-- Hexagon: friends, presence and (optional) anonymous usage counts + owner dashboard backend for Supabase.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste everything -> Run.
-- Safe to re-run, and it upgrades an earlier version of this script (8-character codes + friend requests)
-- to the current design (6-digit code, instant friendship when a friend types it in).
--
-- How people sign in: email + password through Supabase Auth, so a student keeps their code and friends on any phone.
--
-- Security model
--   * Every table has Row Level Security ON and NO policies, so the public API cannot read or write tables directly.
--   * The app talks only to the functions below. Each runs as the table owner but checks auth.uid() itself, and is
--     executable by signed-in users only.
--   * Whoever knows your 6-digit code can add you, so wrong guesses are rate-limited (8 per hour per account) and
--     you can replace your code at any time.
--   * A friend sees your status only if you turned on "share my status". The subject is only included if you also
--     turned on "share my subject".
--   * Usage counts (events): the app may record anonymous events such as "opened the app" or "finished a session", tagged
--     with a random per-device id (and the account id if the person is signed in). Never names, subjects, topics, notes or
--     study content. People can switch this off in Settings, which also deletes their device's events.
--   * The owner dashboard: only accounts listed in public.admins can call admin_stats(), which returns totals only.
--     To make yourself the owner, run the one-line snippet at the very bottom of this file with your own email.

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text not null check (char_length(display_name) between 1 and 30),
  friend_code    text not null unique,
  share_presence boolean not null default false,
  share_subject  boolean not null default false,
  created_at     timestamptz not null default now()
);

create table if not exists public.friendships (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null references public.profiles (id) on delete cascade,
  addressee  uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'accepted' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);

-- One friendship row per pair, whichever side typed the code.
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee);

create table if not exists public.presence (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  state      text not null check (state in ('online', 'studying', 'finished')),
  subject    text check (subject is null or char_length(subject) <= 40),
  session_ms bigint not null default 0 check (session_ms >= 0),
  room_id    text check (room_id is null or char_length(room_id) <= 40),
  updated_at timestamptz not null default now()
);

-- Wrong-code attempts, used to slow down guessing.
create table if not exists public.code_attempts (
  id      bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists code_attempts_user_idx on public.code_attempts (user_id, at);

-- Anonymous usage events. No policies: only log_event() writes and only admin_stats() reads.
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  device_id  uuid not null,
  user_id    uuid references auth.users (id) on delete set null,
  name       text not null check (name in ('app_open', 'session_start', 'session_finish', 'car_built', 'app_installed')),
  created_at timestamptz not null default now()
);
create index if not exists events_created_idx on public.events (created_at);
create index if not exists events_device_idx  on public.events (device_id, created_at);
create index if not exists events_name_idx    on public.events (name, created_at);

-- Accounts allowed to open the owner dashboard.
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.events enable row level security;
alter table public.admins enable row level security;

alter table public.profiles      enable row level security;
alter table public.friendships   enable row level security;
alter table public.presence      enable row level security;
alter table public.code_attempts enable row level security;

-- A signed-in user may read their own profile row (name, code, sharing flags). Nothing else is exposed.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());

-- ---------------------------------------------------------------- upgrade from the earlier version

-- Old requests are gone: anything still pending is dropped.
delete from public.friendships where status = 'pending';

-- Old 8-character codes become 6-digit codes.
alter table public.profiles drop constraint if exists profiles_friend_code_check;
do $$
declare
  r record;
  c text;
begin
  for r in select id from public.profiles where friend_code !~ '^[0-9]{6}$' loop
    loop
      c := lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not exists (select 1 from public.profiles where friend_code = c);
    end loop;
    update public.profiles set friend_code = c where id = r.id;
  end loop;
end $$;
alter table public.profiles add constraint profiles_friend_code_check check (friend_code ~ '^[0-9]{6}$');

drop function if exists public.send_friend_request(text);
drop function if exists public.respond_friend_request(uuid, boolean);
drop function if exists public.list_friend_requests();

-- ---------------------------------------------------------------- functions

-- A fresh 6-digit code nobody else is using.
create or replace function public.new_friend_code()
returns text
language plpgsql set search_path = public as $$
declare c text;
begin
  loop
    c := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.profiles where friend_code = c);
  end loop;
  return c;
end $$;

