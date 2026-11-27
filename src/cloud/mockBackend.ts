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
 * Sign up with an email containing "admin" (e.g. admin+instant@example.com) to see the owner dashboard, filled with made-up numbers
 * plus the events this browser records.
 */
import { parseAdminStats } from './adminStats';
import { mulberry32 } from '../lib/id';
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
  /** The synced study data (what Supabase keeps in public.user_data). */
  data?: { rev: number; doc: unknown };
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
const EVENTS_KEY = 'hexagon.mockevents';
const localEvents = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(EVENTS_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

/** Made-up numbers in the shape the server returns, so the dashboard can be tried without a project. Real local events are added on top. */
function fakeStats(events: string[]): unknown {
  const rnd = mulberry32(7);
  const today = new Date();
  const daily = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today.getTime() - (29 - i) * 86_400_000);
    const visitors = Math.round(6 + i * 1.4 + rnd() * 7);
    const newV = Math.round(visitors * (0.75 - i * 0.012) + rnd() * 2);
    const started = Math.round(visitors * (0.5 + rnd() * 0.15));
    return {
      day: d.toISOString().slice(0, 10),
      visitors,
      new_visitors: Math.max(1, newV),
      started,
      finished: Math.round(started * (0.7 + rnd() * 0.25)),
      signups: Math.round(visitors * (0.08 + rnd() * 0.12)),
    };
  });
  const count = (name: string) => events.filter((e) => e === name).length;
  const visitorsTotal = daily.reduce((n, d) => n + d.new_visitors, 0) + count('app_open');
  const accountsTotal = daily.reduce((n, d) => n + d.signups, 0);
  return {
    generated_at: new Date().toISOString(),
    tz: 'UTC',
    tracking_since: daily[0].day + 'T09:00:00Z',
    overview: {
      visitors_total: visitorsTotal,
      visitors_today: daily[29].visitors + count('app_open'),
      visitors_7d: daily.slice(-7).reduce((n, d) => n + d.visitors, 0),
      visitors_30d: visitorsTotal,
      returning_visitors: Math.round(visitorsTotal * 0.42),
      installed: Math.round(visitorsTotal * 0.18),
      started_studying: Math.round(visitorsTotal * 0.61) + count('session_start'),
      finished_session: Math.round(visitorsTotal * 0.47) + count('session_finish'),
      sessions_started: Math.round(visitorsTotal * 2.4) + count('session_start'),
      sessions_finished: Math.round(visitorsTotal * 1.7) + count('session_finish'),
      cars_built: Math.round(visitorsTotal * 0.3) + count('car_built'),
      signed_in_devices: Math.round(accountsTotal * 1.1),
      friend_devices: Math.round(accountsTotal * 0.6),
    },
    accounts: {
      total: accountsTotal,
      confirmed: Math.round(accountsTotal * 0.93),
      named: Math.round(accountsTotal * 0.88),
      with_friends: Math.round(accountsTotal * 0.55),
      friendships: Math.round(accountsTotal * 0.9),
      sharing_status: Math.round(accountsTotal * 0.4),
      sharing_subject: Math.round(accountsTotal * 0.15),
      signups_7d: daily.slice(-7).reduce((n, d) => n + d.signups, 0),
      recent: [
        { at: new Date(today.getTime() - 3_600_000).toISOString(), email: 'sa***@gmail.com', confirmed: true, named: true, friends: 2 },
        { at: new Date(today.getTime() - 9_000_000).toISOString(), email: 'ri***@gmail.com', confirmed: true, named: true, friends: 0 },
        { at: new Date(today.getTime() - 40_000_000).toISOString(), email: 'an***@outlook.com', confirmed: false, named: false, friends: 0 },
        { at: new Date(today.getTime() - 90_000_000).toISOString(), email: 'me***@gmail.com', confirmed: true, named: true, friends: 5 },
      ],
    },
    daily,
  };
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

    async getUserData(sinceRev) {
      const a = me();
      await wait(80);
      if (!a.data) return { rev: 0, doc: null, unchanged: false };
      if (sinceRev != null && sinceRev === a.data.rev) return { rev: a.data.rev, doc: null, unchanged: true };
      return { rev: a.data.rev, doc: a.data.doc, unchanged: false };
    },
    async putUserData(doc, baseRev) {
      const a = me();
      await wait(120);
      const cur = a.data?.rev ?? 0;
      if (cur !== baseRev) return { status: 'conflict', rev: cur };
      a.data = { rev: cur + 1, doc };
      save();
      return { status: 'ok', rev: cur + 1 };
    },
    async deleteUserData() {
      const a = me();
      delete a.data;
      save();
    },

    async logEvent(_deviceId, name) {
      void _deviceId;
      localStorage.setItem(EVENTS_KEY, JSON.stringify([...localEvents(), name].slice(-500)));
    },
    async forgetDevice() {
      localStorage.removeItem(EVENTS_KEY);
    },
    async isAdmin() {
      const a = db.session ? db.accounts[db.session] : undefined;
      return !!a && a.email.includes('admin');
    },
    async adminStats() {
      const a = db.session ? db.accounts[db.session] : undefined;
      if (!a || !a.email.includes('admin')) throw new CloudError('Only the app\u2019s owner can open the dashboard.', 'validation');
      await wait(300);
      return parseAdminStats(fakeStats(localEvents()));
    },
  };
}
