import { useSyncExternalStore } from 'react';
import { CloudError, type CloudBackend } from './types';
import { applySyncedData, clearStudyData, getState, isDemoMode, subscribe } from '../store/store';
import { STORAGE_KEY } from '../storage/adapter';
import { applySyncDoc, docKey, isEmptyDoc, mergeDocs, parseSyncDoc, toSyncDoc, type SyncDoc } from './syncMerge';
import { showToast } from '../hooks/hooks';

/**
 * Keeps the student's study data (sessions, subjects, exams, cars, goals) in their account, so signing in on another
 * phone or laptop shows the same history. The device stays the source of truth while offline; changes go up a couple of
 * seconds after they are made, and the account is checked again every 30 seconds and whenever the app comes back to the front.
 * The merging itself is in syncMerge.ts.
 */
export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'offline' | 'needs-setup' | 'error';

export interface DataSyncState {
  status: SyncStatus;
  lastSyncAt: number | null;
  message: string | null;
}

let state: DataSyncState = { status: 'off', lastSyncAt: null, message: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<DataSyncState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
export const getDataSync = () => state;
export const useDataSync = (): DataSyncState =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getDataSync,
    getDataSync,
  );

// ---------- what this device remembers about the last sync ----------

const META_KEY = 'hexagon.sync.v1';
const AWAY_COPY_KEY = STORAGE_KEY + '.other-account';

interface Meta {
  /** The account this device's data was last synced with. */
  owner: string;
  /** The account's revision at the last sync. */
  rev: number;
  /** The document as it was at the last sync, the starting point for telling what changed where. */
  base: SyncDoc | null;
  lastSyncAt: number | null;
}

let metaCache: Meta | null | undefined;

function readMeta(): Meta | null {
  if (metaCache !== undefined) return metaCache;
  metaCache = loadMeta();
  return metaCache;
}
function loadMeta(): Meta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<Meta>;
    if (typeof m.owner !== 'string' || typeof m.rev !== 'number') return null;
    return { owner: m.owner, rev: m.rev, base: m.base ? parseSyncDoc(m.base) : null, lastSyncAt: typeof m.lastSyncAt === 'number' ? m.lastSyncAt : null };
  } catch {
    return null;
  }
}
function writeMeta(m: Meta | null) {
  metaCache = m;
  try {
    if (m) localStorage.setItem(META_KEY, JSON.stringify(m));
    else localStorage.removeItem(META_KEY);
  } catch {
    /* Without a saved starting point the next sync is simply treated as a first one, which never removes anything. */
  }
}

// ---------- running ----------

const POLL_MS = 30_000;
const PUSH_DELAY_MS = 2500;

let backend: CloudBackend | null = null;
let userId = '';
let onAuthLost: ((message: string) => void) | null = null;
let timers: { poll?: number; push?: number } = {};
let cleanup: (() => void) | null = null;
let busy = false;
let again = false;
let waiters: (() => void)[] = [];
let notReadyTries = 0;

export function startDataSync(b: CloudBackend, id: string, authLost: (message: string) => void) {
  stopDataSync();
  if (!getState().data.settings.cloudSync) {
    set({ status: 'off', message: null });
    return;
  }
  backend = b;
  userId = id;
  onAuthLost = authLost;

  metaCache = undefined; // read what is saved on disk afresh
  const meta = readMeta();
  if (meta && meta.owner !== id) {
    // Someone else's account was on this device. Their data must not flow into this account.
    // A copy is kept aside rather than thrown away, in case they never got to sync it.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) localStorage.setItem(AWAY_COPY_KEY, raw);
    } catch {
      /* best effort */
    }
    clearStudyData();
    writeMeta(null);
  }

  let last = { s: getState().data.sessions, e: getState().data.exams, u: getState().data.subjects, g: getState().data.garage, b: getState().data.builds, t: getState().data.settings };
  const unsub = subscribe(() => {
    const d = getState().data;
    // Only the things that sync matter; the timer's heartbeat, for one, changes nothing here.
    if (d.sessions === last.s && d.exams === last.e && d.subjects === last.u && d.garage === last.g && d.builds === last.b && d.settings === last.t) return;
    const settingsOnly = d.sessions === last.s && d.exams === last.e && d.subjects === last.u && d.garage === last.g && d.builds === last.b;
    last = { s: d.sessions, e: d.exams, u: d.subjects, g: d.garage, b: d.builds, t: d.settings };
    if (settingsOnly && docKey(toSyncDoc(d)) === lastKey()) return;
    schedulePush(PUSH_DELAY_MS);
  });
  const onVisible = () => {
    if (document.visibilityState === 'visible') void requestSync();
    else if (dirty()) void requestSync(); // leaving the app: send what hasn't gone yet
  };
  const onOnline = () => void requestSync();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  timers.poll = window.setInterval(() => {
    if (document.visibilityState === 'visible') void requestSync();
  }, POLL_MS);
  cleanup = () => {
    unsub();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
  };

  set({ status: 'syncing', message: null, lastSyncAt: meta?.owner === id ? meta.lastSyncAt : null });
  void requestSync();
}

export function stopDataSync() {
  window.clearInterval(timers.poll);
  window.clearTimeout(timers.push);
  timers = {};
  cleanup?.();
  cleanup = null;
  backend = null;
  userId = '';
  onAuthLost = null;
  set({ status: 'off', message: null });
}

