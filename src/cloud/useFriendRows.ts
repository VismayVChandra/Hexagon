import { useMemo } from 'react';
import type { FriendState } from '../types';
import { useStore } from '../store/store';
import { useCloud } from './cloud';
import { cloudConfigured } from './config';
import { effectiveSessionMs, effectiveState } from './presence';
import { friendPresence, roomOf } from '../data/friendsSim';
import { hashString } from '../lib/id';

/** One friend, whether they are a real account or a simulated demo buddy. */
export interface FriendRow {
  id: string;
  name: string;
  hue: number;
  state: FriendState;
  /** Time studied so far (studying) or in the session just finished (finished). */
  sessionMs: number;
  /** Only present when the friend chose to share it. */
  subject?: string;
  /** Which shared room they're in right now, if any. */
  roomId?: string;
  /** What to pass to remove/cancel: a friendship id (live) or friend id (demo). */
  removeId: string;
  demo: boolean;
}

const ORDER: Record<FriendState, number> = { studying: 0, finished: 1, online: 2, offline: 3 };

/**
 * Real friends when signed in to the cloud, otherwise the simulated demo friends.
 * Pass `now` from a component's useNow so states expire on time.
 */
export function useFriendRows(now: number): { live: boolean; rows: FriendRow[] } {
  const { data } = useStore();
  const cloud = useCloud();
  const live = cloudConfigured && cloud.phase === 'signed-in';

  const rows = useMemo<FriendRow[]>(() => {
    const list: FriendRow[] = live
      ? cloud.friends.map((f) => {
          const state = effectiveState(f, now);
          const active = state === 'studying' || state === 'finished';
          return {
            id: f.id,
            name: f.name,
            hue: hashString(f.id) % 360,
            state,
            sessionMs: effectiveSessionMs(f, now),
            subject: active && f.subject ? f.subject : undefined,
            roomId: state === 'studying' && f.roomId ? f.roomId : undefined,
            removeId: f.friendshipId,
            demo: false,
          };
        })
      : data.friends.map((f) => {
          const p = friendPresence(f, now);
          return { id: f.id, name: f.name, hue: f.hue, state: p.state, sessionMs: p.sessionMs, subject: p.subject, roomId: p.state === 'studying' ? roomOf(f) : undefined, removeId: f.id, demo: true };
        });
    return list.sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name));
  }, [live, cloud.friends, data.friends, now]);

  return { live, rows };
}
