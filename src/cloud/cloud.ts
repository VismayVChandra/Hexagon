import { useSyncExternalStore } from 'react';
import { USE_MOCK, cloudConfigured } from './config';
import { CloudError, type CloudBackend, type CloudProfile, type CloudUser, type RemoteFriend } from './types';
import { HEARTBEAT_MS, desiredPresence, normalizeFriendCode, type PresenceInputs } from './presence';
import { isValidEmail, passwordProblem } from './validate';
import { takeAuthRedirect } from './authRedirect';
import { analytics } from './analytics';
import { flushDataSync, isNewHere, startDataSync, stopDataSync, wipeCloudCopy } from './dataSync';
import type { AdminStats } from './adminStats';
import { getState as getMain, subscribe as subscribeMain, updateSettings } from '../store/store';
import { showToast } from '../hooks/hooks';
import { computeView } from '../lib/timer';

/**
 * Friends with a real account: email + password (Supabase Auth), so a student keeps their 6-digit code and friends when
 * they clear site data or switch phones, by signing in again. Typing a friend's code makes you friends instantly.
 */
export type CloudPhase = 'off' | 'starting' | 'signed-out' | 'check-email' | 'reset-password' | 'needs-name' | 'signed-in';

export interface CloudState {
  phase: CloudPhase;
  /** The email being signed up / signed in. */
  email: string;
  profile: CloudProfile | null;
  friends: RemoteFriend[];
  /** A message for the current step. */
  error: string | null;
  /** A positive message for the current step (e.g. "Email confirmed"). */
  notice: string | null;
  busy: boolean;
  /** The last refresh failed (offline, server hiccup). Data shown may be stale. */
  syncError: boolean;
  lastSyncAt: number | null;
  /** A code from an invite link, waiting until friends is turned on. */
  pendingInvite: string | null;
  /** This account is the app's owner and can open the dashboard. */
  isAdmin: boolean;
}

const CACHE_KEY = 'hexagon.cloud.cache';
const INVITE_KEY = 'hexagon.invite';
const POLL_MS = 20_000;

let state: CloudState = {
  phase: cloudConfigured ? 'starting' : 'off',
  email: '',
  profile: null,
  friends: [],
  error: null,
  notice: null,
  busy: false,
  syncError: false,
  lastSyncAt: null,
  pendingInvite: readInvite(),
  isAdmin: false,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<CloudState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
export const getCloud = () => state;
export const subscribeCloud = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useCloud = (): CloudState => useSyncExternalStore(subscribeCloud, getCloud, getCloud);

// ---------- small storage helpers ----------

function readInvite(): string | null {
  try {
    return sessionStorage.getItem(INVITE_KEY);
  } catch {
    return null;
  }
}
export function setPendingInvite(code: string | null) {
  try {
    if (code) sessionStorage.setItem(INVITE_KEY, code);
    else sessionStorage.removeItem(INVITE_KEY);
  } catch {
    /* optional */
  }
  set({ pendingInvite: code });
}

interface Cache {
  profile: CloudProfile;
  friends: RemoteFriend[];
}
function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cache) : null;
  } catch {
    return null;
  }
}
function writeCache() {
  try {
    if (state.profile) localStorage.setItem(CACHE_KEY, JSON.stringify({ profile: state.profile, friends: state.friends } satisfies Cache));
  } catch {
    /* optional */
  }
}
const clearCache = () => {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* optional */
  }
};

// ---------- backend ----------

let backendPromise: Promise<CloudBackend> | null = null;
let backendRef: CloudBackend | null = null;

function loadBackend(): Promise<CloudBackend> {
  backendPromise ??= (async () => {
    if (import.meta.env.DEV && USE_MOCK) return (await import('./mockBackend')).createMockBackend();
    return (await import('./supabaseBackend')).createSupabaseBackend();
  })().then((b) => (backendRef = b));
  backendPromise.catch(() => {
    backendPromise = null; // allow a retry (e.g. the SDK failed to download while offline)
  });
  return backendPromise;
}

const messageOf = (e: unknown) => (e instanceof CloudError ? e.message : e instanceof Error ? e.message : 'Something went wrong');

// ---------- account ----------

let started = false;
const HAD_ACCOUNT_KEY = 'hexagon.hadAccount';

