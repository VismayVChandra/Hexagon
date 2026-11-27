import { useId } from 'react';
import { PARTS, currentPart, partStates, type Car } from '../data/cars';
import { roundedHexPath } from '../lib/hexGeom';

/** Side-view outlines per car (viewBox 200x100, facing right, wheels at x=50 and x=150). */
interface Shape {
  body: string;
  windows: string;
  head: [number, number];
  tail: [number, number];
  spoiler?: boolean;
  chrome?: boolean;
}

const SHAPES: Record<string, Shape> = {
  'mini-hatch': {
    body: 'M26 72 L26 60 Q26 52 34 50 L58 46 Q70 30 92 30 L120 30 Q134 32 142 46 L168 50 Q176 52 176 62 L176 72 Z',
    windows: 'M64 46 Q74 35 92 34 L118 34 Q128 36 134 46 Z',
    head: [174, 58],
    tail: [28, 58],
  },
  'street-coupe': {
    body: 'M18 72 L18 62 Q20 54 34 52 L70 46 Q86 30 112 30 L128 32 Q146 36 156 48 L184 54 Q190 58 190 64 L190 72 Z',
    windows: 'M80 46 Q92 35 112 34 L126 36 Q138 40 146 48 Z',
    head: [188, 62],
    tail: [20, 62],
  },
  executive: {
    body: 'M14 72 L14 60 Q16 52 30 50 L58 46 Q70 32 92 32 L128 32 Q144 34 150 46 L176 48 L186 52 Q192 56 192 64 L192 72 Z',
    windows: 'M64 46 Q74 36 92 36 L104 36 L104 46 Z M110 36 L128 36 Q138 38 144 46 L110 46 Z',
    head: [190, 60],
    tail: [16, 60],
  },
  supercar: {
    body: 'M14 72 L14 66 Q18 60 40 58 L100 48 Q116 42 132 42 L150 44 Q172 50 188 60 Q194 64 194 70 L194 72 Z',
    windows: 'M104 48 Q118 43 132 43 L144 45 L128 55 L100 56 Z',
    head: [191, 64],
    tail: [16, 66],
    spoiler: true,
  },
  'grand-luxe': {
    body: 'M12 72 L12 58 Q14 50 28 48 L56 44 Q66 28 88 28 L132 28 Q150 30 156 44 L182 46 Q194 50 194 60 L194 72 Z',
    windows: 'M60 44 Q68 32 86 32 L96 32 L96 44 Z M102 32 L130 32 Q142 34 148 44 L102 44 Z',
    head: [192, 56],
    tail: [14, 56],
    chrome: true,
  },
};

const WHEELS = [50, 150];
const WHEEL_Y = 72;

interface CarArtProps {
  car: Car;
  /** 0..1: how much of the car is built. Defaults to complete. */
  progress?: number;
  /** Shown as a dark outline (not collected yet). */
  locked?: boolean;
  /** Wheels turn while the car is being built. */
  spinning?: boolean;
  /** Celebrate: a shine over the finished car. */
  shine?: boolean;
  label?: string;
  className?: string;
}

