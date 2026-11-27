import { MIN } from '../lib/time';
import type { GarageItem } from '../types';

/**
 * The garage: cars you build by studying. Each car needs a set amount of focus time. Progress carries over between
 * sessions, so a car can be finished across several sittings. Names are generic on purpose (the artwork is a simple
 * illustration, not a replica of any real model); rename them freely.
 */
export interface Car {
  id: string;
  name: string;
  tier: number;
  buildMin: number;
  /** Main body colour. */
  color: string;
  /** Darker shade for shading and trim. */
  shade: string;
  blurb: string;
}

export const CARS: Car[] = [
  { id: 'mini-hatch', name: 'Mini Hatch', tier: 1, buildMin: 25, color: '#E4572E', shade: '#B8401F', blurb: 'Small, quick, and a first win.' },
  { id: 'street-coupe', name: 'Street Coupe', tier: 2, buildMin: 45, color: '#2E86AB', shade: '#1F6485', blurb: 'Low and sporty.' },
  { id: 'executive', name: 'Executive Sedan', tier: 3, buildMin: 60, color: '#6B7A8F', shade: '#4B586B', blurb: 'Comfort over a full hour.' },
  { id: 'supercar', name: 'Supercar', tier: 4, buildMin: 90, color: '#F2B632', shade: '#C98F14', blurb: 'Built for speed. Worth the wait.' },
  { id: 'grand-luxe', name: 'Grand Luxe', tier: 5, buildMin: 120, color: '#7B1E3A', shade: '#561327', blurb: 'The crown of the garage.' },
];

export const carById = (id: string | undefined) => CARS.find((c) => c.id === id);
export const buildMs = (car: Car) => car.buildMin * MIN;

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
