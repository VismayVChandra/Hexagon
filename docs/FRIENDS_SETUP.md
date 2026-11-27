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

## 2. Choose how people sign in

Supabase's **built-in email sender can't change the email template**: it always sends a plain "Sign in" link. (The dashboard says
"Set up custom SMTP to edit templates".) You have two options.

**Option A: use the link (works today, no extra accounts).** Do step 3 (Site URL). The link in the email then returns to
Hexagon and signs the person in. Limits: mail apps like Gmail sometimes open the link first and use it up ("link expired"),
and on iPhone the link opens in Safari, not in the installed home-screen app, so it signs in there instead.

**Option B: use a 6-digit code (recommended for real users).** Connect your own email sender, then put the code in the template.

1. **Project Settings → Authentication → SMTP Settings → Enable custom SMTP.** Any provider works. Quick choices:
   - *Gmail:* host `smtp.gmail.com`, port `465`, username = your Gmail address, password = a Google **App password**
     (Google Account → Security → 2-Step Verification → App passwords). About 500 emails a day, sent from your Gmail address.
   - *Brevo or Resend:* both have free tiers and are better for sending to many people (Resend needs a domain you own to
     email anyone but yourself).
2. **Authentication → Emails → Templates → Magic Link** (editable once SMTP is on). Make the body contain `{{ .Token }}`:

   ```html
   <h2>Your Hexagon code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   ```

   Set the subject to "Your Hexagon code". Do the same for **Confirm signup** (first-time sign-ins use that one).

Never paste the SMTP password or any secret key into the app, the repo or a chat.

## 3. Recommended auth settings

- **Authentication → Providers → Email → Confirm email: turn ON.** Your project currently auto-confirms emails, which
  lets someone register an address they don't own. Hexagon doesn't need that setting off.
- Leave all other providers off. There is no password sign-in in the app.
- **Authentication → URL Configuration → Site URL (required):** set it to `https://vismayvchandra.github.io/Hexagon/`.
  If this is left at the default (`http://localhost:3000`), anyone who clicks the link in the email lands on a dead page.
  Also add that same URL under **Redirect URLs**.

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

## Troubleshooting sign-in

- **The email has a link but no code.** You're on the built-in sender, which can't be customised, or the template is missing
  `{{ .Token }}`. Use the link (option A) or set up custom SMTP (option B).
- **"Email link is invalid or has expired" / `otp_expired`.** Links are one-time, and Gmail and other mail apps often open
  them to scan for spam, which uses them up before you click. Type the 6-digit code into the app instead. The app now catches
  these redirects and shows a friendly message; if a link does work, it signs you in as a fallback.
- **Link lands on `localhost:3000`.** The Site URL in step 3 is still the default.
- **"Too many attempts".** The built-in email sender is rate-limited (step 4).
