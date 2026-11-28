import type { AppData } from '../types';
import type { CheerKind, FriendShowcase } from '../cloud/types';
import { CARS, carById } from '../data/cars';
import { CELL_MS, COMB_CAPACITY, cellsFromMs, rankFor, timedMs } from './hive';
import { hashString } from './id';

/** What a friend can see of me: my honey count and the cars I have built. Nothing about what I studied. */
export interface Showcase {
  cells: number;
  cars: { id: string; at: number }[];
}

/** Built from real sessions only, so sample data never reaches a friend. Newest car first. */
export function showcaseFromData(d: AppData): Showcase {
  const cells = cellsFromMs(timedMs(d.sessions.filter((s) => !s.demo)));
  const cars = [...d.garage]
    .filter((g) => !!carById(g.carId))
    .sort((a, b) => b.at - a.at)
    .map((g) => ({ id: g.carId, at: g.at }));
  return { cells, cars };
}

/** Changes whenever there is something new to publish. */
export const showcaseKey = (on: boolean, s: Showcase) => `${on}|${s.cells}|${s.cars.map((c) => c.id).join(',')}`;

/** The bee rank a honey count earns (12 cells is an hour of focus). */
export const rankNameForCells = (cells: number) => rankFor(cells * CELL_MS).rank.name;

/** How many of the small honeycomb's cells to fill for a honey count: the current comb's progress, or a full one on an exact multiple. */
export function miniFillFromCells(cells: number, slots = 25): number {
  if (cells <= 0) return 0;
  const partial = cells % COMB_CAPACITY;
  return partial === 0 ? slots : Math.max(1, Math.round((partial / COMB_CAPACITY) * slots));
}

/** A believable, steady profile for a simulated friend, so the screen can be explored without an account. */
export function demoShowcase(friendId: string, name: string, now: number): FriendShowcase {
  const h = hashString(friendId);
  const n = 1 + (h % 5);
  const used = new Set<string>();
  const cars: FriendShowcase['cars'] = [];
  for (let i = 0; cars.length < n && i < 40; i++) {
    const car = CARS[(h + i * 37) % CARS.length];
    if (used.has(car.id)) continue;
    used.add(car.id);
    cars.push({ id: car.id, at: now - (cars.length + 1) * 3 * 86_400_000, likes: (h >> cars.length) % 4, liked: false });
  }
  return { name, shared: true, cells: 30 + (h % 700), cars };
}

/** The preset cheers. Labels are short and warm; there is no free text. */
export const CHEERS: { id: CheerKind; label: string; emoji: string }[] = [
  { id: 'nice', label: 'Nice!', emoji: '👏' },
  { id: 'keep_going', label: 'Keep going', emoji: '💪' },
  { id: 'fire', label: 'On fire', emoji: '🔥' },
];

export const cheerOf = (kind: string) => CHEERS.find((c) => c.id === kind);
