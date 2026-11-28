import { describe, expect, it } from 'vitest';
import { CHEERS, cheerOf, demoShowcase, miniFillFromCells, rankNameForCells, showcaseFromData, showcaseKey } from './showcase';
import { COMB_CAPACITY } from './hive';
import { carById } from '../data/cars';
import { emptyData } from '../data/seed';
import type { AppData, StudySession } from '../types';

const NOW = new Date('2026-11-28T12:00:00').getTime();

function session(studiedMs: number, demo = false): StudySession {
  return { id: `s${studiedMs}${demo}`, subjectId: 'a', topic: '', goal: '', notes: '', mode: 'stopwatch', startedAt: NOW - studiedMs, endedAt: NOW, studiedMs, breakMs: 0, friendIds: [], ...(demo ? { demo: true } : {}) } as StudySession;
}
const data = (patch: Partial<AppData>): AppData => ({ ...emptyData(), ...patch });

describe('what a friend can see', () => {
  it('counts honey from real sessions only (5 minutes a cell)', () => {
    const d = data({ sessions: [session(30 * 60_000), session(10 * 60 * 60_000, true)] });
    expect(showcaseFromData(d).cells).toBe(6);
  });

  it('lists built cars newest first and skips cars that no longer exist', () => {
    const d = data({ garage: [{ carId: 'bmw-x1', at: 100 }, { carId: 'not-a-car', at: 300 }, { carId: 'tata-nano', at: 200 }] });
    expect(showcaseFromData(d).cars).toEqual([
      { id: 'tata-nano', at: 200 },
      { id: 'bmw-x1', at: 100 },
    ]);
  });

  it('has a key that changes only when there is something new to publish', () => {
    const a = showcaseKey(true, { cells: 5, cars: [{ id: 'bmw-x1', at: 1 }] });
    expect(showcaseKey(true, { cells: 5, cars: [{ id: 'bmw-x1', at: 99 }] })).toBe(a);
    expect(showcaseKey(true, { cells: 6, cars: [{ id: 'bmw-x1', at: 1 }] })).not.toBe(a);
    expect(showcaseKey(false, { cells: 5, cars: [{ id: 'bmw-x1', at: 1 }] })).not.toBe(a);
  });
});

describe('hive display', () => {
  it('gives a bee rank for a honey count', () => {
    expect(rankNameForCells(0)).toBe('Egg');
    expect(rankNameForCells(12 * 5)).toBe('Worker bee'); // 5 hours
  });

  it('fills the small honeycomb from progress in the current comb', () => {
    expect(miniFillFromCells(0)).toBe(0);
    expect(miniFillFromCells(1)).toBe(1);
    expect(miniFillFromCells(COMB_CAPACITY)).toBe(25);
    expect(miniFillFromCells(COMB_CAPACITY + 63)).toBeGreaterThan(10);
    expect(miniFillFromCells(COMB_CAPACITY + 63)).toBeLessThan(15);
  });
});

describe('simulated friend profiles', () => {
  it('are steady for the same friend, differ between friends, and only use real cars', () => {
    const a = demoShowcase('fr_a', 'Ava', NOW);
    expect(demoShowcase('fr_a', 'Ava', NOW)).toEqual(a);
    expect(demoShowcase('fr_b', 'Ben', NOW).cells).not.toBe(a.cells);
    expect(a.cars.length).toBeGreaterThanOrEqual(1);
    expect(a.cars.every((c) => !!carById(c.id))).toBe(true);
    expect(new Set(a.cars.map((c) => c.id)).size).toBe(a.cars.length);
  });
});

describe('cheers', () => {
  it('are a short fixed list with no free text', () => {
    expect(CHEERS.map((c) => c.id)).toEqual(['nice', 'keep_going', 'fire']);
    expect(cheerOf('fire')?.label).toBe('On fire');
    expect(cheerOf('hello there')).toBeUndefined();
  });
});
