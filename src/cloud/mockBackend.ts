/**
 * DEVELOPMENT ONLY. An in-memory stand-in for the Supabase backend so the real-friends UI can be tried without a
 * project: run `npm run dev` and open http://localhost:5173/?mockcloud=1. It is never included in production builds.
 *
 * Any email works. The sign-in code is always 123456.
 * Friend codes to try:  AVAX2345 (accepts after ~4 s)   BENX2345 (stays pending)   CHXE2345 (already asked you; shows under Requests)
 */
import { CloudError, type CloudBackend, type CloudProfile, type CloudUser, type FriendRequest, type RemoteFriend } from './types';

const KEY = 'hexagon.mockcloud';

interface MockFriend {
  friendshipId: string;
  id: string;
  name: string;
  code: string;
  status: 'accepted' | 'pending-out' | 'pending-in';
  state: RemoteFriend['state'];
  subject: string | null;
  sessionMs: number;
  roomId: string | null;
}
interface Db {
  user: CloudUser | null;
  profile: CloudProfile | null;
  friends: MockFriend[];
}

const people = (): MockFriend[] => [
  { friendshipId: 'f-ava', id: 'u-ava', name: 'Ava', code: 'AVAX2345', status: 'pending-out', state: 'studying', subject: 'Organic chemistry', sessionMs: 41 * 60_000, roomId: 'quiet-library' },
  { friendshipId: 'f-ben', id: 'u-ben', name: 'Ben', code: 'BENX2345', status: 'pending-out', state: 'online', subject: null, sessionMs: 0, roomId: null },
  { friendshipId: 'f-chloe', id: 'u-chloe', name: 'Chloe', code: 'CHXE2345', status: 'pending-in', state: 'finished', subject: 'Statistics', sessionMs: 55 * 60_000, roomId: null },
];

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    /* fall through */
  }
  return { user: null, profile: null, friends: [] };
}
const save = (db: Db) => localStorage.setItem(KEY, JSON.stringify(db));
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

export function createMockBackend(): CloudBackend {
  let db = load();
  const signedOutListeners = new Set<() => void>();
  const need = () => {
    if (!db.user) throw new CloudError('You’ve been signed out. Please sign in again.', 'auth');
    return db.user;
  };

  return {
    async getUser() {
      return db.user;
    },
    async sendCode() {
      await wait();
    },
    async verifyCode(email, code) {
      await wait();
      if (code.replace(/\s/g, '') !== '123456') throw new CloudError('That code is wrong or has expired. Request a new one.', 'auth');
      db.user = { id: 'u-me', email };
      // A request from Chloe is waiting, so the Requests UI is visible straight away.
      if (!db.friends.some((f) => f.id === 'u-chloe')) db.friends.push(people()[2]);
      save(db);
      return db.user;
    },
    async signOut() {
      db = { user: null, profile: null, friends: [] };
      save(db);
      signedOutListeners.forEach((cb) => cb());
    },
    onSignedOut(cb) {
      signedOutListeners.add(cb);
      return () => signedOutListeners.delete(cb);
    },

    async getProfile() {
      need();
      await wait(120);
      return db.profile;
    },
    async saveProfile(displayName) {
      const u = need();
      await wait();
      db.profile = db.profile
        ? { ...db.profile, displayName }
        : { id: u.id, displayName, friendCode: 'ME2X7K9P', sharePresence: false, shareSubject: false };
      save(db);
      return db.profile;
    },
    async setSharing(sharePresence, shareSubject) {
      need();
      if (db.profile) db.profile = { ...db.profile, sharePresence, shareSubject: sharePresence && shareSubject };
      save(db);
    },

    async listFriends() {
      need();
      await wait(150);
      const now = new Date().toISOString();
      return db.friends
        .filter((f) => f.status === 'accepted')
        .map((f) => ({ friendshipId: f.friendshipId, id: f.id, name: f.name, state: f.state, subject: f.subject, sessionMs: f.sessionMs, roomId: f.roomId, updatedAt: now }));
    },
    async listRequests() {
      need();
      await wait(120);
      return db.friends
        .filter((f) => f.status !== 'accepted')
        .map<FriendRequest>((f) => ({ id: f.friendshipId, direction: f.status === 'pending-in' ? 'incoming' : 'outgoing', name: f.name, createdAt: new Date().toISOString() }));
    },
    async sendRequest(code) {
      need();
      await wait();
      if (!db.profile) throw new CloudError('Create your profile first', 'validation');
      if (code === db.profile.friendCode) throw new CloudError('That is your own code', 'validation');
      const person = people().find((p) => p.code === code);
      if (!person) throw new CloudError('No one has that friend code', 'validation');
      const existing = db.friends.find((f) => f.id === person.id);
      if (existing?.status === 'accepted') throw new CloudError('You are already friends', 'validation');
      if (existing?.status === 'pending-out') throw new CloudError('Request already sent', 'validation');
      if (existing?.status === 'pending-in') {
        existing.status = 'accepted';
        save(db);
        return 'accepted';
      }
      db.friends.push({ ...person, status: person.code === 'CHXE2345' ? 'accepted' : 'pending-out' });
      save(db);
      if (person.code === 'AVAX2345') {
        setTimeout(() => {
          const f = db.friends.find((x) => x.id === 'u-ava');
          if (f && f.status === 'pending-out') {
            f.status = 'accepted';
            save(db);
          }
        }, 4000);
      }
      return person.code === 'CHXE2345' ? 'accepted' : 'sent';
    },
    async respond(requestId, accept) {
      need();
      await wait();
      const f = db.friends.find((x) => x.friendshipId === requestId && x.status === 'pending-in');
      if (!f) throw new CloudError('That request no longer exists', 'validation');
      if (accept) f.status = 'accepted';
      else db.friends = db.friends.filter((x) => x !== f);
      save(db);
    },
    async removeFriendship(id) {
      need();
      await wait(150);
      db.friends = db.friends.filter((f) => f.friendshipId !== id);
      save(db);
    },

    async setPresence() {
      need();
    },
    async clearPresence() {
      need();
    },
    async deleteMyData() {
      need();
      db = { user: db.user, profile: null, friends: [] };
      save(db);
    },
  };
}
