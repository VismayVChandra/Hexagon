import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PARTS, partStates, type Car } from '../data/cars';
import { SPECS, buildShape, clamp01, ease } from '../lib/carShape';
import { CAR_MODELS } from '../data/carModels';

/**
 * The car workshop in 3D. The car is built from code (no model files): a smooth painted body lofted from a side profile,
 * glass, real wheels with spokes and brake discs, a chassis, springs and an engine. As you focus the parts are fitted one by one
 * (frame, wheels, suspension, engine, body, paint) with welding sparks at the spot being worked on; the body is "printed" by a
 * scan plane sweeping from tail to nose, and paint and lights come last. The car turns slowly on a showroom floor.
 */

/** A rod between two points. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, seg = 10): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface PartGroup {
  group: THREE.Group;
  mats: { mat: THREE.Material & { opacity: number; transparent: boolean }; base: number }[];
  baseY: number;
}

function collect(group: THREE.Group, baseY = 0): PartGroup {
  const seen = new Set<THREE.Material>();
  const mats: PartGroup['mats'] = [];
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (seen.has(m)) continue;
      seen.add(m);
      mats.push({ mat: m as PartGroup['mats'][number]['mat'], base: m.opacity });
    }
  });
  return { group, mats, baseY };
}

function fade(p: PartGroup, a: number, dropY = 0) {
  p.group.visible = a > 0.002;
  p.group.position.y = p.baseY + dropY * (1 - ease(a));
  for (const { mat, base } of p.mats) {
    mat.opacity = base * clamp01(a * 1.4);
    mat.transparent = a < 1 || base < 1;
  }
}

function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Car3DProps {
  car: Car;
  /** 0..1, including progress carried over from earlier sessions. */
  progress: number;
  state: 'working' | 'paused' | 'break' | 'done';
  label?: string;
}

interface Live {
  progress: number;
  state: Car3DProps['state'];
}

