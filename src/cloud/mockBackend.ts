/**
 * DEVELOPMENT ONLY. An in-memory stand-in for the Supabase backend so the friends UI can be tried without a
 * project: run `npm run dev` and open http://localhost:5173/?mockcloud=1. It is never included in production builds.
 *
 * Sign up with any email. The "confirmation link" is simulated: the account becomes confirmed 3 seconds after sign-up.
 * Use an email containing "+instant" (e.g. me+instant@example.com) to simulate a project with confirmation switched off.
 * Accounts live in localStorage, so signing out and back in keeps your code and friends, like the real thing.
 *
 * Friend codes to try:  482913 (Ava, studying)   715204 (Ben, online)   690138 (Chloe, finished)
 * Eight wrong codes in a session trigger the rate limit.
 */
import { CloudError, type AddFriendResult, type CloudBackend, type CloudProfile, type CloudUser, type RemoteFriend } from './types';

const KEY = 'hexagon.mockcloud2';

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
interface Account {
  id: string;
  email: string;
  password: string;
  confirmed: boolean;
  profile: CloudProfile | null;
  friendIds: string[];
  wrongGuesses: number;
}
interface Db {
  accounts: Record<string, Account>;
  session: string | null;
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
  return { accounts: {}, session: null };
}
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

export function createMockBackend(): CloudBackend {
  const db = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(db));
  const me = (): Account => {
    const a = db.session ? db.accounts[db.session] : undefined;
    if (!a) throw new CloudError('You’ve been signed out. Please sign in again.', 'auth');
    return a;
  };
  const userOf = (a: Account): CloudUser => ({ id: a.id, email: a.email });

  return {
    async getUser() {
      const a = db.session ? db.accounts[db.session] : undefined;
      return a ? userOf(a) : null;
    },
    async signUp(email, password) {
      await wait();
      if (db.accounts[email]) throw new CloudError('That email already has an account. Try signing in instead.', 'validation');
      const instant = email.includes('+instant');
      db.accounts[email] = { id: `u-${Object.keys(db.accounts).length + 1}`, email, password, confirmed: instant, profile: null, friendIds: [], wrongGuesses: 0 };
      save();
      if (instant) {
        db.session = email;
        save();
        return { status: 'signed-in', user: userOf(db.accounts[email]) };
      }
      // Pretend the person taps the link in their email a few seconds later.
      setTimeout(() => {
        if (db.accounts[email]) {
          db.accounts[email].confirmed = true;
          save();
        }
      }, 3000);
      return { status: 'confirm-email' };
    },
    async signIn(email, password) {
      await wait();
      const a = db.accounts[email];
      if (!a || a.password !== password) throw new CloudError('Wrong email or password.', 'auth');
      if (!a.confirmed) throw new CloudError('Please confirm your email first. Tap the link we sent you, then sign in.', 'unconfirmed');
      db.session = email;
      save();
      return userOf(a);
    },
    async resendConfirmation() {
      await wait();
    },
    async sendPasswordReset() {
      await wait();
    },
    async setSession() {
      await wait();
      const email = 'link@example.com';
      db.accounts[email] ??= { id: 'u-link', email, password: 'password123', confirmed: true, profile: null, friendIds: [], wrongGuesses: 0 };
      db.session = email;
      save();
      return userOf(db.accounts[email]);
    },
    async updatePassword(newPassword) {
      me().password = newPassword;
      save();
    },
    async signOut() {
      db.session = null;
      save();
    },
    onSignedOut() {
      return () => undefined;
    },

    async getProfile() {
      const a = me();
      await wait(120);
      return a.profile;
    },
    async saveProfile(displayName) {
      const a = me();
      await wait();
      a.profile = a.profile ? { ...a.profile, displayName } : { id: a.id, displayName, friendCode: String(207364 + Object.keys(db.accounts).indexOf(a.email) * 1111), sharePresence: false, shareSubject: false };
      save();
      return a.profile;
    },
    async regenerateCode() {
      const a = me();
      await wait();
      if (!a.profile) throw new CloudError('Create your profile first', 'validation');
      a.profile = { ...a.profile, friendCode: String(100000 + Math.floor(Math.random() * 900000)) };
      save();
      return a.profile.friendCode;
    },
    async setSharing(sharePresence, shareSubject) {
      const a = me();
      if (a.profile) a.profile = { ...a.profile, sharePresence, shareSubject: sharePresence && shareSubject };
      save();
    },

    async listFriends() {
      const a = me();
      await wait(150);
      const now = new Date().toISOString();
      return PEOPLE.filter((p) => a.friendIds.includes(p.id)).map((p) => ({
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
      const a = me();
      await wait();
      const digits = code.replace(/\D/g, '');
      if (a.wrongGuesses >= 8) return { status: 'limited' };
      if (a.profile && digits === a.profile.friendCode) return { status: 'self' };
      const person = PEOPLE.find((p) => p.code === digits);
      if (!person) {
        a.wrongGuesses++;
        save();
        return { status: 'not_found' };
      }
      if (a.friendIds.includes(person.id)) return { status: 'already', name: person.name };
      a.friendIds.push(person.id);
      save();
      return { status: 'added', name: person.name };
    },
    async removeFriendship(id) {
      const a = me();
      await wait(150);
      const p = PEOPLE.find((x) => x.friendshipId === id);
      if (p) a.friendIds = a.friendIds.filter((x) => x !== p.id);
      save();
    },

    async setPresence() {
      me();
    },
    async clearPresence() {
      me();
    },
    async deleteMyData() {
      const a = me();
      a.profile = null;
      a.friendIds = [];
      save();
    },
  };
}
