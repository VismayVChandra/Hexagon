import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DOME_RINGS, cellCenter, spiral } from '../lib/hexGeom';
import type { CombProps } from './Comb';

// A honeycomb dome: hundreds of small wax cells following a sphere, each a deep hollow that fills with honey.
// The grid is the same spiral as the flat comb, so cell i is still the i-th cell filled, from the middle outward.
const RS = 10; // radius of the sphere the cell rims sit on
const SPACING = 1.3; // distance between neighbouring cell centres, measured along the surface
const CORNER = SPACING / Math.sqrt(3); // circumradius of a cell
const T_RIM = 0.86; // where the flat top of the wall ends (1 = the cell's outer corner)
const T_HOLE = 0.8; // where the hollow starts, after a small rounded edge
const BEVEL = 0.07; // the soft edge between the rim and the inside of the cell
const DEPTH = 0.78; // how deep the hollows go
const HONEY_MAX = DEPTH - BEVEL - 0.16; // honey height when a cell is full
const ELEVATION = (58 * Math.PI) / 180; // camera tilt above the dome
const FOV = 30;
const THETA_MAX = ((DOME_RINGS + 0.7) * SPACING) / RS; // angular radius of the cap
const SWAY = 0.3;

const hash = (i: number, k: number) => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A point of the flat grid (x, y) laid onto the sphere, keeping distances from the middle: returns the unit direction. */
function toSphere(px: number, py: number, out = new THREE.Vector3()): THREE.Vector3 {
  const rho = Math.hypot(px, py);
  if (rho < 1e-9) return out.set(0, 1, 0);
  const th = rho / RS;
  const s = Math.sin(th) / rho;
  return out.set(px * s, Math.cos(th), py * s);
}

interface Cell {
  index: number;
  dir: THREE.Vector3; // direction of the cell's centre
  hole: THREE.Vector3[]; // directions of the hollow's six corners
  theta: number;
}