export default function Car3D({ car, progress, state, label }: Car3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const live = useRef<Live>({ progress, state });
  live.current = { progress, state };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spec = SPECS[car.style];
    const shape = buildShape(spec);
    const { L, W, H } = spec;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.localClippingEnabled = true;
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'pan-y';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.03);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.6;

    // ----- lights and floor
    scene.add(new THREE.AmbientLight(0xffffff, 0.18));
    const key = new THREE.SpotLight(0xfff2e0, 55, 18, 0.62, 0.7, 1.6);
    key.position.set(3.2, 6.2, 4.2);
    key.target.position.set(0, 0.4, 0);
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xffc27a, 1.4);
    rim.position.set(-4, 2.4, -3.5);
    scene.add(rim);
    const teal = new THREE.PointLight(0x58c4aa, 5, 9, 1.8);
    teal.position.set(2.6, 0.4, -3);
    scene.add(teal);
    const weld = new THREE.PointLight(0xffa24a, 0, 2.6, 2);
    scene.add(weld);

    const floorR = Math.max(L * 0.95, 3.6);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(floorR, 72), new THREE.MeshStandardMaterial({ color: 0x151a20, roughness: 0.6, metalness: 0.25 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xe9b44c, transparent: true, opacity: 0.55 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(floorR - 0.34, floorR - 0.3, 96), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    scene.add(ring);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(floorR - 0.7, floorR - 0.68, 96), new THREE.MeshBasicMaterial({ color: 0x58c4aa, transparent: true, opacity: 0.3 }));
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.004;
    scene.add(ring2);
    const glowTex = radialTexture();
    const spot = new THREE.Mesh(new THREE.PlaneGeometry(floorR * 1.7, floorR * 1.7), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x6f8f86, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = 0.006;
    scene.add(spot);

    // ----- the car
    const carRoot = new THREE.Group();
    scene.add(carRoot);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.25, W * 1.5), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, opacity: 0.8, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.008;
    carRoot.add(shadow);

    const paintMat = new THREE.MeshPhysicalMaterial({ color: 0x8a909a, metalness: 0.25, roughness: 0.7, clearcoat: 0, clearcoatRoughness: 0.06, side: THREE.DoubleSide, envMapIntensity: 1 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0a1118, metalness: 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.93, envMapIntensity: 1.8, side: THREE.DoubleSide });
    const steel = new THREE.MeshStandardMaterial({ color: 0x59606b, metalness: 0.85, roughness: 0.38, transparent: true });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2a2f37, metalness: 0.7, roughness: 0.45, transparent: true });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 1, roughness: 0.12, transparent: true });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x0d0e10, metalness: 0, roughness: 0.92, transparent: true });
    const accentCol = new THREE.Color(car.accent ?? car.shade);
    const carCol = new THREE.Color(car.color);
    const primer = new THREE.Color(0x8a909a);

    // frame
    const frame = new THREE.Group();
    const railZ = W * 0.31;
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(L * 0.8, 0.1, 0.1), steel);
      r.position.set(0, 0.36, s * railZ);
      frame.add(r);
    }
    for (let i = 0; i < 6; i++) {
      const cm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, railZ * 2), darkSteel);
      cm.position.set(-L * 0.36 + i * (L * 0.72) / 5, 0.36, 0);
      frame.add(cm);
    }
    const floorPan = new THREE.Mesh(new THREE.BoxGeometry(L * 0.5, 0.025, railZ * 1.9), darkSteel);
    floorPan.position.set(-L * 0.04, 0.4, 0);
    frame.add(floorPan);
    for (const wx of [spec.wb / 2, -spec.wb / 2]) {
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, W * 0.78, 12), steel);
      axle.rotation.x = Math.PI / 2;
      axle.position.set(wx, spec.R, 0);
      frame.add(axle);
    }
    carRoot.add(frame);
    const frameP = collect(frame);

    // wheels
    const wheels = new THREE.Group();
    const wheelMeshes: THREE.Group[] = [];
    const wheelPos: THREE.Vector3[] = [];
    const tireW = Math.min(0.26, W * 0.13);
    for (const wx of [spec.wb / 2, -spec.wb / 2]) {
      for (const s of [-1, 1]) {
        const R = spec.R;
        const w = new THREE.Group();
        const prof = [
          V(R * 0.6, 0, -tireW / 2), V(R * 0.88, 0, -tireW / 2), V(R - 0.025, 0, -tireW / 2 + 0.035), V(R, 0, -tireW / 2 + 0.08),
          V(R, 0, tireW / 2 - 0.08), V(R - 0.025, 0, tireW / 2 - 0.035), V(R * 0.88, 0, tireW / 2), V(R * 0.6, 0, tireW / 2),
        ].map((p) => new THREE.Vector2(p.x, p.z));
        const tire = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), rubber);
        tire.rotation.x = Math.PI / 2;
        w.add(tire);
        const spin = new THREE.Group();
        const rimR = R * 0.64;
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, tireW * 0.78, 36, 1, true), chrome);
        barrel.rotation.x = Math.PI / 2;
        spin.add(barrel);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.5, R * 0.5, 0.025, 36), darkSteel);
        disc.rotation.x = Math.PI / 2;
        disc.position.z = -s * 0.03;
        spin.add(disc);
        const spokes = 7;
        for (let i = 0; i < spokes; i++) {
          const sp = new THREE.Mesh(new THREE.BoxGeometry(rimR * 0.95, 0.05, 0.035), chrome);
          sp.position.x = 0;
          const arm = new THREE.Group();
          sp.position.x = rimR * 0.48;
          arm.add(sp);
          arm.rotation.z = (i / spokes) * Math.PI * 2;
          arm.position.z = s * (tireW * 0.18);
          spin.add(arm);
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 20), steel);
        hub.rotation.x = Math.PI / 2;
        hub.position.z = s * (tireW * 0.22);
        spin.add(hub);
        spin.name = 'spin';
        w.add(spin);
        const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.05), new THREE.MeshStandardMaterial({ color: accentCol, metalness: 0.3, roughness: 0.4, transparent: true }));
        caliper.position.set(R * 0.38, 0, -s * 0.03);
        w.add(caliper);
        const pz = s * (W / 2 - tireW / 2 - 0.07);
        w.position.set(wx, R, pz);
        wheelPos.push(w.position.clone());
        wheels.add(w);
        wheelMeshes.push(w);
      }
    }
    carRoot.add(wheels);
    const wheelsP = collect(wheels);

    // suspension: coil spring, damper and two arms at every wheel
    const susp = new THREE.Group();
    const springMat = new THREE.MeshStandardMaterial({ color: accentCol, metalness: 0.6, roughness: 0.3, transparent: true });
    const damperMat = new THREE.MeshStandardMaterial({ color: 0xe0a02c, metalness: 0.8, roughness: 0.25, transparent: true });
    for (const wp of wheelPos) {
      const s = Math.sign(wp.z);
      const inner = V(wp.x, 0.5, s * (railZ + 0.17));
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 90; i++) {
        const t = i / 90;
        const a = t * Math.PI * 2 * 6.5;
        pts.push(V(inner.x + Math.cos(a) * 0.075, 0.32 + t * 0.34, inner.z + Math.sin(a) * 0.075));
      }
      susp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.014, 6), springMat));
      susp.add(rod(V(inner.x, 0.3, inner.z), V(inner.x, 0.7, inner.z), 0.024, damperMat));
      const hub = V(wp.x, spec.R, wp.z - s * (tireW * 0.34));
      susp.add(rod(V(wp.x - 0.18, 0.36, s * railZ), hub, 0.017, steel));
      susp.add(rod(V(wp.x + 0.18, 0.36, s * railZ), hub, 0.017, steel));
    }
    carRoot.add(susp);
    const suspP = collect(susp);

    // engine, in the nose
    const engine = new THREE.Group();
    const ex = L * 0.2;
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.34, 0.5), steel);
    block.position.set(ex, 0.58, 0);
    engine.add(block);
    const headMat = new THREE.MeshStandardMaterial({ color: carCol, metalness: 0.5, roughness: 0.35, transparent: true });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.5), headMat);
    head.position.set(ex, 0.8, 0);
    engine.add(head);
    for (let i = 0; i < 4; i++) {
      const cx = ex - 0.27 + i * 0.18;
      const runner = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 12), chrome);
      runner.position.set(cx, 0.97, 0.12);
      runner.rotation.x = 0.5;
      engine.add(runner);
      const ex2 = rod(V(cx, 0.62, -0.26), V(cx, 0.5, -0.46), 0.03, darkSteel);
      engine.add(ex2);
    }
    const plenum = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.09, 0.2), chrome);
    plenum.position.set(ex, 1.1, 0.2);
    engine.add(plenum);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 28), darkSteel);
    fan.rotation.z = Math.PI / 2;
    fan.position.set(ex + 0.46, 0.62, 0);
    engine.add(fan);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.9 });
    const glowDot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), glowMat);
    glowDot.position.set(ex, 0.58, -0.27);
    engine.add(glowDot);
    // keep it under the bonnet: squash it to fit low cars
    const engS = Math.max(0.42, Math.min(1, (shape.topAt(0.72) - 0.2 - 0.41) / 0.72));
    engine.scale.y = engS;
    engine.position.y = 0.41 * (1 - engS);
    carRoot.add(engine);
    const engineP = collect(engine, engine.position.y);

    // body: painted shell and glass, revealed by a scan plane
    const body = new THREE.Group();
    body.add(new THREE.Mesh(shape.paint, paintMat));
    const glassMesh = new THREE.Mesh(shape.glass, glassMat);
    body.add(glassMesh);
    carRoot.add(body);
    const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), -L);
    paintMat.clippingPlanes = [clip];
    glassMat.clippingPlanes = [clip];
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.15, H * 1.15), new THREE.MeshBasicMaterial({ color: 0x7ee0c8, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    scan.rotation.y = Math.PI / 2;
    scan.position.y = H * 0.55;
    carRoot.add(scan);

    // trim fitted with the paint: lights, grille, mirrors, stripe, spoiler, rails, chrome
    const trim = new THREE.Group();
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xf4efe0, emissive: 0xfff2c0, emissiveIntensity: 0, metalness: 0.2, roughness: 0.1, transparent: true });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0d0d, emissive: 0xff2a1e, emissiveIntensity: 0, roughness: 0.2, transparent: true });
    const blackTrim = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, metalness: 0.3, roughness: 0.5, transparent: true });
    const noseT = 0.965;
    const tailT = 0.03;
    const noseY = (shape.topAt(noseT) + shape.botAt(noseT)) / 2;
    const tailY = (shape.topAt(tailT) + shape.botAt(tailT)) / 2 + 0.03;
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), lightMat);
      hl.scale.set(1.5, 0.55, 1.9);
      hl.position.set(shape.xAt(0.945), noseY + 0.07, s * W * 0.34);
      hl.rotation.y = s * 0.25;
      trim.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.3), tailMat);
      tl.position.set(shape.xAt(0.022), tailY, s * W * 0.34);
      trim.add(tl);
      const mir = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.07), blackTrim);
      const mt = Math.min(spec.gh[1] - 0.04, 0.62);
      mir.position.set(shape.xAt(mt), spec.belt * H + 0.08, s * (W / 2 + 0.02));
      trim.add(mir);
    }
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, W * 0.34), blackTrim);
    grille.position.set(shape.xAt(0.975), noseY - 0.02, 0);
    trim.add(grille);
    const lowIntake = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, W * 0.5), blackTrim);
    lowIntake.position.set(shape.xAt(0.972), shape.botAt(0.97) + 0.09, 0);
    trim.add(lowIntake);
    if (car.accent && (car.style === 'coupe' || car.style === 'supercar')) {
      const stripeMat = new THREE.MeshStandardMaterial({ color: accentCol, metalness: 0.3, roughness: 0.35, transparent: true, side: THREE.DoubleSide });
      const pos: number[] = [];
      const ind: number[] = [];
      const ts: number[] = [];
      for (let i = 0; i <= 40; i++) ts.push(0.1 + (i / 40) * 0.84);
      ts.forEach((t, i) => {
        const y = shape.topAt(t) + 0.004;
        pos.push(shape.xAt(t), y, -0.1, shape.xAt(t), y, 0.1);
        if (i < ts.length - 1) ind.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(ind);
      g.computeVertexNormals();
      trim.add(new THREE.Mesh(g, stripeMat));
    }
    if (car.style === 'supercar') {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, W * 0.92), blackTrim);
      wing.position.set(shape.xAt(0.035), shape.topAt(0.08) + 0.22, 0);
      trim.add(wing);
      for (const s of [-1, 1]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.04), blackTrim);
        strut.position.set(shape.xAt(0.04), shape.topAt(0.08) + 0.11, s * W * 0.2);
        trim.add(strut);
      }
    }
    if (car.style === 'suv') {
      for (const s of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(L * 0.38, 0.028, 0.028), blackTrim);
        rail.position.set(shape.xAt(0.36), shape.topAt(0.36) + 0.03, s * W * 0.3);
        trim.add(rail);
      }
    }
    if (car.style === 'limo') {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.02, 0.02), chrome);
      strip.position.set(0, spec.belt * H * 0.8, W * 0.46);
      const strip2 = strip.clone();
      strip2.position.z = -W * 0.46;
      trim.add(strip, strip2);
      const grilleC = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, W * 0.3), chrome);
      grilleC.position.set(shape.xAt(0.978), noseY, 0);
      trim.add(grilleC);
    }
    carRoot.add(trim);
    const trimP = collect(trim);

    // sparks
    const SPARKS = 140;
    const spPos = new Float32Array(SPARKS * 3);
    const spVel = new Float32Array(SPARKS * 3);
    const spLife = new Float32Array(SPARKS).fill(0);
    spPos.fill(-100);
    const spGeo = new THREE.BufferGeometry();
    spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
    const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({ color: 0xffc070, size: 0.045, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    sparks.frustumCulled = false;
    carRoot.add(sparks);

    // ----- camera
    const camera = new THREE.PerspectiveCamera(30, 1.4, 0.1, 60);
    const dist = L * 1.52;
    const fit = () => {
      const w = host.clientWidth || 300;
      const h = host.clientHeight || 220;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    // ----- interaction
    let drag = 0;
    let dragging = false;
    let lastX = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      drag += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
    };
    const onUp = () => {
      dragging = false;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    // ----- the real model, shown once the car is finished (loaded only then, and only for cars that have one)
    const realInfo = CAR_MODELS[car.id];
    const R: { cur: PartGroup | null } = { cur: null };
    let loadingReal = false;
    let disposed = false;
    let swap = 0; // 0 = the car built from parts, 1 = the real model
    const loadReal = async () => {
      if (!realInfo || loadingReal || R.cur) return;
      loadingReal = true;
      try {
        const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')]);
        const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`${import.meta.env.BASE_URL}models/${car.id}.glb`);
        if (disposed) return;
        const holder = new THREE.Group();
        holder.add(gltf.scene);
        if (realInfo.flip) holder.rotation.y = Math.PI;
        holder.visible = false;
        carRoot.add(holder);
        R.cur = collect(holder);
      } catch {
        /* the built car simply stays */
      }
    };
    const realAmount = (p: number) => (realInfo && R.cur && p >= 1 && shown.paint >= 0.999 ? 1 : 0);

    // ----- animation
    type Amounts = Record<(typeof PARTS)[number]['id'], number>;
    // The build you see catches up with the real progress at a steady pace, so reopening the app replays the assembly part by part.
    let shownP = reduce ? clamp01(live.current.progress) : 0;
    const amountsFor = (p: number) => Object.fromEntries(partStates(p).map((s) => [s.id, s.amount])) as Amounts;
    let shown = amountsFor(shownP);
    if (import.meta.env.DEV) (window as unknown as { __c3?: unknown }).__c3 = { get shown() { return shown; }, scan, live, skip() { shownP = clamp01(live.current.progress); }, setTurn(a: number) { turn = a; drag = 0; } };
    let spin = 0;
    let turn = 0.55;
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let visible = true;
    let lost = false;
    let emitCarry = 0;

    const tick = (now: number) => {
      raf = 0;
      if (lost) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock += dt;
      const { progress: p, state: st } = live.current;
      const goal = clamp01(p);
      shownP = reduce ? goal : shownP + Math.max(-0.2 * dt, Math.min(0.2 * dt, goal - shownP)) + (goal - shownP) * Math.min(1, dt * 0.8) * 0.5;
      shownP = clamp01(shownP);
      if (Math.abs(goal - shownP) < 0.0005) shownP = goal;
      shown = amountsFor(shownP);

      const working = st === 'working';
      if (realInfo && p >= 1 && shown.paint >= 0.999) void loadReal();
      const target = realAmount(p);
      swap = reduce ? target : swap + Math.max(-dt / 0.9, Math.min(dt / 0.9, target - swap));
      const keep = 1 - ease(swap);
      fade(frameP, shown.frame * keep, swap > 0 ? 0 : -0.7);
      fade(wheelsP, shown.wheels * keep, swap > 0 ? 0 : 1.4);
      fade(suspP, shown.suspension * keep, swap > 0 ? 0 : 0.5);
      fade(engineP, shown.engine * keep, swap > 0 ? 0 : 1.0);
      fade(trimP, shown.paint * keep);
      if (R.cur) {
        fade(R.cur, ease(swap));
        if (swap >= 1) R.cur.group.visible = true;
      }
      // while the real model takes over, the built body fades out with the rest
      const bodyKeep = swap > 0 ? keep : 1;
      paintMat.transparent = bodyKeep < 1;
      paintMat.opacity = bodyKeep;
      glassMat.opacity = 0.93 * bodyKeep;

      // body: the scan plane moves from tail to nose
      const b = shown.body;
      body.visible = b > 0.002 && bodyKeep > 0.002;
      const cx = -L / 2 - 0.1 + ease(b) * (L + 0.2);
      if (b >= 0.999) {
        paintMat.clippingPlanes = [];
        glassMat.clippingPlanes = [];
      } else {
        paintMat.clippingPlanes = [clip];
        glassMat.clippingPlanes = [clip];
        clip.constant = cx; // keeps everything with x <= cx
      }
      scan.visible = b > 0.002 && b < 0.97;
      scan.position.x = cx;

      // paint: primer turns into the car's colour; lights come on
      const pa = ease(shown.paint);
      paintMat.color.copy(primer).lerp(carCol, pa);
      paintMat.metalness = 0.25 + 0.4 * pa;
      paintMat.roughness = 0.7 - 0.45 * pa;
      paintMat.clearcoat = pa;
      const done = p >= 1;
      const pulse = done ? 0.7 + 0.3 * Math.sin(clock * 3) : 1;
      lightMat.emissiveIntensity = pa * 2.2 * pulse;
      tailMat.emissiveIntensity = pa * 1.6;
      glowMat.opacity = 0.6 + 0.4 * Math.sin(clock * 5);
      ringMat.opacity = done ? 0.55 + 0.35 * Math.sin(clock * 2.4) : 0.45;

      // motion: the car turns slowly, wheels spin, the body bobs a little
      const turnSpeed = reduce ? 0 : st === 'working' ? 0.32 : st === 'done' ? 0.5 : st === 'break' ? 0.12 : 0;
      turn += turnSpeed * dt;
      carRoot.rotation.y = turn + drag;
      const spinSpeed = reduce ? 0 : working ? 5.5 : 0;
      spin += spinSpeed * dt;
      for (const w of swap < 1 ? wheelMeshes : []) {
        const sp = w.getObjectByName('spin');
        if (sp) sp.rotation.z = -spin;
      }
      carRoot.position.y = reduce || !working ? 0 : Math.sin(clock * 9) * 0.004;
      camera.position.set(0, dist * 0.3 + (reduce ? 0 : Math.sin(clock * 0.3) * 0.12), dist);
      camera.lookAt(0, H * 0.34, 0);

      // sparks and weld light where the current part is being fitted
      const cur = PARTS.findIndex((pt) => shown[pt.id] > 0.01 && shown[pt.id] < 0.985);
      const emitting = !reduce && working && cur >= 0;
      let ox = 0;
      let oy = 0;
      let oz = 0;
      const pick = (): [number, number, number] => {
        const id = PARTS[Math.max(0, cur)].id;
        if (id === 'frame') return [(Math.random() - 0.5) * L * 0.7, 0.4, (Math.random() < 0.5 ? -1 : 1) * railZ];
        if (id === 'wheels' || id === 'suspension') {
          const wp = wheelPos[Math.floor(Math.random() * 4)];
          return [wp.x, id === 'wheels' ? wp.y : 0.5, wp.z];
        }
        if (id === 'engine') return [ex + (Math.random() - 0.5) * 0.6, 0.7, (Math.random() - 0.5) * 0.4];
        if (id === 'body') {
          const t = clamp01((cx + L / 2) / L);
          return [cx, shape.botAt(t) + Math.random() * (shape.topAt(t) - shape.botAt(t)), (Math.random() - 0.5) * W * 0.9];
        }
        const t = 0.1 + Math.random() * 0.85;
        return [shape.xAt(t), shape.topAt(t) + 0.02, (Math.random() - 0.5) * W * 0.5];
      };
      if (emitting) {
        emitCarry += dt * 70;
        while (emitCarry >= 1) {
          emitCarry -= 1;
          const i = spLife.findIndex((l) => l <= 0);
          if (i < 0) break;
          const [px, py, pz] = pick();
          spPos.set([px, py, pz], i * 3);
          const a = Math.random() * Math.PI * 2;
          const sp = 0.6 + Math.random() * 1.6;
          spVel.set([Math.cos(a) * sp * 0.6, 0.8 + Math.random() * 1.6, Math.sin(a) * sp * 0.6], i * 3);
          spLife[i] = 0.35 + Math.random() * 0.5;
          ox = px;
          oy = py;
          oz = pz;
        }
      }
      for (let i = 0; i < SPARKS; i++) {
        if (spLife[i] <= 0) {
          spPos[i * 3 + 1] = -100;
          continue;
        }
        spLife[i] -= dt;
        spVel[i * 3 + 1] -= 6 * dt;
        spPos[i * 3] += spVel[i * 3] * dt;
        spPos[i * 3 + 1] = Math.max(0.01, spPos[i * 3 + 1] + spVel[i * 3 + 1] * dt);
        spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
      }
      spGeo.attributes.position.needsUpdate = true;
      if (emitting && (ox || oy || oz)) {
        const wp = new THREE.Vector3(ox, oy + 0.15, oz);
        carRoot.localToWorld(wp);
        weld.position.copy(wp);
        weld.intensity = 2 + Math.random() * 4;
      } else {
        weld.intensity *= 0.8;
      }

      renderer.render(scene, camera);
      if (visible) raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf && !lost && visible) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
    };
    const onRestored = () => {
      lost = false;
      start();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    const ro = new ResizeObserver(() => {
      fit();
      if (!raf) renderer.render(scene, camera);
    });
    ro.observe(host);
    // Stop drawing while the car is off screen or the app is in the background.
    const io = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting !== false && document.visibilityState === 'visible';
      if (visible) start();
    });
    io.observe(host);
    const onVis = () => {
      visible = document.visibilityState === 'visible';
      if (visible) start();
    };
    document.addEventListener('visibilitychange', onVis);
    fit();
    start();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      lost = true;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
        }
      });
      glowTex.dispose();
      envTarget.dispose();
      roomEnv.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [car]);

  return <div ref={hostRef} className="car-3d" role="img" aria-label={label ?? car.name} />;
}
