# Hexagon

A calm, mobile-first study companion, built as an installable PWA (iOS, Android, desktop) from a single codebase.
Start a session in seconds, focus alongside (simulated) friends, track effort by subject, and plan for exams.

**Stack:** Vite + React + TypeScript, `react-router-dom` (hash routing, so any static host works), hand-written service worker. No UI or chart libraries; the only large dependency is three.js for the 3D honeycomb, loaded on demand. How Hexagon compares with other study apps, and what is still missing: [docs/COMPETITIVE_ANALYSIS.md](docs/COMPETITIVE_ANALYSIS.md).

## Run it

```powershell
npm install
npm run dev          # development server (no service worker in dev)
npm run build        # type-check + production build into dist/ (emits dist/sw.js)
npm run preview      # serve the production build at http://localhost:4173 (service worker + install work here)
npm run lint
npm run typecheck
npm test             # unit tests: timer engine, stats, goals, storage parsing
npm run icons        # regenerate PNG icons in public/icons
```

To try it on a phone, run `npm run preview` and open the printed network URL. Note: installing as an app and the service worker need HTTPS (or `localhost`), so for a real phone test deploy `dist/` to any static HTTPS host.

## How it is organised

```
src/
  lib/timer.ts      Timer engine. Pure functions of (stored timestamps, now). No interval is the source of truth.
  lib/stats.ts      Totals, streaks, chart buckets, consistency calendar. All derived from saved sessions.
  lib/goals.ts      Exam prep plans and the weekly-goal suggestion.
  storage/adapter.ts  StudyStorage interface + localStorage adapter (+ in-memory fallback, defensive parsing).
  store/store.ts    App state and every action (start/pause/finish session, exams, friends, settings, data tools).
  data/seed.ts      Demo data (flagged `demo`, removable). data/friendsSim.ts: simulated friends and rooms.
  pages/            Home, Study (setup), Session, Progress, Friends, Exams, Settings.
sw/sw.template.js   Service worker template; vite.config.ts injects the precache list at build time.
```

### Swapping in a backend

The UI only talks to `store.ts`, and `store.ts` only talks to the `StudyStorage` interface (`load`, `save`, `reset`). A server-backed
version means writing one new adapter, then moving `persist()` to per-entity API calls, and replacing `friendsSim.ts` with real presence.

## What is real and what is demo

