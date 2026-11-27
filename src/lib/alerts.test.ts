import { describe, expect, it } from 'vitest';
import type { ActiveSession, Exam, SessionSummary } from '../types';
import { CUE_TONES } from '../types';
import { upcomingEvents, type CueContext } from './cues';
import { CUES, cueGain, cueLength, planCue } from './sfx';
import { NUDGE_DAYS, buildNudgePlan, nudgeMessage, pickNudge, rewardMessage, timerAlert, type NudgePlan } from './messages';
import { MIN, dayKey } from './time';

const T0 = new Date(2026, 10, 27, 10, 0, 0).getTime();

function session(config: ActiveSession['config'], over: Partial<ActiveSession> = {}): ActiveSession {
  return { id: 's', subjectId: 'x', topic: '', goal: '', config, startedAt: T0, runMs: 0, resumedAt: T0, lastSeenAt: T0, friendIds: [], ...over };
}
const ctx = (over: Partial<CueContext> = {}): CueContext => ({ stopwatchChimeMin: 30, goalRemainingMs: null, carRemainingMs: null, dayKey: '2026-11-27', ...over });

describe('timer sounds', () => {
  it('has a tune in every voice for every moment, in order and in range', () => {
    for (const tone of CUE_TONES) {
      for (const { id } of CUES) {
        const notes = planCue(id, tone);
        expect(notes.length).toBeGreaterThan(0);
        for (const n of notes) {
          expect(n.hz).toBeGreaterThan(100);
          expect(n.hz).toBeLessThan(4000);
          expect(n.duration).toBeGreaterThan(0.1);
          expect(n.gain).toBeGreaterThan(0);
          expect(n.gain).toBeLessThanOrEqual(1);
        }
        expect(cueLength(id, tone)).toBeLessThan(5);
      }
    }
  });

  it('gives each action its own tune', () => {
    const shape = (id: (typeof CUES)[number]['id']) => planCue(id, 'bell').map((n) => `${Math.round(n.hz)}@${n.start}`).join(',');
    const shapes = CUES.map((c) => shape(c.id));
    expect(new Set(shapes).size).toBe(CUES.length);
  });

  it('keeps chords from getting louder than single notes', () => {
    const done = planCue('timerDone', 'bell');
    const chord = done.filter((n) => n.start === 1.2);
    expect(chord).toHaveLength(4);
    const power = chord.reduce((a, n) => a + n.gain ** 2, 0);
    expect(power).toBeCloseTo(1, 5);
  });

  it('maps the volume slider to a gentle, always-audible range', () => {
    expect(cueGain(0)).toBeGreaterThan(0.02);
    expect(cueGain(1)).toBeLessThan(0.5);
    expect(cueGain(0.5)).toBeLessThan(cueGain(0.9));
    expect(cueGain(-3)).toBe(cueGain(0));
    expect(cueGain(9)).toBe(cueGain(1));
  });
});

