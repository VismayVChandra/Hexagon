import { useEffect, useRef, useState } from 'react';
import { getState, useStore } from '../store/store';
import { haptic, primeAudio, showToast } from '../hooks/hooks';
import { computeView } from '../lib/timer';
import { MIN, dayKey } from '../lib/time';
import { todayMs } from '../lib/stats';
import { buildMs, carById } from '../data/cars';
import { upcomingEvents, type CueEventKind, type UpcomingEvent } from '../lib/cues';
import { audioReady, playCue, scheduleCue, type Cue, type CueHandle } from '../lib/sfx';
import { resumeAudio } from '../lib/ambient';
import { rewardMessage, timerAlert } from '../lib/messages';
import { showNotification, syncNudges } from '../lib/notify';
import type { Settings } from '../types';

const CUE_FOR: Record<CueEventKind, Cue> = { timerDone: 'timerDone', focusEnd: 'focusEnd', breakEnd: 'breakEnd', milestone: 'milestone', goal: 'goal', car: 'reward' };

/** The "time's up" alarm rings this many seconds apart when repeating is on. */
const RING_GAP_S = 9;

/**
 * Sounds and alerts for a running session, kept at the top of the app so they work on every page, not just the timer.
 *  - Lines up the next moment (timer done, block end, stopwatch milestone, goal, finished car) on the audio clock, which
 *    keeps ticking when the screen is off, and on an ordinary timer for notifications and vibration.
 *  - Plays a small tune when you start, pause or resume, and a fanfare when you save a session.
 *  - Shows a system notification for things that happen while Hexagon is in the background.
 *  - Any tap or key press silences a ringing alarm.
 */
