import { useSyncExternalStore } from 'react';
import { USE_MOCK, cloudConfigured } from './config';
import { CloudError, type CloudBackend, type CloudProfile, type CloudUser, type FriendRequest, type RemoteFriend } from './types';
import { HEARTBEAT_MS, desiredPresence, isValidEmail, normalizeFriendCode, type PresenceInputs } from './presence';
import { takeAuthRedirect } from './authRedirect';
import { getState as getMain, subscribe as subscribeMain, updateSettings } from '../store/store';
import { computeView } from '../lib/timer';

export type CloudPhase = 'off' | 'starting' | 'signed-out' | 'code-sent' | 'needs-name' | 'signed-in';

export interface CloudState {
  phase: CloudPhase;
  email: string;
  profile: CloudProfile | null;
  friends: RemoteFriend[];
  requests: FriendRequest[];
  /** A message for the current step (sign-in errors etc.). */
  error: string | null;
  busy: boolean;
  /** The last refresh failed (offline, server hiccup). Data shown may be stale. */
  syncError: boolean;
  lastSyncAt: number | null;
  /** A friend code from an invite link, waiting for the person to sign in. */
  pendingInvite: string | null;
}

const CACHE_KEY = 'hexagon.cloud.cache';
const INVITE_KEY = 'hexagon.invite';
const POLL_MS = 20_000;

let state: CloudState = {
  phase: cloudConfigured ? 'starting' : 'off',
  email: '',
  profile: null,
  friends: [],
  requests: [],
  error: null,
  busy: false,
  syncError: false,
  lastSyncAt: null,
  pendingInvite: readInvite(),
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
  requests: FriendRequest[];
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
    if (state.profile) localStorage.setItem(CACHE_KEY, JSON.stringify({ profile: state.profile, friends: state.friends, requests: state.requests } satisfies Cache));
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

// ---------- sign-in ----------

let started = false;

export async function initCloud() {
  if (!cloudConfigured || started) return;
  started = true;
  const redirect = takeAuthRedirect(); // set when the person arrived by clicking a link in the sign-in email
  try {
    const b = await loadBackend();
    b.onSignedOut(() => {
      if (state.phase === 'signed-in') void handleSignedOut();
    });
    let user: CloudUser | null;
    if (redirect?.accessToken && redirect.refreshToken) {
      try {
        user = await b.setSession(redirect.accessToken, redirect.refreshToken);
      } catch {
        user = null;
        redirect.error = 'That sign-in link didn’t work. Request a new code and type it in here instead.';
      }
    } else {
      user = await b.getUser();
    }
    if (!user) return set({ phase: 'signed-out', error: redirect?.error ?? null });
    set({ email: user.email });
    await enterAccount(b, user);
  } catch (e) {
    // Offline or the server is unreachable: fall back to what we last knew.
    const cache = readCache();
    if (cache) {
      set({ phase: 'signed-in', profile: cache.profile, friends: cache.friends, requests: cache.requests, syncError: true });
      startSync();
    } else {
      set({ phase: 'signed-out', error: messageOf(e) });
    }
  }
}

async function enterAccount(b: CloudBackend, user: CloudUser) {
  const profile = await b.getProfile();
  set({ email: user.email });
  if (!profile) return set({ phase: 'needs-name', error: null });
  set({ phase: 'signed-in', profile, error: null });
  startSync();
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

export async function requestCode(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!isValidEmail(email)) return set({ error: 'Enter a valid email address.' });
  await guarded(async () => {
    const b = await loadBackend();
    await b.sendCode(email);
    set({ phase: 'code-sent', email });
  });
}

export async function submitCode(codeRaw: string) {
  const code = codeRaw.replace(/\s+/g, '');
  if (!/^\d{4,10}$/.test(code)) return set({ error: 'Enter the numeric code from the email.' });
  await guarded(async () => {
    const b = await loadBackend();
    const user = await b.verifyCode(state.email, code);
    await enterAccount(b, user);
  });
}

export function backToEmail() {
  set({ phase: 'signed-out', error: null });
}

export async function saveName(nameRaw: string) {
  const name = nameRaw.trim();
  if (name.length < 1 || name.length > 30) return set({ error: 'Your name should be 1 to 30 characters.' });
  await guarded(async () => {
    const b = await loadBackend();
    const profile = await b.saveProfile(name);
    updateSettings({ displayName: name });
    const wasSignedIn = state.phase === 'signed-in';
    set({ profile, phase: 'signed-in' });
    if (!wasSignedIn) startSync();
    writeCache();
  });
}

async function handleSignedOut(message?: string) {
  stopSync();
  clearCache();
  set({ phase: 'signed-out', profile: null, friends: [], requests: [], email: '', syncError: false, error: message ?? null });
}

export async function signOut() {
  await guarded(async () => {
    const b = await loadBackend();
    stopSync();
    await b.clearPresence().catch(() => undefined);
    await b.signOut();
    clearCache();
    set({ phase: 'signed-out', profile: null, friends: [], requests: [], email: '' });
  });
}

export async function deleteCloudData() {
  await guarded(async () => {
    const b = await loadBackend();
    stopSync();
    await b.deleteMyData();
    await b.signOut();
    clearCache();
    set({ phase: 'signed-out', profile: null, friends: [], requests: [], email: '' });
  });
}

// ---------- friends ----------

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function act(fn: (b: CloudBackend) => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    const b = await loadBackend();
    const r = await fn(b);
    await refresh();
    return r ?? { ok: true };
  } catch (e) {
    if (e instanceof CloudError && e.kind === 'auth') void handleSignedOut(e.message);
    return { ok: false, error: messageOf(e) };
  }
}

export function addFriendByCode(raw: string): Promise<ActionResult> {
  const code = normalizeFriendCode(raw);
  if (!code) return Promise.resolve({ ok: false, error: 'Friend codes are 8 letters and numbers, like ABCD-2345.' });
  if (code === state.profile?.friendCode) return Promise.resolve({ ok: false, error: 'That’s your own code.' });
  return act(async (b) => {
    const r = await b.sendRequest(code);
    return { ok: true, message: r === 'accepted' ? 'You’re now friends.' : 'Request sent. They’ll see it next time they open Hexagon.' };
  });
}
export const respondToRequest = (id: string, accept: boolean) => act((b) => b.respond(id, accept));
export const removeFriendship = (id: string) => act((b) => b.removeFriendship(id));

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
    const [friends, requests] = await Promise.all([b.listFriends(), b.listRequests()]);
    set({ friends, requests, syncError: false, lastSyncAt: Date.now() });
    writeCache();
  } catch (e) {
    if (e instanceof CloudError && e.kind === 'auth') void handleSignedOut(e.message);
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
    if (e instanceof CloudError && e.kind === 'auth') void handleSignedOut(e.message);
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
  visListener = () => {
    if (document.visibilityState === 'visible') {
      void refresh();
      void pushPresence(true);
    }
  };
  document.addEventListener('visibilitychange', visListener);
}

function stopSync() {
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
