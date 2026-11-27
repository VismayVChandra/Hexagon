import { Component, Suspense, lazy, type ReactNode } from 'react';
import { CELL_MS } from '../lib/hive';
import { capacityFor, ringsFor } from '../lib/hexGeom';
import { CombSvg, type BeeMode, type CombProps } from './Comb';

// The 3D scene carries the three.js library, so it is fetched only when a comb is on screen.
const Comb3D = lazy(() => import('./Comb3D'));

let webgl: boolean | null = null;
function hasWebGL(): boolean {
  if (webgl != null) return webgl;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    webgl = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

class Guard extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The honeycomb: a real 3D scene where the device supports it, otherwise the drawn version. */
export function CombView(props: CombProps) {
  const flat = <CombSvg {...props} />;
  if (!hasWebGL()) return flat;
  return (
    <Guard fallback={flat}>
      <Suspense fallback={<div className={`comb-3d${props.className ? ` ${props.className}` : ''}`} aria-hidden="true" />}>
        <Comb3D {...props} />
      </Suspense>
    </Guard>
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
    <CombView
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
