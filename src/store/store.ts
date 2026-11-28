import { useSyncExternalStore } from 'react';
import type { ActiveSession, AppData, Exam, FocusRating, Friend, PlanTask, Scene, SessionSummary, Settings, SetupMemory, StudySession, Subject, TimerConfig } from '../types';
import { rememberSetup } from '../lib/setup';
import { LocalStorageAdapter, MemoryAdapter, STORAGE_KEY, StorageError, parseAppData, type StudyStorage } from '../storage/adapter';
import { createSeed, emptyData, SUBJECT_COLORS } from '../data/seed';
import { makeSimFriend } from '../data/friendsSim';
import { uid } from '../lib/id';
import { AWAY_THRESHOLD_MS, computeView, extendCountdown, pause, resume, skipBreak, stopAtLastSeen } from '../lib/timer';
import { dayKey as dayKeyOf, isValidDayKey } from '../lib/time';
import { currentStreak, longestStreak, todayMs, weekMs } from '../lib/stats';
import { GOLDEN_SESSION_MS, cellsFromMs, goldenDayKeys, rankFor, timedMs } from '../lib/hive';
import { applyBuild, buildMs, carById } from '../data/cars';
import { MIN } from '../lib/time';
import { showToast } from '../hooks/hooks';
import { analytics } from '../cloud/analytics';

export interface StoreState {
  status: 'loading' | 'ready' | 'error';
  data: AppData;
  /** Set when load failed in a way the user must decide about. */
  loadError: { kind: 'corrupt' | 'unavailable'; message: string } | null;
  /** True when the last write failed (data may not survive a reload). */
  persistFailed: boolean;
  storageKind: 'local' | 'memory';
  /** Set when the app reopened with a session still running after a long gap. */
  away: { lastSeenAt: number } | null;
  /** Shown once on Home right after a session is saved. */
  summary: SessionSummary | null;
}

let storage: StudyStorage = new LocalStorageAdapter();
let state: StoreState = {
  status: 'loading',
  data: emptyData(),
  loadError: null,
  persistFailed: false,
  storageKind: 'local',
  away: null,
  summary: null,
};
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function set(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  emit();
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const getState = () => state;
export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getState, getState);
}

function persist(data: AppData) {
  storage.save(data).then(
    () => {
      if (state.persistFailed) set({ persistFailed: false });
    },
    () => {
      if (!state.persistFailed) set({ persistFailed: true });
    },
  );
}

function commit(next: AppData) {
  state = { ...state, data: next };
  persist(next);
  emit();
}

function mutate(fn: (d: AppData) => AppData) {
  commit(fn(state.data));
}

// ---------- demo mode ----------

/** True while the app still holds sample sessions or exams that came with the first launch. */
export function isDemoMode(d: AppData): boolean {
  return d.sessions.some((s) => s.demo) || d.exams.some((e) => e.demo);
}

/**
 * Removes the sample content. Anything the student created is kept, and so is any sample subject
 * their own data still uses. Simulated friends are cleared unless listed in `keepFriendIds`.
 */
export function stripDemo(d: AppData, keepFriendIds: string[] = []): AppData {
  const sessions = d.sessions.filter((s) => !s.demo);
  const exams = d.exams.filter((e) => !e.demo);
  const used = new Set<string>([...sessions.map((s) => s.subjectId), ...exams.map((e) => e.subjectId)]);
  if (d.active) used.add(d.active.subjectId);
  // A sample subject the student's own data still uses becomes theirs.
  const subjects = d.subjects.filter((s) => !s.demo || used.has(s.id)).map((s) => (s.demo ? { ...s, demo: undefined } : s));
  const friends = d.friends.filter((f) => keepFriendIds.includes(f.id));
  return { ...d, sessions, exams, subjects, friends };
}

/**
 * Used by actions that mean "I'm really using this now" (start a session, add a subject, an exam or a
 * past session). While in demo mode, the first of these clears the sample data so the student lands in a fresh space.
 */
function mutateLeavingDemo(fn: (d: AppData) => AppData, keepFriendIds: string[] = []) {
  const wasDemo = isDemoMode(state.data);
  const next = fn(state.data);
  commit(wasDemo ? stripDemo(next, keepFriendIds) : next);
  if (wasDemo) showToast('Sample data cleared. This is your own fresh space now.', 'info');
}

