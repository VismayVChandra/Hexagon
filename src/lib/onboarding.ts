import type { AppData } from '../types';
import { anchorDayFor } from './notify';
import { daysBetween, dayKey } from './time';
import { isDemoMode } from '../store/store';

export const PRESET_SUBJECTS = ['Physics', 'Mathematics', 'Chemistry', 'Biology', 'English', 'Computer Science', 'Economics', 'History', 'Accountancy', 'Hindi'];

export const GOAL_STEP = 15;
export const GOAL_MIN = 15;
export const GOAL_MAX = 720;

/** Move the daily goal up or down one step, staying inside the allowed range. */
export function stepGoal(min: number, dir: 1 | -1): number {
  return Math.min(GOAL_MAX, Math.max(GOAL_MIN, min + dir * GOAL_STEP));
}

/** A daily goal that reaches `targetHours` of study by the exam: rounded up to 15 minutes, never under 30 minutes or over 4 hours. */
export function suggestDailyMin(daysLeft: number, targetHours = 10): number {
  const days = Math.max(1, daysLeft);
  const raw = (targetHours * 60) / days;
  const rounded = Math.ceil(raw / GOAL_STEP) * GOAL_STEP;
  return Math.min(240, Math.max(30, rounded));
}

/** Add or remove a subject name from the chosen list (names compare ignoring case). */
export function toggleName(list: string[], name: string): string[] {
  const key = name.trim().toLowerCase();
  return list.some((n) => n.toLowerCase() === key) ? list.filter((n) => n.toLowerCase() !== key) : [...list, name.trim()];
}

/** Add a subject typed by hand. Returns the new list, or an error to show. */
export function addCustomName(list: string[], raw: string): { list: string[]; error?: string } {
  const t = raw.trim();
  if (!t) return { list, error: 'Type a subject name.' };
  if (t.length > 40) return { list, error: 'Keep it to 40 characters or fewer.' };
  if (list.some((n) => n.toLowerCase() === t.toLowerCase())) return { list };
  if (list.length >= 12) return { list, error: 'That’s plenty to start with. You can add more later.' };
  return { list: [...list, t] };
}

/** A brand-new student: still on the sample data from first launch and has not been through the welcome yet. */
export function needsWelcome(d: AppData): boolean {
  return !d.settings.onboarded && isDemoMode(d);
}

/** Whole days since the last real study session, or null when there has never been one. */
export function daysAway(d: AppData, now: number): number | null {
  const real = d.sessions.filter((s) => !s.demo);
  if (real.length === 0) return null;
  return daysBetween(anchorDayFor(real, now), dayKey(now));
}

/** Show the warm come-back screen: two or more days since the last session, nothing running, not already shown today. */
export function comebackWanted(d: AppData, now: number, shownToday: boolean): boolean {
  if (shownToday || d.active) return false;
  const away = daysAway(d, now);
  return away != null && away >= 2;
}
