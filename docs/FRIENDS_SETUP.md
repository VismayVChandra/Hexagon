# Real friends: Supabase setup

Hexagon works fully without a backend (friends are then simulated demos). To make friends real, connect a free
[Supabase](https://supabase.com) project. This is a one-time setup, about 10 minutes.

The app already contains your project URL and **publishable** key in `.env.production`. Those two values are meant
to be public. What's left is installing the database schema and checking a few auth settings.

## 1. Install the database schema (required)

1. Open your project in the Supabase dashboard.
2. Go to **SQL Editor → New query**.
3. Paste the entire contents of [`supabase/schema.sql`](../supabase/schema.sql) and click **Run**.
4. You should see "Success. No rows returned". The script is safe to re-run.

This creates the profile, friendship and presence tables, locks them completely (Row Level Security with no direct
access), and adds the functions the app calls. Until this step is done, signing in works but adding friends will fail.

## 2. Make the sign-in email contain a code (required)

Hexagon signs people in with a 6-digit code, not a link, because links open in a different browser from an installed
home-screen app on iPhone.

1. **Authentication → Emails → Templates → Magic Link** (the one used for passwordless sign-in).
2. Make sure the body contains `{{ .Token }}`. For example:

   ```html
   <h2>Your Hexagon code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   ```

3. Save. (Also edit the **Confirm signup** template the same way: first-time sign-ins use that one.)

## 3. Recommended auth settings

- **Authentication → Providers → Email → Confirm email: turn ON.** Your project currently auto-confirms emails, which
  lets someone register an address they don't own. Hexagon doesn't need that setting off.
- Leave all other providers off. There is no password sign-in in the app.
- **Authentication → URL Configuration → Site URL:** set it to `https://vismayvchandra.github.io/Hexagon/`.

## 4. Email sending limits (important before real users)

Supabase's built-in email sender is for testing and is heavily rate-limited (a handful of emails per hour for the whole
project). For real users, configure your own SMTP provider under **Project Settings → Authentication → SMTP Settings**
(Resend, Postmark, SendGrid, etc. all have free tiers).

## 5. Keys: what is safe

| Key | Where it lives | Safe in the app? |
| --- | --- | --- |
| Project URL | `.env.production` | Yes |
| Publishable key (`sb_publishable_…`) | `.env.production` | Yes. Designed to be public. Grants nothing by itself. |
| **Secret key (`sb_secret_…`)** | Nowhere in this repo | **No, never.** It bypasses all security rules. If it was ever pasted into a chat or committed, regenerate it under **Project Settings → API Keys**. |

## 6. Try it

1. Deploy (push to `main`, or `npm run build` and host `dist/`).
2. Open the **Friends** tab, enter your email, then the code from the email, then your name.
3. Share your friend code (or invite link) with a second account, e.g. on another phone or a private window.
4. The other person enters the code under **Add friend**; you accept under **Friend requests**.
5. In **Settings → Privacy**, turn on "Let friends see when I'm studying" on both accounts. Start a session on one and
   watch it appear on the other within about 20 seconds.

## How privacy works

- Study sessions, subjects, notes, exams and goals **never leave the device**. Only these are stored on the server:
  your display name, email (for sign-in), friend code, friendships, and your current status.
- Status is **off by default**. When on, only people you've both accepted can see it. The subject is hidden unless you
  also turn on "Also show my subject". The server enforces both, not just the app.
- Status expires on its own: a few minutes after the app closes, friends see you as offline.
- **Settings → Friends account → Delete my friends data** removes your profile, friendships and status from the server.
- Not built (yet): blocking/reporting, deleting the sign-in email record itself (needs the dashboard or a server
  function), rate limiting on friend-code guesses.

## Local development

`npm run dev`, then open `http://localhost:5173/?mockcloud=1`. An in-memory fake server (development builds only) lets you
try sign-in (code `123456`) and friends without a Supabase project. Test friend codes: `AVAX2345`, `BENX2345`, `CHXE2345`.
