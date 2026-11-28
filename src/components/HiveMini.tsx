/** Small, static 2.5D honeycomb (25 cells) for cards and onboarding. The big 3D dome stays on the Progress page. */

export interface MiniCell {
  x: number;
  y: number;
  w: number;
  h: number;
  /** brightness shading, brighter in the middle */
  shade: number;
  kind: 'empty' | 'honey' | 'gold' | 'fresh';
}

const ROWS = [3, 4, 5, 6, 7];
export const MINI_CELLS = ROWS.reduce((a, b) => a + b, 0);

/** Lay out the 25 cells and decide which are filled. Cells fill from the bottom row up, centre first. Pure, so it can be tested. */
export function layoutMiniHive(width: number, filled: number, golden = true, fresh = false): { cells: MiniCell[]; height: number } {
  const S = width;
  const g = Math.max(2, S * 0.012);
  const W = (S - 6 * g) / 7;
  const H = W * 1.1547;
  const step = 0.75 * H + g * 0.866;
  const all: { r: number; cx: number; cy: number; dist: number; rank: number }[] = [];
  ROWS.forEach((n, r) => {
    const off = ((7 - n) * (W + g)) / 2;
    for (let i = 0; i < n; i++) {
      const cx = off + i * (W + g);
      all.push({ r, cx, cy: r * step, dist: Math.abs(cx + W / 2 - S / 2) / (S / 2), rank: 0 });
    }
  });
  [...all].sort((a, b) => b.r - a.r || a.dist - b.dist).forEach((c, k) => (c.rank = k));
  const cells = all.map((c): MiniCell => {
    const isFilled = c.rank < filled;
    const isGold = golden && filled > 2 && c.rank === 2;
    const isFresh = fresh && filled > 0 && c.rank === filled - 1;
    return {
      x: c.cx,
      y: c.cy,
      w: W,
      h: H,
      shade: 1.06 - c.dist * 0.16 - (4 - c.r) * 0.01,
      kind: !isFilled ? 'empty' : isFresh ? 'fresh' : isGold ? 'gold' : 'honey',
    };
  });
  return { cells, height: 4 * step + H };
}

export function HiveMini({ filled, width = 110, golden = true, fresh = false }: { filled: number; width?: number; golden?: boolean; fresh?: boolean }) {
  const n = Math.max(0, Math.min(MINI_CELLS, Math.round(filled)));
  const { cells, height } = layoutMiniHive(width, n, golden, fresh);
  return (
    <div role="img" aria-label={`Honeycomb: ${n} of ${MINI_CELLS} cells filled`} className="hive-mini" style={{ width, height: Math.ceil(height) }}>
      <span className="hive-mini-shadow" aria-hidden="true" />
      {cells.map((c, i) => (
        <span key={i} className="hive-mini-cell" style={{ left: c.x, top: c.y, width: c.w, height: c.h, filter: `brightness(${c.shade.toFixed(3)})` }} aria-hidden="true">
          {c.kind === 'empty' && <i className="mc-empty" />}
          {c.kind === 'honey' && (
            <>
              <i className="mc-honey" />
              <i className="mc-gloss" />
            </>
          )}
          {c.kind === 'gold' && (
            <>
              <i className="mc-gold" />
              <i className="mc-gold-core" />
            </>
          )}
          {c.kind === 'fresh' && <i className="mc-fresh" />}
        </span>
      ))}
    </div>
  );
}
