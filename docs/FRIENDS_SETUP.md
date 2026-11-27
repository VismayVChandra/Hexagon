# Real friends: Supabase setup

Hexagon works fully without a backend (friends are then simulated demos). To make friends real, connect a free
[Supabase](https://supabase.com) project. This takes about two minutes and needs **no email setup**.

How it works for a student: open **Friends → type a name → get a 6-digit code** (like a ride-share OTP). Share it. When a
friend types it into their app, you're friends, instantly. No email, no password, no links.

Under the hood each device gets an anonymous Supabase account the first time friends is turned on.

The app already contains your project URL and **publishable** key in `.env.production`. Those two values are meant to be
public. Two things are left to do in the dashboard.

## 1. Install the database (required)

1. Open your project in the Supabase dashboard.
2. **SQL Editor → New query**.
3. Paste the entire contents of [`supabase/schema.sql`](../supabase/schema.sql) and click **Run**.
4. You should see "Success. No rows returned".

Safe to re-run. If you ran an earlier version of this script (8-character codes and friend requests), running this one
upgrades it: old codes become 6-digit codes and pending requests are dropped.

## 2. Allow anonymous sign-ins (required)

**Authentication → Sign In / Providers → "Allow anonymous sign-ins" → ON.** Save.

Until this is on, the Friends tab shows "Friends isn't switched on for this app yet".

## 3. Recommended

- **Turn the Email provider off** (Authentication → Sign In / Providers → Email). Hexagon doesn't use it, and leaving it on
  lets strangers create email accounts against your project.
- **Authentication → Rate Limits:** keep "anonymous users" at its default (30 per hour per IP) or lower.
- When you have lots of users, enable CAPTCHA under **Authentication → Attack Protection** (it needs an app change too).

## Keys: what is safe

| Key | Where it lives | Safe in the app? |
| --- | --- | --- |
| Project URL | `.env.production` | Yes |
| Publishable key (`sb_publishable_…`) | `.env.production` | Yes. Designed to be public. Grants nothing by itself. |
| **Secret key (`sb_secret_…`)** | Nowhere in this repo | **No, never.** It bypasses all security rules. If it was ever pasted into a chat or committed, regenerate it under **Project Settings → API Keys**. |

## Try it

1. Deploy (push to `main`, or `npm run build` and host `dist/`).
2. On two devices, open **Friends**, enter a name and tap **Get my friend code**.
3. On one device tap **Add friend** and type the other's code. You're friends right away. The other device shows a
   "…added you as a friend" notice within about 20 seconds.
4. In **Settings → Privacy**, turn on "Let friends see when I'm studying" on both. Start a session on one and watch it
   appear on the other within about 20 seconds.

## How it stays safe

- Whoever has your code can add you, like handing over an OTP. So: wrong guesses are limited to **8 per hour per account**,
  you can **replace your code any time** (Friends → Replace my code; existing friends stay), and friends can be removed by
  either side.
- Study sessions, subjects, notes, exams and goals **never leave the device**. The server only holds: your display name,
  friend code, friendships, and your current status.
- Status is **off by default**. When on, only your friends see it. The subject is hidden unless you also turn on "Also show my
  subject". The server enforces both, not just the app.
- Status expires on its own: a few minutes after the app closes, friends see you as offline.
- **Settings → Friends → Delete my friends data** removes everything about you from the server.

## Things to know

- **The account lives in the browser.** Clearing site data, reinstalling, or switching phones means a new account, a new code,
  and re-adding friends. (An optional "link an email to keep my account" step could be added later.)
- 6-digit codes can be guessed (1 in a million per try), which is why guesses are rate-limited. If you ever expect a lot of
  users, make codes longer: change `lpad(..., 6, '0')` and the `^[0-9]{6}$` checks in `supabase/schema.sql`, and the code
  helpers in `src/cloud/presence.ts`.
- Not built yet: blocking/reporting, true real-time updates (it polls every ~20 seconds).

## Troubleshooting

- **"Friends isn't switched on for this app yet"** → step 2 (anonymous sign-ins).
- **"The friends database isn't set up yet"** → step 1 (run the SQL).
- **"Your friends account was reset"** → site data was cleared. Tap **Get my friend code** again.

## Local development

`npm run dev`, then open `http://localhost:5173/?mockcloud=1`. An in-memory fake server (development builds only) lets you
try friends without a Supabase project. Test codes: `482913` (Ava, studying), `715204` (Ben, online), `690138` (Chloe, finished).
