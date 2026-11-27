import { useSyncExternalStore } from 'react';
import { USE_MOCK, cloudConfigured } from './config';
import { CloudError, type CloudBackend, type CloudProfile, type RemoteFriend } from './types';
import { HEARTBEAT_MS, desiredPresence, normalizeFriendCode, type PresenceInputs } from './presence';
import { getState as getMain, subscribe as subscribeMain, updateSettings } from '../store/store';
import { showToast } from '../hooks/hooks';
import { computeView } from '../lib/timer';

/**
 * Friends without email: the first time someone turns friends on, this device gets an anonymous account, they pick a
 * name, and receive a 6-digit code. Typing a friend's code makes you friends instantly.
 * The account lives in this browser. Clearing site data or switching phones gives a new account and a new code.
 */
export type CloudPhase = 'off' | 'starting' | 'signed-out' | 'needs-name' | 'signed-in';

export interface CloudState {
  phase: CloudPhase;
  profile: CloudProfile | null;
  friends: RemoteFriend[];
  /** A message for the current step. */
  error: string | null;
  busy: boolean;
  /** The last refresh failed (offline, server hiccup). Data shown may be stale. */
  syncError: boolean;
  lastSyncAt: number | null;
  /** A code from an invite link, waiting until friends is turned on. */
  pendingInvite: string | null;
}

const CACHE_KEY = 'hexagon.cloud.cache';
const INVITE_KEY = 'hexagon.invite';
const POLL_MS = 20_000;

let state: CloudState = {
  phase: cloudConfigured ? 'starting' : 'off',
  profile: null,
  friends: [],
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

// ---------- turning friends on ----------

let started = false;

export async function initCloud() {
  if (!cloudConfigured || started) return;
  started = true;
  try {
    const b = await loadBackend();
    b.onSignedOut(() => {
      if (state.phase === 'signed-in') void handleAccountLost();
    });
    const user = await b.getUser();
    if (!user) return set({ phase: 'signed-out' });
    const profile = await b.getProfile();
    if (!profile) return set({ phase: 'needs-name' });
    set({ phase: 'signed-in', profile });
    startSync();
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

/** First-time setup: create this device's account, set the name, get a code. */
export async function enableFriends(nameRaw: string) {
  const name = nameRaw.trim();
  if (name.length < 1 || name.length > 30) return set({ error: 'Your name should be 1 to 30 characters.' });
  await guarded(async () => {
    const b = await loadBackend();
    if (!(await b.getUser())) await b.signInAnonymously();
    const profile = await b.saveProfile(name);
    updateSettings({ displayName: name });
    set({ profile, phase: 'signed-in' });
    writeCache();
    startSync();
  });
}

async function handleAccountLost(message?: string) {
  stopSync();
  clearCache();
  set({ phase: 'signed-out', profile: null, friends: [], syncError: false, error: message ?? null });
}

/** Remove my profile, friendships and status from the server, and forget this device's account. */
export async function deleteCloudData() {
  await guarded(async () => {
    const b = await loadBackend();
    stopSync();
    await b.deleteMyData();
    await b.signOut();
    clearCache();
    set({ phase: 'signed-out', profile: null, friends: [] });
  });
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
    const friends = await b.listFriends();
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
    set({ friends, syncError: false, lastSyncAt: Date.now() });
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
