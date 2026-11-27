# Real friends: Supabase setup

Hexagon works fully without a backend (friends are then simulated demos). To make friends real, connect a free
[Supabase](https://supabase.com) project.

How it works for a student:

1. Open **Friends → Create account** (email + password).
2. Tap the confirmation link in the email (if your project requires it), then sign in.
3. Pick a name. You now have a **6-digit friend code**, like a ride-share OTP.
4. Share the code. When a friend types it under **Add friend**, you're friends, instantly.

Because it's a real account, clearing site data or switching phones just means **signing in again**: the same code and
all your friends come back.

The app already contains your project URL and **publishable** key in `.env.production`. Those two values are meant to be
public. What's left is in the Supabase dashboard.

## 1. Install the database (required)

1. **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/schema.sql`](../supabase/schema.sql) and click **Run**.
3. You should see "Success. No rows returned".

Safe to re-run, and it upgrades older versions of the script. Re-run it whenever `supabase/schema.sql` changes.

## 2. Set the redirect address (required for email links)

**Authentication → URL Configuration:**

- **Site URL:** `https://vismayvchandra.github.io/Hexagon/`
- **Redirect URLs:** add the same URL (and `http://localhost:5173/` if you develop locally).

Without this, the link in the confirmation or password-reset email goes to `http://localhost:3000` and shows a dead page.

## 3. Decide whether to require email confirmation

**Authentication → Sign In / Providers → Email → "Confirm email".**

| Setting | What happens | Needs |
| --- | --- | --- |
| **ON** (recommended) | Sign-up sends a confirmation link. People can't use an email address they don't own. | Working email delivery (see below). |
| **OFF** | Sign-up works instantly with no email. Anyone can register any address. For a small friends circle that's low-risk, since a real owner can still take the account over with "Forgot password". | Nothing. |

The app handles both automatically. **Your project currently has confirmation OFF** (auto-confirm). Turn it on when email
delivery is ready.

### About email delivery

Supabase's **built-in email sender is for testing only**. It is heavily rate-limited (a handful of emails per hour for the
whole project), and on many projects it only delivers to addresses on your own Supabase team. So it may work for you but
not for a friend. Test it by signing up with a friend's email: if they never get the email, you need your own sender.

For real users, set up custom SMTP: **Project Settings → Authentication → SMTP Settings**.
- *Gmail:* host `smtp.gmail.com`, port `465`, username = your Gmail address, password = a Google **App password**
  (Google Account → Security → 2-Step Verification → App passwords). About 500 emails a day, sent from your address.
- *Brevo or Resend:* free tiers, better for many users (Resend needs a domain you own to email other people).

Never paste an SMTP password or a secret key into the app, the repo, or a chat.

Also: **Authentication → Sign In / Providers → Anonymous sign-ins** can stay **off**. Hexagon doesn't use them.

## 4. Usage counts and the owner dashboard (optional)

The same `schema.sql` also adds anonymous usage counts and an owner-only dashboard. After re-running it (step 1):

1. Sign in to the app once with the account you want as owner (the app needs that account to exist).
2. **SQL Editor → New query**, paste this with **your own sign-in email**, and **Run**:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where lower(email) = lower('YOUR-EMAIL@example.com')
   on conflict do nothing;
   ```

   Don't commit your email anywhere: this statement is meant to be run once in the Supabase website, not saved in the project.
3. Reopen the app on that account. An **Admin dashboard** card appears on Home and in Settings. Anyone else who opens
   `#/admin` is refused by the server, not just hidden by the app.

