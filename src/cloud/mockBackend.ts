/**
 * DEVELOPMENT ONLY. An in-memory stand-in for the Supabase backend so the friends UI can be tried without a
 * project: run `npm run dev` and open http://localhost:5173/?mockcloud=1. It is never included in production builds.
 *
 * Friend codes to try:  482913 (Ava, studying)   715204 (Ben, online)   690138 (Chloe, finished)
 * Eight wrong codes in a session trigger the rate limit.
 */
import { CloudError, type AddFriendResult, type CloudBackend, type CloudProfile, type CloudUser, type RemoteFriend } from './types';

const KEY = 'hexagon.mockcloud';

interface Person {
  friendshipId: string;
  id: string;
  name: string;
  code: string;
  state: RemoteFriend['state'];
  subject: string | null;
  sessionMs: number;
  roomId: string | null;
}
interface Db {
  user: CloudUser | null;
  profile: CloudProfile | null;
  friendIds: string[];
  wrongGuesses: number;
}

const PEOPLE: Person[] = [
  { friendshipId: 'f-ava', id: 'u-ava', name: 'Ava', code: '482913', state: 'studying', subject: 'Organic chemistry', sessionMs: 41 * 60_000, roomId: 'quiet-library' },
  { friendshipId: 'f-ben', id: 'u-ben', name: 'Ben', code: '715204', state: 'online', subject: null, sessionMs: 0, roomId: null },
  { friendshipId: 'f-chloe', id: 'u-chloe', name: 'Chloe', code: '690138', state: 'finished', subject: 'Statistics', sessionMs: 55 * 60_000, roomId: null },
];

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    /* fall through */
  }
  return { user: null, profile: null, friendIds: [], wrongGuesses: 0 };
}
const save = (db: Db) => localStorage.setItem(KEY, JSON.stringify(db));
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

export function createMockBackend(): CloudBackend {
  let db = load();
  const need = () => {
    if (!db.user) throw new CloudError('Your friends account was reset. Please turn friends on again.', 'auth');
    return db.user;
  };

  return {
    async getUser() {
      return db.user;
    },
    async signInAnonymously() {
      await wait();
      db.user = { id: 'u-me' };
      save(db);
      return db.user;
    },
    async signOut() {
      db = { user: null, profile: null, friendIds: [], wrongGuesses: 0 };
      save(db);
    },
    onSignedOut() {
      return () => undefined;
    },

    async getProfile() {
      need();
      await wait(120);
      return db.profile;
    },
    async saveProfile(displayName) {
      const u = need();
      await wait();
      db.profile = db.profile ? { ...db.profile, displayName } : { id: u.id, displayName, friendCode: '207364', sharePresence: false, shareSubject: false };
      save(db);
      return db.profile;
    },
    async regenerateCode() {
      need();
      await wait();
      if (!db.profile) throw new CloudError('Create your profile first', 'validation');
      const code = String(100000 + Math.floor(Math.random() * 900000));
      db.profile = { ...db.profile, friendCode: code };
      save(db);
      return code;
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
      return PEOPLE.filter((p) => db.friendIds.includes(p.id)).map((p) => ({
        friendshipId: p.friendshipId,
        id: p.id,
        name: p.name,
        state: p.state,
        subject: p.subject,
        sessionMs: p.sessionMs,
        roomId: p.roomId,
        updatedAt: now,
      }));
    },
    async addFriendByCode(code): Promise<AddFriendResult> {
      need();
      await wait();
      const digits = code.replace(/\D/g, '');
      if (db.wrongGuesses >= 8) return { status: 'limited' };
      if (db.profile && digits === db.profile.friendCode) return { status: 'self' };
      const person = PEOPLE.find((p) => p.code === digits);
      if (!person) {
        db.wrongGuesses++;
        save(db);
        return { status: 'not_found' };
      }
      if (db.friendIds.includes(person.id)) return { status: 'already', name: person.name };
      db.friendIds.push(person.id);
      save(db);
      return { status: 'added', name: person.name };
    },
    async removeFriendship(id) {
      need();
      await wait(150);
      const p = PEOPLE.find((x) => x.friendshipId === id);
      if (p) db.friendIds = db.friendIds.filter((x) => x !== p.id);
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
      db = { user: db.user, profile: null, friendIds: [], wrongGuesses: 0 };
      save(db);
    },
  };
}
