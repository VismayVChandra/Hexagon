import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cellCenter, spiral } from '../lib/hexGeom';
import type { CombProps } from './Comb';

// A real 3D honeycomb: hollow wax tubes lit from one side, honey that rises inside them, and a bee.
// Units: a cell is 2 wide (outer circumradius 1), neighbouring cells share a wall.
const RO = 1; // outer circumradius of a cell
const WALL = 0.1; // wall thickness
const RI = (Math.sqrt(3) / 2 - WALL) / (Math.sqrt(3) / 2); // circumradius of the hollow
const H = 1; // height of the walls
const FLOOR = 0.14; // thickness of the cell floor
const HONEY_MAX = H - FLOOR - 0.14; // honey height when a cell is full
const ELEVATION = (50 * Math.PI) / 180; // camera tilt above the comb
const FOV = 30;

const hash = (i: number, k: number) => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** A pointy-top hexagon with softly rounded corners, drawn into `path` (x, y plane). */
function hexPath<P extends THREE.Path>(path: P, R: number, t: number): P {
  const pts = Array.from({ length: 6 }, (_, k) => {
    const a = Math.PI / 2 + (k * Math.PI) / 3;
    return new THREE.Vector2(R * Math.cos(a), R * Math.sin(a));
  });
  pts.forEach((V, i) => {
    const a = V.clone().lerp(pts[(i + 5) % 6], t);
    const b = V.clone().lerp(pts[(i + 1) % 6], t);
    if (i === 0) path.moveTo(a.x, a.y);
    else path.lineTo(a.x, a.y);
    path.quadraticCurveTo(V.x, V.y, b.x, b.y);
  });
  path.closePath();
  return path;
}

/** Extrudes a shape upward (+y) with rounded edges; the result spans y from 0 to `height`. */
function prism(shape: THREE.Shape, height: number, bevel: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: height - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelOffset: -bevel * 0.8,
    bevelSegments: 3,
    curveSegments: 4,
  });
  g.translate(0, 0, bevel);
  g.rotateX(-Math.PI / 2);
  return g;
}