/** True once someone has signed in on this device, so the form can default to "Sign in" instead of "Create account". */
export function hadAccount(): boolean {
  try {
    return localStorage.getItem(HAD_ACCOUNT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Where email links should send people back to: this app's own address. */
const redirectTo = () => `${location.origin}${location.pathname}`;

export async function initCloud() {
  if (!cloudConfigured || started) return;
  started = true;
  const redirect = takeAuthRedirect(); // set when the person arrived by tapping a link in an email
  try {
    const b = await loadBackend();
    analytics.attach(b); // anonymous usage counts waiting to be sent (unless the person switched them off)
    b.onSignedOut(() => {
      if (state.phase === 'signed-in') void handleAccountLost();
    });
    let user: CloudUser | null = null;
    if (redirect?.accessToken && redirect.refreshToken) {
      try {
        user = await b.setSession(redirect.accessToken, redirect.refreshToken);
      } catch {
        redirect.error = 'That email link didn’t work. Try signing in with your email and password.';
      }
      if (user && redirect.type === 'recovery') return set({ email: user.email, phase: 'reset-password' });
      if (user) set({ notice: 'Email confirmed. You’re signed in.' });
    } else {
      user = await b.getUser();
    }
    if (!user) return set({ phase: 'signed-out', error: redirect?.error ?? null });
    await enterAccount(b, user);
  } catch (e) {
    // Offline or the server is unreachable: fall back to what we last knew.
    const cache = readCache();
    if (cache) {
      set({ phase: 'signed-in', profile: cache.profile, friends: cache.friends, syncError: true });
      startSync();
    } else {
      set({ phase: 'signed-out', error: messageOf(e) });
    }
  }
}

async function enterAccount(b: CloudBackend, user: CloudUser) {
  try {
    localStorage.setItem(HAD_ACCOUNT_KEY, '1');
  } catch {
    /* optional */
  }
  set({ email: user.email });
  void checkAdmin(b);
  const profile = await b.getProfile();
  if (!profile) return set({ phase: 'needs-name', error: null });
  // A device that has never been signed in to this account takes the privacy choices already made on it (they are kept on the server).
  if (isNewHere(profile.id)) updateSettings({ sharePresence: profile.sharePresence, shareSubject: profile.shareSubject });
  set({ phase: 'signed-in', profile, error: null });
  startSync();
}

/** Ask the server whether this account is the owner. Quietly false if the setup SQL is older or the server is unreachable. */
async function checkAdmin(b: CloudBackend) {
  try {
    set({ isAdmin: await b.isAdmin() });
  } catch {
    set({ isAdmin: false });
  }
}

/** Totals for the owner dashboard. Throws a friendly CloudError if this account isn't the owner. */
export async function loadAdminStats(): Promise<AdminStats> {
  const b = await loadBackend();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  try {
    return await b.adminStats(tz); // already converted to safe numbers by the backend
  } catch (e) {
    throw e instanceof CloudError ? e : new CloudError(messageOf(e));
  }
}

async function guarded(fn: () => Promise<void>) {
  set({ busy: true, error: null });
  try {
    await fn();
  } catch (e) {
    set({ error: messageOf(e) });
  } finally {
    set({ busy: false });
  }
}

export async function signUp(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!isValidEmail(email)) return set({ error: 'Enter a valid email address.' });
  const problem = passwordProblem(password);
  if (problem) return set({ error: problem });
  await guarded(async () => {
    const b = await loadBackend();
    const r = await b.signUp(email, password, redirectTo());
    if (r.status === 'signed-in') await enterAccount(b, r.user);
    else set({ phase: 'check-email', email, notice: null });
  });
}

export async function signIn(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!isValidEmail(email)) return set({ error: 'Enter a valid email address.' });
  if (!password) return set({ error: 'Enter your password.' });
  set({ busy: true, error: null, notice: null });
  try {
    const b = await loadBackend();
    const user = await b.signIn(email, password);
    await enterAccount(b, user);
  } catch (e) {
    if (e instanceof CloudError && e.kind === 'unconfirmed') set({ phase: 'check-email', email, notice: e.message });
    else set({ error: messageOf(e) });
  } finally {
    set({ busy: false });
  }
}

export async function resendConfirmation() {
  await guarded(async () => {
    const b = await loadBackend();
    await b.resendConfirmation(state.email, redirectTo());
    set({ notice: 'Sent again. Check your inbox, and your spam folder.' });
  });
}

export async function sendPasswordReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!isValidEmail(email)) return set({ error: 'Enter a valid email address.' });
  await guarded(async () => {
    const b = await loadBackend();
    await b.sendPasswordReset(email, redirectTo());
    // Same message whether or not the address has an account, so this can't be used to check who is registered.
    set({ notice: 'If that email has an account, a reset link is on its way. Check your spam folder too.' });
  });
}

export async function setNewPassword(password: string) {
  const problem = passwordProblem(password);
  if (problem) return set({ error: problem });
  await guarded(async () => {
    const b = await loadBackend();
    await b.updatePassword(password);
    const user = await b.getUser();
    if (!user) throw new CloudError('You’ve been signed out. Please sign in again.', 'auth');
    set({ notice: 'Password updated.' });
    await enterAccount(b, user);
  });
}

export function backToSignIn() {
  set({ phase: 'signed-out', error: null, notice: null });
}

