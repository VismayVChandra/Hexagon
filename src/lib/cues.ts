import type { ActiveSession } from '../types';
import { computeView } from './timer';
import { MIN } from './time';

/**
 * Works out what is about to happen in a running session (a timer reaching zero, a Pomodoro block ending, a stopwatch
 * milestone, today's goal being passed, a car being finished) and exactly when. Pure, so it can be tested without a clock.
 * The app-wide CueHost uses it to line up sounds and notifications ahead of time.
 */
export type CueEventKind = 'timerDone' | 'focusEnd' | 'breakEnd' | 'milestone' | 'goal' | 'car';

export interface UpcomingEvent {
  /** Stays the same for the same moment, so it is only announced once. */
  key: string;
  kind: CueEventKind;
  /** When it happens (epoch milliseconds). */
  at: number;
  /** Which focus block or milestone it belongs to, for messages. */
  n?: number;
  /** Another, more important moment happens right then, so this one makes no sound of its own. */
  hush?: boolean;
}

const PRIORITY: Record<CueEventKind, number> = { timerDone: 5, focusEnd: 4, breakEnd: 4, car: 3, goal: 2, milestone: 1 };

export interface CueContext {
  /** Stopwatch chime interval in minutes; 0 = none. */
  stopwatchChimeMin: number;
  /** Study time still needed to reach today's goal, or null if already reached. */
  goalRemainingMs: number | null;
  /** Study time still needed to finish the car being built, or null if none / already finished. */
  carRemainingMs: number | null;
  carId?: string;
  /** Today's date key, so "goal reached" is announced once a day. */
  dayKey: string;
}

export function upcomingEvents(a: ActiveSession, now: number, ctx: CueContext): UpcomingEvent[] {
  if (a.resumedAt == null) return [];
  const v = computeView(a, now);
  const out: UpcomingEvent[] = [];
  let boundary: number | null = null;

  if (a.config.mode === 'countdown') {
    if (!v.done && v.phaseRemainingMs != null) {
      boundary = now + v.phaseRemainingMs;
      out.push({ key: `done-${a.config.targetMin ?? 25}`, kind: 'timerDone', at: boundary });
    }
  } else if (a.config.mode === 'pomodoro') {
    if (v.phaseRemainingMs != null) {
      boundary = now + v.phaseRemainingMs;
      out.push(v.phase === 'focus' ? { key: `fe-${v.block}`, kind: 'focusEnd', at: boundary, n: v.block } : { key: `be-${v.block}`, kind: 'breakEnd', at: boundary, n: v.block + 1 });
    }
  } else if (ctx.stopwatchChimeMin > 0) {
    const step = ctx.stopwatchChimeMin * MIN;
    const n = Math.floor(v.totalRunMs / step) + 1;
    out.push({ key: `ms-${n}`, kind: 'milestone', at: now + (n * step - v.totalRunMs), n });
  }

  // Goals and cars only move while studying, and only up to the end of the current block.
  const studying = v.phase === 'focus' && !v.done;
  if (studying) {
    if (ctx.goalRemainingMs != null && ctx.goalRemainingMs > 0) out.push({ key: `goal-${ctx.dayKey}`, kind: 'goal', at: now + ctx.goalRemainingMs });
    if (ctx.carRemainingMs != null && ctx.carRemainingMs > 0) out.push({ key: `car-${ctx.carId ?? ''}`, kind: 'car', at: now + ctx.carRemainingMs });
  }

  // A goal or car that would only be reached after the block ends is worked out again once the next block starts.
  const within = (e: UpcomingEvent) => (e.kind !== 'goal' && e.kind !== 'car') || boundary == null || e.at <= boundary;
  const list = out.filter(within).sort((x, y) => x.at - y.at);
  // Two tunes at the same moment would clash: the more important one plays alone.
  return list.map((e) => (list.some((o) => o !== e && PRIORITY[o.kind] > PRIORITY[e.kind] && Math.abs(o.at - e.at) < 3000) ? { ...e, hush: true } : e));
}
