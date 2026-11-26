// Rounded (filleted) pointy-top hexagon geometry shared by the icon generators.
// Each corner is replaced by a quadratic curve that starts/ends a fraction `t` of the way along the adjoining edges.

const f = (n) => Number(n.toFixed(3));

export function corners(cx, cy, R) {
  return Array.from({ length: 6 }, (_, k) => {
    const a = ((-90 + 60 * k) * Math.PI) / 180;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  });
}

function segs(cx, cy, R, t) {
  const v = corners(cx, cy, R);
  return v.map((V, i) => {
    const P = v[(i + 5) % 6];
    const N = v[(i + 1) % 6];
    const a = [V[0] + (P[0] - V[0]) * t, V[1] + (P[1] - V[1]) * t];
    const b = [V[0] + (N[0] - V[0]) * t, V[1] + (N[1] - V[1]) * t];
    return { a, V, b };
  });
}

/** SVG path data for the filleted hexagon. */
export function hexPath(cx, cy, R, t = 0.2) {
  return (
    segs(cx, cy, R, t)
      .map(({ a, V, b }, i) => `${i === 0 ? 'M' : 'L'}${f(a[0])} ${f(a[1])}Q${f(V[0])} ${f(V[1])} ${f(b[0])} ${f(b[1])}`)
      .join('') + 'Z'
  );
}

/** The same outline sampled into a convex polygon (for rasterising). */
export function hexPolygon(cx, cy, R, t = 0.2, steps = 14) {
  const pts = [];
  for (const { a, V, b } of segs(cx, cy, R, t)) {
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      pts.push([(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * V[0] + u ** 2 * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * V[1] + u ** 2 * b[1]]);
    }
  }
  return pts;
}

/** Point-in-convex-polygon (clockwise or counter-clockwise). */
export function inside(poly, x, y) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const cross = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
    if (Math.abs(cross) < 1e-12) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Same hexagon normalised to a 0..1 box, for CSS clipPathUnits="objectBoundingBox". */
export function hexPathUnit(t = 0.2) {
  const R = 1;
  const w = Math.sqrt(3) * R;
  const h = 2 * R;
  const raw = hexPath(0, 0, R, t);
  // Re-map every coordinate pair into the unit box.
  return raw.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${((Number(x) + w / 2) / w).toFixed(4)} ${((Number(y) + h / 2) / h).toFixed(4)}`);
}