// ---------- boot ----------

function detectAway(data: AppData, now: number): StoreState['away'] {
  const a = data.active;
  if (a && a.resumedAt != null && now - a.lastSeenAt > AWAY_THRESHOLD_MS) return { lastSeenAt: a.lastSeenAt };
  return null;
}

export async function initStore(): Promise<void> {
  if (!LocalStorageAdapter.isAvailable()) {
    storage = new MemoryAdapter();
  } else if (!(storage instanceof LocalStorageAdapter)) {
    storage = new LocalStorageAdapter();
  }
  set({ status: 'loading', storageKind: storage.kind, loadError: null });
  try {
    let data = await storage.load();
    if (data == null) {
      data = createSeed();
      await storage.save(data).catch(() => set({ persistFailed: true }));
    }
    set({ status: 'ready', data, away: detectAway(data, Date.now()) });
  } catch (e) {
    const err = e instanceof StorageError ? e : new StorageError('unavailable', 'Something went wrong while opening your data.');
    set({ status: 'error', loadError: { kind: err.kind, message: err.message } });
  }
}

/** After a corrupt-data error: keep the unreadable copy aside and start with a fresh, empty app. */
export async function startFresh(): Promise<void> {
  storage.quarantine();
  const data = emptyData();
  await storage.save(data).catch(() => undefined);
  set({ status: 'ready', data, loadError: null, away: null });
}

/** Keep two open tabs in sync. */
export function watchOtherTabs() {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || e.newValue == null) return;
    try {
      const data = parseAppData(JSON.parse(e.newValue));
      if (data) {
        state = { ...state, data };
        emit();
      }
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

// ---------- subjects ----------

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateSubjectName(name: string, subjects: Subject[]): string | null {
  const t = name.trim();
  if (!t) return 'Give the subject a name.';
  if (t.length > 40) return 'Keep it to 40 characters or fewer.';
  if (subjects.some((s) => s.name.toLowerCase() === t.toLowerCase())) return 'You already have a subject with that name.';
  return null;
}

export function addSubject(name: string): Result<Subject> {
  const err = validateSubjectName(name, state.data.subjects);
  if (err) return { ok: false, error: err };
  const used = SUBJECT_COLORS.map((_, i) => state.data.subjects.filter((s) => s.color % SUBJECT_COLORS.length === i).length);
  const color = used.indexOf(Math.min(...used));
  const subject: Subject = { id: uid('sub'), name: name.trim(), color };
  mutateLeavingDemo((d) => ({ ...d, subjects: [...d.subjects, subject] }));
  return { ok: true, value: subject };
}

export function deleteSubject(id: string): Result<null> {
  const d = state.data;
  if (d.sessions.some((s) => s.subjectId === id) || d.exams.some((e) => e.subjectId === id) || d.active?.subjectId === id) {
    return { ok: false, error: 'This subject has sessions or exams, so it can’t be removed.' };
  }
  mutate((x) => ({ ...x, subjects: x.subjects.filter((s) => s.id !== id) }));
  return { ok: true, value: null };
}

// ---------- active session ----------

export interface StartParams {
  scene?: Scene;
  carId?: string;
  subjectId: string;
  topic: string;
  goal: string;
  config: TimerConfig;
  friendIds: string[];
  roomId?: string;
  /** What the student plans to get done (each line becomes a tick-off task). */
  tasks?: string[];
}

/** Turns typed lines into tasks: trimmed, no blanks, no duplicates, at most 12. */
export function makeTasks(lines: string[] | undefined): PlanTask[] | undefined {
  const seen = new Set<string>();
  const out: PlanTask[] = [];
  for (const line of lines ?? []) {
    const text = line.trim().slice(0, 100);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: uid('tsk'), text, done: false });
    if (out.length >= 12) break;
  }
  return out.length ? out : undefined;
}

