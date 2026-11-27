import type { Exam, SessionSummary } from '../types';
import type { CueEventKind } from './cues';
import { DAY, dayKey, daysBetween, formatDuration } from './time';

/**
 * Words for notifications and come-back cards. Kept in one place so the tone stays consistent: warm, a little playful,
 * never guilt-tripping, and always ending with something small the student can do.
 */
export interface Message {
  title: string;
  body: string;
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ---------- timer alerts (shown when Hexagon is in the background) ----------

export interface TimerAlertInfo {
  subject?: string;
  studiedMs?: number;
  /** Pomodoro: the break length in minutes, or the next focus block number. */
  breakMin?: number;
  nextBlock?: number;
  goalMin?: number;
  car?: string;
}

export function timerAlert(kind: CueEventKind, i: TimerAlertInfo): Message | null {
  switch (kind) {
    case 'timerDone':
      return {
        title: `Time’s up${i.studiedMs ? ` — ${formatDuration(i.studiedMs)}${i.subject ? ` of ${i.subject}` : ''}` : ''}`,
        body: 'Open Hexagon to save it and collect your honey.',
      };
    case 'focusEnd':
      return { title: 'Focus block done 🎉', body: i.breakMin ? `Take your ${plural(i.breakMin, 'minute')} break. Break time isn’t counted as study time.` : 'Time for a short break.' };
    case 'breakEnd':
      return { title: 'Break’s over', body: i.nextBlock ? `Ready for focus block ${i.nextBlock}? Your bee is waiting.` : 'Ready to focus again? Your bee is waiting.' };
    case 'goal':
      return { title: 'Daily goal reached 🎯', body: `${i.goalMin ? formatDuration(i.goalMin * 60_000) : 'Your goal'} studied today. Everything from here is a bonus.` };
    case 'car':
      return { title: `${i.car ?? 'Your car'} is complete 🏁`, body: 'Open Hexagon to save the session and add it to your garage.' };
    default:
      return null; // stopwatch milestones are sound only
  }
}

// ---------- rewards after a saved session ----------

export function rewardMessage(s: SessionSummary, subjectName?: string): Message {
  const studied = formatDuration(s.studiedMs);
  const wins: string[] = [];
  if (s.cellsAdded > 0) wins.push(`+${plural(s.cellsAdded, 'honey cell')}`);
  if (s.rankUp) wins.push(`new bee rank: ${s.rankUp.to}`);
  if (s.goldenEarned) wins.push('golden cell earned');
  if (s.streakExtended) wins.push(s.streakDays > 1 ? `${s.streakDays}-day streak 🔥` : 'streak started 🔥');
  if (s.car && !s.car.completed) wins.push(`${s.car.name} ${Math.floor(s.car.progress * 100)}% built`);
  const bits = wins.length ? wins.join(' · ') : 'Saved to your progress.';

  if (s.car?.completed) return { title: `${s.car.name} is finished 🏁`, body: `Built with ${studied} of focus${subjectName ? ` on ${subjectName}` : ''} and added to your garage.${wins.length ? ' ' + bits : ''}` };
  if (s.goalReached) return { title: 'Daily goal reached 🎯', body: `${studied}${subjectName ? ` of ${subjectName}` : ''} saved. ${bits}` };
  return { title: `${studied}${subjectName ? ` of ${subjectName}` : ''} saved`, body: bits };
}

// ---------- come-back reminders ----------

/** Days away that get a reminder. After the last one, Hexagon stops: no endless nagging. */
export const NUDGE_DAYS = [1, 2, 3, 5, 7, 14] as const;

export interface NudgeContext {
  name: string;
  streak: number;
  /** The soonest upcoming exam, if any, and how many days away it is on the day of the reminder. */
  exam?: { subject: string; days: number };
}

/** The reminder for a student who last studied `gap` days ago. */
export function nudgeMessage(gap: number, c: NudgeContext): Message {
  const hi = c.name ? `${c.name}, ` : '';
  const exam = c.exam && c.exam.days >= 0 && c.exam.days <= 7 && gap <= 3 ? c.exam : undefined;
  if (exam) {
    return {
      title: exam.days === 0 ? `${exam.subject} exam is today` : `${exam.subject} exam in ${plural(exam.days, 'day')}`,
      body: `${hi}a 25-minute session today keeps you on track. Tap to start one.`,
    };
  }
  if (gap <= 1) {
    return c.streak >= 2
      ? { title: `Buzz here: your ${c.streak}-day streak ends today 🔥`, body: `${hi}ten focused minutes keeps it alive. Tap to start.` }
      : { title: 'Ready for today’s session? 🐝', body: `${hi}even 15 minutes adds honey to your hive.` };
  }
  if (gap === 2) return { title: 'Buzz is getting lonely 🐝', body: `${hi}two quiet days. One short session and the honey starts flowing again.` };
  if (gap <= 4) return { title: 'Your honey is waiting 🍯', body: `${hi}a few days away happens. Start tiny: ten minutes is plenty.` };
  if (gap <= 6) return { title: 'No pressure, just a nudge', body: `${hi}a five-minute starter session is enough to get back in the swing.` };
  if (gap <= 13) return { title: 'It’s been a week', body: 'Your hive, garage and history are all still here. Come back with one small session.' };
  return { title: 'Last one from Buzz 🐝', body: 'Whenever you’re ready, your hive will be here. We won’t keep nudging.' };
}

/** What the service worker needs to send reminders while the app is closed. */
export interface NudgePlan {
  v: 1;
  enabled: boolean;
  /** Reminders go out from this hour of the day onward (never at night). */
  hour: number;
  /** The last day the student studied, or the day the plan was first made if they never have (local YYYY-MM-DD). */
  anchorDay: string;
  messages: { days: number; title: string; body: string }[];
  /** Filled in by the service worker so it only sends each reminder once. */
  sent?: { anchorDay: string; days: number; on: string };
  /** The app address to open when a reminder is tapped. */
  url: string;
}

export function buildNudgePlan(opts: { enabled: boolean; hour: number; anchorDay: string; name: string; streak: number; exams: Exam[]; subjectName: (id: string) => string | undefined; url: string; now: number }): NudgePlan {
  const messages = NUDGE_DAYS.map((days) => {
    const when = opts.now + days * DAY;
    let exam: NudgeContext['exam'];
    for (const e of opts.exams) {
      const left = daysBetween(dayKey(when), e.date);
      if (left >= 0 && (!exam || left < exam.days)) exam = { subject: opts.subjectName(e.subjectId) ?? 'Your', days: left };
    }
    return { days, ...nudgeMessage(days, { name: opts.name, streak: opts.streak, exam }) };
  });
  return { v: 1, enabled: opts.enabled, hour: Math.min(23, Math.max(0, Math.round(opts.hour))), anchorDay: opts.anchorDay, messages, url: opts.url };
}

/**
 * Which reminder (if any) to send. The service worker has its own copy of this rule (it can't import app code), so keep
 * the two in step: one per day, only from the chosen hour, only for a day not already sent, never after two weeks away.
 */
export function pickNudge(plan: NudgePlan, today: string, hourNow: number): { days: number; title: string; body: string } | null {
  if (!plan.enabled || hourNow < plan.hour || hourNow >= 22) return null;
  if (plan.sent?.on === today) return null;
  const gap = daysBetween(plan.anchorDay, today);
  if (gap < 1 || gap > 16) return null;
  const sentDays = plan.sent && plan.sent.anchorDay === plan.anchorDay ? plan.sent.days : 0;
  const due = plan.messages.filter((m) => m.days <= gap && m.days > sentDays);
  return due.length ? due[due.length - 1] : null;
}
