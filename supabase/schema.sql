-- Hexagon: friends and presence backend for Supabase.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: it uses "if not exists" / "create or replace".
--
-- Security model
--   * Every table has Row Level Security turned ON and NO policies, so the public API
--     (anon or signed-in) cannot read or write any table directly.
--   * The app talks only to the functions below. Each one runs as the table owner but checks
--     auth.uid() itself, and each is executable by signed-in users only.
--   * A friend sees your presence only if: you accepted each other, and you turned on
--     "share my status". Your subject is only included if you also turned on "share my subject".

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text not null check (char_length(display_name) between 1 and 30),
  friend_code    text not null unique check (char_length(friend_code) = 8),
  share_presence boolean not null default false,
  share_subject  boolean not null default false,
  created_at     timestamptz not null default now()
);

create table if not exists public.friendships (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null references public.profiles (id) on delete cascade,
  addressee  uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);

-- One friendship row per pair, whichever direction it was requested in.
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

alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;
alter table public.presence    enable row level security;

-- A signed-in user may read their own profile row (name, friend code, sharing flags). Nothing else is exposed.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());

-- ---------------------------------------------------------------- functions

-- Create or rename my profile. Generates a friend code on first call.
create or replace function public.ensure_profile(p_name text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  name text := btrim(coalesce(p_name, ''));
  code text;
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
    code := '';
    for i in 1..8 loop
      -- Unambiguous alphabet (no I, L, O, 0, 1).
      code := code || substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1);
    end loop;
    begin
      insert into public.profiles (id, display_name, friend_code) values (uid, name, code) returning * into prof;
      return prof;
    exception when unique_violation then
      select * into prof from public.profiles where id = uid;
      if found then return prof; end if; -- lost a race with myself; otherwise it was a code clash, try again
    end;
  end loop;
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

-- Publish my status. Ignored unless I have switched sharing on; the subject is dropped unless I share it.
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

-- Add a friend by their code. If they already asked me, this accepts. Returns 'sent' or 'accepted'.
create or replace function public.send_friend_request(p_code text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  target uuid;
  f      public.friendships;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Create your profile first';
  end if;

  select id into target from public.profiles where friend_code = upper(btrim(coalesce(p_code, '')));
  if target is null then raise exception 'No one has that friend code'; end if;
  if target = uid then raise exception 'That is your own code'; end if;

  select * into f from public.friendships
   where (requester = uid and addressee = target) or (requester = target and addressee = uid);
  if found then
    if f.status = 'accepted' then raise exception 'You are already friends'; end if;
    if f.requester = uid then raise exception 'Request already sent'; end if;
    update public.friendships set status = 'accepted' where id = f.id;
    return 'accepted';
  end if;

  insert into public.friendships (requester, addressee) values (uid, target);
  return 'sent';
end $$;

-- Accept or decline a request addressed to me.
create or replace function public.respond_friend_request(p_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_accept then
    update public.friendships set status = 'accepted'
     where id = p_id and addressee = uid and status = 'pending';
  else
    delete from public.friendships where id = p_id and addressee = uid and status = 'pending';
  end if;
  if not found then raise exception 'That request no longer exists'; end if;
end $$;

-- Remove a friend, cancel a request I sent, or decline one: delete the friendship row if I am part of it.
create or replace function public.remove_friendship(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  delete from public.friendships where id = p_id and (requester = uid or addressee = uid);
end $$;

-- My accepted friends with their presence (only when they chose to share it).
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

-- Pending requests in both directions. direction = 'incoming' (someone asked me) or 'outgoing' (I asked them).
create or replace function public.list_friend_requests()
returns table (
  id           uuid,
  direction    text,
  display_name text,
  created_at   timestamptz
)
language plpgsql security definer stable set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  return query
    select f.id,
           case when f.addressee = uid then 'incoming' else 'outgoing' end,
           p.display_name,
           f.created_at
      from public.friendships f
      join public.profiles p on p.id = case when f.addressee = uid then f.requester else f.addressee end
     where f.status = 'pending' and (f.requester = uid or f.addressee = uid)
     order by f.created_at desc;
end $$;

-- Delete everything I have stored in the cloud (profile, friendships, presence).
create or replace function public.delete_my_data()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from public.profiles where id = auth.uid();
end $$;

-- ---------------------------------------------------------------- permissions

revoke all on public.profiles, public.friendships, public.presence from anon, authenticated;
grant select on public.profiles to authenticated; -- still limited to my own row by the policy above

revoke execute on function public.ensure_profile(text)                            from public, anon;
revoke execute on function public.set_sharing(boolean, boolean)                   from public, anon;
revoke execute on function public.set_presence(text, text, bigint, text)          from public, anon;
revoke execute on function public.clear_presence()                                from public, anon;
revoke execute on function public.send_friend_request(text)                       from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean)           from public, anon;
revoke execute on function public.remove_friendship(uuid)                         from public, anon;
revoke execute on function public.list_friends()                                  from public, anon;
revoke execute on function public.list_friend_requests()                          from public, anon;
revoke execute on function public.delete_my_data()                                from public, anon;

grant execute on function public.ensure_profile(text)                             to authenticated;
grant execute on function public.set_sharing(boolean, boolean)                    to authenticated;
grant execute on function public.set_presence(text, text, bigint, text)           to authenticated;
grant execute on function public.clear_presence()                                 to authenticated;
grant execute on function public.send_friend_request(text)                        to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean)            to authenticated;
grant execute on function public.remove_friendship(uuid)                          to authenticated;
grant execute on function public.list_friends()                                   to authenticated;
grant execute on function public.list_friend_requests()                           to authenticated;
grant execute on function public.delete_my_data()                                 to authenticated;
