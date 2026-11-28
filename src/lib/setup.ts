import type { Scene, SetupMemory, TimerConfig } from '../types';

/** The most subjects we keep a remembered setup for. */
export const MAX_REMEMBERED = 40;

const int = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;

/** Checks a timer config read from storage; returns undefined if it can't be trusted. */
export function parseConfig(c: unknown): TimerConfig | undefined {
  if (!c || typeof c !== 'object') return undefined;
  const o = c as Record<string, unknown>;
  if (o.mode === 'stopwatch') return { mode: 'stopwatch' };
  if (o.mode === 'countdown') return int(o.targetMin, 1, 600) ? { mode: 'countdown', targetMin: o.targetMin } : undefined;
  if (o.mode === 'pomodoro') {
    const p = o.pomodoro as Record<string, unknown> | undefined;
    if (!p) return undefined;
    if (!int(p.focusMin, 1, 180) || !int(p.breakMin, 1, 60) || !int(p.longBreakMin, 1, 90) || !int(p.cyclesBeforeLong, 1, 10)) return undefined;
    return { mode: 'pomodoro', pomodoro: { focusMin: p.focusMin, breakMin: p.breakMin, longBreakMin: p.longBreakMin, cyclesBeforeLong: p.cyclesBeforeLong } };
  }
  return undefined;
}

/** Reads the remembered setups from saved settings, dropping anything damaged. */
export function parseSetups(raw: unknown): Record<string, SetupMemory> {
  const out: Record<string, SetupMemory> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [subjectId, v] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_REMEMBERED)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const config = parseConfig(o.config);
    const scene: Scene | undefined = o.scene === 'honeycomb' || o.scene === 'car' || o.scene === 'minimal' ? o.scene : undefined;
    if (!config || !scene) continue;
    out[subjectId] = { config, scene, ...(scene === 'car' && typeof o.carId === 'string' ? { carId: o.carId } : {}) };
  }
  return out;
}

/** Remembers what was just used for a subject, keeping only subjects that still exist. */
export function rememberSetup(current: Record<string, SetupMemory>, subjectId: string, setup: SetupMemory, subjectIds: string[]): Record<string, SetupMemory> {
  const keep = new Set(subjectIds);
  const out: Record<string, SetupMemory> = {};
  for (const [id, s] of Object.entries(current)) if (id !== subjectId && keep.has(id)) out[id] = s;
  out[subjectId] = setup;
  return out;
}

/**
 * What to use for a subject: the last setup it was studied with, or the plain default.
 * A remembered car is dropped when it is already in the garage (or no longer exists), so the next session never asks to build a finished car.
 */
export function setupFor(
  remembered: Record<string, SetupMemory>,
  subjectId: string,
  fallbackScene: Scene,
  carAvailable: (carId: string) => boolean,
): SetupMemory {
  const m = remembered[subjectId];
  if (!m) return { config: { mode: 'stopwatch' }, scene: fallbackScene === 'car' ? 'honeycomb' : fallbackScene };
  if (m.scene === 'car' && !(m.carId && carAvailable(m.carId))) return { config: m.config, scene: 'honeycomb' };
  return m;
}

/** "Pomodoro 25 · 5", "Countdown 45 min", "Stopwatch". */
export function describeConfig(c: TimerConfig): string {
  if (c.mode === 'pomodoro' && c.pomodoro) return `Pomodoro ${c.pomodoro.focusMin} · ${c.pomodoro.breakMin}`;
  if (c.mode === 'countdown' && c.targetMin) return `Countdown ${c.targetMin} min`;
  return 'Stopwatch';
}

export const SCENE_LABEL: Record<Scene, string> = { honeycomb: 'Honeycomb', car: 'Build a car', minimal: 'Minimal' };