What it counts: devices that opened the app, started or finished a session, built a car or installed the app (a random id
per device), and, from the database itself, accounts, confirmed emails, friend codes, friendships and who shares status.
What it never receives: names, subjects, topics, notes, study time or anything typed. People can switch the counts off in
Settings → Privacy (that also deletes their device's counts), and **Delete my friends data** removes the events tied to
their account. Events older than about 13 months are removed automatically.

Limits worth knowing: a "visitor" is a device, not a person; counts start the day this version goes live; ad blockers can
stop the counts; and because anyone can call the counting function, someone determined could inflate numbers (each device is
capped at 150 events a day, and repeated opens within 30 minutes count once).

## Keys: what is safe

| Key | Where it lives | Safe in the app? |
| --- | --- | --- |
| Project URL | `.env.production` | Yes |
| Publishable key (`sb_publishable_…`) | `.env.production` | Yes. Designed to be public. Grants nothing by itself. |
| **Secret key (`sb_secret_…`)** | Nowhere in this repo | **No, never.** It bypasses all security rules. If it was ever pasted into a chat or committed, regenerate it under **Project Settings → API Keys**. |

## Try it

1. Deploy (push to `main`, or `npm run build` and host `dist/`).
2. On two devices, open **Friends**, create accounts, and pick names.
3. On one device tap **Add friend** and type the other's code. You're friends right away. The other device shows a
   "…added you as a friend" notice within about 20 seconds.
4. In **Settings → Privacy**, turn on "Let friends see when I'm studying" on both. Start a session on one and watch it
   appear on the other within about 20 seconds.
5. Sign out in **Settings → Friends**, clear the site's data, sign in again, and check your code and friends are back.

## How it stays safe

- Whoever has your code can add you, like handing over an OTP. So: wrong guesses are limited to **8 per hour per account**,
  you can **replace your code any time** (Friends → Replace my code; existing friends stay), and friends can be removed by
  either side.
- Your study data (sessions, subjects, notes, exams, cars and goals) is **saved to your own account, and only visible to it,
  while you are signed in and "Keep my study data in my account" is on** (Settings → Account). Friends never see it. The server
  holds: your email (for sign-in), display name, friend code, friendships, your current status, that one private study-data
  copy, and (unless you switch it off) anonymous usage counts such as "opened the app" with a random device id. Whoever runs the
  Supabase project can technically read the database, like with any app, so say that plainly if you promise privacy to people.
- Status is **on by default** in the app (new installs), and the sign-up step says so. Only your friends see it, and each person can switch it off in
  Settings → Privacy. The subject stays hidden unless they also turn on "Also show my subject". The server enforces both, not just the app.
  People who had already chosen (or never touched it before this change) keep their saved setting; nobody is switched on retroactively.
- Status expires on its own: a few minutes after the app closes, friends see you as offline.
- **Settings → Friends → Delete my friends data** removes your name, code, friendships and status from the server. (Your
  email account itself stays, and can be removed from the Supabase dashboard under Authentication → Users.)

## Things to know

- **Study data syncs through your account.** It is one document per account (`public.user_data`), merged on each device so
  nothing is lost; see `src/cloud/syncMerge.ts`. It needs the latest `supabase/schema.sql` (step 1). If you have not re-run it,
  Settings → Account says "Syncing needs the latest setup SQL" and everything keeps working on the device.
- A different account signing in on a device does not inherit the previous account's data. A safety copy of the previous data
  is kept in the browser's storage under `hexagon.v1.other-account`.
- **iPhone home-screen app:** an email link opens in Safari, not in the installed app. That's fine: after you tap the
  confirmation link, go back to the app and sign in with your password.
- 6-digit codes can be guessed (1 in a million per try), which is why guesses are rate-limited. If you expect a lot of
  users, make codes longer: change `lpad(..., 6, '0')` and the `^[0-9]{6}$` checks in `supabase/schema.sql`, and the code
  helpers in `src/cloud/presence.ts`.
- Not built yet: blocking/reporting, true real-time updates (it polls every ~20 seconds).

## Troubleshooting

- **Link goes to `localhost:3000`** → step 2 (Site URL).
- **"Email link was already used or has expired"** → mail apps sometimes open links first. If you just signed up you're
  probably already confirmed: sign in with your password. Otherwise tap **Forgot your password?** for a fresh link.
- **A friend never gets the confirmation email** → built-in sender limits (see above), or turn "Confirm email" off.
- **"The friends database isn't set up yet"** → step 1.
- **No Admin dashboard card, or "needs the latest setup SQL"** → re-run `supabase/schema.sql` (step 1), then do the owner step (step 4) while signed in with the same email you use in the app. The numbers are empty until people open the new version.
- **"Wrong email or password"** → use **Forgot your password?** on the Sign in tab.

## Local development

`npm run dev`, then open `http://localhost:5173/?mockcloud=1`. An in-memory fake server (development builds only) lets you
try friends without a Supabase project. Sign up with any email; the "confirmation" happens by itself after 3 seconds (use an
email containing `+instant` to skip it). Test friend codes: `482913` (Ava, studying), `715204` (Ben, online), `690138`
(Chloe, finished). To see the owner dashboard with made-up numbers, sign up with an email containing `admin`, for example
`admin+instant@example.com`.
