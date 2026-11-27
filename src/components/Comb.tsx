import { useId, useMemo } from 'react';
import { CELL_MS } from '../lib/hive';
import { capacityFor, cellCenter, ringsFor, roundedHexPath, spiral } from '../lib/hexGeom';

export type BeeMode = 'fly' | 'still' | 'rest' | null;

interface CombProps {
  /** How many cells the comb has room for (1, 7, 19, 37 …). */
  capacity: number;
  /** Completed honey cells. */
  filled: number;
  /** 0..1 progress of the cell being filled right now (it fills from the bottom). */
  frac?: number;
  bee?: BeeMode;
  /** Highlight the empty cells in [from, to) as the goal (a countdown, or the current Pomodoro block). */
  goal?: { from: number; to: number } | null;
  /** Soft glow once everything is filled. */
  glow?: boolean;
  label: string;
  className?: string;
}

const SIZE = 20; // circumradius of the grid; cells are drawn a little smaller to leave a gap
const GAP = 0.9;

/** A honeycomb that fills with honey, cell by cell, with an optional bee on the cell being worked on. */
export function CombSvg({ capacity, filled, frac = 0, bee = null, goal = null, glow = false, label, className }: CombProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const cells = useMemo(() => spiral(capacity).map((c) => ({ ...c, ...cellCenter(c, SIZE) })), [capacity]);
  const R = SIZE * GAP;
  const paths = useMemo(() => cells.map((c) => roundedHexPath(c.x, c.y, R)), [cells, R]);
  const box = useMemo(() => {
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const pad = SIZE * 1.1;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    return { minX, minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY };
  }, [cells]);

  const done = Math.min(filled, capacity);
  const currentIdx = done < capacity ? done : -1;
  const beeCell = cells[Math.min(currentIdx >= 0 ? currentIdx : capacity - 1, capacity - 1)];
  const cur = currentIdx >= 0 ? cells[currentIdx] : null;
  const clamped = Math.max(0, Math.min(1, frac));

  return (
    <svg className={`comb${glow ? ' comb-glow' : ''}${className ? ` ${className}` : ''}`} viewBox={`${box.minX} ${box.minY} ${box.w} ${box.h}`} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`${uid}-honey`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--honey-a)' }} />
          <stop offset="1" style={{ stopColor: 'var(--honey-b)' }} />
        </linearGradient>
        {cur && (
          <clipPath id={`${uid}-clip`}>
            <rect x={cur.x - R} y={cur.y + R - 2 * R * clamped} width={2 * R} height={2 * R * clamped + 0.5} />
          </clipPath>
        )}
      </defs>

      {paths.map((d, i) => {
        const inGoal = goal != null && i >= goal.from && i < goal.to && i >= done;
        const full = i < done;
        return (
          <path
            key={i}
            d={d}
            className={`comb-cell${full ? ' is-full' : ''}${inGoal ? ' in-goal' : ''}${full && i === done - 1 ? ' is-new' : ''}`}
            style={full ? { fill: `url(#${uid}-honey)` } : undefined}
          />
        );
      })}

      {cur && clamped > 0 && <path d={paths[currentIdx]} className="comb-fill" fill={`url(#${uid}-honey)`} clipPath={`url(#${uid}-clip)`} />}

      {bee && beeCell && (
        <g className="bee-move" style={{ transform: `translate(${beeCell.x}px, ${beeCell.y - 2}px)` }}>
          <Bee mode={bee} />
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
