import { describe, expect, it } from 'vitest';
import { MAX_REMEMBERED, describeConfig, parseSetups, rememberSetup, setupFor } from './setup';
import type { SetupMemory } from '../types';

const pomo: SetupMemory = { config: { mode: 'pomodoro', pomodoro: { focusMin: 25, breakMin: 5, longBreakMin: 15, cyclesBeforeLong: 4 } }, scene: 'honeycomb' };

describe('setup memory', () => {
  it('falls back to a stopwatch with the usual scene when nothing is remembered', () => {
    expect(setupFor({}, 'a', 'minimal', () => true)).toEqual({ config: { mode: 'stopwatch' }, scene: 'minimal' });
    // never starts a car the student did not pick for this subject
    expect(setupFor({}, 'a', 'car', () => true).scene).toBe('honeycomb');
  });

  it('returns what was remembered for that subject only', () => {
    const r = { a: pomo };
    expect(setupFor(r, 'a', 'honeycomb', () => true)).toEqual(pomo);
    expect(setupFor(r, 'b', 'honeycomb', () => true).config.mode).toBe('stopwatch');
  });

  it('drops a remembered car that is finished or gone, but keeps the timer', () => {
    const car: SetupMemory = { config: { mode: 'countdown', targetMin: 45 }, scene: 'car', carId: 'bmw-x1' };
    expect(setupFor({ a: car }, 'a', 'honeycomb', () => true)).toEqual(car);
    expect(setupFor({ a: car }, 'a', 'honeycomb', () => false)).toEqual({ config: { mode: 'countdown', targetMin: 45 }, scene: 'honeycomb' });
  });

  it('describes timers in a few words', () => {
    expect(describeConfig(pomo.config)).toBe('Pomodoro 25 · 5');
    expect(describeConfig({ mode: 'countdown', targetMin: 45 })).toBe('Countdown 45 min');
    expect(describeConfig({ mode: 'stopwatch' })).toBe('Stopwatch');
  });

  it('keeps only subjects that still exist when remembering a new setup', () => {
    const out = rememberSetup({ gone: pomo, kept: pomo }, 'new', pomo, ['kept', 'new']);
    expect(Object.keys(out).sort()).toEqual(['kept', 'new']);
  });

  it('reads saved setups safely: bad entries are dropped, good ones kept', () => {
    const out = parseSetups({
      ok: { config: { mode: 'countdown', targetMin: 30 }, scene: 'minimal' },
      badMode: { config: { mode: 'sprint' }, scene: 'honeycomb' },
      badMinutes: { config: { mode: 'countdown', targetMin: 99999 }, scene: 'honeycomb' },
      badScene: { config: { mode: 'stopwatch' }, scene: 'space' },
      carNoId: { config: { mode: 'stopwatch' }, scene: 'car' },
      junk: 5,
    });
    expect(Object.keys(out).sort()).toEqual(['carNoId', 'ok']);
    expect(out.ok.config).toEqual({ mode: 'countdown', targetMin: 30 });
    expect(parseSetups('nope')).toEqual({});
    expect(parseSetups(undefined)).toEqual({});
  });

  it('caps how many are read', () => {
    const many = Object.fromEntries(Array.from({ length: MAX_REMEMBERED + 10 }, (_, i) => [`s${i}`, pomo]));
    expect(Object.keys(parseSetups(many))).toHaveLength(MAX_REMEMBERED);
  });
});