function waxGeometry(): THREE.BufferGeometry {
  const outer = hexPath(new THREE.Shape(), RO, 0.1);
  outer.holes.push(hexPath(new THREE.Path(), RI, 0.1));
  const tube = prism(outer, H, 0.035);
  const floorShape = hexPath(new THREE.Shape(), RO, 0.1);
  const floor = new THREE.ExtrudeGeometry(floorShape, { depth: FLOOR, bevelEnabled: false, curveSegments: 4 });
  floor.rotateX(-Math.PI / 2);
  // Vertex colours: pale wax walls, a darker, deeper floor.
  const paint = (g: THREE.BufferGeometry, r: number, gr: number, b: number) => {
    const count = g.attributes.position.count;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) arr.set([r, gr, b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  };
  paint(tube, 1, 1, 1);
  paint(floor, 0.42, 0.26, 0.1);
  const merged = mergeGeometries([tube, floor]);
  tube.dispose();
  floor.dispose();
  return merged ?? new THREE.BufferGeometry();
}

function honeyGeometry(): THREE.BufferGeometry {
  // Unit height; the instance's y scale sets the real height. The rounded edge gives a glossy, domed surface.
  return prism(hexPath(new THREE.Shape(), RI * 0.985, 0.1), 1, 0.07);
}

/** Soft blotches so the wax isn't perfectly flat-coloured. */
function waxTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 700; i++) {
      const x = hash(i, 1) * 256;
      const y = hash(i, 2) * 256;
      const r = 3 + hash(i, 3) * 16;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(130,84,18,${0.05 + hash(i, 4) * 0.13})`);
      gr.addColorStop(1, 'rgba(130,84,18,0)');
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
  const amber = new THREE.MeshStandardMaterial({ color: 0xf5b21c, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x241608, roughness: 0.65 });
  const fuzz = new THREE.MeshStandardMaterial({ color: 0x6e4c1c, roughness: 0.95 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b0805, roughness: 0.1, metalness: 0.2 });
  const sph = new THREE.SphereGeometry(1, 22, 16);
  const add = (mat: THREE.Material, pos: [number, number, number], scale: [number, number, number]) => {
    const m = new THREE.Mesh(sph, mat);
    m.position.set(...pos);
    m.scale.set(...scale);
    m.castShadow = true;
    body.add(m);
    return m;
  };
  // striped abdomen
  add(amber, [-0.3, 0, 0], [0.55, 0.3, 0.3]);
  for (const x of [-0.12, -0.36, -0.6]) {
    const r = 0.3 * Math.sqrt(1 - ((x + 0.3) / 0.55) ** 2) + 0.012;
    add(dark, [x, 0, 0], [0.085, r, r]);
  }
  add(dark, [-0.84, 0, 0], [0.06, 0.07, 0.07]);
  // thorax and head
  add(fuzz, [0.3, 0.02, 0], [0.27, 0.26, 0.26]);
  add(dark, [0.62, 0, 0], [0.2, 0.19, 0.2]);
  add(glass, [0.7, 0.06, 0.13], [0.08, 0.085, 0.07]);
  add(glass, [0.7, 0.06, -0.13], [0.08, 0.085, 0.07]);
  // antennae
  const feeler = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6);
  for (const s of [1, -1]) {
    const a = new THREE.Mesh(feeler, dark);
    a.position.set(0.78, 0.2, 0.07 * s);
    a.rotation.set(0.35 * s, 0, -0.9);
    body.add(a);
  }
  // wings pivot at the thorax
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
  root.scale.setScalar(0.8);
  return { root, body, wings };
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

/** The 3D honeycomb. Loaded on demand (it carries the three.js library); see CombView for the fallback. */
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'pan-y';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.7;

    // ---- cells ----
    const cells = spiral(capacity).map((c) => {
      const p = cellCenter(c, RO);
      return { x: p.x, z: p.y };
    });
    const n = cells.length;
    const reach = Math.max(...cells.map((c) => Math.hypot(c.x, c.z))) + RO;
    // How far the comb reaches sideways and in depth as the camera sways a little around it.
    let reachX = 0;
    let reachZ = 0;
    for (let k = -4; k <= 4; k++) {
      const a = (k / 4) * 0.32;
      for (const c of cells) {
        reachX = Math.max(reachX, Math.abs(c.x * Math.cos(a) + c.z * Math.sin(a)));
        reachZ = Math.max(reachZ, Math.abs(-c.x * Math.sin(a) + c.z * Math.cos(a)));
      }
    }
    reachX += RO;
    reachZ += RO;

    const tex = waxTexture();
    const waxGeo = waxGeometry();
    const waxMat = new THREE.MeshStandardMaterial({ color: 0xdca13a, roughness: 0.62, map: tex, bumpMap: tex, bumpScale: 0.6, vertexColors: true });
    const wax = new THREE.InstancedMesh(waxGeo, waxMat, n);
    wax.castShadow = true;
    wax.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const topY: number[] = [];
    cells.forEach((c, i) => {
      const sy = 0.94 + hash(i, 5) * 0.12;
      topY.push(H * sy);
      dummy.position.set(c.x, 0, c.z);
      dummy.scale.set(1, sy, 1);
      dummy.updateMatrix();
      wax.setMatrixAt(i, dummy.matrix);
      const v = 0.86 + hash(i, 6) * 0.2;
      col.setRGB(v, v * (0.96 + hash(i, 7) * 0.06), v * (0.88 + hash(i, 8) * 0.1));
      wax.setColorAt(i, col);
    });
    scene.add(wax);

    const honeyGeo = honeyGeometry();
    const honeyMat = new THREE.MeshPhysicalMaterial({
      color: 0xe58a06,
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      emissive: 0x9a3e00,
      emissiveIntensity: 0.22,
      envMapIntensity: 2.6,
    });
    const honey = new THREE.InstancedMesh(honeyGeo, honeyMat, n);
    honey.receiveShadow = true;
    honey.frustumCulled = false;
    scene.add(honey);
    const shown = new Float32Array(n).fill(-1);

    const ringGeo = new THREE.RingGeometry(0.9, 0.985, 6, 1);
    ringGeo.rotateZ(Math.PI / 2);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.95, depthWrite: false });
    const rings = new THREE.InstancedMesh(ringGeo, ringMat, n);
    rings.count = 0;
    rings.frustumCulled = false;
    scene.add(rings);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(reach * 5, reach * 5), new THREE.ShadowMaterial({ opacity: 0.32 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    // ---- light ----
    scene.add(new THREE.HemisphereLight(0xfff3da, 0x7a5320, 0.5));
    const sun = new THREE.DirectionalLight(0xfff0d2, 2.1);
    sun.position.set(-5.5, 9, 4.5);
    sun.castShadow = true;
    const shadowRes = n > 61 ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowRes, shadowRes);
    const sc = sun.shadow.camera;
    const ext = reach + 3;
    sc.left = -ext;
    sc.right = ext;
    sc.top = ext;
    sc.bottom = -ext;
    sc.near = 1;
    sc.far = 40;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    scene.add(sun);

    // ---- bee ----
    const beeRig = makeBee();
    beeRig.root.visible = false;
    scene.add(beeRig.root);

    // ---- camera ----
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
    const target = new THREE.Vector3(0, 0.5, 0);
    let dist = 20;
    const fit = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const tan = Math.tan((FOV * Math.PI) / 360);
      const halfV = reachZ * Math.sin(ELEVATION) + H * Math.cos(ELEVATION) + 0.8;
      dist = Math.max(halfV / tan, (reachX + 0.2) / (tan * camera.aspect)) * 1.03;
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
    const beePos = new THREE.Vector3();
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
      const done = Math.min(Math.max(0, Math.floor(s.filled)), n);
      let honeyChanged = false;
      for (let i = 0; i < n; i++) {
        const goalLevel = i < done ? 1 : i === done ? Math.max(0, Math.min(1, s.frac)) : 0;
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
          const h = HONEY_MAX * v;
          dummy.position.set(cells[i].x, FLOOR - 0.001, cells[i].z);
          dummy.scale.set(1, Math.max(h, 0.0001), 1);
          dummy.updateMatrix();
          honey.setMatrixAt(i, dummy.matrix);
        }
      }
      if (honeyChanged) honey.instanceMatrix.needsUpdate = true;

      // goal cells get a glowing rim
      let ringCount = 0;
      const g = s.goal;
      if (g) {
        for (let i = Math.max(g.from, done); i < Math.min(g.to, n); i++) {
          dummy.position.set(cells[i].x, topY[i] + 0.012, cells[i].z);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          rings.setMatrixAt(ringCount++, dummy.matrix);
        }
      }
      rings.count = ringCount;
      rings.instanceMatrix.needsUpdate = true;
      ringMat.opacity = continuous ? 0.7 + 0.25 * Math.sin(t * 2.4) : 0.9;

      const glowTarget = s.glow ? 0.8 : 0.22;
      honeyMat.emissiveIntensity += (glowTarget - honeyMat.emissiveIntensity) * Math.min(1, dt * 3);
      if (Math.abs(glowTarget - honeyMat.emissiveIntensity) > 0.01) moving = true;

      // camera: a slow sway, plus whatever the person drags (which eases back after a moment)
      if (!dragging && userAz !== 0 && t - lastTouch > 2.5) {
        userAz *= Math.exp(-dt * 1.8);
        if (Math.abs(userAz) < 0.002) userAz = 0;
      }
      if (userAz !== 0) moving = true;
      const az = userAz + (continuous ? 0.25 * Math.sin(t * 0.4) : 0);
      camera.position.set(
        target.x + Math.sin(az) * Math.cos(ELEVATION) * dist,
        target.y + Math.sin(ELEVATION) * dist,
        target.z + Math.cos(az) * Math.cos(ELEVATION) * dist,
      );
      camera.lookAt(target);

      // the bee
      const mode = s.bee;
      beeRig.root.visible = mode != null;
      if (mode) {
        const bi = done < n ? done : n - 1;
        const c = cells[bi];
        let hx = c.x;
        let hz = c.z;
        let hy = H + 0.14;
        let heading = 0.6;
        let tilt = 0;
        if (mode === 'fly') {
          const a = reduce ? 0.8 : t * 1.3;
          hx += Math.cos(a) * 0.42;
          hz += Math.sin(a) * 0.42;
          hy = H + 0.95 + (reduce ? 0 : Math.sin(t * 3.1) * 0.09);
          heading = Math.atan2(-Math.cos(a), -Math.sin(a));
          tilt = -0.14;
        } else if (mode === 'still') {
          hy = H + 0.5 + (reduce ? 0 : Math.sin(t * 2) * 0.05);
          hx += 0.25;
        } else {
          hx += 0.3;
        }
        if (!beeInit) {
          beePos.set(hx, hy, hz);
          beeInit = true;
        } else {
          beePos.lerp(new THREE.Vector3(hx, hy, hz), Math.min(1, dt * 7));
        }
        beeRig.root.position.copy(beePos);
        beeRig.root.rotation.y = heading;
        beeRig.body.rotation.z = tilt;
        const amp = reduce ? 0.2 : mode === 'fly' ? 0.2 + 0.55 * Math.sin(t * 52) : mode === 'still' ? 0.2 + 0.2 * Math.sin(t * 14) : 0.1;
        beeRig.wings[0].rotation.x = -(0.25 + amp);
        beeRig.wings[1].rotation.x = 0.25 + amp;
        if (Math.hypot(beePos.x - hx, beePos.y - hy, beePos.z - hz) > 0.01) moving = true;
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
      wax.dispose();
      honey.dispose();
      rings.dispose();
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