| Area | Status |
| --- | --- |
| Stopwatch, countdown, Pomodoro (breaks excluded from study time), pause/resume, finish/save, discard with confirmation | Fully working |
| Session recovery after refresh, closing or backgrounding; "welcome back" prompt after a long absence | Fully working |
| Subjects, notes, manual logging of past sessions, history, delete | Fully working |
| Daily/weekly totals, streaks, goal progress, subject breakdown, charts, consistency calendar (7/30/90 days, all time, subject filter) | Fully working, derived from saved sessions |
| Exams (add/edit/delete), countdowns, prep progress, weekly goal suggestion | Fully working |
| Installable PWA, offline app shell, iOS install hint, safe areas, reduced motion, keyboard and screen-reader support | Fully working |
| Session-complete summary (goal reached, streak, milestones, week progress), live "today" progress while studying, animated rings and charts, calm breathing break screen | Fully working |
| Vibration feedback on start, pause and finish | Android browsers only. iPhone browsers have no vibration API, and the setting says so. |
| Light / Dark / System appearance, with a quick sun/moon toggle in the header | Fully working. The choice is applied before first paint, so there is no flash. |
| **Honeycomb scene:** while you study, a 3D honeycomb dome of 271 cells (three.js, loaded on demand, drag to turn it; a drawn comb replaces it where WebGL isn't available) fills with honey (1 cell per 5 minutes of focus) with a bee on the cell being filled; the cells you make across all sessions form a lasting hive, and total hours raise your bee rank (Egg to Queen). One 25-minute session a day earns a golden cell. Only timed sessions count. | Fully working |
| **Plan and focus:** add a short checklist when you start (under "Add details") or mid-session, tick things off as you go, and rate how focused the session felt when you finish. The plan shows in the summary and history, and Progress gets a "When you focus" card: which part of the day you study most, how focused you feel then, average and longest session, and plan completion. | Fully working. The best-time message waits for four timed sessions. |
| **Ambient sound:** rain, brown noise or waves while you study, with a volume slider. Generated on the device with the Web Audio API (no audio files), plays while the timer runs, rests during pauses and Pomodoro breaks, and keeps going if you leave the Session page. | Fully working. Browsers need a tap before they allow sound, so after reopening the app it starts on your first tap. |
| One-tap timer presets (open-ended, 25, 45, 90 minutes, Pomodoro 25/5 and 50/10), Space or K to pause and resume on desktop, and a Share button after a session (the share sheet, or copy to clipboard) | Fully working |
| **Build a car (option):** pick a car from 51 models across 19 brands (from Maruti Suzuki, Toyota, BMW and Audi up to Ferrari, Lamborghini, McLaren, Bugatti, Pagani, Koenigsegg and Rimac) in six tiers from 25 minutes to 5 hours, the top tier being hypercars. Its parts (frame, wheels, suspension, engine, body, paint) come together as you focus; progress carries across sessions and finished cars go in your garage. Names are plain text with no logos. While building, the artwork is a simple illustration of each body style; once a car is built, its real photo appears in the garage (see Photo credits below). A plain ring is also available. | Fully working |
| **Owner dashboard:** an "Admin dashboard" page, visible only to the account listed as owner in the database, with Overview, Visitors and Accounts sections: visitors (today, week, month, all time, returning, installed), how many started and finished studying, sign-ups, who made friends, a visit-to-friends funnel and 30-day charts. | Fully working once `supabase/schema.sql` is re-run and the owner step in docs/FRIENDS_SETUP.md is done. Counts are per device, not per person. |
| Keep-screen-on during sessions | Works where the browser supports the Wake Lock API |
| Friends, presence, shared focus rooms | **Demo by default** (simulated from the clock, labelled "Demo"/"Simulated"). **Real friends** switch on when a Supabase project is connected: an email + password account, a 6-digit friend code you share (like a ride-share OTP; type a friend's code and you're friends), invite links, opt-in presence, shared rooms, updated about every 20 seconds. Signing in on a new phone brings the code and friends back. See [docs/FRIENDS_SETUP.md](docs/FRIENDS_SETUP.md). |
| First launch | Opens in **demo mode** with sample sessions, exams and simulated friends, flagged with a "Demo" strip. Browsing never changes anything. Your first real action (start a session, add a subject or exam, log a past session) clears the sample data and starts a fresh space. "Start fresh now" in the strip or "Remove demo data" in Settings does the same. |
| Push notifications, background alerts, cross-device sync | **Not implemented.** Chimes only play while the app is open. |

Study data stays in the browser's localStorage. Your sessions, subjects, topics and notes are never uploaded. When a Supabase project is connected, the app also sends a few **anonymous usage counts** (opened the app, started or finished a session, built a car, installed the app) tagged with a random id on the device, so the owner can see how the app is used. There is a plain-words note on Home and a switch in Settings → Privacy; turning it off also deletes that device's counts. Without a Supabase project nothing is sent. Privacy sharing toggles for friends are off by default.

## Still needed for real users

- **Backend + accounts:** authentication, a database for sessions/exams/subjects, sync across devices, data export/deletion endpoints.
- **Real friends hardening:** the backend is written but needs the one-time setup in docs/FRIENDS_SETUP.md (run the SQL, set the redirect URL, sort out email delivery). Still to build: blocking/reporting, rate limiting on friend-code guesses, true real-time updates (it polls every ~20s), and a privacy policy that matches what is shared.
- **Notifications:** Web Push needs a push server, VAPID keys and user permission flow (supported on iOS 16.4+ only for installed home-screen apps). Until then there are no background alerts.
- **Hosting:** any static HTTPS host (Netlify, Vercel, Cloudflare Pages, GitHub Pages). The build uses relative paths and hash routing, so no rewrite rules are required.
- **Icons/branding:** the generated hexagon icons are placeholders. Add a splash/screenshots set for nicer install prompts.
- **App stores (optional):** the PWA works on its own. To list it in Google Play, wrap it as a Trusted Web Activity (e.g. Bubblewrap/PWABuilder). The Apple App Store requires a native wrapper (e.g. Capacitor) and review, and background timers/notifications would need native APIs there.
- **Testing:** run on real iOS Safari and Android Chrome devices; automated tests currently cover the logic, not the UI.

## Photo credits

The car photos in `public/cars/` come from [Wikimedia Commons](https://commons.wikimedia.org/) and are used under their free licences
(CC BY, CC BY-SA or CC0). They were resized and converted to WebP for the app. Each photo's author, licence and source page are listed in
[`src/data/carPhotos.ts`](src/data/carPhotos.ts) and shown in the app under **Garage → Photo credits**. Brand and model names belong to their owners.
To change a photo, replace the file in `public/cars/` and update its entry in `carPhotos.ts`.
