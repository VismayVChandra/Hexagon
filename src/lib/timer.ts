import type { ActiveSession, PomodoroConfig } from '../types';
import { MIN } from './time';

/**
 * Timer engine. The only stored state is `runMs` (running time before the current
 * segment) and `resumedAt` (when the current segment began, null if paused).
 * Everything else — studied time, breaks, phase, remaining time — is a pure
 * function of those and `now`, so it is correct after backgrounding or a reload.
 */

export type Phase = 'focus' | 'break' | 'done';

export interface TimerView {
  running: boolean;
  /** Total running time (pauses excluded). */
  totalRunMs: number;
  /** Time that counts as studying. */
  studiedMs: number;
  /** Pomodoro break time (never counted as studying). */
  breakMs: number;
  phase: Phase;
  /** 1-based focus block number (Pomodoro), else 1. */
  block: number;
  /** Length of the current phase, if bounded. */
  phaseLengthMs: number | null;
  /** Time left in the current phase, if bounded. */
  phaseRemainingMs: number | null;
  /** The value the big clock should show. */
  displayMs: number;
  /** 0..1 progress through the current bounded phase, null if unbounded. */
  progress: number | null;
  done: boolean;
  /** For Pomodoro: whether the upcoming break is a long one. */
  nextBreakLong: boolean;
}

export function runTotal(s: ActiveSession, now: number): number {
  return s.runMs + (s.resumedAt != null ? Math.max(0, now - s.resumedAt) : 0);
}

interface Block {
  kind: 'focus' | 'break';
  ms: number;
  long?: boolean;
}

export function pomodoroBlocks(p: PomodoroConfig): Block[] {
  const n = Math.max(1, Math.floor(p.cyclesBeforeLong));
  const blocks: Block[] = [];
  for (let i = 0; i < n; i++) {
    blocks.push({ kind: 'focus', ms: p.focusMin * MIN });
    const long = i === n - 1 && n > 1;
    blocks.push({ kind: 'break', ms: (long ? p.longBreakMin : p.breakMin) * MIN, long });
  }
  return blocks;
}

export function computeView(s: ActiveSession, now: number): TimerView {
  const total = runTotal(s, now);
  const running = s.resumedAt != null;
  const base = { running, totalRunMs: total };

  if (s.config.mode === 'countdown') {
    const target = (s.config.targetMin ?? 25) * MIN;
    const studied = Math.min(total, target);
    const remaining = Math.max(0, target - total);
    const done = total >= target;
    return {
      ...base,
      studiedMs: studied,
      breakMs: 0,
      phase: done ? 'done' : 'focus',
      block: 1,
      phaseLengthMs: target,
      phaseRemainingMs: remaining,
      displayMs: remaining,
      progress: target > 0 ? studied / target : 1,
      done,
      nextBreakLong: false,
    };
  }

  if (s.config.mode === 'pomodoro' && s.config.pomodoro) {
    const blocks = pomodoroBlocks(s.config.pomodoro);
    const focusPerSuper = blocks.filter((b) => b.kind === 'focus').reduce((a, b) => a + b.ms, 0);
    const superLen = blocks.reduce((a, b) => a + b.ms, 0);
    const superIdx = Math.floor(total / superLen);
    let pos = total - superIdx * superLen;
    let studied = superIdx * focusPerSuper;
    let focusDone = superIdx * blocks.filter((b) => b.kind === 'focus').length;
    let current: Block = blocks[0];
    let intoBlock = 0;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (pos < b.ms || i === blocks.length - 1) {
        current = b;
        intoBlock = Math.min(pos, b.ms);
        if (b.kind === 'focus') {
          studied += intoBlock;
          focusDone += 1;
        }
        break;
      }
      pos -= b.ms;
      if (b.kind === 'focus') {
        studied += b.ms;
        focusDone += 1;
      }
    }
    const remaining = Math.max(0, current.ms - intoBlock);
    // Is the next break the long one? Find the next break after the current focus block.
    const focusInSuper = (focusDone - 1) % blocks.filter((b) => b.kind === 'focus').length;
    const nextBreakLong = current.kind === 'focus' && focusInSuper === blocks.filter((b) => b.kind === 'focus').length - 1 && blocks.length > 2;
    return {
      ...base,
      studiedMs: studied,
      breakMs: Math.max(0, total - studied),
      phase: current.kind,
      block: Math.max(1, focusDone),
      phaseLengthMs: current.ms,
      phaseRemainingMs: remaining,
      displayMs: remaining,
      progress: current.ms > 0 ? intoBlock / current.ms : 1,
      done: false,
      nextBreakLong,
    };
  }

  // stopwatch
  return {
    ...base,
    studiedMs: total,
    breakMs: 0,
    phase: 'focus',
    block: 1,
    phaseLengthMs: null,
    phaseRemainingMs: null,
    displayMs: total,
    progress: null,
    done: false,
    nextBreakLong: false,
  };
}

// ---- state transitions (pure; return a new ActiveSession) ----

export function pause(s: ActiveSession, now: number): ActiveSession {
  if (s.resumedAt == null) return s;
  return { ...s, runMs: runTotal(s, now), resumedAt: null, lastSeenAt: now };
}

export function resume(s: ActiveSession, now: number): ActiveSession {
  if (s.resumedAt != null) return s;
  return { ...s, resumedAt: now, lastSeenAt: now };
}

/** Pomodoro only: jump past the remaining break time. */
export function skipBreak(s: ActiveSession, now: number): ActiveSession {
  const v = computeView(s, now);
  if (s.config.mode !== 'pomodoro' || v.phase !== 'break' || v.phaseRemainingMs == null) return s;
  return { ...s, runMs: s.runMs + v.phaseRemainingMs };
}

/** Countdown only: add minutes. Time spent past the old target is not counted as studying. */
export function extendCountdown(s: ActiveSession, addMin: number, now: number): ActiveSession {
  if (s.config.mode !== 'countdown') return s;
  const target = (s.config.targetMin ?? 25) * MIN;
  const clamped = Math.min(runTotal(s, now), target);
  return {
    ...s,
    config: { ...s.config, targetMin: (s.config.targetMin ?? 25) + addMin },
    runMs: clamped,
    resumedAt: s.resumedAt != null ? now : null,
  };
}

/**
 * Called when the app reopens with a session still marked as running and a long
 * gap since it was last seen. Stops the clock at the last heartbeat.
 */
export function stopAtLastSeen(s: ActiveSession): ActiveSession {
  if (s.resumedAt == null) return s;
  const at = Math.max(s.resumedAt, s.lastSeenAt);
  return { ...s, runMs: s.runMs + (at - s.resumedAt), resumedAt: null };
}

export const AWAY_THRESHOLD_MS = 20 * MIN;

export function modeLabel(mode: ActiveSession['config']['mode']): string {
  return mode === 'stopwatch' ? 'Stopwatch' : mode === 'countdown' ? 'Countdown' : 'Pomodoro';
}
