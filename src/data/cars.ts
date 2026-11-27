import { MIN } from '../lib/time';
import type { GarageItem } from '../types';

/**
 * The garage: cars you build by studying. Each tier needs a set amount of focus time, and progress carries over
 * between sessions, so a long build can be finished across several sittings.
 *
 * Brand and model names are shown as plain text only (no logos), and the artwork is a simple illustration of a body style
 * (hatch, sedan, SUV, coupe, supercar, limousine) in a signature colour, not a replica of any real model.
 */

export type BodyStyle = 'hatch' | 'sedan' | 'suv' | 'coupe' | 'supercar' | 'limo';

export interface Tier {
  n: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  /** Focus time needed to finish a car in this tier. */
  buildMin: number;
  blurb: string;
}

export const TIERS: Tier[] = [
  { n: 1, name: 'Starter', buildMin: 25, blurb: 'Quick wins. One focus block.' },
  { n: 2, name: 'Everyday icons', buildMin: 45, blurb: 'The cars everyone knows.' },
  { n: 3, name: 'Premium', buildMin: 60, blurb: 'A solid hour of focus.' },
  { n: 4, name: 'Performance', buildMin: 90, blurb: 'Power and presence.' },
  { n: 5, name: 'Legends', buildMin: 180, blurb: 'Three hours for the dream cars.' },
  { n: 6, name: 'Hypercars', buildMin: 300, blurb: 'Five hours for the cars everyone dreams of.' },
];

export interface Car {
  id: string;
  brand: string;
  model: string;
  /** Brand and model, e.g. "BMW X5". */
  name: string;
  tier: Tier['n'];
  buildMin: number;
  style: BodyStyle;
  /** Main body colour. */
  color: string;
  /** Darker shade for shading and trim (derived from `color`). */
  shade: string;
  /** Optional stripe colour for the sporty ones. */
  accent?: string;
}

/** Darken a #rrggbb colour by `amount` (0..1). */
export function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amount)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function car(id: string, brand: string, model: string, tier: Tier['n'], style: BodyStyle, color: string, accent?: string): Car {
  return { id, brand, model, name: `${brand} ${model}`, tier, buildMin: TIERS[tier - 1].buildMin, style, color, shade: darken(color, 0.3), accent };
}