describe('what is about to happen in a session', () => {
  it('knows nothing is coming while paused', () => {
    expect(upcomingEvents(session({ mode: 'countdown', targetMin: 30 }, { resumedAt: null }), T0, ctx())).toEqual([]);
  });

  it('countdown: rings when the time is up, accounting for time already run', () => {
    const a = session({ mode: 'countdown', targetMin: 30 }, { runMs: 10 * MIN, resumedAt: T0 });
    const [e] = upcomingEvents(a, T0 + 5 * MIN, ctx());
    expect(e.kind).toBe('timerDone');
    expect(e.at).toBe(T0 + 5 * MIN + 15 * MIN);
    expect(upcomingEvents(a, T0 + 25 * MIN, ctx())).toEqual([]); // already done
  });

  it('pomodoro: focus end, then break end, then the next focus end', () => {
    const cfg = { mode: 'pomodoro' as const, pomodoro: { focusMin: 25, breakMin: 5, longBreakMin: 15, cyclesBeforeLong: 4 } };
    const a = session(cfg);
    const focus = upcomingEvents(a, T0 + 10 * MIN, ctx())[0];
    expect([focus.kind, focus.at]).toEqual(['focusEnd', T0 + 25 * MIN]);
    const brk = upcomingEvents(a, T0 + 26 * MIN, ctx())[0];
    expect([brk.kind, brk.at, brk.n]).toEqual(['breakEnd', T0 + 30 * MIN, 2]);
    const next = upcomingEvents(a, T0 + 31 * MIN, ctx())[0];
    expect([next.kind, next.at]).toEqual(['focusEnd', T0 + 55 * MIN]);
  });

  it('stopwatch: a milestone at the next interval, and none when switched off', () => {
    const a = session({ mode: 'stopwatch' });
    const [m] = upcomingEvents(a, T0 + 12 * MIN, ctx({ stopwatchChimeMin: 30 }));
    expect([m.kind, m.at, m.key]).toEqual(['milestone', T0 + 30 * MIN, 'ms-1']);
    const [m2] = upcomingEvents(a, T0 + 31 * MIN, ctx({ stopwatchChimeMin: 30 }));
    expect(m2.key).toBe('ms-2');
    expect(upcomingEvents(a, T0, ctx({ stopwatchChimeMin: 0 }))).toEqual([]);
  });

  it('announces the daily goal and a finished car while studying, once each', () => {
    const a = session({ mode: 'stopwatch' });
    const evs = upcomingEvents(a, T0, ctx({ stopwatchChimeMin: 0, goalRemainingMs: 20 * MIN, carRemainingMs: 40 * MIN, carId: 'c' }));
    expect(evs.map((e) => [e.kind, e.at - T0])).toEqual([
      ['goal', 20 * MIN],
      ['car', 40 * MIN],
    ]);
    expect(evs.map((e) => e.key)).toEqual(['goal-2026-11-27', 'car-c']);
  });

  it('ignores a goal that would only be reached after the current block ends', () => {
    const cfg = { mode: 'pomodoro' as const, pomodoro: { focusMin: 25, breakMin: 5, longBreakMin: 15, cyclesBeforeLong: 4 } };
    const evs = upcomingEvents(session(cfg), T0, ctx({ goalRemainingMs: 60 * MIN }));
    expect(evs.map((e) => e.kind)).toEqual(['focusEnd']);
  });

  it('mutes the lesser tune when two moments land together', () => {
    const a = session({ mode: 'countdown', targetMin: 30 });
    const evs = upcomingEvents(a, T0, ctx({ goalRemainingMs: 30 * MIN - 1000 }));
    const done = evs.find((e) => e.kind === 'timerDone')!;
    const goal = evs.find((e) => e.kind === 'goal')!;
    expect(done.hush).toBeUndefined();
    expect(goal.hush).toBe(true);
  });
});

const summary = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionId: 's',
  subjectId: 'x',
  studiedMs: 45 * MIN,
  todayMs: 45 * MIN,
  dailyGoalMs: 90 * MIN,
  goalReached: false,
  streakDays: 4,
  streakExtended: true,
  newBestStreak: false,
  weekMs: 0,
  weeklyGoalMs: 0,
  cellsAdded: 9,
  hiveCells: 40,
  goldenEarned: false,
  ...over,
});

describe('notification wording', () => {
  it('tells the student what they studied and earned', () => {
    const m = rewardMessage(summary(), 'Physics');
    expect(m.title).toBe('45m of Physics saved');
    expect(m.body).toContain('+9 honey cells');
    expect(m.body).toContain('4-day streak');
  });

  it('celebrates a finished car and a reached goal first', () => {
    expect(rewardMessage(summary({ car: { id: 'c', name: 'Ferrari 488', completed: true, progress: 1 } }), 'Maths').title).toBe('Ferrari 488 is finished 🏁');
    expect(rewardMessage(summary({ goalReached: true })).title).toBe('Daily goal reached 🎯');
  });

  it('says something sensible when nothing special was earned', () => {
    const m = rewardMessage(summary({ cellsAdded: 0, streakExtended: false }));
    expect(m.body).toBe('Saved to your progress.');
  });

  it('writes a timer alert for each moment, and none for a stopwatch milestone', () => {
    expect(timerAlert('timerDone', { subject: 'Biology', studiedMs: 30 * MIN })!.title).toBe('Time’s up — 30m of Biology');
    expect(timerAlert('focusEnd', { breakMin: 5 })!.body).toContain('5 minutes');
    expect(timerAlert('breakEnd', { nextBlock: 2 })!.body).toContain('block 2');
    expect(timerAlert('milestone', {})).toBeNull();
  });

  it('nudges more gently the longer someone is away, and uses an upcoming exam when there is one', () => {
    const base = { name: 'Sam', streak: 5 };
    expect(nudgeMessage(1, base).title).toContain('5-day streak');
    expect(nudgeMessage(1, { name: '', streak: 0 }).title).toContain('Ready for today');
    expect(nudgeMessage(2, base).title).toContain('lonely');
    expect(nudgeMessage(3, base).title).toContain('honey');
    expect(nudgeMessage(7, base).title).toBe('It’s been a week');
    expect(nudgeMessage(14, base).body).toContain('won’t keep nudging');
    expect(nudgeMessage(2, { ...base, exam: { subject: 'Physics', days: 4 } }).title).toBe('Physics exam in 4 days');
    expect(nudgeMessage(7, { ...base, exam: { subject: 'Physics', days: 4 } }).title).toBe('It’s been a week'); // exam talk only in the first days
  });

  it('never shames: no message is a scolding', () => {
    for (const d of NUDGE_DAYS) {
      const m = nudgeMessage(d, { name: 'Sam', streak: 3 });
      expect(`${m.title} ${m.body}`.toLowerCase()).not.toMatch(/lazy|disappoint|give up|failed|shame/);
    }
  });
});