export function startSession(p: StartParams, now = Date.now()): Result<ActiveSession> {
  if (state.data.active) return { ok: false, error: 'A session is already in progress.' };
  if (!state.data.subjects.some((s) => s.id === p.subjectId)) return { ok: false, error: 'Choose a subject first.' };
  const active: ActiveSession = {
    id: uid('ses'),
    subjectId: p.subjectId,
    topic: p.topic.trim().slice(0, 80),
    goal: p.goal.trim().slice(0, 120),
    config: p.config,
    startedAt: now,
    runMs: 0,
    resumedAt: now,
    lastSeenAt: now,
    friendIds: p.friendIds,
    roomId: p.roomId,
    scene: p.scene ?? state.data.settings.scene,
    carId: p.scene === 'car' ? p.carId : undefined,
    tasks: makeTasks(p.tasks),
  };
  const setup: SetupMemory = { config: p.config, scene: active.scene ?? state.data.settings.scene, ...(active.scene === 'car' && active.carId ? { carId: active.carId } : {}) };
  mutateLeavingDemo(
    (d) => ({
      ...d,
      active,
      settings: {
        ...d.settings,
        lastSubjectId: p.subjectId,
        scene: active.scene ?? d.settings.scene,
        lastSetups: rememberSetup(d.settings.lastSetups, p.subjectId, setup, d.subjects.map((s) => s.id)),
      },
    }),
    p.friendIds,
  );
  analytics.track('session_start');
  return { ok: true, value: active };
}

function mutateActive(fn: (a: ActiveSession) => ActiveSession) {
  const a = state.data.active;
  if (!a) return;
  const next = fn(a);
  if (next !== a) mutate((d) => ({ ...d, active: next }));
}

export const pauseActive = (now = Date.now()) => mutateActive((a) => pause(a, now));
export const resumeActive = (now = Date.now()) => mutateActive((a) => resume(a, now));
export const skipActiveBreak = (now = Date.now()) => mutateActive((a) => skipBreak(a, now));
export const extendActive = (min: number, now = Date.now()) => mutateActive((a) => extendCountdown(a, min, now));

/** Adds a task to the session in progress. Returns false when it is blank, a repeat, or the plan is full. */
export function addActiveTask(text: string): boolean {
  const a = state.data.active;
  if (!a) return false;
  const next = makeTasks([...(a.tasks ?? []).map((t) => t.text), text]);
  if (!next || next.length === (a.tasks?.length ?? 0)) return false;
  // keep the existing tasks (and their ticks), appending only the new one
  const added = next[next.length - 1];
  mutate((d) => (d.active ? { ...d, active: { ...d.active, tasks: [...(d.active.tasks ?? []), added] } } : d));
  return true;
}

export function toggleActiveTask(id: string) {
  mutate((d) => (d.active?.tasks ? { ...d, active: { ...d.active, tasks: d.active.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) } } : d));
}

export function removeActiveTask(id: string) {
  mutate((d) => {
    if (!d.active?.tasks) return d;
    const tasks = d.active.tasks.filter((t) => t.id !== id);
    return { ...d, active: { ...d.active, tasks: tasks.length ? tasks : undefined } };
  });
}

export function heartbeat(now = Date.now()) {
  const a = state.data.active;
  if (!a || a.resumedAt == null) return;
  mutate((d) => (d.active ? { ...d, active: { ...d.active, lastSeenAt: now } } : d));
}

export function resolveAway(choice: 'keep' | 'stop', now = Date.now()) {
  const a = state.data.active;
  if (a) {
    mutate((d) => ({
      ...d,
      active: d.active ? (choice === 'stop' ? stopAtLastSeen(d.active) : { ...d.active, lastSeenAt: now }) : null,
    }));
  }
  set({ away: null });
}

