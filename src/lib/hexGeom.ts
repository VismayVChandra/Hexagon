/** Hexagon geometry for the honeycomb scenes (pointy-top hexagons on an axial grid). */

const f = (n: number) => Math.round(n * 100) / 100;

/** SVG path for a hexagon with softly rounded corners (each corner starts `t` of the way along its edges). */
export function roundedHexPath(cx: number, cy: number, R: number, t = 0.2): string {
  const v = Array.from({ length: 6 }, (_, k) => {
    const a = ((-90 + 60 * k) * Math.PI) / 180;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)] as const;
  });
  return (
    v
      .map((V, i) => {
        const P = v[(i + 5) % 6];
        const N = v[(i + 1) % 6];
        const a = [V[0] + (P[0] - V[0]) * t, V[1] + (P[1] - V[1]) * t];
        const b = [V[0] + (N[0] - V[0]) * t, V[1] + (N[1] - V[1]) * t];
        return `${i === 0 ? 'M' : 'L'}${f(a[0])} ${f(a[1])}Q${f(V[0])} ${f(V[1])} ${f(b[0])} ${f(b[1])}`;
      })
      .join('') + 'Z'
  );
}

export interface Axial {
  q: number;
  r: number;
}

const DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Cells needed to fill a hexagonal comb of `rings` rings around the centre: 1, 7, 19, 37, 61, 91, 127… */
export const capacityFor = (rings: number) => 1 + 3 * rings * (rings + 1);

/** Smallest number of rings whose comb holds at least `n` cells. */
export function ringsFor(n: number): number {
  let r = 0;
  while (capacityFor(r) < n) r++;
  return r;
}

/** The first `n` cells of a spiral that starts in the middle and winds outward, ring by ring. */
export function spiral(n: number): Axial[] {
  const cells: Axial[] = [];
  if (n <= 0) return cells;
  cells.push({ q: 0, r: 0 });
  for (let ring = 1; cells.length < n; ring++) {
    let q = DIRS[4].q * ring;
    let r = DIRS[4].r * ring;
    for (let side = 0; side < 6 && cells.length < n; side++) {
      for (let step = 0; step < ring && cells.length < n; step++) {
        cells.push({ q, r });
        q += DIRS[side].q;
        r += DIRS[side].r;
      }
    }
  }
  return cells;
}

/** Centre of an axial cell for hexagons with circumradius `size`. */
export function cellCenter(c: Axial, size: number): { x: number; y: number } {
  return { x: size * Math.sqrt(3) * (c.q + c.r / 2), y: size * 1.5 * c.r };
}
