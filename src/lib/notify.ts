import type { Exam, StudySession } from '../types';
import { buildNudgePlan, type Message, type NudgePlan } from './messages';
import { dayKey } from './time';
import { currentStreak } from './stats';

/**
 * Notifications. Three kinds of things can show up:
 *  - alerts and rewards while Hexagon is open or in the background (timer done, block ended, goal reached, session saved);
 *  - come-back reminders while it is closed, sent by the service worker through the browser's periodic background sync
 *    (installed app on Android Chrome). The browser decides exactly when it runs, so reminders are best-effort;
 *  - nothing else. No server, no account, nothing leaves the device.
 */
export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function notifyPermission(): NotifyPermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/** Ask for permission. Must be called from a tap. */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export interface ShowOptions {
  tag: string;
  /** Where tapping it should land, as a hash route like '/session'. */
  route?: string;
  /** No sound or vibration (used when the app is already on screen). */
  silent?: boolean;
}

const iconUrl = () => new URL('icons/icon-192.png', document.baseURI).href;

/** Show a notification now. Resolves true if the browser accepted it. */
export async function showNotification(message: Message, opts: ShowOptions): Promise<boolean> {
  if (notifyPermission() !== 'granted') return false;
  const url = new URL(`./#${opts.route ?? '/'}`, document.baseURI).href;
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body: message.body,
    tag: opts.tag,
    icon: iconUrl(),
    badge: iconUrl(),
    data: { url },
    silent: opts.silent ?? false,
    renotify: !opts.silent,
    vibrate: opts.silent ? undefined : [120, 60, 120],
  };
  try {
    // Phones only allow notifications through the service worker.
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(message.title, options);
      return true;
    }
    const n = new Notification(message.title, options);
    n.onclick = () => {
      window.focus();
      location.href = url;
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

// ---------- come-back reminders ----------

const PLAN_CACHE = 'hexagon-nudge';
const SYNC_TAG = 'hexagon-nudge';

const planUrl = () => new URL('nudge-plan.json', document.baseURI).href;

async function readPlan(): Promise<NudgePlan | null> {
  try {
    const hit = await (await caches.open(PLAN_CACHE)).match(planUrl());
    return hit ? ((await hit.json()) as NudgePlan) : null;
  } catch {
    return null;
  }
}

interface PeriodicSyncRegistration extends ServiceWorkerRegistration {
  periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void>; unregister: (tag: string) => Promise<void> };
}

export interface NudgeSupport {
  /** The browser can wake Hexagon in the background to send reminders. */
  background: boolean;
}

export async function nudgeSupport(): Promise<NudgeSupport> {
  try {
    const reg = (await navigator.serviceWorker?.getRegistration()) as PeriodicSyncRegistration | undefined;
    return { background: !!reg?.periodicSync && typeof caches !== 'undefined' };
  } catch {
    return { background: false };
  }
}

export interface NudgeInputs {
  enabled: boolean;
  hour: number;
  name: string;
  sessions: StudySession[];
  exams: Exam[];
  subjectName: (id: string) => string | undefined;
}

/** The last day the student studied, or today if they never have (so a brand-new student isn't nudged on day one). */
export function anchorDayFor(sessions: StudySession[], now: number): string {
  let last = '';
  for (const s of sessions) {
    if (s.demo) continue;
    const k = dayKey(s.endedAt);
    if (k > last) last = k;
  }
  return last || dayKey(now);
}

/** Keep the service worker's reminder plan, and the browser's background-sync registration, in step with Settings. */
export async function syncNudges(i: NudgeInputs, now = Date.now()): Promise<void> {
  if (typeof caches === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = (await navigator.serviceWorker.getRegistration()) as PeriodicSyncRegistration | undefined;
    if (!reg) return; // dev builds have no service worker
    const on = i.enabled && notifyPermission() === 'granted';
    const anchorDay = anchorDayFor(i.sessions, now);
    const previous = await readPlan();
    const plan = buildNudgePlan({
      enabled: on,
      hour: i.hour,
      anchorDay,
      name: i.name,
      streak: currentStreak(i.sessions.filter((s) => !s.demo), now).days,
      exams: i.exams.filter((e) => !e.demo),
      subjectName: i.subjectName,
      url: new URL('./#/study', document.baseURI).href,
      now,
    });
    if (previous?.sent) plan.sent = previous.sent;
    const cache = await caches.open(PLAN_CACHE);
    await cache.put(planUrl(), new Response(JSON.stringify(plan), { headers: { 'content-type': 'application/json' } }));
    if (reg.periodicSync) {
      if (on) await reg.periodicSync.register(SYNC_TAG, { minInterval: 12 * 60 * 60 * 1000 });
      else await reg.periodicSync.unregister(SYNC_TAG);
    }
  } catch {
    /* reminders are a bonus */
  }
}
