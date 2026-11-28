import { describe, expect, it } from 'vitest';
import { MINI_CELLS, layoutMiniHive } from './HiveMini';

describe('layoutMiniHive', () => {
  it('lays out 25 cells in five rows of 3 to 7', () => {
    const { cells } = layoutMiniHive(110, 0);
    expect(cells).toHaveLength(MINI_CELLS);
    expect(cells.every((c) => c.kind === 'empty')).toBe(true);
    const rows = new Map<number, number>();
    for (const c of cells) rows.set(Math.round(c.y), (rows.get(Math.round(c.y)) ?? 0) + 1);
    expect([...rows.values()].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it('fills the requested number of cells, bottom row first', () => {
    const { cells } = layoutMiniHive(110, 7, false);
    const filled = cells.filter((c) => c.kind !== 'empty');
    expect(filled).toHaveLength(7);
    const bottom = Math.max(...cells.map((c) => c.y));
    expect(filled.every((c) => c.y === bottom)).toBe(true);
  });

  it('marks one golden cell once a few are filled, and a fresh cell on request', () => {
    expect(layoutMiniHive(110, 2).cells.filter((c) => c.kind === 'gold')).toHaveLength(0);
    expect(layoutMiniHive(110, 10).cells.filter((c) => c.kind === 'gold')).toHaveLength(1);
    expect(layoutMiniHive(110, 10, true, true).cells.filter((c) => c.kind === 'fresh')).toHaveLength(1);
  });
});