describe('come-back reminder plan', () => {
  const plan = (over: Partial<NudgePlan> = {}): NudgePlan => ({
    ...buildNudgePlan({ enabled: true, hour: 18, anchorDay: '2026-11-20', name: '', streak: 3, exams: [], subjectName: () => undefined, url: 'x', now: T0 }),
    ...over,
  });

  it('has a message for each reminder day', () => {
    expect(plan().messages.map((m) => m.days)).toEqual([...NUDGE_DAYS]);
  });

  it('works out exam countdowns for the day each reminder would be sent', () => {
    const exam: Exam = { id: 'e', subjectId: 's', date: dayKey(T0 + 3 * 86_400_000), notes: '', targetHours: 5, createdAt: 0 };
    const p = buildNudgePlan({ enabled: true, hour: 18, anchorDay: dayKey(T0), name: '', streak: 0, exams: [exam], subjectName: () => 'Physics', url: 'x', now: T0 });
    expect(p.messages.find((m) => m.days === 1)!.title).toBe('Physics exam in 2 days');
    expect(p.messages.find((m) => m.days === 3)!.title).toBe('Physics exam is today');
  });

  it('sends nothing when switched off, too early, at night, or if already studied today', () => {
    expect(pickNudge(plan({ enabled: false }), '2026-11-22', 19)).toBeNull();
    expect(pickNudge(plan(), '2026-11-22', 9)).toBeNull();
    expect(pickNudge(plan(), '2026-11-22', 22)).toBeNull();
    expect(pickNudge(plan({ anchorDay: '2026-11-22' }), '2026-11-22', 19)).toBeNull();
  });

  it('sends the right reminder for the days away, once a day, and never the same one twice', () => {
    const p = plan();
    expect(pickNudge(p, '2026-11-21', 19)!.days).toBe(1);
    expect(pickNudge(p, '2026-11-22', 19)!.days).toBe(2);
    expect(pickNudge(p, '2026-11-23', 19)!.days).toBe(3);
    // The phone was asleep for days: send the latest due one, not a pile.
    expect(pickNudge(p, '2026-11-27', 19)!.days).toBe(7);
    const sentToday = { ...p, sent: { anchorDay: p.anchorDay, days: 2, on: '2026-11-22' } };
    expect(pickNudge(sentToday, '2026-11-22', 20)).toBeNull();
    expect(pickNudge(sentToday, '2026-11-23', 20)!.days).toBe(3);
    expect(pickNudge({ ...p, sent: { anchorDay: p.anchorDay, days: 7, on: '2026-11-27' } }, '2026-11-28', 19)).toBeNull();
  });

  it('starts over after the student studies again, and stops after two weeks away', () => {
    const p = plan({ anchorDay: '2026-11-25', sent: { anchorDay: '2026-11-20', days: 14, on: '2026-11-24' } });
    expect(pickNudge(p, '2026-11-26', 19)!.days).toBe(1);
    expect(pickNudge(plan({ anchorDay: '2026-11-01' }), '2026-11-27', 19)).toBeNull();
  });
});