/** Fine wax grain and soft blotches, used for colour and bump. */
function waxTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = 205 + hash(i, 9) * 50;
      img.data.set([v, v, v, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 260; i++) {
      const x = hash(i, 1) * size;
      const y = hash(i, 2) * size;
      const r = 5 + hash(i, 3) * 22;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(90,40,10,${0.06 + hash(i, 4) * 0.12})`);
      gr.addColorStop(1, 'rgba(90,40,10,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface BeeRig {
  root: THREE.Group;
  body: THREE.Group;
  wings: [THREE.Group, THREE.Group];
}

/** A small bee built from primitives; it faces +x. */
function makeBee(): BeeRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const amber = new THREE.MeshStandardMaterial({ color: 0xf5b21c, roughness: 0.4, emissive: 0x6a3a00, emissiveIntensity: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x241608, roughness: 0.65 });
  const fuzz = new THREE.MeshStandardMaterial({ color: 0x7a5420, roughness: 0.95 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b0805, roughness: 0.1, metalness: 0.2 });
  const sph = new THREE.SphereGeometry(1, 22, 16);
  const add = (mat: THREE.Material, pos: [number, number, number], scale: [number, number, number]) => {
    const m = new THREE.Mesh(sph, mat);
    m.position.set(...pos);
    m.scale.set(...scale);
    body.add(m);
    return m;
  };
  add(amber, [-0.3, 0, 0], [0.55, 0.3, 0.3]);
  for (const x of [-0.12, -0.36, -0.6]) {
    const r = 0.3 * Math.sqrt(1 - ((x + 0.3) / 0.55) ** 2) + 0.012;
    add(dark, [x, 0, 0], [0.085, r, r]);
  }
  add(dark, [-0.84, 0, 0], [0.06, 0.07, 0.07]);
  add(fuzz, [0.3, 0.02, 0], [0.27, 0.26, 0.26]);
  add(dark, [0.62, 0, 0], [0.2, 0.19, 0.2]);
  add(glass, [0.7, 0.06, 0.13], [0.08, 0.085, 0.07]);
  add(glass, [0.7, 0.06, -0.13], [0.08, 0.085, 0.07]);
  const feeler = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6);
  for (const s of [1, -1]) {
    const a = new THREE.Mesh(feeler, dark);
    a.position.set(0.78, 0.2, 0.07 * s);
    a.rotation.set(0.35 * s, 0, -0.9);
    body.add(a);
  }
  const wingGeo = new THREE.SphereGeometry(1, 18, 8);
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0.15, side: THREE.DoubleSide, depthWrite: false });
  const wings = [1, -1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.26, 0.26, 0.07 * s);
    const w = new THREE.Mesh(wingGeo, wingMat);
    w.scale.set(0.36, 0.012, 0.17);
    w.position.set(-0.12, 0.02, 0.17 * s);
    pivot.add(w);
    body.add(pivot);
    return pivot;
  }) as [THREE.Group, THREE.Group];
  root.scale.setScalar(1.5);
  return { root, body, wings };
}

interface Built {
  cells: Cell[];
  wax: THREE.BufferGeometry;
  honey: THREE.BufferGeometry;
  honeyPos: Float32Array;
  rings: THREE.BufferGeometry;
}

/** Builds the dome: one static wax mesh, one honey mesh whose heights change, and one set of goal outlines. */
function buildDome(capacity: number): Built {
  const axial = spiral(1 + 3 * DOME_RINGS * (DOME_RINGS + 1));
  const present = new Set(axial.map((a) => `${a.q},${a.r}`));
  const centers = axial.map((a) => cellCenter(a, CORNER));
  const angles = Array.from({ length: 6 }, (_, k) => ((90 + 60 * k) * Math.PI) / 180);
  // the neighbour across edge k (between corner k and corner k + 1)
  const across = [
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
    [1, 0],
    [0, 1],
  ];

  const cellsOut: Cell[] = [];
  const pos: number[] = [];
  const col: number[] = [];

  const cRim = new THREE.Color('#f3a944');
  const cEdge = new THREE.Color('#ffd391');
  const cWall = new THREE.Color('#c4601a');
  const cMid = new THREE.Color('#8a3b10');
  const cDeep = new THREE.Color('#2a1007');
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const N = new THREE.Vector3();

  const pushTri = (pa: THREE.Vector3, ca: THREE.Color, pb: THREE.Vector3, cb: THREE.Color, pc: THREE.Vector3, cc: THREE.Color, hint: THREE.Vector3) => {
    A.subVectors(pb, pa);
    B.subVectors(pc, pa);
    N.crossVectors(A, B);
    const flip = N.dot(hint) < 0;
    const order = flip ? [pa, pc, pb] : [pa, pb, pc];
    const cols = flip ? [ca, cc, cb] : [ca, cb, cc];
    for (let i = 0; i < 3; i++) {
      pos.push(order[i].x, order[i].y, order[i].z);
      col.push(cols[i].r, cols[i].g, cols[i].b);
    }
  };
  const pushQuad = (p0: THREE.Vector3, c0: THREE.Color, p1: THREE.Vector3, c1: THREE.Color, p2: THREE.Vector3, c2: THREE.Color, p3: THREE.Vector3, c3: THREE.Color, hint: THREE.Vector3) => {
    pushTri(p0, c0, p1, c1, p2, c2, hint);
    pushTri(p0, c0, p2, c2, p3, c3, hint);
  };

  const ringPts = (cx: number, cy: number, t: number) => angles.map((a) => toSphere(cx + CORNER * t * Math.cos(a), cy + CORNER * t * Math.sin(a)));
  const at = (d: THREE.Vector3, h: number) => d.clone().multiplyScalar(h);
  const shade = (base: THREE.Color, m: number) => base.clone().multiplyScalar(m);

  const ringPos: number[] = [];

  axial.forEach((a, i) => {
    const c = centers[i];
    const dc = toSphere(c.x, c.y);
    const dA = ringPts(c.x, c.y, 1);
    const dB = ringPts(c.x, c.y, T_RIM);
    const dC = ringPts(c.x, c.y, T_HOLE);
    const theta = Math.hypot(c.x, c.y) / RS;
    // each cell is a little darker or lighter; the rim of the dome fades into shadow, and cells beyond the capacity are unbuilt
    const m = (0.9 + hash(i, 11) * 0.2) * (1 - 0.7 * smooth(0.55, 1.0, theta / THETA_MAX)) * (i < capacity ? 1 : 0.4);
    const rim = shade(cRim, m);
    const edge = shade(cEdge, m);
    const wallTop = shade(cWall, m);
    const wallMidC = shade(cMid, m);
    const deep = shade(cDeep, m);
    const hTop = RS;
    const hBev = RS - BEVEL;
    const hBot = RS - DEPTH;
    const mid = at(dc, hBot);

    for (let k = 0; k < 6; k++) {
      const k2 = (k + 1) % 6;
      pushQuad(at(dA[k], hTop), rim, at(dA[k2], hTop), rim, at(dB[k2], hTop), rim, at(dB[k], hTop), rim, dc);
      pushQuad(at(dB[k], hTop), edge, at(dB[k2], hTop), edge, at(dC[k2], hBev), wallTop, at(dC[k], hBev), wallTop, dc);
      const hm = (hBev + hBot) / 2;
      const wallMid = at(dC[k], hm).add(at(dC[k2], hm)).multiplyScalar(0.5);
      const inward = at(dc, hm).sub(wallMid);
      const hq = RS - DEPTH * 0.42;
      pushQuad(at(dC[k], hBev), wallTop, at(dC[k2], hBev), wallTop, at(dC[k2], hq), wallMidC, at(dC[k], hq), wallMidC, inward);
      pushQuad(at(dC[k], hq), wallMidC, at(dC[k2], hq), wallMidC, at(dC[k2], hBot), deep, at(dC[k], hBot), deep, inward);
      pushTri(mid, deep, at(dC[k], hBot), deep, at(dC[k2], hBot), deep, dc);
      // outer wall where the dome ends
      const [dq, dr] = across[k];
      if (!present.has(`${a.q + dq},${a.r + dr}`)) {
        const outward = at(dA[k], hTop).add(at(dA[k2], hTop)).multiplyScalar(0.5).sub(at(dc, hTop));
        pushQuad(at(dA[k], hTop), rim, at(dA[k2], hTop), rim, at(dA[k2], hBot - 0.3), deep, at(dA[k], hBot - 0.3), deep, outward);
      }
    }

    cellsOut.push({ index: i, dir: dc, hole: dC, theta });
    // thin outline for goal cells, just above the rim
    const dO = ringPts(c.x, c.y, 0.97);
    const dI = ringPts(c.x, c.y, 0.9);
    for (let k = 0; k < 6; k++) {
      const k2 = (k + 1) % 6;
      const q = [at(dO[k], hTop + 0.015), at(dO[k2], hTop + 0.015), at(dI[k2], hTop + 0.015), at(dI[k], hTop + 0.015)];
      for (const idx of [0, 1, 2, 0, 2, 3]) ringPos.push(q[idx].x, q[idx].y, q[idx].z);
    }
  });

  // uv from position, so the grain follows the surface
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] * 0.45 + pos[i + 1] * 0.2, pos[i + 2] * 0.45 + pos[i + 1] * 0.13);
  const wax = new THREE.BufferGeometry();
  wax.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wax.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  wax.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  wax.computeVertexNormals();
  wax.computeBoundingSphere();

  // honey: a domed fan per cell (centre + six corners). Heights are written each time a level changes.
  const n = axial.length;
  const honeyPos = new Float32Array(n * 7 * 3);
  const honeyNor = new Float32Array(n * 7 * 3);
  const idx: number[] = [];
  const v = new THREE.Vector3();
  cellsOut.forEach((cell, i) => {
    const base = i * 7;
    honeyNor.set([cell.dir.x, cell.dir.y, cell.dir.z], base * 3);
    cell.hole.forEach((d, k) => {
      v.copy(d).sub(cell.dir).multiplyScalar(6).add(d).normalize();
      honeyNor.set([v.x, v.y, v.z], (base + 1 + k) * 3);
      idx.push(base, base + 1 + ((k + 1) % 6), base + 1 + k);
    });
  });
  const honey = new THREE.BufferGeometry();
  honey.setAttribute('position', new THREE.BufferAttribute(honeyPos, 3).setUsage(THREE.DynamicDrawUsage));
  honey.setAttribute('normal', new THREE.BufferAttribute(honeyNor, 3));
  honey.setIndex(idx);

  const rings = new THREE.BufferGeometry();
  rings.setAttribute('position', new THREE.Float32BufferAttribute(ringPos, 3));

  return { cells: cellsOut, wax, honey, honeyPos, rings };
}

interface Live {
  filled: number;
  frac: number;
  bee: CombProps['bee'];
  goal: CombProps['goal'];
  glow: boolean;
}

interface Api {
  invalidate: () => void;
}

/**
 * The 3D honeycomb dome. Loaded on demand (it carries the three.js library); see CombView for the fallback.
 * `capacity` is how many cells (counted from the middle) belong to this comb; the rest of the dome is shown unbuilt.
 */
export default function Comb3D({ capacity, filled, frac = 0, bee = null, goal = null, glow = false, label, className }: CombProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const live = useRef<Live>({ filled, frac, bee, goal, glow });
  const api = useRef<Api | null>(null);

  useEffect(() => {
    live.current = { filled, frac, bee, goal, glow };
    api.current?.invalidate();
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false; // the light never moves, so the dome's shadows are drawn once
    renderer.shadowMap.needsUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'pan-y';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.3;

    const built = buildDome(Math.max(1, capacity));
    const { cells } = built;
    const n = cells.length;
    const cap = Math.max(0, Math.min(n, Math.floor(capacity)));

    const tex = waxTexture();
    const waxMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex, bumpMap: tex, bumpScale: 1.1 });
    const wax = new THREE.Mesh(built.wax, waxMat);
    wax.castShadow = true;
    wax.receiveShadow = true;
    scene.add(wax);

    const honeyMat = new THREE.MeshPhysicalMaterial({
      color: 0xffb41c,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      emissive: 0xff8a00,
      emissiveIntensity: 0.55,
      envMapIntensity: 2,
    });
    const honey = new THREE.Mesh(built.honey, honeyMat);
    honey.receiveShadow = true;
    honey.frustumCulled = false;
    scene.add(honey);
    const shown = new Float32Array(n).fill(-1);
    const hBot = RS - DEPTH;

    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff0c4, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const rings = new THREE.Mesh(built.rings, ringMat);
    rings.frustumCulled = false;
    scene.add(rings);
    built.rings.setDrawRange(0, 0);

    // ---- light: a strong warm key from one side, the far side falling into shadow ----
    scene.add(new THREE.HemisphereLight(0xa070a8, 0x3a1608, 0.85));
    const sun = new THREE.DirectionalLight(0xffb066, 3.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -RS * 1.15;
    sc.right = RS * 1.15;
    sc.top = RS * 1.15;
    sc.bottom = -RS * 1.15;
    sc.near = 2;
    sc.far = 70;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
    scene.add(sun);
    scene.add(sun.target);
    const rimLight = new THREE.DirectionalLight(0x9a6ad0, 0.9);
    scene.add(rimLight);
    sun.position.set(-17, 14 + RS * 0.8, 11);
    sun.target.position.set(0, RS * 0.8, 0);
    rimLight.position.set(16, 6 + RS * 0.8, -10);

    // ---- bee ----
    const beeRig = makeBee();
    beeRig.root.visible = false;
    scene.add(beeRig.root);

    // the bee's shadow on the dome: a soft dark disc lying on the surface under it
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(1, 28),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    blob.visible = false;
    blob.scale.set(1.0, 0.8, 1);
    scene.add(blob);
    const Z = new THREE.Vector3(0, 0, 1);
    const surf = new THREE.Vector3();

    // ---- camera ----
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 300);
    const target = new THREE.Vector3(0, RS * 0.82, 0);
    let dist = 40;
    const placeCamera = (az: number, d: number) => {
      camera.position.set(
        target.x + Math.sin(az) * Math.cos(ELEVATION) * d,
        target.y + Math.sin(ELEVATION) * d,
        target.z + Math.cos(az) * Math.cos(ELEVATION) * d,
      );
      camera.lookAt(target);
    };
    const probe = cells.map((c) => c.dir.clone().multiplyScalar(RS));
    const pv = new THREE.Vector3();
    const fit = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // the nearest distance at which the whole dome stays in view through the sway
      const worst = (d: number) => {
        let m = 0;
        for (const az of [-SWAY, 0, SWAY]) {
          placeCamera(az, d);
          camera.updateMatrixWorld();
          for (const p of probe) {
            pv.copy(p).project(camera);
            m = Math.max(m, Math.abs(pv.x), Math.abs(pv.y));
          }
        }
        return m;
      };
      let lo = 8;
      let hi = 160;
      for (let k = 0; k < 18; k++) {
        const mid = (lo + hi) / 2;
        if (worst(mid) > 0.94) lo = mid;
        else hi = mid;
      }
      dist = hi;
    };

    // ---- interaction ----
    let userAz = 0;
    let dragging = false;
    let lastX = 0;
    let lastTouch = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      userAz += (e.clientX - lastX) * 0.009;
      lastX = e.clientX;
      lastTouch = performance.now() / 1000;
      invalidate();
    };
    const onUp = () => {
      dragging = false;
      lastTouch = performance.now() / 1000;
      invalidate();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.style.cursor = 'grab';

    // ---- frame loop ----
    let raf = 0;
    let last = performance.now();
    let lost = false;
    const Y = new THREE.Vector3(0, 1, 0);
    const beePos = new THREE.Vector3();
    const beeQ = new THREE.Quaternion();
    const nQ = new THREE.Quaternion();
    const hQ = new THREE.Quaternion();
    const ex = new THREE.Vector3();
    const ez = new THREE.Vector3();
    const want = new THREE.Vector3();
    let beeInit = false;

    const tick = (now: number) => {
      raf = 0;
      if (lost) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const s = live.current;
      const continuous = !reduce && s.bee != null;
      let moving = false;

      // honey levels rise smoothly toward their targets
      const done = Math.min(Math.max(0, Math.floor(s.filled)), cap);
      let honeyChanged = false;
      for (let i = 0; i < n; i++) {
        const goalLevel = i < done ? 1 : i === done && i < cap ? Math.max(0, Math.min(1, s.frac)) : 0;
        let v = shown[i];
        if (v < 0 || reduce) v = goalLevel;
        else {
          v += (goalLevel - v) * Math.min(1, dt * (i === done ? 3 : 2.2));
          if (Math.abs(goalLevel - v) < 0.003) v = goalLevel;
          else moving = true;
        }
        if (v !== shown[i]) {
          shown[i] = v;
          honeyChanged = true;
          const h = v <= 0.002 ? hBot - 0.3 : hBot + 0.02 + HONEY_MAX * v;
          const cell = cells[i];
          const base = i * 7;
          const ctr = h + (v > 0.002 ? 0.05 : 0);
          built.honeyPos.set([cell.dir.x * ctr, cell.dir.y * ctr, cell.dir.z * ctr], base * 3);
          for (let k = 0; k < 6; k++) {
            const d = cell.hole[k];
            built.honeyPos.set([d.x * h, d.y * h, d.z * h], (base + 1 + k) * 3);
          }
        }
      }
      if (honeyChanged) built.honey.attributes.position.needsUpdate = true;

      // goal cells get a glowing outline
      const g = s.goal;
      if (g) {
        const from = Math.max(g.from, done);
        const to = Math.min(g.to, cap);
        built.rings.setDrawRange(from * 36, Math.max(0, to - from) * 36);
      } else built.rings.setDrawRange(0, 0);
      ringMat.opacity = continuous ? 0.65 + 0.3 * Math.sin(t * 2.4) : 0.9;

      const glowTarget = s.glow ? 1 : 0.55;
      honeyMat.emissiveIntensity += (glowTarget - honeyMat.emissiveIntensity) * Math.min(1, dt * 3);
      if (Math.abs(glowTarget - honeyMat.emissiveIntensity) > 0.01) moving = true;

      // camera: a slow sway, plus whatever the person drags (which eases back after a moment)
      if (!dragging && userAz !== 0 && t - lastTouch > 2.5) {
        userAz *= Math.exp(-dt * 1.8);
        if (Math.abs(userAz) < 0.002) userAz = 0;
      }
      if (userAz !== 0) moving = true;
      const az = userAz + (continuous ? SWAY * 0.85 * Math.sin(t * 0.4) : 0);
      placeCamera(az, dist);

      // the bee hovers over the cell being filled, standing on the dome's surface normal
      const mode = s.bee;
      beeRig.root.visible = mode != null;
      blob.visible = mode != null;
      if (mode) {
        const bi = Math.min(done, n - 1);
        const cell = cells[bi];
        nQ.setFromUnitVectors(Y, cell.dir);
        ex.set(1, 0, 0).applyQuaternion(nQ);
        ez.set(0, 0, 1).applyQuaternion(nQ);
        let hy: number;
        let ox: number;
        let oz = 0;
        let heading = 0.6;
        let tilt = 0;
        if (mode === 'fly') {
          const a = reduce ? 0.8 : t * 1.3;
          ox = Math.cos(a) * 1.1;
          oz = Math.sin(a) * 1.1;
          hy = 2.5 + (reduce ? 0 : Math.sin(t * 3.1) * 0.15);
          heading = Math.atan2(-Math.cos(a), -Math.sin(a));
          tilt = -0.14;
        } else if (mode === 'still') {
          hy = 1.2 + (reduce ? 0 : Math.sin(t * 2) * 0.08);
          ox = 0.5;
        } else {
          hy = 0.25;
          ox = 0.55;
        }
        want.copy(cell.dir).multiplyScalar(RS + hy).addScaledVector(ex, ox).addScaledVector(ez, oz);
        if (!beeInit) {
          beePos.copy(want);
          beeQ.copy(nQ);
          beeInit = true;
        } else {
          beePos.lerp(want, Math.min(1, dt * 7));
          beeQ.slerp(nQ, Math.min(1, dt * 5));
        }
        beeRig.root.position.copy(beePos);
        surf.copy(beePos).normalize();
        blob.position.copy(surf).multiplyScalar(RS + 0.05);
        blob.quaternion.setFromUnitVectors(Z, surf);
        const lift = Math.max(0, beePos.length() - RS);
        blob.scale.setScalar(0.8 + lift * 0.18);
        (blob.material as THREE.MeshBasicMaterial).opacity = mode === 'rest' ? 0.3 : Math.max(0.15, 0.42 - lift * 0.08);
        hQ.setFromAxisAngle(Y, heading);
        beeRig.root.quaternion.copy(beeQ).multiply(hQ);
        beeRig.body.rotation.z = tilt;
        const amp = reduce ? 0.2 : mode === 'fly' ? 0.2 + 0.55 * Math.sin(t * 52) : mode === 'still' ? 0.2 + 0.2 * Math.sin(t * 14) : 0.1;
        beeRig.wings[0].rotation.x = -(0.25 + amp);
        beeRig.wings[1].rotation.x = 0.25 + amp;
        if (beePos.distanceTo(want) > 0.02) moving = true;
      }

      renderer.render(scene, camera);
      if (continuous || moving) raf = requestAnimationFrame(tick);
    };
    function invalidate() {
      if (!raf && !lost) raf = requestAnimationFrame(tick);
    }

    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
    };
    const onRestored = () => {
      lost = false;
      renderer.shadowMap.needsUpdate = true;
      shown.fill(-1);
      invalidate();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    const ro = new ResizeObserver(() => {
      fit();
      invalidate();
    });
    ro.observe(host);
    fit();
    api.current = { invalidate };
    invalidate();

    return () => {
      api.current = null;
      cancelAnimationFrame(raf);
      lost = true;
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
        }
      });
      tex.dispose();
      envTarget.dispose();
      roomEnv.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [capacity]);

  return <div ref={hostRef} className={`comb-3d${className ? ` ${className}` : ''}`} role="img" aria-label={label} />;
}
