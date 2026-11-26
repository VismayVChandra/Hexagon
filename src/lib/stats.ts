import type { StudySession } from '../types';
import { MIN, addDays, dayKey, daysBetween, weekStartKey } from './time';

/** A day counts toward the streak once at least this much was studied. */
export const STREAK_MIN_MS = 10 * MIN;

export type RangeId = '7d' | '30d' | '90d' | 'all';

export const RANGES: { id: RangeId; label: string; days: number | null }[] = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
];

export function sessionDay(s: StudySession): string {
  return dayKey(s.startedAt);
}

/** Total studied ms keyed by local day. */
export function totalsByDay(sessions: StudySession[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    const k = sessionDay(s);
    m.set(k, (m.get(k) ?? 0) + s.studiedMs);
  }
  return m;
}

export function sessionsInRange(sessions: StudySession[], startKey: string, endKey: string): StudySession[] {
  return sessions.filter((s) => {
    const k = sessionDay(s);
    return k >= startKey && k <= endKey;
  });
}

export function sum(sessions: StudySession[]): number {
  return sessions.reduce((a, s) => a + s.studiedMs, 0);
}

export function todayMs(sessions: StudySession[], now: number): number {
  const k = dayKey(now);
  return sum(sessions.filter((s) => sessionDay(s) === k));
}

export function weekMs(sessions: StudySession[], now: number): number {
  const today = dayKey(now);
  return sum(sessionsInRange(sessions, weekStartKey(today), today));
}

/** Consecutive qualifying days ending today (or yesterday if today has not qualified yet). */
export function currentStreak(sessions: StudySession[], now: number): { days: number; todayDone: boolean } {
  const totals = totalsByDay(sessions);
  const today = dayKey(now);
  const qualifies = (k: string) => (totals.get(k) ?? 0) >= STREAK_MIN_MS;
  const todayDone = qualifies(today);
  let cursor = todayDone ? today : addDays(today, -1);
  let days = 0;
  while (qualifies(cursor)) {
    days++;
    cursor = addDays(cursor, -1);
  }
  return { days, todayDone };
}

export function longestStreak(sessions: StudySession[]): number {
  const totals = totalsByDay(sessions);
  const keys = [...totals.keys()].filter((k) => (totals.get(k) ?? 0) >= STREAK_MIN_MS).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of keys) {
    run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

export function subjectTotals(sessions: StudySession[]): { subjectId: string; ms: number; count: number }[] {
  const m = new Map<string, { ms: number; count: number }>();
  for (const s of sessions) {
    const cur = m.get(s.subjectId) ?? { ms: 0, count: 0 };
    cur.ms += s.studiedMs;
    cur.count += 1;
    m.set(s.subjectId, cur);
  }
  return [...m.entries()].map(([subjectId, v]) => ({ subjectId, ...v })).sort((a, b) => b.ms - a.ms);
}

export interface Bucket {
  /** First day of the bucket (YYYY-MM-DD). */
  key: string;
  /** Last day of the bucket. */
  endKey: string;
  label: string;
  totalMs: number;
  bySubject: { subjectId: string; ms: number }[];
}

/**
 * Buckets for the stacked chart: daily for up to 31 days, weekly beyond that.
 * `startKey`..`endKey` inclusive.
 */
export function buildBuckets(sessions: StudySession[], startKey: string, endKey: string, weekday: (key: string) => string, shortDate: (key: string) => string): Bucket[] {
  const spanDays = daysBetween(startKey, endKey) + 1;
  const weekly = spanDays > 31;
  const buckets: Bucket[] = [];
  if (!weekly) {
    for (let i = 0; i < spanDays; i++) {
      const k = addDays(startKey, i);
      buckets.push({ key: k, endKey: k, label: spanDays <= 7 ? weekday(k) : shortDate(k), totalMs: 0, bySubject: [] });
    }
  } else {
    let k = weekStartKey(startKey);
    while (k <= endKey) {
      buckets.push({ key: k, endKey: addDays(k, 6), label: shortDate(k), totalMs: 0, bySubject: [] });
      k = addDays(k, 7);
    }
  }
  const idx = (day: string) => {
    if (!weekly) return daysBetween(startKey, day);
    return buckets.findIndex((b) => day >= b.key && day <= b.endKey);
  };
  for (const s of sessions) {
    const day = sessionDay(s);
    if (day < startKey || day > endKey) continue;
    const b = buckets[idx(day)];
    if (!b) continue;
    b.totalMs += s.studiedMs;
    const e = b.bySubject.find((x) => x.subjectId === s.subjectId);
    if (e) e.ms += s.studiedMs;
    else b.bySubject.push({ subjectId: s.subjectId, ms: s.studiedMs });
  }
  for (const b of buckets) b.bySubject.sort((a, c) => c.ms - a.ms);
  return buckets;
}

/** Last `weeks` weeks (Monday-aligned) of daily totals for the consistency calendar. */
export function calendarCells(sessions: StudySession[], now: number, weeks: number): { key: string; ms: number; future: boolean }[] {
  const totals = totalsByDay(sessions);
  const today = dayKey(now);
  const start = addDays(weekStartKey(today), -(weeks - 1) * 7);
  const cells: { key: string; ms: number; future: boolean }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const k = addDays(start, i);
    cells.push({ key: k, ms: totals.get(k) ?? 0, future: k > today });
  }
  return cells;
}

/** Average studied ms per week over the last `weeks` full weeks before this one, falling back to this week. */
export function recentWeeklyAverage(sessions: StudySession[], now: number, weeks = 4): number {
  if (sessions.length === 0) return 0;
  const today = dayKey(now);
  const thisWeek = weekStartKey(today);
  const first = addDays(thisWeek, -weeks * 7);
  const earliest = sessions.reduce((m, s) => (sessionDay(s) < m ? sessionDay(s) : m), today);
  // Weeks of history before this one, counting the week the first session fell in.
  const firstWeek = weekStartKey(earliest < first ? first : earliest);
  const usable = Math.min(weeks, Math.max(0, Math.round(daysBetween(firstWeek, thisWeek) / 7)));
  if (usable === 0) return weekMs(sessions, now);
  const start = addDays(thisWeek, -usable * 7);
  const total = sum(sessionsInRange(sessions, start, addDays(thisWeek, -1)));
  return total / usable;
}

export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

/** The next streak milestone above `days`, with how many more days it takes. */
export function nextMilestone(days: number): { target: number; remaining: number } | null {
  const target = STREAK_MILESTONES.find((m) => m > days);
  return target ? { target, remaining: target - days } : null;
}
