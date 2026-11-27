import { describe, expect, it } from 'vitest';
import type { StudySession } from '../types';
import { CELL_MS, COMB_CAPACITY, GOLDEN_SESSION_MS, RANKS, cellsFromMs, goldenDayKeys, hiveSummary, rankFor } from './hive';
import { capacityFor, ringsFor, spiral } from './hexGeom';
import { applyBuild, carById, currentPart, partStates, CARS, TIERS, LEGACY_CAR_IDS, buildMs, carsInTier, darken } from '../data/cars';
import { HOUR, MIN } from './time';

function ses(minutes: number, over: Partial<StudySession> = {}): StudySession {
  return { id: Math.random().toString(), subjectId: 'a', topic: '', goal: '', notes: '', mode: 'stopwatch', startedAt: new Date(2026, 10, 20, 10).getTime(), endedAt: 0, studiedMs: minutes * MIN, breakMs: 0, friendIds: [], ...over };
}

describe('hex spiral', () => {
  it('has the classic comb sizes', () => {
    expect([0, 1, 2, 3, 6].map(capacityFor)).toEqual([1, 7, 19, 37, 127]);
    expect(ringsFor(1)).toBe(0);
    expect(ringsFor(8)).toBe(2);
    expect(ringsFor(19)).toBe(2);
    expect(ringsFor(20)).toBe(3);
  });
  it('places each cell once, starting in the middle', () => {
    const cells = spiral(61);
    expect(cells).toHaveLength(61);
    expect(cells[0]).toEqual({ q: 0, r: 0 });
    expect(new Set(cells.map((c) => `${c.q},${c.r}`)).size).toBe(61);
  });
  it('keeps every new cell touching the comb so far (no gaps)', () => {
    const cells = spiral(37);
    const key = (c: { q: number; r: number }) => `${c.q},${c.r}`;
    const dirs = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ];
    const seen = new Set([key(cells[0])]);
    for (const c of cells.slice(1)) {
      expect(dirs.some(([dq, dr]) => seen.has(`${c.q + dq},${c.r + dr}`))).toBe(true);
      seen.add(key(c));
    }
  });
});

describe('hive', () => {
  it('turns 5 minutes of focus into one cell', () => {
    expect(cellsFromMs(0)).toBe(0);
    expect(cellsFromMs(CELL_MS - 1)).toBe(0);
    expect(cellsFromMs(CELL_MS)).toBe(1);
    expect(cellsFromMs(25 * MIN)).toBe(5);
    expect(cellsFromMs(HOUR)).toBe(12);
  });
  it('counts only timed sessions, not ones logged by hand', () => {
    const h = hiveSummary([ses(60), ses(600, { manual: true })]);
    expect(h.cells).toBe(12);
    expect(h.totalMs).toBe(HOUR);
  });
  it('rolls full combs over', () => {
    const justFull = hiveSummary([ses((COMB_CAPACITY * CELL_MS) / MIN)]);
    expect(justFull.fullCombs).toBe(1);
    expect(justFull.inCurrent).toBe(COMB_CAPACITY);
    const more = hiveSummary([ses(((COMB_CAPACITY + 3) * CELL_MS) / MIN)]);
    expect(more.fullCombs).toBe(1);
    expect(more.inCurrent).toBe(3);
  });
  it('ranks by total hours', () => {
    expect(rankFor(0).rank.id).toBe('egg');
    expect(rankFor(59 * MIN).rank.id).toBe('egg');
    expect(rankFor(HOUR).rank.id).toBe('larva');
    expect(rankFor(10 * HOUR).rank.id).toBe('builder');
    expect(rankFor(500 * HOUR).rank.id).toBe('queen');
    expect(rankFor(500 * HOUR).next).toBeNull();
    expect(RANKS.map((r) => r.hours)).toEqual([...RANKS.map((r) => r.hours)].sort((a, b) => a - b));
  });
  it('reports progress to the next rank', () => {
    const r = rankFor(3 * HOUR); // larva (1h) -> worker (5h): halfway
    expect(r.rank.id).toBe('larva');
    expect(r.next?.id).toBe('worker');
    expect(r.progress).toBeCloseTo(0.5, 5);
  });
  it('awards one golden day per day with a 25+ minute timed session', () => {
    const day1 = new Date(2026, 10, 20, 9).getTime();
    const day2 = new Date(2026, 10, 21, 9).getTime();
    const keys = goldenDayKeys([
      ses(25, { startedAt: day1 }),
      ses(40, { startedAt: day1 + HOUR }),
      ses(24, { startedAt: day2 }),
      ses(90, { startedAt: day2, manual: true }),
    ]);
    expect(keys.size).toBe(1);
    expect(GOLDEN_SESSION_MS).toBe(25 * MIN);
  });
});