export function finishSession(notes: string, focus?: FocusRating, now = Date.now()): Result<StudySession> {
  const a = state.data.active;
  if (!a) return { ok: false, error: 'There is no session to save.' };
  const v = computeView(a, now);
  const session: StudySession = {
    id: a.id,
    subjectId: a.subjectId,
    topic: a.topic,
    goal: a.goal,
    notes: notes.trim().slice(0, 600),
    mode: a.config.mode,
    startedAt: a.startedAt,
    endedAt: now,
    studiedMs: v.studiedMs,
    breakMs: v.breakMs,
    friendIds: a.friendIds,
    roomId: a.roomId,
    scene: a.scene,
    carId: a.scene === 'car' ? a.carId : undefined,
    tasks: a.tasks,
    focus,
  };
  const before = state.data.sessions;
  const after = [...before, session];
  const dailyGoalMs = state.data.settings.dailyGoalMin * MIN;
  const prevStreak = currentStreak(before, now);
  const streak = currentStreak(after, now);
  const today = todayMs(after, now);

  // Rewards: honey cells, bee rank, today's golden cell, and car progress. Only timed sessions earn them.
  const cellsBefore = cellsFromMs(timedMs(before));
  const cellsAfter = cellsFromMs(timedMs(after));
  const rankBefore = rankFor(timedMs(before)).rank;
  const rankAfter = rankFor(timedMs(after)).rank;
  const goldenEarned = session.studiedMs >= GOLDEN_SESSION_MS && !goldenDayKeys(before).has(dayKeyOf(session.startedAt));
  const built = applyBuild(state.data.builds, state.data.garage, session.carId, session.studiedMs, now);
  const car = carById(session.carId);
  const carProgress = car ? (built.completed ? 1 : (built.builds[car.id] ?? 0) / buildMs(car)) : 0;

  const summary: SessionSummary = {
    sessionId: session.id,
    subjectId: session.subjectId,
    studiedMs: session.studiedMs,
    todayMs: today,
    dailyGoalMs,
    goalReached: todayMs(before, now) < dailyGoalMs && today >= dailyGoalMs,
    streakDays: streak.days,
    streakExtended: !prevStreak.todayDone && streak.todayDone,
    newBestStreak: streak.days >= 2 && streak.days > longestStreak(before),
    weekMs: weekMs(after, now),
    weeklyGoalMs: state.data.settings.weeklyGoalMin * MIN,
    cellsAdded: cellsAfter - cellsBefore,
    hiveCells: cellsAfter,
    rankUp: rankAfter.id !== rankBefore.id ? { from: rankBefore.name, to: rankAfter.name } : undefined,
    goldenEarned,
    car: car ? { id: car.id, name: car.name, completed: !!built.completed, progress: carProgress } : undefined,
    tasks: a.tasks ? { done: a.tasks.filter((t) => t.done).length, total: a.tasks.length } : undefined,
  };
  mutate((d) => ({ ...d, sessions: after, active: null, builds: built.builds, garage: built.garage }));
  // Anonymous counts: only sessions of a minute or more count as "finished".
  if (session.studiedMs >= MIN) analytics.track('session_finish');
  if (built.completed) analytics.track('car_built');
  set({ summary });
  return { ok: true, value: session };
}

export function dismissSummary() {
  if (state.summary) set({ summary: null });
}

export function discardSession() {
  mutate((d) => ({ ...d, active: null }));
}

// ---------- history ----------

export interface ManualSessionInput {
  subjectId: string;
  /** YYYY-MM-DD */
  date: string;
  minutes: number;
  notes: string;
}

export function validateManualSession(i: ManualSessionInput, subjects: Subject[], now = Date.now()): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!subjects.some((s) => s.id === i.subjectId)) errs.subjectId = 'Choose a subject.';
  if (!isValidDayKey(i.date)) errs.date = 'Pick a valid date.';
  else if (new Date(i.date + 'T00:00:00').getTime() > now) errs.date = 'That date is in the future.';
  if (!Number.isFinite(i.minutes) || i.minutes < 1 || i.minutes > 720) errs.minutes = 'Enter between 1 and 720 minutes.';
  if (i.notes.length > 600) errs.notes = 'Keep notes under 600 characters.';
  return errs;
}

export function addManualSession(i: ManualSessionInput): Result<StudySession> {
  const errs = validateManualSession(i, state.data.subjects);
  if (Object.keys(errs).length) return { ok: false, error: Object.values(errs)[0] };
  const start = new Date(i.date + 'T12:00:00').getTime();
  const session: StudySession = {
    id: uid('ses'),
    subjectId: i.subjectId,
    topic: '',
    goal: '',
    notes: i.notes.trim(),
    mode: 'stopwatch',
    startedAt: start,
    endedAt: start + i.minutes * 60_000,
    studiedMs: Math.round(i.minutes) * 60_000,
    breakMs: 0,
    friendIds: [],
    manual: true,
  };
  mutateLeavingDemo((d) => ({ ...d, sessions: [...d.sessions, session] }));
  return { ok: true, value: session };
}

