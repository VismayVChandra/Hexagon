import { describe, expect, it } from 'vitest';
import type { ActiveSession, TimerConfig } from '../types';
import { computeView, extendCountdown, pause, resume, runTotal, skipBreak, stopAtLastSeen } from './timer';
import { MIN } from './time';

const T0 = 1_700_000_000_000;

function make(config: TimerConfig, over: Partial<ActiveSession> = {}): ActiveSession {
  return { id: 's', subjectId: 'x', topic: '', goal: '', config, startedAt: T0, runMs: 0, resumedAt: T0, lastSeenAt: T0, friendIds: [], ...over };
}
const pomo = { mode: 'pomodoro', pomodoro: { focusMin: 25, breakMin: 5, longBreakMin: 15, cyclesBeforeLong: 4 } } as const;

describe('stopwatch', () => {
  it('derives elapsed from timestamps, not ticks', () => {
    const s = make({ mode: 'stopwatch' });
    // 3 hours later with zero intervening "ticks" (e.g. page was backgrounded)
    expect(computeView(s, T0 + 180 * MIN).studiedMs).toBe(180 * MIN);
  });

  it('does not count paused time', () => {
    let s = make({ mode: 'stopwatch' });
    s = pause(s, T0 + 10 * MIN);
    expect(computeView(s, T0 + 60 * MIN).studiedMs).toBe(10 * MIN);
    s = resume(s, T0 + 60 * MIN);
    expect(computeView(s, T0 + 75 * MIN).studiedMs).toBe(25 * MIN);
  });

  it('pause/resume are idempotent', () => {
    const s = make({ mode: 'stopwatch' });
    const p = pause(s, T0 + MIN);
    expect(pause(p, T0 + 5 * MIN)).toBe(p);
    expect(resume(s, T0 + MIN)).toBe(s);
  });

  it('survives a reload: state round-trips through JSON', () => {
    const s = pause(make({ mode: 'stopwatch' }), T0 + 7 * MIN);
    const restored = JSON.parse(JSON.stringify(s)) as ActiveSession;
    expect(runTotal(restored, T0 + 99 * MIN)).toBe(7 * MIN);
  });
});

describe('countdown', () => {
  const cfg: TimerConfig = { mode: 'countdown', targetMin: 30 };
  it('counts down and caps studied time at the target', () => {
    const s = make(cfg);
    const mid = computeView(s, T0 + 10 * MIN);
    expect(mid.displayMs).toBe(20 * MIN);
    expect(mid.done).toBe(false);
    const late = computeView(s, T0 + 50 * MIN);
    expect(late.done).toBe(true);
    expect(late.displayMs).toBe(0);
    expect(late.studiedMs).toBe(30 * MIN);
  });

  it('extending does not count the overrun as study time', () => {
    const s = make(cfg);
    const ext = extendCountdown(s, 5, T0 + 50 * MIN); // 20 min of overrun already elapsed
    const v = computeView(ext, T0 + 50 * MIN);
    expect(v.studiedMs).toBe(30 * MIN);
    expect(v.done).toBe(false);
    expect(computeView(ext, T0 + 52 * MIN).studiedMs).toBe(32 * MIN);
  });
});

describe('pomodoro', () => {
  it('starts in focus', () => {
    const v = computeView(make(pomo), T0 + 10 * MIN);
    expect(v.phase).toBe('focus');
    expect(v.block).toBe(1);
    expect(v.displayMs).toBe(15 * MIN);
    expect(v.studiedMs).toBe(10 * MIN);
    expect(v.breakMs).toBe(0);
  });

  it('does not count breaks as study time', () => {
    const v = computeView(make(pomo), T0 + 27 * MIN);
    expect(v.phase).toBe('break');
    expect(v.studiedMs).toBe(25 * MIN);
    expect(v.breakMs).toBe(2 * MIN);
    expect(v.displayMs).toBe(3 * MIN);
  });

  it('moves to the next focus block after a break', () => {
    const v = computeView(make(pomo), T0 + 32 * MIN);
    expect(v.phase).toBe('focus');
    expect(v.block).toBe(2);
    expect(v.studiedMs).toBe(27 * MIN);
    expect(v.breakMs).toBe(5 * MIN);
  });

  it('uses a long break after the configured number of blocks', () => {
    // 3 full cycles = 90 min; the 4th focus ends at 90 + 25 = 115 min, then a 15 min long break.
    const v = computeView(make(pomo), T0 + 120 * MIN);
    expect(v.phase).toBe('break');
    expect(v.phaseLengthMs).toBe(15 * MIN);
    expect(v.studiedMs).toBe(100 * MIN);
    expect(computeView(make(pomo), T0 + 100 * MIN).nextBreakLong).toBe(true);
    expect(computeView(make(pomo), T0 + 10 * MIN).nextBreakLong).toBe(false);
  });

  it('studied + break always equals total running time', () => {
    const s = make(pomo);
    for (let m = 0; m < 600; m += 7) {
      const v = computeView(s, T0 + m * MIN);
      expect(v.studiedMs + v.breakMs).toBe(m * MIN);
    }
  });

  it('is correct after a long absence (cycles wrap)', () => {
    // 4 focus (100) + 3 short (15) + 1 long (15) = 130 min super-cycle. 135 min in = 5 min into 5th focus.
    const v = computeView(make(pomo), T0 + 135 * MIN);
    expect(v.phase).toBe('focus');
    expect(v.block).toBe(5);
    expect(v.studiedMs).toBe(105 * MIN);
  });

  it('skipping a break jumps to the next focus without counting it as study', () => {
    const s = make(pomo);
    const at = T0 + 27 * MIN;
    const skipped = skipBreak(s, at);
    const v = computeView(skipped, at);
    expect(v.phase).toBe('focus');
    expect(v.block).toBe(2);
    expect(v.studiedMs).toBe(25 * MIN);
  });

  it('pausing mid-break freezes the break', () => {
    const p = pause(make(pomo), T0 + 27 * MIN);
    const v = computeView(p, T0 + 500 * MIN);
    expect(v.phase).toBe('break');
    expect(v.breakMs).toBe(2 * MIN);
  });
});

describe('stopAtLastSeen', () => {
  it('stops the clock at the last heartbeat', () => {
    const s = make({ mode: 'stopwatch' }, { lastSeenAt: T0 + 40 * MIN });
    const stopped = stopAtLastSeen(s);
    expect(stopped.resumedAt).toBeNull();
    expect(computeView(stopped, T0 + 600 * MIN).studiedMs).toBe(40 * MIN);
  });
});
