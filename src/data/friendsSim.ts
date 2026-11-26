import type { Friend, FriendState } from '../types';
import { MIN } from '../lib/time';
import { hashString } from '../lib/id';

/**
 * DEMO ONLY. Friends are simulated on this device from the clock: no network, no real people.
 * Each friend loops through: studying -> just finished -> online -> offline.
 */

export interface FriendPresence {
  state: FriendState;
  /** How long the current state has lasted. */
  sinceMs: number;
  /** Study length so far (studying) or the length of the session just finished. */
  sessionMs: number;
  /** Only present if the friend chooses to share it. */
  subject?: string;
}

const FINISHED_WINDOW = 25 * MIN;
const ONLINE_WINDOW = 35 * MIN;

export function friendPresence(f: Friend, now: number): FriendPresence {
  const period = f.sim.periodMin * MIN;
  const study = f.sim.studyMin * MIN;
  const t = (((now + f.sim.offsetMin * MIN) % period) + period) % period;
  const cycleIdx = Math.floor((now + f.sim.offsetMin * MIN) / period);
  const subj = f.sharesSubject ? f.sim.subjects[((cycleIdx % f.sim.subjects.length) + f.sim.subjects.length) % f.sim.subjects.length] : undefined;

  if (t < study) return { state: 'studying', sinceMs: t, sessionMs: t, subject: subj };
  if (t < study + FINISHED_WINDOW) return { state: 'finished', sinceMs: t - study, sessionMs: study, subject: subj };
  if (t < study + FINISHED_WINDOW + ONLINE_WINDOW) return { state: 'online', sinceMs: t - study - FINISHED_WINDOW, sessionMs: 0 };
  return { state: 'offline', sinceMs: t - study - FINISHED_WINDOW - ONLINE_WINDOW, sessionMs: 0 };
}

export const STATE_LABEL: Record<FriendState, string> = {
  studying: 'Studying',
  online: 'Online',
  finished: 'Finished',
  offline: 'Offline',
};

const SUBJECT_POOL = ['Organic chemistry', 'Linear algebra', 'World history', 'Macroeconomics', 'Anatomy', 'Statistics', 'Spanish', 'Physics', 'Essay drafting'];

/** A friend added by the user: a simulated study buddy derived from the name. */
export function makeSimFriend(id: string, name: string): Friend {
  const h = hashString(id + name);
  const pick = (salt: number) => SUBJECT_POOL[(h >>> salt) % SUBJECT_POOL.length];
  return {
    id,
    name,
    hue: h % 360,
    sharesSubject: h % 3 !== 0,
    sim: {
      periodMin: 150 + (h % 90),
      offsetMin: h % 240,
      studyMin: 45 + ((h >>> 3) % 40),
      subjects: [pick(5), pick(9), pick(13)],
    },
    demo: true,
  };
}

export interface RoomDef {
  id: string;
  name: string;
  blurb: string;
  mode: 'pomodoro' | 'stopwatch';
  focusMin?: number;
  breakMin?: number;
}

export const ROOMS: RoomDef[] = [
  { id: 'quiet-library', name: 'Quiet Library', blurb: 'Silent focus in 25-minute blocks with 5-minute breaks.', mode: 'pomodoro', focusMin: 25, breakMin: 5 },
  { id: 'deep-work', name: 'Deep Work', blurb: 'Longer blocks: 50 minutes on, 10 off.', mode: 'pomodoro', focusMin: 50, breakMin: 10 },
  { id: 'open-desk', name: 'Open Desk', blurb: 'No structure. Just a stopwatch and company.', mode: 'stopwatch' },
];

/** Which simulated room a studying friend appears in. */
export function roomOf(f: Pick<Friend, 'id'>): string {
  return ROOMS[hashString(f.id) % ROOMS.length].id;
}
