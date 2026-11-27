/** Hexagon geometry for the honeycomb scenes (pointy-top hexagons on an axial grid). */

const f = (n: number) => Math.round(n * 100) / 100;

export interface Pt {
  x: number;
  y: number;
}

/**
 * Corners of a pointy-top hexagon, starting at the top and going clockwise. `squash` flattens it vertically, which is how a
 * flat hexagon looks when the comb is tilted away from you (1 = seen straight on, about 0.6 = a comfortable tilt).
 */
export function hexVertices(cx: number, cy: number, R: number, squash = 1): Pt[] {
  return Array.from({ length: 6 }, (_, k) => {
    const a = ((-90 + 60 * k) * Math.PI) / 180;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) * squash };
  });
}

/** A closed path through `pts` with softly rounded corners (each corner starts `t` of the way along its edges). */
export function roundedPolyPath(pts: Pt[], t = 0.2): string {
  return (
    pts
      .map((V, i) => {
        const P = pts[(i + pts.length - 1) % pts.length];
        const N = pts[(i + 1) % pts.length];
        const a = { x: V.x + (P.x - V.x) * t, y: V.y + (P.y - V.y) * t };
        const b = { x: V.x + (N.x - V.x) * t, y: V.y + (N.y - V.y) * t };
        return `${i === 0 ? 'M' : 'L'}${f(a.x)} ${f(a.y)}Q${f(V.x)} ${f(V.y)} ${f(b.x)} ${f(b.y)}`;
      })
      .join('') + 'Z'
  );
}

/** SVG path for a hexagon with softly rounded corners. */
export function roundedHexPath(cx: number, cy: number, R: number, t = 0.2): string {
  return roundedPolyPath(hexVertices(cx, cy, R, 1), t);
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

/** The 3D comb is a fixed, dense dome: this many rings (and cells) cover it, so even a short session looks rich. */
export const DOME_RINGS = 9;
export const DOME_CELLS = capacityFor(DOME_RINGS);
