import type { FriendState } from '../types';
import { MIN } from '../lib/time';
import type { PresenceUpdate, RemoteFriend } from './types';

/**
 * Presence is "last known, with an expiry". Apps heartbeat every minute while open, so a row that has not
 * been refreshed for a few minutes means the person closed the app, lost signal, or their phone died.
 */
export const HEARTBEAT_MS = MIN;
export const FRESH_MS = 3 * MIN;
export const FINISHED_WINDOW_MS = 25 * MIN;

type Row = Pick<RemoteFriend, 'state' | 'updatedAt'>;

function ageOf(r: Row, now: number): number | null {
  if (!r.state || !r.updatedAt) return null;
  const t = Date.parse(r.updatedAt);
  return Number.isFinite(t) ? Math.max(0, now - t) : null;
}

export function effectiveState(r: Row, now: number): FriendState {
  const age = ageOf(r, now);
  if (age == null) return 'offline';
  if (r.state === 'finished') return age <= FINISHED_WINDOW_MS ? 'finished' : 'offline';
  // 'studying' and 'online' both need a recent heartbeat.
  if (age > FRESH_MS) return 'offline';
  return r.state === 'studying' ? 'studying' : 'online';
}

/** How long they have been studying (or studied, if finished), counting time since the last heartbeat. */
export function effectiveSessionMs(r: Row & Pick<RemoteFriend, 'sessionMs'>, now: number): number {
  const age = ageOf(r, now);
  if (age == null) return 0;
  return r.state === 'studying' ? r.sessionMs + age : r.sessionMs;
}

export interface PresenceInputs {
  sharing: boolean;
  shareSubject: boolean;
  /** A session is running right now (not paused). */
  running: boolean;
  studiedMs: number;
  subjectName?: string;
  roomId?: string;
  /** The most recently finished session, if it ended recently. */
  finished: { at: number; studiedMs: number; subjectName?: string } | null;
  now: number;
}

/** What this device should publish, or null to publish nothing. */
export function desiredPresence(i: PresenceInputs): PresenceUpdate | null {
  if (!i.sharing) return null;
  const subj = (name?: string) => (i.shareSubject && name ? name : null);
  if (i.running) return { state: 'studying', subject: subj(i.subjectName), sessionMs: i.studiedMs, roomId: i.roomId ?? null };
  if (i.finished && i.now - i.finished.at <= FINISHED_WINDOW_MS) {
    return { state: 'finished', subject: subj(i.finished.subjectName), sessionMs: i.finished.studiedMs, roomId: null };
  }
  return { state: 'online', subject: null, sessionMs: 0, roomId: null };
}

/**
 * Friend codes are 6 digits, like a ride-share OTP. Spaces and dashes are ignored so a pasted "482 913" works.
 * Returns null if what was typed can't be a code.
 */
export function normalizeFriendCode(input: string): string | null {
  const digits = input.replace(/[\s-]+/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

/** Shows a code as 482 913 for easier reading aloud. */
export const formatFriendCode = (code: string) => (code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code);