/** After sign-in, a first-time account chooses a name (this creates the profile and the friend code). */
export async function saveName(nameRaw: string) {
  const name = nameRaw.trim();
  if (name.length < 1 || name.length > 30) return set({ error: 'Your name should be 1 to 30 characters.' });
  await guarded(async () => {
    const b = await loadBackend();
    const profile = await b.saveProfile(name);
    set({ profile, phase: 'signed-in', notice: null });
    writeCache();
    startSync(); // may clear another account's data from this device first,
    updateSettings({ displayName: name }); // so the new name is set afterwards
  });
}

/** Sign out of this device. The account, code and friends stay, and come back when signing in again. */
export async function signOut() {
  await guarded(async () => {
    const b = await loadBackend();
    await flushDataSync(); // whatever hasn't gone up yet goes now, so nothing is lost
    stopSync();
    await b.clearPresence().catch(() => undefined);
    await b.signOut();
    clearCache();
    set({ phase: 'signed-out', profile: null, friends: [], email: '', notice: null, isAdmin: false });
  });
}

async function handleAccountLost(message?: string) {
  stopSync();
  clearCache();
  set({ phase: 'signed-out', profile: null, friends: [], syncError: false, error: message ?? null, notice: null, isAdmin: false });
}

/** Remove my name, code, friendships and status from the server, and sign out. (The email account itself can be reused.) */
export async function deleteCloudData() {
  await guarded(async () => {
    const b = await loadBackend();
    await flushDataSync();
    stopSync();
    await b.deleteMyData();
    await b.signOut();
    clearCache();
    set({ phase: 'signed-out', profile: null, friends: [], email: '', notice: null, isAdmin: false });
  });
}

// ---------- study data in the account ----------

/** Turn syncing of study data on or off for this device. Off keeps this device's data as it is and stops sending or receiving. */
export function setCloudSync(on: boolean) {
  updateSettings({ cloudSync: on });
  if (!on) stopDataSync();
  else if (state.phase === 'signed-in' && state.profile && backendRef) startDataSync(backendRef, state.profile.id, (m) => void handleAccountLost(m));
}

