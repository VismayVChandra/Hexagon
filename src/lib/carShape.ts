import * as THREE from 'three';
import type { BodyStyle } from '../data/cars';

/**
 * The geometry of the 3D cars: a smooth body lofted from a side profile (so no model files are needed), plus its glass.
 * Pure (three.js geometry only, no drawing), so it can be tested.
 */

export interface Spec {
  /** Length, width, height in metres. */
  L: number;
  W: number;
  H: number;
  /** Wheelbase and wheel radius. */
  wb: number;
  R: number;
  /** Where the top of the body is along its length (0 = tail, 1 = nose), as a fraction of the height. */
  top: [number, number][];
  /** The beltline (bottom of the windows) as a fraction of the height. */
  belt: number;
  /** Where the glasshouse starts and ends along the length. */
  gh: [number, number];
  /** Pillars between side windows (positions along the length). */
  pillars: number[];
}

export const SPECS: Record<BodyStyle, Spec> = {
  hatch: {
    L: 3.95, W: 1.72, H: 1.5, wb: 2.45, R: 0.31,
    top: [[0, 0.5], [0.04, 0.62], [0.1, 0.85], [0.17, 0.98], [0.26, 1], [0.5, 1], [0.6, 0.97], [0.7, 0.72], [0.78, 0.66], [0.9, 0.6], [0.97, 0.52], [1, 0.42]],
    belt: 0.66, gh: [0.12, 0.7], pillars: [0.42],
  },
  sedan: {
    L: 4.75, W: 1.86, H: 1.42, wb: 2.85, R: 0.33,
    top: [[0, 0.55], [0.05, 0.66], [0.12, 0.68], [0.22, 0.72], [0.3, 0.92], [0.38, 1], [0.55, 1], [0.63, 0.95], [0.72, 0.7], [0.8, 0.68], [0.92, 0.64], [0.97, 0.56], [1, 0.46]],
    belt: 0.68, gh: [0.27, 0.72], pillars: [0.5],
  },
  suv: {
    L: 4.65, W: 1.95, H: 1.72, wb: 2.75, R: 0.37,
    top: [[0, 0.52], [0.04, 0.66], [0.08, 0.9], [0.14, 0.99], [0.3, 1], [0.55, 1], [0.62, 0.96], [0.7, 0.72], [0.78, 0.68], [0.92, 0.64], [0.97, 0.56], [1, 0.44]],
    belt: 0.7, gh: [0.1, 0.7], pillars: [0.4],
  },
  coupe: {
    L: 4.45, W: 1.86, H: 1.3, wb: 2.65, R: 0.34,
    top: [[0, 0.55], [0.05, 0.68], [0.15, 0.74], [0.3, 0.92], [0.4, 1], [0.52, 1], [0.6, 0.92], [0.7, 0.72], [0.8, 0.68], [0.92, 0.62], [0.97, 0.54], [1, 0.44]],
    belt: 0.66, gh: [0.3, 0.7], pillars: [],
  },
  supercar: {
    L: 4.55, W: 2.0, H: 1.12, wb: 2.7, R: 0.33,
    top: [[0, 0.58], [0.05, 0.7], [0.15, 0.78], [0.3, 0.9], [0.42, 1], [0.52, 1], [0.6, 0.9], [0.72, 0.76], [0.82, 0.72], [0.92, 0.63], [0.97, 0.55], [1, 0.46]],
    belt: 0.62, gh: [0.36, 0.68], pillars: [],
  },
  limo: {
    L: 5.6, W: 1.95, H: 1.5, wb: 3.4, R: 0.35,
    top: [[0, 0.5], [0.04, 0.62], [0.08, 0.66], [0.2, 0.7], [0.3, 0.96], [0.4, 1], [0.62, 1], [0.68, 0.95], [0.76, 0.72], [0.82, 0.68], [0.93, 0.64], [0.98, 0.54], [1, 0.44]],
    belt: 0.68, gh: [0.26, 0.74], pillars: [0.45, 0.58],
  },
};

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (a: number, b: number, x: number) => {
  if (Math.abs(b - a) < 1e-9) return x >= a ? 1 : 0;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const ease = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const spow = (v: number, p: number) => Math.sign(v) * Math.pow(Math.abs(v), p);

/** A smooth curve through control points (cubic Hermite with finite-difference slopes). */
export function curve(pts: [number, number][], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  const n = pts.length;
  if (x >= pts[n - 1][0]) return pts[n - 1][1];
  let i = 0;
  while (i < n - 2 && x > pts[i + 1][0]) i++;
  const [x0, y0] = pts[i];
  const [x1, y1] = pts[i + 1];
  const slope = (k: number) => {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(n - 1, k + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  };
  const h = x1 - x0;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * slope(i) + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * slope(i + 1);
}

const N_T = 80; // stations along the car
const N_C = 36; // points around each cross-section

export interface Shape {
  spec: Spec;
  xAt: (t: number) => number;
  topAt: (t: number) => number;
  botAt: (t: number) => number;
  paint: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
}

export function buildShape(spec: Spec): Shape {
  const { L, W, H } = spec;
  const xAt = (t: number) => (t - 0.5) * L;
  const topAt = (t: number) => curve(spec.top, t) * H;
  const wheelX = [spec.wb / 2, -spec.wb / 2];
  const botAt = (t: number) => {
    const x = xAt(t);
    let y = 0.17;
    const ra = spec.R + 0.08;
    for (const wx of wheelX) {
      const dx = Math.abs(x - wx);
      if (dx < ra) y = Math.max(y, spec.R + Math.sqrt(ra * ra - dx * dx));
    }
    return Math.min(y, topAt(t) - 0.14);
  };
  const edge = (t: number) => {
    const a = clamp01(t / 0.06);
    const b = clamp01((1 - t) / 0.1);
    return Math.min(Math.sqrt(1 - (1 - a) ** 2), Math.sqrt(1 - (1 - b) ** 2));
  };
  const belt = spec.belt * H;

  const pos = new Float32Array((N_T + 1) * N_C * 3);
  const zfrac = new Float32Array((N_T + 1) * N_C);
  for (let i = 0; i <= N_T; i++) {
    const t = i / N_T;
    const e = edge(t);
    const top = topAt(t);
    const bot = botAt(t);
    const mid = (top + bot) / 2;
    const half = ((top - bot) / 2) * e;
    for (let k = 0; k < N_C; k++) {
      const phi = (k / N_C) * Math.PI * 2;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      const y = mid + spow(s, 0.5) * half;
      const tumble = 1 - 0.17 * smooth(belt, top, y);
      const zs = spow(c, 0.4);
      // the body narrows towards the tail and the nose, like a real car seen from above
      const taper = (0.86 + 0.14 * smooth(0, 0.16, t)) * (0.9 + 0.1 * smooth(1, 0.82, t));
      const z = zs * (W / 2) * e * tumble * taper;
      const v = i * N_C + k;
      pos.set([xAt(t), y, z], v * 3);
      zfrac[v] = Math.abs(zs);
    }
  }

  const idx: number[] = [];
  for (let i = 0; i < N_T; i++) {
    for (let k = 0; k < N_C; k++) {
      const k2 = (k + 1) % N_C;
      const a = i * N_C + k;
      const b = (i + 1) * N_C + k;
      const c = (i + 1) * N_C + k2;
      const d = i * N_C + k2;
      idx.push(a, b, c, a, c, d);
    }
  }
  const paint = new THREE.BufferGeometry();
  paint.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  paint.setIndex(idx);
  paint.computeVertexNormals();
  // Make sure the faces point outwards: the top of the middle of the car should face up.
  const nrm = paint.getAttribute('normal') as THREE.BufferAttribute;
  const probe = Math.floor(N_T * 0.5) * N_C + N_C / 4;
  if (nrm.getY(probe) < 0) {
    for (let j = 0; j < idx.length; j += 3) [idx[j + 1], idx[j + 2]] = [idx[j + 2], idx[j + 1]];
    paint.setIndex(idx);
    paint.computeVertexNormals();
  }

  // Glass: the quads of the glasshouse that are windows (the sides, plus the windscreen and rear screen), lifted a hair off the paint.
  const normals = paint.getAttribute('normal') as THREE.BufferAttribute;
  const gpos = new Float32Array(pos.length);
  for (let v = 0; v < pos.length / 3; v++) {
    gpos[v * 3] = pos[v * 3] + normals.getX(v) * 0.007;
    gpos[v * 3 + 1] = pos[v * 3 + 1] + normals.getY(v) * 0.007;
    gpos[v * 3 + 2] = pos[v * 3 + 2] + normals.getZ(v) * 0.007;
  }
  const slopeAt = (t: number) => (topAt(Math.min(1, t + 0.01)) - topAt(Math.max(0, t - 0.01))) / (0.02 * L);
  const gidx: number[] = [];
  const pi = paint.getIndex()!;
  for (let q = 0; q < N_T * N_C; q++) {
    const i = Math.floor(q / N_C);
    const k = q % N_C;
    const tm = (i + 0.5) / N_T;
    if (tm < spec.gh[0] || tm > spec.gh[1]) continue;
    const v = i * N_C + k;
    const y = pos[v * 3 + 1];
    if (y < belt + 0.04) continue;
    const slope = slopeAt(tm);
    const screen = Math.abs(slope) > 0.42 && y > belt + 0.04;
    const side = zfrac[v] > 0.5 && !spec.pillars.some((p) => Math.abs(tm - p) < 0.014) && tm > spec.gh[0] + 0.035 && tm < spec.gh[1] - 0.02;
    if (!screen && !side) continue;
    gidx.push(pi.getX(q * 6), pi.getX(q * 6 + 1), pi.getX(q * 6 + 2), pi.getX(q * 6 + 3), pi.getX(q * 6 + 4), pi.getX(q * 6 + 5));
  }
  const glass = new THREE.BufferGeometry();
  glass.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
  glass.setAttribute('normal', normals.clone());
  glass.setIndex(gidx);
  return { spec, xAt, topAt, botAt, paint, glass };
}

