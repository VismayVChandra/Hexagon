import { useId, useMemo } from 'react';
import { CELL_MS } from '../lib/hive';
import { capacityFor, cellCenter, hexVertices, ringsFor, roundedPolyPath, spiral, type Pt } from '../lib/hexGeom';

export type BeeMode = 'fly' | 'still' | 'rest' | null;

interface CombProps {
  /** How many cells the comb has room for (1, 7, 19, 37 …). */
  capacity: number;
  /** Completed honey cells. */
  filled: number;
  /** 0..1 progress of the cell being filled right now (the honey level rises inside it). */
  frac?: number;
  bee?: BeeMode;
  /** Highlight the empty cells in [from, to) as the goal (a countdown, or the current Pomodoro block). */
  goal?: { from: number; to: number } | null;
  /** Soft glow once everything is filled. */
  glow?: boolean;
  /** 'full' draws the hollow depth of each cell; 'lite' is cheaper, for the big hive on Home. */
  quality?: 'full' | 'lite';
  label: string;
  className?: string;
}

// The comb is drawn as if tilted away from you and lit from the upper left: wax tubes with a hollow that fills with honey.
const SIZE = 20; // spacing of the grid
const K = 0.7; // how much the tilt flattens the hexagons vertically
const RO = SIZE * 0.97; // outer radius of a cell's wax rim
const RI = RO * 0.76; // radius of the hollow
const WALL = 9; // visible height of the wax walls
const DEPTH = 8; // depth of the hollow
const LIFT = 13; // how high the flying bee hovers above the comb

const quad = (a: Pt, b: Pt, drop: number) => `M${a.x} ${a.y}L${b.x} ${b.y}L${b.x} ${b.y + drop}L${a.x} ${a.y + drop}Z`;
const shifted = (pts: Pt[], dy: number) => pts.map((p) => ({ x: p.x, y: p.y + dy }));

interface Cell {
  x: number;
  y: number;
  wall: string;
  rim: string;
  rimTop: string;
  hole: string;
  farL: string;
  farR: string;
  honeyTop: string;
  shine: { cx: number; cy: number; rx: number; ry: number };
}

function buildCell(x: number, y: number): Cell {
  const rim = hexVertices(x, y, RO, K);
  const hole = hexVertices(x, y, RI, K);
  const inner = hexVertices(x, y, RI * 0.97, K); // a hair inside the rounded hollow so the walls never poke past its corners
  return {
    x,
    y,
    wall: roundedPolyPath(shifted(rim, WALL), 0.16),
    rim: roundedPolyPath(rim, 0.16),
    // The two upper edges of the rim catch the light.
    rimTop: `M${rim[4].x} ${rim[4].y}L${rim[5].x} ${rim[5].y}L${rim[0].x} ${rim[0].y}L${rim[1].x} ${rim[1].y}`,
    hole: roundedPolyPath(hole, 0.14),
    // Looking down into the hollow you see the far inner walls.
    farL: quad(inner[5], inner[0], DEPTH),
    farR: quad(inner[0], inner[1], DEPTH),
    honeyTop: roundedPolyPath(hexVertices(x, y, RI * 0.93, K), 0.14),
    shine: { cx: x - RI * 0.3, cy: y - RI * K * 0.32, rx: RI * 0.3, ry: RI * K * 0.15 },
  };
}

