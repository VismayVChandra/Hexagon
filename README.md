# Hexagon

A calm, mobile-first study companion, built as an installable PWA (iOS, Android, desktop) from a single codebase.
Start a session in seconds, focus alongside (simulated) friends, track effort by subject, and plan for exams.

**Stack:** Vite + React + TypeScript, `react-router-dom` (hash routing, so any static host works), hand-written service worker. No UI or chart libraries.

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
| Keep-screen-on during sessions | Works where the browser supports the Wake Lock API |
| Friends, presence, shared focus rooms | **Demo only.** Simulated on the device from the clock. Nobody is connected. Labelled "Demo"/"Simulated" in the UI. |
| First launch | Opens in **demo mode** with sample sessions, exams and simulated friends, flagged with a "Demo" strip. Browsing never changes anything. Your first real action (start a session, add a subject or exam, log a past session) clears the sample data and starts a fresh space. "Start fresh now" in the strip or "Remove demo data" in Settings does the same. |
| Push notifications, background alerts, cross-device sync | **Not implemented.** Chimes only play while the app is open. |

Study data stays in the browser's localStorage. Nothing is uploaded and there is no analytics. Privacy sharing toggles are off by default.

## Still needed for real users

- **Backend + accounts:** authentication, a database for sessions/exams/subjects, sync across devices, data export/deletion endpoints.
- **Real friends and rooms:** a presence service (WebSocket or similar), invitations/friend requests, blocking and reporting, and a privacy policy that matches what is shared.
- **Notifications:** Web Push needs a push server, VAPID keys and user permission flow (supported on iOS 16.4+ only for installed home-screen apps). Until then there are no background alerts.
- **Hosting:** any static HTTPS host (Netlify, Vercel, Cloudflare Pages, GitHub Pages). The build uses relative paths and hash routing, so no rewrite rules are required.
- **Icons/branding:** the generated hexagon icons are placeholders. Add a splash/screenshots set for nicer install prompts.
- **App stores (optional):** the PWA works on its own. To list it in Google Play, wrap it as a Trusted Web Activity (e.g. Bubblewrap/PWABuilder). The Apple App Store requires a native wrapper (e.g. Capacitor) and review, and background timers/notifications would need native APIs there.
- **Testing:** run on real iOS Safari and Android Chrome devices; automated tests currently cover the logic, not the UI.