export const CARS: Car[] = [
  // Tier 1: Starter (25 min)
  car('maruti-alto', 'Maruti Suzuki', 'Alto', 1, 'hatch', '#E5533D'),
  car('maruti-swift', 'Maruti Suzuki', 'Swift', 1, 'hatch', '#F4B400'),
  car('maruti-wagon-r', 'Maruti Suzuki', 'Wagon R', 1, 'hatch', '#5FA8D3'),
  car('maruti-baleno', 'Maruti Suzuki', 'Baleno', 1, 'hatch', '#3A86C8'),
  car('maruti-brezza', 'Maruti Suzuki', 'Brezza', 1, 'suv', '#7A8B99'),

  // Tier 2: Everyday icons (45 min)
  car('toyota-corolla', 'Toyota', 'Corolla', 2, 'sedan', '#B7BDC6'),
  car('toyota-innova', 'Toyota', 'Innova', 2, 'suv', '#8A6E52'),
  car('toyota-fortuner', 'Toyota', 'Fortuner', 2, 'suv', '#E9EBEF'),
  car('tesla-model-3', 'Tesla', 'Model 3', 2, 'sedan', '#C5283D'),
  car('audi-a3', 'Audi', 'A3', 2, 'hatch', '#6D7A8A'),
  car('mercedes-a-class', 'Mercedes-Benz', 'A-Class', 2, 'hatch', '#2F3E55'),

  // Tier 3: Premium (60 min)
  car('bmw-x1', 'BMW', 'X1', 3, 'suv', '#1C69D4'),
  car('bmw-x2', 'BMW', 'X2', 3, 'suv', '#F26B21'),
  car('bmw-3-series', 'BMW', '3 Series', 3, 'sedan', '#262C36'),
  car('audi-a4', 'Audi', 'A4', 3, 'sedan', '#B22A36'),
  car('audi-q3', 'Audi', 'Q3', 3, 'suv', '#3F7D5C'),
  car('mercedes-c-class', 'Mercedes-Benz', 'C-Class', 3, 'sedan', '#C9CED6'),
  car('tesla-model-y', 'Tesla', 'Model Y', 3, 'suv', '#E5E7EB'),

  // Tier 4: Performance (90 min)
  car('bmw-x3', 'BMW', 'X3', 4, 'suv', '#0F4C81'),
  car('bmw-x5', 'BMW', 'X5', 4, 'suv', '#3B2F2F'),
  car('bmw-m4', 'BMW', 'M4', 4, 'coupe', '#1AA6B7', '#FFFFFF'),
  car('audi-q7', 'Audi', 'Q7', 4, 'suv', '#2A2D33'),
  car('mercedes-e-class', 'Mercedes-Benz', 'E-Class', 4, 'sedan', '#8D99AE'),
  car('mercedes-gle', 'Mercedes-Benz', 'GLE', 4, 'suv', '#5C4B8A'),
  car('porsche-macan', 'Porsche', 'Macan', 4, 'suv', '#C79A2B'),
  car('jeep-wagoneer', 'Jeep', 'Wagoneer', 4, 'suv', '#2F4A3C'),

  // Tier 5: Legends (180 min)
  car('porsche-911', 'Porsche', '911', 5, 'coupe', '#C1121F', '#FFFFFF'),
  car('audi-r8', 'Audi', 'R8', 5, 'supercar', '#9B9EA6', '#C5283D'),
  car('mercedes-amg-gt', 'Mercedes-Benz', 'AMG GT', 5, 'supercar', '#1D7F5A', '#FFFFFF'),
  car('tesla-model-s', 'Tesla', 'Model S Plaid', 5, 'sedan', '#101418', '#C5283D'),
  car('ferrari-f8', 'Ferrari', 'F8 Tributo', 5, 'supercar', '#D00000', '#FFE600'),
  car('lamborghini-huracan', 'Lamborghini', 'Huracán', 5, 'supercar', '#6BC21F', '#101418'),
  car('lamborghini-urus', 'Lamborghini', 'Urus', 5, 'suv', '#F5A300', '#101418'),
  car('rolls-royce-ghost', 'Rolls-Royce', 'Ghost', 5, 'limo', '#E9E4D8'),
  car('rolls-royce-phantom', 'Rolls-Royce', 'Phantom', 5, 'limo', '#1B1F3B'),
  car('mclaren-720s', 'McLaren', '720S', 5, 'supercar', '#F26B21', '#101418'),
  car('lamborghini-aventador', 'Lamborghini', 'Aventador', 5, 'supercar', '#2A5CAA', '#101418'),
  car('lamborghini-revuelto', 'Lamborghini', 'Revuelto', 5, 'supercar', '#E9EBEF', '#F5A300'),
  car('ferrari-488', 'Ferrari', '488 GTB', 5, 'supercar', '#E8B70D', '#101418'),
  car('nissan-gtr', 'Nissan', 'GT-R', 5, 'coupe', '#E5E7EB', '#C5283D'),
  car('corvette-c8', 'Chevrolet', 'Corvette C8', 5, 'supercar', '#E0C200', '#101418'),
  car('aston-martin-vantage', 'Aston Martin', 'Vantage', 5, 'coupe', '#6E7B5C', '#E9EBEF'),

  // Tier 6: Hypercars (300 min)
  car('bugatti-chiron', 'Bugatti', 'Chiron', 6, 'supercar', '#1C69D4', '#101418'),
  car('bugatti-veyron', 'Bugatti', 'Veyron', 6, 'supercar', '#1F2A4D', '#B87333'),
  car('koenigsegg-jesko', 'Koenigsegg', 'Jesko', 6, 'supercar', '#3A3F45', '#E5533D'),
  car('pagani-huayra', 'Pagani', 'Huayra', 6, 'supercar', '#B21E3B', '#C9A227'),
  car('ferrari-laferrari', 'Ferrari', 'LaFerrari', 6, 'supercar', '#D00000', '#101418'),
  car('mclaren-p1', 'McLaren', 'P1', 6, 'supercar', '#F5A300', '#101418'),
  car('porsche-918', 'Porsche', '918 Spyder', 6, 'supercar', '#A9AEB5', '#1D7F5A'),
  car('rimac-nevera', 'Rimac', 'Nevera', 6, 'supercar', '#1AA6B7', '#101418'),
  car('aston-martin-valkyrie', 'Aston Martin', 'Valkyrie', 6, 'supercar', '#2F8F83', '#F4D000'),
  car('mercedes-amg-one', 'Mercedes-Benz', 'AMG One', 6, 'supercar', '#C9CED6', '#00A99D'),
];