/** A car drawn in layers (frame, wheels, suspension, engine, body, paint) that appear as `progress` grows. */
export function CarArt({ car, progress = 1, locked = false, spinning = false, shine = false, label, className }: CarArtProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const shape = SHAPES[car.id] ?? SHAPES['mini-hatch'];
  const parts = Object.fromEntries(partStates(progress).map((p) => [p.id, p.amount])) as Record<(typeof PARTS)[number]['id'], number>;
  // Each part drops into place and fades in as its slice of the build is completed.
  const layer = (amount: number) => ({ opacity: amount, transform: `translateY(${(1 - amount) * -18}px)` });

  return (
    <svg className={`car-art${locked ? ' car-locked' : ''}${className ? ` ${className}` : ''}`} viewBox="0 0 200 100" role="img" aria-label={label ?? car.name}>
      <defs>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={car.color} />
          <stop offset="1" stopColor={car.shade} />
        </linearGradient>
        <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9f6ff" />
          <stop offset="1" stopColor="#8fb8d0" />
        </linearGradient>
        <clipPath id={`${uid}-carclip`}>
          <path d={shape.body} />
        </clipPath>
      </defs>

      <ellipse cx="100" cy="90" rx="86" ry="4" fill="currentColor" opacity="0.18" />

      {/* frame */}
      <g className="car-part" style={layer(parts.frame)}>
        <rect x="18" y="66" width="164" height="8" rx="3" fill="#4a4f57" />
        <rect x="70" y="62" width="6" height="12" rx="1.5" fill="#5b616b" />
        <rect x="124" y="62" width="6" height="12" rx="1.5" fill="#5b616b" />
        {[32, 100, 168].map((x) => (
          <path key={x} d={roundedHexPath(x, 70, 2.6)} fill="#aeb6c1" />
        ))}
      </g>

      {/* suspension */}
      <g className="car-part" style={layer(parts.suspension)}>
        {WHEELS.map((x) => (
          <g key={x} stroke="#9aa3ad" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={`M${x - 6} 56 l12 3 l-12 3 l12 3 l-12 3 l12 3 l-12 3`} strokeWidth="2.2" />
            <path d={`M${x + 9} 56 L${x + 9} 72`} strokeWidth="3" stroke="#6b7280" />
          </g>
        ))}
      </g>

      {/* engine */}
      <g className="car-part" style={layer(parts.engine)}>
        <rect x="108" y="54" width="40" height="15" rx="3" fill="#6b7280" />
        <rect x="113" y="47" width="30" height="9" rx="2.5" fill="#8b93a1" />
        {[117, 124, 131, 138].map((x) => (
          <rect key={x} x={x} y="43" width="3.5" height="6" rx="1.5" fill={car.color} />
        ))}
        <path d={roundedHexPath(128, 62, 4.6)} fill="#2b2f36" />
        <path d={roundedHexPath(128, 62, 2.4)} fill="#e0a02c" />
      </g>

      {/* body */}
      <g className="car-part" style={layer(parts.body)}>
        <path d={shape.body} fill={`url(#${uid}-body)`} stroke={car.shade} strokeWidth="1.4" strokeLinejoin="round" />
        <g clipPath={`url(#${uid}-carclip)`}>
          <rect x="0" y="62" width="200" height="12" fill={car.shade} opacity="0.55" />
        </g>
      </g>

      {/* wheels (drawn over the body so the arches read correctly) */}
      <g className="car-part" style={layer(parts.wheels)}>
        {WHEELS.map((x) => (
          <g key={x}>
            <circle cx={x} cy={WHEEL_Y} r="18" fill="#12151a" opacity={parts.body > 0 ? 0.9 : 0} />
            <circle cx={x} cy={WHEEL_Y} r="14" fill="#1b1f24" />
            <g className={spinning ? 'wheel-spin' : undefined}>
              <circle cx={x} cy={WHEEL_Y} r="9" fill="#c9d1d9" />
              {[0, 60, 120].map((deg) => (
                <line key={deg} x1={x - 8} y1={WHEEL_Y} x2={x + 8} y2={WHEEL_Y} stroke="#8b93a1" strokeWidth="1.6" transform={`rotate(${deg} ${x} ${WHEEL_Y})`} />
              ))}
              <path d={roundedHexPath(x, WHEEL_Y, 4.4)} fill="#6b7280" />
            </g>
          </g>
        ))}
      </g>

      {/* paint and trim */}
      <g className="car-part" style={{ opacity: parts.paint, transform: `translateY(${(1 - parts.paint) * -6}px)` }}>
        <path d={shape.windows} fill={`url(#${uid}-glass)`} stroke={car.shade} strokeWidth="1" strokeLinejoin="round" opacity="0.95" />
        <ellipse cx={shape.head[0]} cy={shape.head[1]} rx="3.4" ry="2.6" fill="#ffe9a6" />
        <ellipse cx={shape.tail[0]} cy={shape.tail[1]} rx="2.4" ry="2.6" fill="#e5483a" />
        <path d={`M${shape.tail[0] + 40} 60 L${shape.tail[0] + 40} 70`} stroke={car.shade} strokeWidth="1.2" opacity="0.6" />
        <path d="M70 41 Q96 33 118 38" stroke="#fff" strokeWidth="2" fill="none" opacity="0.25" strokeLinecap="round" />
        {shape.spoiler && (
          <g fill={car.shade}>
            <rect x="12" y="52" width="26" height="4" rx="1.5" />
            <rect x="20" y="55" width="3" height="8" />
            <rect x="30" y="55" width="3" height="8" />
          </g>
        )}
        {shape.chrome && (
          <g>
            <path d="M16 62 L188 62" stroke="#e8c25a" strokeWidth="1.4" />
            <rect x="186" y="54" width="6" height="12" rx="1.5" fill="#d9dde3" />
            <path d={roundedHexPath(190, 49, 3.2)} fill="#e8c25a" />
          </g>
        )}
        {shine && <path className="car-shine" d="M-30 0 L-10 0 L20 100 L0 100 Z" fill="#fff" opacity="0.5" clipPath={`url(#${uid}-carclip)`} />}
      </g>
    </svg>
  );
}

interface CarSceneProps {
  car: Car;
  /** 0..1, including progress carried over from earlier sessions. */
  progress: number;
  state: 'working' | 'paused' | 'break' | 'done';
}

/** The live scene for building a car: parts are fitted one by one as you study. */
export function CarScene({ car, progress, state }: CarSceneProps) {
  const done = progress >= 1;
  const part = currentPart(progress);
  const pct = Math.min(100, Math.floor(progress * 100));
  const caption = done
    ? `${car.name} is complete! Finish to add it to your garage.`
    : state === 'break'
      ? 'Taking a break. The workshop will be here when you’re back.'
      : part
        ? `Fitting the ${part.label.toLowerCase()}… ${pct}% built`
        : 'Gathering parts…';
  return (
    <div className={`car-scene${done ? ' is-done' : ''}`}>
      <div className="workbench">
        <CarArt car={car} progress={progress} spinning={state === 'working' && !done} shine={done} label={`${car.name}, ${pct}% built`} />
      </div>
      <p className="scene-caption" aria-live="off">
        {caption}
      </p>
      <ol className="parts-list" aria-label="Build steps">
        {PARTS.map((p, i) => {
          const amount = Math.max(0, Math.min(1, progress * PARTS.length - i));
          return (
            <li key={p.id} className={amount >= 1 ? 'is-fitted' : amount > 0 ? 'is-working' : ''}>
              <span className="part-dot" aria-hidden="true" />
              <span>{p.label}</span>
              <span className="sr-only">{amount >= 1 ? ' done' : amount > 0 ? ' in progress' : ' not started'}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
