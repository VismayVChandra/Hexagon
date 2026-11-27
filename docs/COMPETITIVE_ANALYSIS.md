# Hexagon vs. the study-timer field

A plain comparison of Hexagon with the apps students actually reach for, what they do better, where Hexagon is
different, and what was added after looking at the gaps. Competitor details come from public listings and review roundups
(linked at the end); prices change and differ by country, so treat them as indicative.

## The field in one paragraph each

**Forest.** A focus timer where a virtual tree grows while you stay off your phone and dies if you leave. It has app
blocking and screen-time stats, unlockable tree species, shared "plant together" sessions, and coins that fund real
tree planting through a partner charity (capped per account). Core planting is free; there is a Plus tier, and reported
one-time prices are around $4 to $6 depending on store and country. Its strength is the stake it puts on your phone use.

**Focusmate.** Not a timer at all: it pairs you with a live partner on video for a silent work session ("body
doubling"). Accountability from another person is the product. It is paid beyond a free tier.

**Study Together / StudyStream and similar.** Live study rooms with video or voice, Pomodoro timers, task lists, streaks
and (in some) leaderboards and a global hours ranking. Free with paid upgrades, typically a few dollars a month. The
draw is crowd energy: being in a room with other people studying.

**Pomofocus and Focus To-Do style timers.** Simple, fast Pomodoro with a task list, no account, free with a small paid
tier for themes and reports. The draw is zero friction.

## Where each one beats Hexagon today

| Area | Better elsewhere | Why it matters |
| --- | --- | --- |
| Live company | Focusmate, StudyStream, Study Together | Seeing a real person study next to you is the strongest motivator for many students. Hexagon shows friends' presence only (no video, no voice). |
| Phone discipline | Forest | Native apps can block other apps. A web app (PWA) cannot, on any platform. |
| Real-world meaning | Forest | Real trees planted from coins gives focus a purpose beyond a score. |
| Reach and community | All of them | Millions of users, public rooms, rankings. Hexagon is new and small. |
| Reminders | Native apps | Hexagon can only chime while the app is open; it cannot wake a closed phone. |

## Where Hexagon is different, and better for the right student

- **No account, works offline, free.** Open it and study. Data stays on the device unless the student opts into Friends.
- **Honest by design.** Break time never counts as study time. Hand-logged sessions never earn rewards. Demo content is
  labelled and disappears the moment you start for real. There are no public rankings and no streak-shaming.
- **Rewards that mean something.** Honey cells fill from real, timed focus (one per 5 minutes) and grow into a visible
  hive with bee ranks. The optional car build carries progress across sessions into a garage of real models.
- **Planning, not just timing.** Exams with a realistic weekly-goal helper, daily and weekly goals, and a consistency
  calendar sit in the same app as the timer.
- **Quiet, private friends.** Friends see only "studying / online" if you choose to share. No chat, no scores.
- **Recovery that respects the student.** Timing is based on timestamps, so a locked screen, a reload or a crash does
  not lose the session, and a long gap asks before counting it.

## What the gap analysis led to (shipped)

| Gap seen in competitors | What Hexagon now does |
| --- | --- |
| Every timer rival has a task list (Pomofocus, Focus To-Do, StudyStream) | **Plan checklist.** Add tasks when you start or mid-session, tick them off, and see "2 of 3 done" in the summary, history and Progress. |
| Forest and StudyStream offer white noise / ambience | **Ambient sound.** Rain, brown noise and waves, generated on the device (no audio files, works offline). It plays while the timer runs and rests during pauses and Pomodoro breaks, even if you leave the Session page. |
| Rivals show stats but not *when you focus best* | **Focus rating and "When you focus".** Rate how focused a session felt in one tap; Progress shows which part of the day you study most, how focused you feel then, average and longest session, and plan completion. |
| Zero-friction timers start in one tap | **One-tap presets** (open-ended, 25, 45 or 90 minutes, Pomodoro 25/5 and 50/10) and topic, goal and plan tucked into "Add details", so the first screen is subject, timer, go. |
| Desktop users expect shortcuts | **Space or K** pauses and resumes. |
| Growth comes from sharing | **Share** after a session sends a short line (no name, only what the student chooses to send). |

## Bugs found and fixed in this pass

- Dismissing the Finish sheet (tap outside, X, or Escape) left the timer **silently paused**, so a student who closed it by
  accident kept "studying" with the clock stopped. Dismissing now resumes where they were.
- A session under a minute was announced as "Session complete". It now says it was a quick session.
- Small text buttons had touch areas of about 32 px. They now have a comfortable hit area without changing the layout.

## What is still missing, in order of value

1. **Live focus rooms.** The presence backend already exists. Real-time rooms where friends see each other's timers tick,
   still with no chat or rankings, would close the biggest gap with Focusmate and Study Together without video.
2. **Streak-at-risk reminders.** Needs web push (a server and the student's permission). The one reminder that matters.
3. **Weekly recap.** A Sunday summary card (hours, best day, best time of day, cells made) built from data already collected.
4. **Exam plan to calendar.** Export the weekly plan as an .ics file.
5. **A gentle "you left" note.** When the student leaves the app during a session, show how long they were away on return.
   It cannot block apps like Forest, but it can make leaving visible.

## Sources

- Forest: [forestapp.cc](https://forestapp.cc/), [App Store listing](https://apps.apple.com/app/id866450515), [ClickUp review](https://clickup.com/learn/topic/productivity/tools/forest/)
- Roundups: [Best Study Timers in 2026](https://toolfinder.co/best/study-timer-apps), [Best apps for virtual study sessions](https://www.mindomax.com/best-apps-for-virtual-study-sessions), [Pomodoro apps compared](https://goalsandprogress.com/pomodoro-apps-comparison/)
- Focusmate: [Fast Company on body doubling](https://www.fastcompany.com/90632591/focusmate-body-doubling-virtual-coworking)
- Study Together / StudyStream: [App Store listing](https://apps.apple.com/app/id6461722416)
