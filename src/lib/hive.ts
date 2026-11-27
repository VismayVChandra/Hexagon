import type { StudySession } from '../types';
import { HOUR, MIN, dayKey } from './time';
import { capacityFor } from './hexGeom';

/**
 * The hive: every 5 minutes of focus fills one honey cell. Cells you've filled across all sessions form your hive,
 * and your total study time earns a bee rank. It is derived from saved sessions, never stored.
 * Only timed sessions count, so logging a past session by hand doesn't earn honey.
 */
export const CELL_MS = 5 * MIN;
/** The comb drawn on Home holds 127 cells (6 rings). Once it is full, that is one "full comb" and a new one starts. */
export const COMB_CAPACITY = capacityFor(6);
/** A single session this long (or longer) earns the day's golden cell. */
export const GOLDEN_SESSION_MS = 25 * MIN;

export interface Rank {
  id: string;
  name: string;
  hours: number;
  blurb: string;
}

export const RANKS: Rank[] = [
  { id: 'egg', name: 'Egg', hours: 0, blurb: 'Your hive is just beginning.' },
  { id: 'larva', name: 'Larva', hours: 1, blurb: 'Growing fast.' },
  { id: 'worker', name: 'Worker bee', hours: 5, blurb: 'Putting in the hours.' },
  { id: 'builder', name: 'Comb builder', hours: 10, blurb: 'Your comb is taking shape.' },
  { id: 'forager', name: 'Forager', hours: 25, blurb: 'Bringing in honey every day.' },
  { id: 'guardian', name: 'Guardian', hours: 50, blurb: 'The hive depends on you.' },
  { id: 'queen', name: 'Queen', hours: 100, blurb: 'The heart of the hive.' },
];

export const timedMs = (sessions: StudySession[]) => sessions.filter((s) => !s.manual).reduce((a, s) => a + s.studiedMs, 0);

export const cellsFromMs = (ms: number) => Math.floor(Math.max(0, ms) / CELL_MS);

export function rankFor(totalMs: number): { rank: Rank; next: Rank | null; progress: number } {
  const hours = totalMs / HOUR;
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (hours >= RANKS[i].hours) idx = i;
  const rank = RANKS[idx];
  const next = RANKS[idx + 1] ?? null;
  const progress = next ? (hours - rank.hours) / (next.hours - rank.hours) : 1;
  return { rank, next, progress: Math.max(0, Math.min(1, progress)) };
}

export interface HiveSummary {
  totalMs: number;
  cells: number;
  fullCombs: number;
  /** Cells in the comb currently being built (a full comb shows as 127). */
  inCurrent: number;
  rank: Rank;
  next: Rank | null;
  rankProgress: number;
  hoursToNext: number;
  /** Days with at least one timed session of 25+ minutes. */
  goldenDays: number;
}

export function goldenDayKeys(sessions: StudySession[]): Set<string> {
  const days = new Set<string>();
  for (const s of sessions) if (!s.manual && s.studiedMs >= GOLDEN_SESSION_MS) days.add(dayKey(s.startedAt));
  return days;
}

export function hiveSummary(sessions: StudySession[]): HiveSummary {
  const totalMs = timedMs(sessions);
  const cells = cellsFromMs(totalMs);
  const { rank, next, progress } = rankFor(totalMs);
  const partial = cells % COMB_CAPACITY;
  return {
    totalMs,
    cells,
    fullCombs: Math.floor(cells / COMB_CAPACITY),
    inCurrent: cells > 0 && partial === 0 ? COMB_CAPACITY : partial,
    rank,
    next,
    rankProgress: progress,
    hoursToNext: next ? Math.max(0, next.hours - totalMs / HOUR) : 0,
    goldenDays: goldenDayKeys(sessions).size,
  };
}
