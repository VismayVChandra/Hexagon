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
- Study sessions, subjects, notes, exams and goals **never leave the device**. The server holds only: your email (for
  sign-in), display name, friend code, friendships, and your current status.
- Status is **off by default**. When on, only your friends see it. The subject is hidden unless you also turn on "Also show my
  subject". The server enforces both, not just the app.
- Status expires on its own: a few minutes after the app closes, friends see you as offline.
- **Settings → Friends → Delete my friends data** removes your name, code, friendships and status from the server. (Your
  email account itself stays, and can be removed from the Supabase dashboard under Authentication → Users.)

## Things to know

- **Study data is still per device.** Sessions, exams and goals live in each browser and don't sync. Only friends do. (That
  could be built next, now that accounts exist.)
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
- **"Wrong email or password"** → use **Forgot your password?** on the Sign in tab.

## Local development

`npm run dev`, then open `http://localhost:5173/?mockcloud=1`. An in-memory fake server (development builds only) lets you
try friends without a Supabase project. Sign up with any email; the "confirmation" happens by itself after 3 seconds (use an
email containing `+instant` to skip it). Test friend codes: `482913` (Ava, studying), `715204` (Ben, online), `690138`
(Chloe, finished).