const lastKey = () => {
  const m = readMeta();
  return m?.owner === userId ? docKey(m.base) : '';
};
const dirty = () => !!backend && docKey(toSyncDoc(getState().data)) !== lastKey();

function schedulePush(ms: number) {
  window.clearTimeout(timers.push);
  timers.push = window.setTimeout(() => void requestSync(), ms);
}

/** Sync now, or as soon as the one in progress ends. Resolves when a sync that started after this call has finished. */
export function requestSync(): Promise<void> {
  if (!backend) return Promise.resolve();
  return new Promise((resolve) => {
    waiters.push(resolve);
    if (busy) {
      again = true;
      return;
    }
    void loop();
  });
}

async function loop() {
  busy = true;
  try {
    do {
      again = false;
      const mine = waiters;
      waiters = [];
      await runOnce();
      mine.forEach((r) => r());
    } while (again);
  } finally {
    busy = false;
    const rest = waiters;
    waiters = [];
    rest.forEach((r) => r());
  }
}

function describe(e: unknown): { status: SyncStatus; message: string } {
  if (e instanceof CloudError) {
    if (e.kind === 'network') return { status: 'offline', message: 'No connection. Your data is safe on this device and will sync when you’re back online.' };
    if (/latest setup SQL/i.test(e.message)) return { status: 'needs-setup', message: e.message };
    return { status: 'error', message: e.message };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline', message: 'No connection. Your data is safe on this device and will sync when you’re back online.' };
  return { status: 'error', message: e instanceof Error ? e.message : 'Syncing didn’t work just now. It will try again.' };
}

async function runOnce() {
  const b = backend;
  if (!b) return;
  if (getState().status !== 'ready') {
    // The app is still opening its saved data.
    if (notReadyTries++ < 40) window.setTimeout(() => void requestSync(), 500);
    return;
  }
  notReadyTries = 0;
  const showSpinner = state.status !== 'ok';
  if (showSpinner) set({ status: 'syncing', message: null });
  try {
    await cycle(b);
  } catch (e) {
    if (b !== backend) return; // signed out meanwhile
    if (e instanceof CloudError && e.kind === 'auth') {
      onAuthLost?.(e.message);
      return;
    }
    set(describe(e));
    schedulePush(POLL_MS); // try again soon even if nothing else changes
  }
}

async function cycle(b: CloudBackend) {
  let meta: Meta = readMeta() ?? { owner: userId, rev: 0, base: null, lastSyncAt: null };
  if (meta.owner !== userId) meta = { owner: userId, rev: 0, base: null, lastSyncAt: null };
  const firstSync = !meta.base;

  for (let attempt = 0; attempt < 4; attempt++) {
    const read = await b.getUserData(meta.base && meta.rev > 0 ? meta.rev : null);
    let remote: SyncDoc | null;
    if (read.unchanged && meta.base) remote = meta.base;
    else if (read.doc == null) remote = null;
    else {
      remote = parseSyncDoc(read.doc);
      // Never overwrite a saved copy that can't be understood (for example one from a newer version of the app).
      if (!remote) throw new CloudError('Your account holds data this version of Hexagon can’t read. Update the app and try again.');
    }

    // From here to the end of the merge there is no waiting, so nothing the student does in between can be missed.
    const before = getState().data;
    const local = toSyncDoc(before);
    const { doc, remap } = mergeDocs(remote ? meta.base : null, local, remote);
    const changedHere = docKey(doc) !== docKey(local) || Object.keys(remap).length > 0 || (!isEmptyDoc(doc) && isDemoMode(before));
    if (changedHere) applySyncedData((d) => applySyncDoc(d, doc, remap));

    let rev = read.rev;
    if (docKey(doc) !== docKey(remote)) {
      const w = await b.putUserData(doc, read.rev);
      if (w.status === 'conflict') {
        continue; // another device saved while we were merging: start again from what it saved
      }
      rev = w.rev;
    }

    const now = Date.now();
    if (rev !== meta.rev || docKey(doc) !== docKey(meta.base)) writeMeta({ owner: userId, rev, base: doc, lastSyncAt: now });
    set({ status: 'ok', lastSyncAt: now, message: null });

    if (firstSync && !isEmptyDoc(doc)) {
      if (!isEmptyDoc(remote) && changedHere) showToast('Your study history is here, synced with your account.');
      else if (isEmptyDoc(remote)) showToast('Your study history is now saved to your account.');
    }
    return;
  }
  throw new CloudError('Syncing is busy. It will try again in a moment.');
}

/** Used when signing out: send anything that hasn't gone up yet, but never hold the person up for long. */
export async function flushDataSync(timeoutMs = 4000): Promise<void> {
  if (!backend) return;
  await Promise.race([requestSync(), new Promise<void>((r) => window.setTimeout(r, timeoutMs))]);
}

/** Removes the copy in the account, and forgets what this device knew of it. */
export async function wipeCloudCopy(b: CloudBackend) {
  await b.deleteUserData();
  writeMeta(null);
}

/** Forget the last-sync record (after this device's data was deleted on purpose). */
export function forgetSyncRecord() {
  writeMeta(null);
}

/** True when this device has never synced with this account (a new phone or laptop, or the first time since sync existed). */
export function isNewHere(id: string): boolean {
  metaCache = undefined;
  return readMeta()?.owner !== id;
}