export function CueHost() {
  const { data, summary } = useStore();
  const settings = data.settings;
  const active = data.active;
  const running = !!active && active.resumedAt != null;
  const [tick, setTick] = useState(0);

  // Browsers keep sound switched off until the page has been tapped (for example after the app is reopened mid-session).
  // Say so, instead of letting the timer finish in silence.
  const wantsSound = running && (settings.sound || settings.ambient !== 'off');
  const [audioOn, setAudioOn] = useState(true);
  useEffect(() => {
    if (!wantsSound) return;
    primeAudio();
    const check = () => setAudioOn(audioReady());
    check();
    const timer = window.setInterval(check, 1000);
    return () => window.clearInterval(timer);
  }, [wantsSound]);

  const latest = useRef(settings);
  latest.current = settings;
  const fired = useRef<{ id: string | null; keys: Set<string> }>({ id: null, keys: new Set() });
  const ringing = useRef<CueHandle[]>([]);

  const hushAlarm = () => {
    ringing.current.forEach((h) => h.cancel());
    ringing.current = [];
  };

  // Any tap or key silences the alarm, and wakes the audio engine if the browser still wants a tap first.
  useEffect(() => {
    const onTap = () => {
      hushAlarm();
      if (getState().data.active) void resumeAudio();
    };
    window.addEventListener('pointerdown', onTap, { capture: true });
    window.addEventListener('keydown', onTap, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onTap, { capture: true });
      window.removeEventListener('keydown', onTap, { capture: true });
    };
  }, []);

  // Coming back to the app: look at the clock again (timers run late while a page is in the background).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Start, pause and resume.
  const prev = useRef<{ id: string | null; running: boolean } | null>(null);
  const id = active?.id ?? null;
  useEffect(() => {
    const before = prev.current;
    prev.current = { id, running };
    if (!before || !latest.current.sound) return;
    const s = latest.current;
    if (id && id !== before.id && running) playCue('start', s.cueTone, s.cueVolume);
    else if (id && id === before.id && running !== before.running) playCue(running ? 'start' : 'pause', s.cueTone, s.cueVolume);
    if (!id) hushAlarm();
  }, [id, running]);

  // The next moments in a running session.
  const runMs = active?.runMs;
  const resumedAt = active?.resumedAt;
  const config = active?.config;
  useEffect(() => {
    if (!active || active.resumedAt == null) return;
    if (fired.current.id !== active.id) fired.current = { id: active.id, keys: new Set() };
    const s = latest.current;
    const state = getState().data;
    const now = Date.now();
    const view = computeView(active, now);
    const todayDay = dayKey(now);
    const doneToday = todayMs(state.sessions, now) + (dayKey(active.startedAt) === todayDay ? view.studiedMs : 0);
    const goalMs = s.dailyGoalMin * MIN;
    const car = active.scene === 'car' ? carById(active.carId) : undefined;
    const carLeft = car ? buildMs(car) - (state.builds[car.id] ?? 0) - view.studiedMs : null;
    const events = upcomingEvents(active, now, {
      stopwatchChimeMin: s.stopwatchChimeMin,
      goalRemainingMs: doneToday < goalMs ? goalMs - doneToday : null,
      carRemainingMs: carLeft != null && carLeft > 0 ? carLeft : null,
      carId: car?.id,
      dayKey: todayDay,
    });

    const timers: number[] = [];
    const lined: { key: string; handles: CueHandle[] }[] = [];

    for (const ev of events) {
      if (fired.current.keys.has(ev.key)) continue;
      const delay = Math.max(0, ev.at - now);
      // Sound goes on the audio clock so it is on time even if the page's timers are slowed down.
      const handles: CueHandle[] = [];
      if (s.sound && !ev.hush) {
        const rings = ev.kind === 'timerDone' && s.cueRepeat ? 3 : 1;
        for (let i = 0; i < rings; i++) {
          const h = scheduleCue(CUE_FOR[ev.kind], s.cueTone, s.cueVolume, delay / 1000 + i * RING_GAP_S);
          if (h) handles.push(h);
        }
      }
      lined.push({ key: ev.key, handles });
      timers.push(window.setTimeout(() => announce(ev, handles.length > 0), delay + 30));
    }

    function announce(ev: UpcomingEvent, soundAlreadyScheduled: boolean) {
      if (fired.current.keys.has(ev.key)) return;
      fired.current.keys.add(ev.key);
      const mine = lined.find((l) => l.key === ev.key);
      if (mine) ringing.current.push(...mine.handles); // keeps ringing; a tap silences it
      const cur = getState().data;
      const now2 = latest.current;
      if (now2.sound && !ev.hush && !soundAlreadyScheduled) {
        const rings = ev.kind === 'timerDone' && now2.cueRepeat ? 3 : 1;
        for (let i = 0; i < rings; i++) {
          const h = scheduleCue(CUE_FOR[ev.kind], now2.cueTone, now2.cueVolume, i * RING_GAP_S);
          if (h) ringing.current.push(h);
        }
      }
      if (ev.kind !== 'milestone') haptic('success', now2.haptics);
      const a = cur.active;
      const subject = a ? cur.subjects.find((x) => x.id === a.subjectId)?.name : undefined;
      const v = a ? computeView(a, Date.now()) : null;
      const info = {
        subject,
        studiedMs: v?.studiedMs,
        breakMin: a?.config.pomodoro ? (v?.nextBreakLong ? a.config.pomodoro.longBreakMin : a.config.pomodoro.breakMin) : undefined,
        nextBlock: ev.n,
        goalMin: now2.dailyGoalMin,
        car: a?.carId ? carById(a.carId)?.name : undefined,
      };
      const message = timerAlert(ev.kind, info);
      if (message) {
        if (document.visibilityState === 'visible') {
          if (ev.kind === 'goal' || ev.kind === 'car') showToast(message.title, 'success');
        } else if (alertAllowed(now2, ev.kind)) {
          void showNotification(message, { tag: `hexagon-${ev.kind}`, route: '/session' });
        }
      }
      setTick((t) => t + 1); // line up whatever comes next
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      // Cancel sounds for moments that haven't happened (a pause, a changed timer); leave ones already ringing.
      for (const l of lined) if (!fired.current.keys.has(l.key)) l.handles.forEach((h) => h.cancel());
    };
    // `active` itself changes every second elsewhere; only these inputs change what is coming up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, runMs, resumedAt, config, settings.sound, settings.cueTone, settings.cueRepeat, settings.stopwatchChimeMin, settings.dailyGoalMin, audioOn, tick]);

  // A saved session: a fanfare, and a notification of what was earned (quiet if you're looking at the app).
  const sessionId = summary?.sessionId;
  useEffect(() => {
    if (!summary || !sessionId) return;
    const s = latest.current;
    const visible = document.visibilityState === 'visible';
    if (s.sound && summary.studiedMs >= MIN) playCue('reward', s.cueTone, s.cueVolume);
    if (summary.studiedMs >= MIN && s.notify && s.notifyRewards) {
      const subject = getState().data.subjects.find((x) => x.id === summary.subjectId)?.name;
      void showNotification(rewardMessage(summary, subject), { tag: 'hexagon-reward', route: '/', silent: visible });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Keep the come-back reminder plan (used by the service worker while the app is closed) up to date.
  const realSessions = data.sessions.length;
  const examCount = data.exams.length;
  useEffect(() => {
    const d = getState().data;
    void syncNudges({ enabled: d.settings.notify && d.settings.notifyNudges, hour: d.settings.nudgeHour, name: d.settings.displayName.trim(), sessions: d.sessions, exams: d.exams, subjectName: (id) => d.subjects.find((x) => x.id === id)?.name });
  }, [settings.notify, settings.notifyNudges, settings.nudgeHour, settings.displayName, realSessions, examCount]);

  return wantsSound && !audioOn ? (
    <button type="button" className="sound-pill" onClick={() => void resumeAudio().then(setAudioOn)}>
      Tap to turn sound on
    </button>
  ) : null;
}

function alertAllowed(s: Settings, kind: CueEventKind): boolean {
  if (!s.notify) return false;
  return kind === 'goal' || kind === 'car' ? s.notifyRewards : s.notifyTimer;
}