export const carById = (id: string | undefined) => CARS.find((c) => c.id === id);
export const buildMs = (car: Car) => car.buildMin * MIN;
export const carsInTier = (n: Tier['n']) => CARS.filter((c) => c.tier === n);
export const tierOf = (car: Car) => TIERS[car.tier - 1];

/** Cars from the first version of the garage, so anyone who already built one keeps it. */
export const LEGACY_CAR_IDS: Record<string, string> = {
  'mini-hatch': 'maruti-alto',
  'street-coupe': 'toyota-corolla',
  executive: 'bmw-3-series',
  supercar: 'bmw-m4',
  'grand-luxe': 'rolls-royce-ghost',
};
export const migrateCarId = (id: string) => LEGACY_CAR_IDS[id] ?? id;

/** The parts of a car, in the order they are fitted. */
export const PARTS = [
  { id: 'frame', label: 'Frame' },
  { id: 'wheels', label: 'Wheels' },
  { id: 'suspension', label: 'Suspension' },
  { id: 'engine', label: 'Engine' },
  { id: 'body', label: 'Body' },
  { id: 'paint', label: 'Paint and trim' },
] as const;

export type PartId = (typeof PARTS)[number]['id'];

export interface PartState {
  id: PartId;
  label: string;
  /** 0 = not started, 1 = fitted. A part under construction has a value in between. */
  amount: number;
}

/** Which parts are fitted at `progress` (0..1). Each part owns an equal slice of the build. */
export function partStates(progress: number): PartState[] {
  const p = Math.max(0, Math.min(1, progress));
  const n = PARTS.length;
  return PARTS.map((part, i) => ({ id: part.id, label: part.label, amount: Math.max(0, Math.min(1, p * n - i)) }));
}

/** The part being worked on right now, or null when nothing has started or everything is done. */
export function currentPart(progress: number): PartState | null {
  if (progress <= 0 || progress >= 1) return null;
  return partStates(progress).find((s) => s.amount > 0 && s.amount < 1) ?? null;
}

export interface BuildResult {
  builds: Record<string, number>;
  garage: GarageItem[];
  /** The car finished by this session, if any. */
  completed: Car | null;
}

/**
 * Adds a session's focus time to a car. Reaching its build time adds it to the garage (once) and resets its progress.
 * Pure: returns new objects.
 */
export function applyBuild(builds: Record<string, number>, garage: GarageItem[], carId: string | undefined, studiedMs: number, now: number): BuildResult {
  const car = carById(carId);
  if (!car || garage.some((g) => g.carId === car.id)) return { builds, garage, completed: null };
  const total = (builds[car.id] ?? 0) + Math.max(0, studiedMs);
  if (total >= buildMs(car)) {
    const { [car.id]: _done, ...rest } = builds;
    void _done;
    return { builds: rest, garage: [...garage, { carId: car.id, at: now }], completed: car };
  }
  return { builds: { ...builds, [car.id]: total }, garage, completed: null };
}