/** Remove the copy of my study data from my account (and switch syncing off here). This device keeps its own data. */
export async function deleteSyncedCopy(): Promise<ActionResult> {
  try {
    const b = await loadBackend();
    setCloudSync(false);
    await wipeCloudCopy(b);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/** "Delete everything" on this device: if the account holds a copy, it goes too, otherwise it would simply come back. */
export async function eraseSyncedCopyIfAny(): Promise<void> {
  if (state.phase !== 'signed-in' || !backendRef) return;
  try {
    await wipeCloudCopy(backendRef);
  } catch {
    /* offline: the copy stays and this device will pick it up again, which the person can see */
  }
}

// ---------- friends ----------

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** Friends I just added myself, so the "added you" notice doesn't fire for them. */
const selfAdded = new Set<string>();

async function act(fn: (b: CloudBackend) => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    const b = await loadBackend();
    const r = await fn(b);
    await refresh();
    return r ?? { ok: true };
  } catch (e) {
    if (e instanceof CloudError && e.kind === 'auth') void handleAccountLost(e.message);
    return { ok: false, error: messageOf(e) };
  }
}

export function addFriendByCode(raw: string): Promise<ActionResult> {
  const code = normalizeFriendCode(raw);
  if (!code) return Promise.resolve({ ok: false, error: 'Friend codes are 6 digits, like 482 913.' });
  if (code === state.profile?.friendCode) return Promise.resolve({ ok: false, error: 'That’s your own code. Share it with a friend instead.' });
  return act(async (b) => {
    const r = await b.addFriendByCode(code);
    switch (r.status) {
      case 'added':
        selfAdded.add(r.name);
        return { ok: true, message: `You and ${r.name} are now friends.` };
      case 'already':
        return { ok: false, error: `You’re already friends with ${r.name}.` };
      case 'self':
        return { ok: false, error: 'That’s your own code. Share it with a friend instead.' };
      case 'limited':
        return { ok: false, error: 'Too many wrong codes. Please try again in an hour.' };
      default:
        return { ok: false, error: 'No one has that code. Check it with your friend, since codes can be replaced.' };
    }
  });
}

export const removeFriendship = (id: string) => act((b) => b.removeFriendship(id));

export async function regenerateCode(): Promise<ActionResult> {
  try {
    const b = await loadBackend();
    const friendCode = await b.regenerateCode();
    if (state.profile) set({ profile: { ...state.profile, friendCode } });
    writeCache();
    return { ok: true, message: 'New code ready. The old one no longer works.' };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

export async function renameSelf(nameRaw: string): Promise<ActionResult> {
  const name = nameRaw.trim();
  if (name.length < 1 || name.length > 30) return { ok: false, error: 'Your name should be 1 to 30 characters.' };
  try {
    const b = await loadBackend();
    const profile = await b.saveProfile(name);
    updateSettings({ displayName: name });
    set({ profile });
    writeCache();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

export async function refresh() {
  const b = backendRef;
  if (!b || state.phase !== 'signed-in') return;
  try {
    const [friends, profile] = await Promise.all([b.listFriends(), b.getProfile()]);
    // Tell the person when someone adds them using their code (not on the first load, not for friends they added).
    if (state.lastSyncAt != null) {
      const known = new Set(state.friends.map((f) => f.id));
      for (const f of friends) {
        if (!known.has(f.id)) {
          if (selfAdded.has(f.name)) selfAdded.delete(f.name);
          else showToast(`${f.name} added you as a friend.`);
        }
      }
    }
    set({ friends, profile: profile ?? state.profile, syncError: false, lastSyncAt: Date.now() });
    writeCache();
  } catch (e) {
    if (e instanceof CloudError && e.kind === 'auth') void handleAccountLost(e.message);
    else set({ syncError: true });
  }
}

// ---------- background sync: polling + publishing my own status ----------

let pollTimer: number | undefined;
let beatTimer: number | undefined;
let unsubMain: (() => void) | undefined;
let visListener: (() => void) | undefined;
let lastSharingKey = '';
let lastPresenceKey = '';
let presenceSet = false;
let prevActiveId: string | null = null;
let finished: PresenceInputs['finished'] = null;

function inputs(): PresenceInputs {
  const m = getMain().data;
  const a = m.active;
  const now = Date.now();
  const view = a ? computeView(a, now) : null;
  return {
    sharing: m.settings.sharePresence,
    shareSubject: m.settings.shareSubject,
    // Break time and a finished countdown are not "studying".
    running: !!a && a.resumedAt != null && view?.phase === 'focus',
    studiedMs: view?.studiedMs ?? 0,
    subjectName: a ? m.subjects.find((s) => s.id === a.subjectId)?.name : undefined,
    roomId: a?.roomId,
    finished,
    now,
  };
}

async function pushPresence(force: boolean) {
  const b = backendRef;
  if (!b || state.phase !== 'signed-in') return;
  const want = desiredPresence(inputs());
  const key = want ? `${want.state}|${want.subject}|${want.roomId}` : 'none';
  if (!force && key === lastPresenceKey) return;
  lastPresenceKey = key;
  try {
    if (!want) {
      if (presenceSet) await b.clearPresence();
      presenceSet = false;
    } else {
      await b.setPresence(want);
      presenceSet = true;
    }
  } catch (e) {
    if (e instanceof CloudError && e.kind === 'auth') void handleAccountLost(e.message);
  }
}

async function pushSharing() {
  const b = backendRef;
  if (!b || state.phase !== 'signed-in') return;
  const s = getMain().data.settings;
  const key = `${s.sharePresence}|${s.shareSubject}`;
  if (key === lastSharingKey) return;
  lastSharingKey = key;
  try {
    await b.setSharing(s.sharePresence, s.shareSubject);
  } catch {
    lastSharingKey = ''; // try again on the next change/heartbeat
  }
  await pushPresence(true);
}

function onLocalChange() {
  const m = getMain().data;
  const activeId = m.active?.id ?? null;
  if (prevActiveId && !activeId) {
    const saved = m.sessions.find((s) => s.id === prevActiveId);
    finished = saved ? { at: Date.now(), studiedMs: saved.studiedMs, subjectName: m.subjects.find((s) => s.id === saved.subjectId)?.name } : null;
  }
  prevActiveId = activeId;
  void pushSharing().then(() => pushPresence(false));
}

function startSync() {
  stopSync();
  prevActiveId = getMain().data.active?.id ?? null;
  void refresh();
  void pushSharing().then(() => pushPresence(true));
  pollTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void refresh();
  }, POLL_MS);
  beatTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void pushPresence(true);
  }, HEARTBEAT_MS);
  unsubMain = subscribeMain(onLocalChange);
  if (state.profile && backendRef) startDataSync(backendRef, state.profile.id, (m) => void handleAccountLost(m));
  visListener = () => {
    if (document.visibilityState === 'visible') {
      void refresh();
      void pushPresence(true);
    }
  };
  document.addEventListener('visibilitychange', visListener);
}

function stopSync() {
  stopDataSync();
  window.clearInterval(pollTimer);
  window.clearInterval(beatTimer);
  unsubMain?.();
  unsubMain = undefined;
  if (visListener) document.removeEventListener('visibilitychange', visListener);
  visListener = undefined;
  lastSharingKey = '';
  lastPresenceKey = '';
  presenceSet = false;
  finished = null;
}