-- Create or rename my profile. Generates my friend code on first call.
create or replace function public.ensure_profile(p_name text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  name text := btrim(coalesce(p_name, ''));
  prof public.profiles;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if char_length(name) < 1 or char_length(name) > 30 then
    raise exception 'Name must be 1 to 30 characters';
  end if;

  select * into prof from public.profiles where id = uid;
  if found then
    update public.profiles set display_name = name where id = uid returning * into prof;
    return prof;
  end if;

  loop
    begin
      insert into public.profiles (id, display_name, friend_code)
      values (uid, name, public.new_friend_code())
      returning * into prof;
      return prof;
    exception when unique_violation then
      select * into prof from public.profiles where id = uid;
      if found then return prof; end if; -- raced with myself; otherwise a code clash, so try again
    end;
  end loop;
end $$;

-- Replace my friend code (e.g. if it was shared with someone I'd rather not have). Existing friends stay.
create or replace function public.regenerate_friend_code()
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c   text;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  c := public.new_friend_code();
  update public.profiles set friend_code = c where id = uid;
  if not found then raise exception 'Create your profile first'; end if;
  return c;
end $$;

-- Turn sharing on or off. Turning it off removes my presence immediately.
create or replace function public.set_sharing(p_presence boolean, p_subject boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  update public.profiles
     set share_presence = p_presence,
         share_subject  = p_presence and p_subject
   where id = uid;
  if not found then raise exception 'Create your profile first'; end if;
  if not p_presence then
    delete from public.presence where user_id = uid;
  elsif not p_subject then
    update public.presence set subject = null where user_id = uid;
  end if;
end $$;

-- Publish my status. Ignored unless I switched sharing on; the subject is dropped unless I share it.
create or replace function public.set_presence(p_state text, p_subject text, p_session_ms bigint, p_room text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  prof public.profiles;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into prof from public.profiles where id = uid;
  if not found or not prof.share_presence then return; end if;
  if p_state not in ('online', 'studying', 'finished') then raise exception 'Bad state'; end if;

  insert into public.presence (user_id, state, subject, session_ms, room_id, updated_at)
  values (
    uid,
    p_state,
    case when prof.share_subject then left(nullif(btrim(p_subject), ''), 40) else null end,
    greatest(coalesce(p_session_ms, 0), 0),
    left(nullif(btrim(p_room), ''), 40),
    now()
  )
  on conflict (user_id) do update
    set state = excluded.state,
        subject = excluded.subject,
        session_ms = excluded.session_ms,
        room_id = excluded.room_id,
        updated_at = now();
end $$;

create or replace function public.clear_presence()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from public.presence where user_id = auth.uid();
end $$;

-- Add a friend by typing their code. Friendship is immediate and mutual.
-- Returns {"status": "added" | "already" | "not_found" | "self" | "limited", "name": "..."}.
-- (Wrong guesses return a status instead of raising, so the attempt is still recorded.)
create or replace function public.add_friend_by_code(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  code   text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  target public.profiles;
  recent int;
  f      public.friendships;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Create your profile first';
  end if;

  delete from public.code_attempts where at < now() - interval '1 day';
  select count(*) into recent from public.code_attempts where user_id = uid and at > now() - interval '1 hour';
  if recent >= 8 then return jsonb_build_object('status', 'limited'); end if;

  select * into target from public.profiles where friend_code = code;
  if not found then
    insert into public.code_attempts (user_id) values (uid);
    return jsonb_build_object('status', 'not_found');
  end if;
  if target.id = uid then return jsonb_build_object('status', 'self'); end if;

  select * into f from public.friendships
   where (requester = uid and addressee = target.id) or (requester = target.id and addressee = uid);
  if found then
    if f.status <> 'accepted' then
      update public.friendships set status = 'accepted' where id = f.id;
      return jsonb_build_object('status', 'added', 'name', target.display_name);
    end if;
    return jsonb_build_object('status', 'already', 'name', target.display_name);
  end if;

  insert into public.friendships (requester, addressee, status) values (uid, target.id, 'accepted');
  return jsonb_build_object('status', 'added', 'name', target.display_name);
end $$;

-- Remove a friend (either side can).
create or replace function public.remove_friendship(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  delete from public.friendships where id = p_id and (requester = uid or addressee = uid);
end $$;

-- My friends with their presence (only when they chose to share it).
create or replace function public.list_friends()
returns table (
  friendship_id uuid,
  friend_id     uuid,
  display_name  text,
  state         text,
  subject       text,
  session_ms    bigint,
  room_id       text,
  updated_at    timestamptz
)
language plpgsql security definer stable set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  return query
    select f.id, p.id, p.display_name, pr.state, pr.subject, pr.session_ms, pr.room_id, pr.updated_at
      from public.friendships f
      join public.profiles p on p.id = case when f.requester = uid then f.addressee else f.requester end
      left join public.presence pr on pr.user_id = p.id and p.share_presence
     where f.status = 'accepted' and (f.requester = uid or f.addressee = uid)
     order by p.display_name;
end $$;

-- Delete everything I have stored in the cloud (profile, friendships, presence, usage events tied to my account).
create or replace function public.delete_my_data()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from public.profiles where id = auth.uid();
  delete from public.events where user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------- usage counts and owner dashboard

-- Record one anonymous event. Anyone with the public key may call it, so it is strict: a fixed list of event names,
-- a daily cap per device, and repeats of "opened the app" within 30 minutes are ignored.
create or replace function public.log_event(p_device uuid, p_name text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_device is null or p_name is null
     or p_name not in ('app_open', 'session_start', 'session_finish', 'car_built', 'app_installed') then
    return;
  end if;
  if (select count(*) from public.events where device_id = p_device and created_at > now() - interval '1 day') >= 150 then
    return;
  end if;
  if p_name = 'app_open' and exists (
       select 1 from public.events where device_id = p_device and name = 'app_open' and created_at > now() - interval '30 minutes') then
    return;
  end if;
  if p_name = 'app_installed' and exists (select 1 from public.events where device_id = p_device and name = 'app_installed') then
    return;
  end if;
  insert into public.events (device_id, user_id, name) values (p_device, auth.uid(), p_name);
  -- Keep the table small: forget events older than about 13 months (done now and then, not on every call).
  if random() < 0.01 then
    delete from public.events where created_at < now() - interval '400 days';
  end if;
end $$;

-- Delete every event recorded for one device (used when someone switches usage counts off).
create or replace function public.forget_device(p_device uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_device is null then return; end if;
  delete from public.events where device_id = p_device;
end $$;

-- Is the signed-in account the owner?
create or replace function public.is_admin()
returns boolean
language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Totals for the owner dashboard, as one JSON document. Owner only. Days are counted in the owner's time zone.
create or replace function public.admin_stats(p_tz text default 'UTC')
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  tz     text := coalesce(nullif(btrim(p_tz), ''), 'UTC');
  today  date;
  result jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Not allowed';
  end if;
  begin
    perform now() at time zone tz;
  exception when others then
    tz := 'UTC';
  end;
  today := (now() at time zone tz)::date;

  select jsonb_build_object(
    'generated_at', now(),
    'tz', tz,
    'tracking_since', (select min(created_at) from public.events),
    'overview', jsonb_build_object(
      'visitors_total',     (select count(distinct device_id) from public.events where name = 'app_open'),
      'visitors_today',     (select count(distinct device_id) from public.events where name = 'app_open' and (created_at at time zone tz)::date = today),
      'visitors_7d',        (select count(distinct device_id) from public.events where name = 'app_open' and created_at > now() - interval '7 days'),
      'visitors_30d',       (select count(distinct device_id) from public.events where name = 'app_open' and created_at > now() - interval '30 days'),
      'returning_visitors', (select count(*) from (
                               select device_id from public.events where name = 'app_open'
                               group by device_id having count(distinct (created_at at time zone tz)::date) >= 2) r),
      'installed',          (select count(distinct device_id) from public.events where name = 'app_installed'),
      'started_studying',   (select count(distinct device_id) from public.events where name = 'session_start'),
      'finished_session',   (select count(distinct device_id) from public.events where name = 'session_finish'),
      'sessions_started',   (select count(*) from public.events where name = 'session_start'),
      'sessions_finished',  (select count(*) from public.events where name = 'session_finish'),
      'cars_built',         (select count(*) from public.events where name = 'car_built'),
      'signed_in_devices',  (select count(distinct device_id) from public.events where user_id is not null),
      'friend_devices',     (select count(distinct e.device_id) from public.events e
                              where e.user_id is not null and exists (
                                select 1 from public.friendships f
                                 where f.status = 'accepted' and (f.requester = e.user_id or f.addressee = e.user_id)))
    ),
    'accounts', jsonb_build_object(
      'total',          (select count(*) from auth.users),
      'confirmed',      (select count(*) from auth.users where email_confirmed_at is not null),
      'named',          (select count(*) from public.profiles),
      'with_friends',   (select count(*) from public.profiles p
                          where exists (select 1 from public.friendships f
                                         where f.status = 'accepted' and (f.requester = p.id or f.addressee = p.id))),
      'friendships',    (select count(*) from public.friendships where status = 'accepted'),
      'sharing_status', (select count(*) from public.profiles where share_presence),
      'sharing_subject',(select count(*) from public.profiles where share_subject),
      'signups_7d',     (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'recent', (select coalesce(jsonb_agg(jsonb_build_object(
                    'at', u.created_at,
                    'email', left(split_part(u.email, '@', 1), 2) || '***@' || split_part(u.email, '@', 2),
                    'confirmed', u.email_confirmed_at is not null,
                    'named', exists (select 1 from public.profiles p where p.id = u.id),
                    'friends', (select count(*) from public.friendships f
                                 where f.status = 'accepted' and (f.requester = u.id or f.addressee = u.id))
                  ) order by u.created_at desc), '[]'::jsonb)
                 from (select * from auth.users order by created_at desc limit 8) u)
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', d.day::text,
               'visitors', coalesce(v.visitors, 0),
               'new_visitors', coalesce(nv.n, 0),
               'started', coalesce(v.started, 0),
               'finished', coalesce(v.finished, 0),
               'signups', coalesce(s.n, 0)
             ) order by d.day), '[]'::jsonb)
        from (select (today - g)::date as day from generate_series(0, 29) g) d
        left join (
          select (created_at at time zone tz)::date as day,
                 count(distinct device_id) filter (where name = 'app_open')      as visitors,
                 count(distinct device_id) filter (where name = 'session_start') as started,
                 count(*)                  filter (where name = 'session_finish') as finished
            from public.events
           where created_at > now() - interval '32 days'
           group by 1) v on v.day = d.day
        left join (
          select first_day as day, count(*) as n
            from (select device_id, min((created_at at time zone tz)::date) as first_day
                    from public.events where name = 'app_open' group by device_id) f
           group by first_day) nv on nv.day = d.day
        left join (
          select (created_at at time zone tz)::date as day, count(*) as n
            from auth.users where created_at > now() - interval '32 days' group by 1) s on s.day = d.day
    )
  ) into result;

  return result;
end $$;

-- ---------------------------------------------------------------- permissions

revoke all on public.profiles, public.friendships, public.presence, public.code_attempts, public.events, public.admins from anon, authenticated;
grant select on public.profiles to authenticated; -- still limited to my own row by the policy above

revoke execute on function public.new_friend_code()                               from public, anon, authenticated;
revoke execute on function public.ensure_profile(text)                            from public, anon;
revoke execute on function public.regenerate_friend_code()                        from public, anon;
revoke execute on function public.set_sharing(boolean, boolean)                   from public, anon;
revoke execute on function public.set_presence(text, text, bigint, text)          from public, anon;
revoke execute on function public.clear_presence()                                from public, anon;
revoke execute on function public.add_friend_by_code(text)                        from public, anon;
revoke execute on function public.remove_friendship(uuid)                         from public, anon;
revoke execute on function public.list_friends()                                  from public, anon;
revoke execute on function public.delete_my_data()                                from public, anon;
revoke execute on function public.log_event(uuid, text)                           from public;
revoke execute on function public.forget_device(uuid)                             from public;
revoke execute on function public.is_admin()                                      from public, anon;
revoke execute on function public.admin_stats(text)                               from public, anon;

grant execute on function public.ensure_profile(text)                             to authenticated;
grant execute on function public.regenerate_friend_code()                         to authenticated;
grant execute on function public.set_sharing(boolean, boolean)                    to authenticated;
grant execute on function public.set_presence(text, text, bigint, text)           to authenticated;
grant execute on function public.clear_presence()                                 to authenticated;
grant execute on function public.add_friend_by_code(text)                         to authenticated;
grant execute on function public.remove_friendship(uuid)                          to authenticated;
grant execute on function public.list_friends()                                   to authenticated;
grant execute on function public.delete_my_data()                                 to authenticated;
grant execute on function public.log_event(uuid, text)                            to anon, authenticated;
grant execute on function public.forget_device(uuid)                              to anon, authenticated;
grant execute on function public.is_admin()                                       to authenticated;
grant execute on function public.admin_stats(text)                                to authenticated;

-- ---------------------------------------------------------------- make yourself the owner (run once, separately)
-- Replace the address with the email of the account you sign in with, then run just this statement.
-- (It is commented out here so the script never gives anyone access by accident.)
--
-- insert into public.admins (user_id)
-- select id from auth.users where lower(email) = lower('YOUR-EMAIL@example.com')
-- on conflict do nothing;