export function deleteSession(id: string) {
  mutate((d) => ({ ...d, sessions: d.sessions.filter((s) => s.id !== id) }));
}

// ---------- exams ----------

export interface ExamInput {
  subjectId: string;
  date: string;
  notes: string;
  targetHours: number;
}

export function validateExam(i: ExamInput, subjects: Subject[], isNew: boolean, todayKey: string): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!subjects.some((s) => s.id === i.subjectId)) errs.subjectId = 'Choose a subject.';
  if (!isValidDayKey(i.date)) errs.date = 'Pick a valid date.';
  else if (isNew && i.date < todayKey) errs.date = 'The exam date should be today or later.';
  if (!Number.isFinite(i.targetHours) || i.targetHours < 1 || i.targetHours > 200) errs.targetHours = 'Enter between 1 and 200 hours.';
  if (i.notes.length > 300) errs.notes = 'Keep notes under 300 characters.';
  return errs;
}

export function saveExam(i: ExamInput, existingId?: string): Result<Exam> {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const errs = validateExam(i, state.data.subjects, !existingId, todayKey);
  if (Object.keys(errs).length) return { ok: false, error: Object.values(errs)[0] };
  if (existingId) {
    let updated: Exam | undefined;
    mutate((d) => ({
      ...d,
      exams: d.exams.map((e) => {
        if (e.id !== existingId) return e;
        updated = { ...e, subjectId: i.subjectId, date: i.date, notes: i.notes.trim(), targetHours: i.targetHours };
        return updated;
      }),
    }));
    return updated ? { ok: true, value: updated } : { ok: false, error: 'That exam no longer exists.' };
  }
  const exam: Exam = { id: uid('exm'), subjectId: i.subjectId, date: i.date, notes: i.notes.trim(), targetHours: i.targetHours, createdAt: Date.now() };
  mutateLeavingDemo((d) => ({ ...d, exams: [...d.exams, exam] }));
  return { ok: true, value: exam };
}

export function deleteExam(id: string) {
  mutate((d) => ({ ...d, exams: d.exams.filter((e) => e.id !== id) }));
}

// ---------- friends (simulated) ----------

export function validateFriendName(name: string, friends: Friend[]): string | null {
  const t = name.trim();
  if (!t) return 'Enter a name.';
  if (t.length > 30) return 'Keep it to 30 characters or fewer.';
  if (friends.some((f) => f.name.toLowerCase() === t.toLowerCase())) return 'You already have a friend with that name.';
  return null;
}

export function addFriend(name: string): Result<Friend> {
  const err = validateFriendName(name, state.data.friends);
  if (err) return { ok: false, error: err };
  const friend = makeSimFriend(uid('frd'), name.trim());
  mutate((d) => ({ ...d, friends: [...d.friends, friend] }));
  return { ok: true, value: friend };
}

export function removeFriend(id: string) {
  mutate((d) => ({ ...d, friends: d.friends.filter((f) => f.id !== id) }));
}

// ---------- settings & data ----------

export function updateSettings(patch: Partial<Settings>) {
  mutate((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
}

/**
 * Account sync hands over merged data. Applied to whatever the app holds right now (so nothing typed in the
 * meantime is lost), and quietly: no toast, no analytics.
 */
export function applySyncedData(fn: (d: AppData) => AppData) {
  const next = fn(state.data);
  if (next !== state.data) commit(next);
}

/**
 * A different account signed in on this device: its study data must not mix with the previous account's.
 * Clears sessions, subjects, exams and cars, and keeps this device's own preferences.
 */
export function clearStudyData() {
  const keep = state.data.settings;
  commit({ ...emptyData(), settings: { ...keep, displayName: '', lastSubjectId: undefined, lastSetups: {} } });
}

export function hasDemoData(d: AppData): boolean {
  return isDemoMode(d) || d.friends.length > 0;
}

/** Removes the sample sessions and exams plus all simulated friends. */
export function removeDemoData() {
  mutate((d) => stripDemo(d));
}

export async function resetEverything() {
  await storage.reset();
  const data = emptyData();
  await storage.save(data).catch(() => undefined);
  set({ data, away: null, persistFailed: false, summary: null });
}

export function exportJson(): string {
  return JSON.stringify(state.data, null, 2);
}