describe('car build', () => {
  it('fits parts in order as progress grows', () => {
    expect(partStates(0).every((p) => p.amount === 0)).toBe(true);
    expect(partStates(1).every((p) => p.amount === 1)).toBe(true);
    const half = partStates(0.5);
    expect(half.map((p) => p.amount)).toEqual([1, 1, 1, 0, 0, 0]);
    const s = partStates(0.25); // 1.5 parts: frame done, wheels half-way
    expect(s[0].amount).toBe(1);
    expect(s[1].amount).toBeCloseTo(0.5, 5);
    expect(s[2].amount).toBe(0);
  });
  it('knows which part is being worked on', () => {
    expect(currentPart(0)).toBeNull();
    expect(currentPart(1)).toBeNull();
    expect(currentPart(0.25)?.id).toBe('wheels');
    expect(currentPart(0.9)?.id).toBe('paint');
  });
  it('carries progress across sessions, then moves the car to the garage once', () => {
    const car = carById('toyota-corolla')!;
    const first = applyBuild({}, [], car.id, 30 * MIN, 1000);
    expect(first.completed).toBeNull();
    expect(first.builds[car.id]).toBe(30 * MIN);
    const second = applyBuild(first.builds, first.garage, car.id, 20 * MIN, 2000);
    expect(second.completed?.id).toBe(car.id);
    expect(second.garage).toEqual([{ carId: car.id, at: 2000 }]);
    expect(second.builds[car.id]).toBeUndefined();
    // Already collected: more study doesn't duplicate it
    const again = applyBuild(second.builds, second.garage, car.id, 90 * MIN, 3000);
    expect(again.completed).toBeNull();
    expect(again.garage).toHaveLength(1);
  });
  it('ignores unknown cars and sessions with no car', () => {
    expect(applyBuild({}, [], 'nope', HOUR, 1).completed).toBeNull();
    expect(applyBuild({}, [], undefined, HOUR, 1).builds).toEqual({});
  });
  it('has an increasing ladder of build times', () => {
    const times = CARS.map(buildMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(CARS[0].buildMin).toBe(25);
  });
});

describe('car catalog', () => {
  it('has unique ids and a sensible set of brands', () => {
    expect(new Set(CARS.map((c) => c.id)).size).toBe(CARS.length);
    const brands = new Set(CARS.map((c) => c.brand));
    expect(brands.size).toBe(10);
    for (const b of ['BMW', 'Audi', 'Mercedes-Benz', 'Toyota', 'Porsche', 'Ferrari', 'Lamborghini', 'Rolls-Royce', 'Tesla', 'Maruti Suzuki']) expect(brands.has(b)).toBe(true);
  });
  it('fills every tier, and each car takes its tier’s build time', () => {
    for (const t of TIERS) {
      const cars = carsInTier(t.n);
      expect(cars.length).toBeGreaterThanOrEqual(4);
      expect(cars.every((c) => c.buildMin === t.buildMin)).toBe(true);
    }
    expect(TIERS.map((t) => t.buildMin)).toEqual([...TIERS.map((t) => t.buildMin)].sort((a, b) => a - b));
  });
  it('names cars as brand and model', () => {
    expect(carById('bmw-x5')?.name).toBe('BMW X5');
    expect(carById('lamborghini-huracan')?.brand).toBe('Lamborghini');
  });
  it('derives a darker shade for each colour', () => {
    expect(darken('#ffffff', 0.5)).toBe('#808080');
    expect(darken('#000000', 0.5)).toBe('#000000');
    for (const c of CARS) expect(c.shade).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('maps every old car id to a car that exists', () => {
    for (const to of Object.values(LEGACY_CAR_IDS)) expect(carById(to)).toBeTruthy();
  });
});