/** A 3D honeycomb of wax cells. Each cell is a hollow tube; honey rises inside it, with a bee hovering over the one being filled. */
export function CombSvg({ capacity, filled, frac = 0, bee = null, goal = null, glow = false, quality = 'full', label, className }: CombProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const full = quality === 'full';

  const cells = useMemo(
    () =>
      spiral(capacity).map((c, index) => {
        const p = cellCenter(c, SIZE);
        return { index, ...buildCell(p.x, p.y * K) };
      }),
    [capacity],
  );
  // Draw from the back of the comb to the front so nearer cells overlap the ones behind.
  const drawOrder = useMemo(() => [...cells].sort((a, b) => a.y - b.y || a.x - b.x), [cells]);
  const box = useMemo(() => {
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const minX = Math.min(...xs) - RO * 0.9 - 4;
    const maxX = Math.max(...xs) + RO * 0.9 + 4;
    const minY = Math.min(...ys) - RO * K - (full ? LIFT + 12 : 6);
    const maxY = Math.max(...ys) + RO * K + WALL + 14;
    return { minX, minY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, bottom: maxY - 9 };
  }, [cells, full]);

  const done = Math.min(filled, capacity);
  const currentIdx = done < capacity ? done : -1;
  const clamped = Math.max(0, Math.min(1, frac));
  const cur = currentIdx >= 0 ? cells[currentIdx] : null;
  const beeCell = cells[Math.min(currentIdx >= 0 ? currentIdx : capacity - 1, capacity - 1)];
  const beeLift = bee === 'fly' ? LIFT : bee === 'rest' ? 3 : 6;

  return (
    <svg
      className={`comb comb3d${glow ? ' comb-glow' : ''}${className ? ` ${className}` : ''}`}
      viewBox={`${box.minX} ${box.minY} ${box.w} ${box.h}`}
      role="img"
      aria-label={label}
    >
      <defs>
        {/* wax: lit from above, darker on the left wall and lighter on the right */}
        <linearGradient id={`${uid}-top`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#fbeec2" />
          <stop offset="1" stopColor="#e6bf68" />
        </linearGradient>
        <linearGradient id={`${uid}-wall`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a8761f" />
          <stop offset="0.5" stopColor="#a8761f" />
          <stop offset="0.5" stopColor="#cf9b3c" />
          <stop offset="1" stopColor="#dba94a" />
        </linearGradient>
        <linearGradient id={`${uid}-hole`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a3a0d" />
          <stop offset="1" stopColor="#2e1b05" />
        </linearGradient>
        <linearGradient id={`${uid}-far`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b07a1f" />
          <stop offset="1" stopColor="#4d300a" />
        </linearGradient>
        <linearGradient id={`${uid}-honey`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--honey-a)' }} />
          <stop offset="1" style={{ stopColor: 'var(--honey-b)' }} />
        </linearGradient>
        <radialGradient id={`${uid}-ground`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.42" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        {full && cur && (
          <clipPath id={`${uid}-clip`}>
            <path d={cur.hole} />
          </clipPath>
        )}
      </defs>

      {/* the comb rests on a soft shadow */}
      <ellipse cx={box.cx} cy={box.bottom} rx={box.w * 0.46} ry={11} fill={`url(#${uid}-ground)`} />

      {drawOrder.map((c) => {
        const isFull = c.index < done;
        const inGoal = goal != null && c.index >= goal.from && c.index < goal.to && !isFull;
        const isNew = isFull && c.index === done - 1;
        return (
          <g key={c.index} className={`c3${isFull ? ' is-full' : ''}${isNew ? ' is-new' : ''}`}>
            <path d={c.wall} fill={`url(#${uid}-wall)`} />
            <path d={c.rim} className={`c3-rim${inGoal ? ' in-goal' : ''}`} fill={`url(#${uid}-top)`} />
            <path d={c.rimTop} className="c3-edge" />
            <path d={c.hole} fill={`url(#${uid}-hole)`} />
            {full && (
              <>
                <path d={c.farL} fill={`url(#${uid}-far)`} opacity="0.9" />
                <path d={c.farR} fill={`url(#${uid}-far)`} opacity="0.7" />
              </>
            )}
            {isFull && (
              <>
                <path d={c.honeyTop} fill={`url(#${uid}-honey)`} className="c3-honey" />
                <ellipse cx={c.shine.cx} cy={c.shine.cy} rx={c.shine.rx} ry={c.shine.ry} fill="#fff" opacity="0.55" transform={`rotate(-14 ${c.shine.cx} ${c.shine.cy})`} />
              </>
            )}
          </g>
        );
      })}

      {/* the cell being filled: honey rises inside the hollow, hidden behind the near rim as it sinks */}
      {full && cur && clamped > 0 && (
        <g clipPath={`url(#${uid}-clip)`} className="c3-rising">
          <path d={roundedPolyPath(hexVertices(cur.x, cur.y + DEPTH * (1 - clamped), RI * 0.97, K), 0.14)} fill={`url(#${uid}-honey)`} />
          {clamped > 0.35 && <ellipse cx={cur.shine.cx} cy={cur.shine.cy + DEPTH * (1 - clamped)} rx={cur.shine.rx} ry={cur.shine.ry} fill="#fff" opacity="0.5" transform={`rotate(-14 ${cur.shine.cx} ${cur.shine.cy + DEPTH * (1 - clamped)})`} />}
        </g>
      )}
      {!full && cur && clamped > 0 && <path d={roundedPolyPath(hexVertices(cur.x, cur.y + DEPTH * (1 - clamped) * 0.5, RI * 0.85, K), 0.14)} fill={`url(#${uid}-honey)`} opacity="0.85" />}

      {bee && beeCell && (
        <g className="bee-move" style={{ transform: `translate(${beeCell.x}px, ${beeCell.y}px)` }}>
          <ellipse className={`bee-shadow bee-shadow-${bee}`} cx="0" cy="1" rx="8" ry="2.8" />
          <g style={{ transform: `translateY(${-beeLift}px)` }} className="bee-lift">
            <Bee mode={bee} />
          </g>
        </g>
      )}
    </svg>
  );
}

function Bee({ mode }: { mode: Exclude<BeeMode, null> }) {
  return (
    <g className={`bee bee-${mode}`}>
      <g className="bee-body-wrap">
        <ellipse className="bee-wing wing-l" cx="-2.5" cy="-5.5" rx="4.2" ry="2.8" />
        <ellipse className="bee-wing wing-r" cx="3.5" cy="-5.8" rx="4.2" ry="2.8" />
        <ellipse cx="0" cy="0" rx="8.5" ry="5.8" fill="#f4b63b" stroke="#2b1d0e" strokeWidth="0.8" />
        <ellipse cx="-1.5" cy="-2.4" rx="5" ry="1.8" fill="#fff" opacity="0.28" />
        <path d="M-2.5 -5.2q-1.6 5.2 0 10.4M2.6 -5.4q-1.6 5.4 0 10.8" stroke="#2b1d0e" strokeWidth="2.3" fill="none" strokeLinecap="round" />
        <circle cx="8.8" cy="-0.6" r="3.7" fill="#2b1d0e" />
        <circle cx="10.2" cy="-1.6" r="1" fill="#fff" />
        <path d="M-8.4 0l-3 0" stroke="#2b1d0e" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M9.5 -3.8q1.8 -3 3.2 -3.4M11.4 -2.6q2.6 -2 4 -1.9" stroke="#2b1d0e" strokeWidth="0.9" fill="none" strokeLinecap="round" />
      </g>
      {mode === 'rest' && (
        <g className="bee-zzz" fill="var(--muted)" fontFamily="var(--serif)" fontWeight="700">
          <text x="10" y="-10" fontSize="7">z</text>
          <text x="15" y="-17" fontSize="9">z</text>
        </g>
      )}
    </g>
  );
}

interface SceneProps {
  /** Focus time so far in this session (breaks and pauses excluded). */
  studiedMs: number;
  state: 'working' | 'paused' | 'break' | 'done';
  goal?: { fromMs: number; toMs: number } | null;
}

/** The live honeycomb for a study session. The comb grows (1, 7, 19, 37… cells) as the session gets longer. */
export function HoneycombScene({ studiedMs, state, goal }: SceneProps) {
  const cells = Math.floor(studiedMs / CELL_MS);
  const frac = (studiedMs % CELL_MS) / CELL_MS;
  const goalTo = goal ? Math.ceil(goal.toMs / CELL_MS) : 0;
  const rings = Math.min(6, Math.max(2, ringsFor(Math.max(cells + 1, goalTo))));
  const capacity = capacityFor(rings);
  const bee: BeeMode = state === 'working' ? 'fly' : state === 'break' ? 'rest' : 'still';
  return (
    <CombSvg
      capacity={capacity}
      filled={cells}
      frac={state === 'done' ? 0 : frac}
      bee={bee}
      goal={goal ? { from: Math.floor(goal.fromMs / CELL_MS), to: goalTo } : null}
      glow={state === 'done'}
      label={`Honeycomb: ${cells} ${cells === 1 ? 'cell' : 'cells'} of honey made this session`}
      className="comb-scene"
    />
  );
}
