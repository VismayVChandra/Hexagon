import type { Exam, StudySession } from '../types';
import { HOUR, MIN, daysBetween, dayKey } from './time';
import { sessionDay } from './stats';

export interface ExamPlan {
  exam: Exam;
  daysLeft: number;
  loggedMs: number;
  remainingMs: number;
  /** Study needed per week to reach the exam's target hours. */
  perWeekMs: number;
}

export interface GoalSuggestion {
  plans: ExamPlan[];
  recentAvgMs: number;
  /** What the exams alone call for. */
  neededMs: number;
  /** A realistic goal: the need, but not more than a modest step up from recent habits. */
  suggestedMs: number;
  /** True when the full need would be a big jump from current habits. */
  rampUp: boolean;
  /** One-line, plain-language reason. */
  reason: string;
}

const MAX_RAMP = 1.4; // don't suggest more than +40% over the recent average in one step
const FLOOR_MS = 2 * HOUR;
const CEIL_MS = 50 * HOUR;

/** Progress toward an exam = study logged for that subject since the exam was added. */
export function examPlan(exam: Exam, sessions: StudySession[], now: number): ExamPlan {
  const today = dayKey(now);
  const daysLeft = daysBetween(today, exam.date);
  const since = dayKey(exam.createdAt);
  const loggedMs = sessions
    .filter((s) => s.subjectId === exam.subjectId && sessionDay(s) >= since)
    .reduce((a, s) => a + s.studiedMs, 0);
  const remainingMs = Math.max(0, exam.targetHours * HOUR - loggedMs);
  const weeksLeft = Math.max(1, daysLeft / 7);
  return { exam, daysLeft, loggedMs, remainingMs, perWeekMs: remainingMs / weeksLeft };
}

function roundTo(ms: number, stepMin: number) {
  const step = stepMin * MIN;
  return Math.round(ms / step) * step;
}

export function suggestWeeklyGoal(exams: Exam[], sessions: StudySession[], recentAvgMs: number, now: number): GoalSuggestion | null {
  const today = dayKey(now);
  const upcoming = exams.filter((e) => e.date >= today && daysBetween(today, e.date) <= 70);
  if (upcoming.length === 0) return null;
  const plans = upcoming.map((e) => examPlan(e, sessions, now)).sort((a, b) => a.daysLeft - b.daysLeft);
  const neededMs = plans.reduce((a, p) => a + p.perWeekMs, 0);
  const clampedNeed = Math.min(CEIL_MS, Math.max(FLOOR_MS, neededMs));

  let suggested = clampedNeed;
  let rampUp = false;
  let reason: string;
  if (recentAvgMs > 0 && clampedNeed > recentAvgMs * MAX_RAMP) {
    suggested = Math.max(FLOOR_MS, recentAvgMs * MAX_RAMP);
    rampUp = true;
    reason = `Your exams call for about ${hoursText(clampedNeed)} a week, but you've averaged ${hoursText(recentAvgMs)}. Start with a step up of about 40% and raise it as you settle in.`;
  } else if (neededMs < FLOOR_MS) {
    reason = `You're well on track. This is a light maintenance goal while you keep the exams in view.`;
  } else {
    reason = `Based on the hours you'd like before each exam, minus what you've already logged, spread over the weeks left.`;
  }
  return { plans, recentAvgMs, neededMs: clampedNeed, suggestedMs: roundTo(suggested, 15), rampUp, reason };
}

function hoursText(ms: number): string {
  const h = Math.round((ms / HOUR) * 10) / 10;
  return `${h}h`;
}

/** A daily goal in minutes that spreads the weekly goal over six study days, to the nearest 5 minutes. */
export function dailyMinFromWeeklyMs(weeklyMs: number): number {
  return Math.max(10, Math.round(weeklyMs / MIN / 6 / 5) * 5);
}
