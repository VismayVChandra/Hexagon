import type { ActiveSession, AppData, Exam, FocusRating, Friend, PlanTask, Settings, StudySession, Subject, TimerConfig } from '../types';
import { AMBIENT_IDS, CUE_TONES } from '../types';
import { DEFAULT_SETTINGS } from '../data/seed';
import { migrateCarId } from '../data/cars';

/**
 * Storage boundary. The app only talks to this interface, so swapping localStorage
 * for a real API later means writing one new adapter (and making the store's
 * persistence async-aware, which `save` already is).
 */
export interface StudyStorage {
  readonly kind: 'local' | 'memory';
  /** Resolves null on first run (nothing stored). Rejects with StorageError if data is unreadable. */
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
  reset(): Promise<void>;
  /** Move unreadable data aside so the user can start fresh without losing it. */
  quarantine(): void;
}

export class StorageError extends Error {
  constructor(
    public readonly kind: 'corrupt' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}

export const STORAGE_KEY = 'hexagon.v1';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function sanitizeSettings(v: unknown): Settings {
  const s = isObj(v) ? v : {};
  const p = isObj(s.pomodoro) ? s.pomodoro : {};
  const d = DEFAULT_SETTINGS;
  const clamp = (n: unknown, min: number, max: number, fallback: number) => (isNum(n) ? Math.min(max, Math.max(min, n)) : fallback);
  return {
    displayName: isStr(s.displayName) ? s.displayName.slice(0, 30) : d.displayName,
    dailyGoalMin: clamp(s.dailyGoalMin, 5, 720, d.dailyGoalMin),
    weeklyGoalMin: clamp(s.weeklyGoalMin, 15, 4000, d.weeklyGoalMin),
    pomodoro: {
      focusMin: clamp(p.focusMin, 1, 180, d.pomodoro.focusMin),
      breakMin: clamp(p.breakMin, 1, 60, d.pomodoro.breakMin),
      longBreakMin: clamp(p.longBreakMin, 1, 90, d.pomodoro.longBreakMin),
      cyclesBeforeLong: Math.round(clamp(p.cyclesBeforeLong, 1, 10, d.pomodoro.cyclesBeforeLong)),
    },
    theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system',
    scene: s.scene === 'car' || s.scene === 'minimal' ? s.scene : 'honeycomb',
    keepAwake: typeof s.keepAwake === 'boolean' ? s.keepAwake : d.keepAwake,
    sound: typeof s.sound === 'boolean' ? s.sound : d.sound,
    cueTone: CUE_TONES.find((t) => t === s.cueTone) ?? d.cueTone,
    cueVolume: clamp(s.cueVolume, 0, 1, d.cueVolume),
    cueRepeat: typeof s.cueRepeat === 'boolean' ? s.cueRepeat : d.cueRepeat,
    stopwatchChimeMin: [0, 15, 30, 60].includes(s.stopwatchChimeMin as number) ? (s.stopwatchChimeMin as number) : d.stopwatchChimeMin,
    ambient: AMBIENT_IDS.find((a) => a === s.ambient) ?? 'off',
    ambientVolume: clamp(s.ambientVolume, 0, 1, d.ambientVolume),
    haptics: typeof s.haptics === 'boolean' ? s.haptics : d.haptics,
    sharePresence: typeof s.sharePresence === 'boolean' ? s.sharePresence : false,
    shareSubject: typeof s.shareSubject === 'boolean' ? s.shareSubject : false,
    lastSubjectId: isStr(s.lastSubjectId) ? s.lastSubjectId : undefined,
    installHintDismissed: s.installHintDismissed === true,
    analytics: typeof s.analytics === 'boolean' ? s.analytics : d.analytics,
    analyticsNoticeDismissed: s.analyticsNoticeDismissed === true,
    notify: s.notify === true,
    notifyTimer: typeof s.notifyTimer === 'boolean' ? s.notifyTimer : d.notifyTimer,
    notifyRewards: typeof s.notifyRewards === 'boolean' ? s.notifyRewards : d.notifyRewards,
    notifyNudges: typeof s.notifyNudges === 'boolean' ? s.notifyNudges : d.notifyNudges,
    nudgeHour: Math.round(clamp(s.nudgeHour, 0, 23, d.nudgeHour)),
    notifyPromptDismissed: s.notifyPromptDismissed === true,
    cloudSync: typeof s.cloudSync === 'boolean' ? s.cloudSync : d.cloudSync,
    accountPromptDismissed: s.accountPromptDismissed === true,
  };
}

function sanitizeConfig(v: unknown): TimerConfig | null {
  if (!isObj(v)) return null;
  if (v.mode !== 'stopwatch' && v.mode !== 'countdown' && v.mode !== 'pomodoro') return null;
  const cfg: TimerConfig = { mode: v.mode };
  if (v.mode === 'countdown') cfg.targetMin = isNum(v.targetMin) && v.targetMin > 0 ? v.targetMin : 25;
  if (v.mode === 'pomodoro') {
    const p = isObj(v.pomodoro) ? v.pomodoro : {};
    cfg.pomodoro = {
      focusMin: isNum(p.focusMin) && p.focusMin > 0 ? p.focusMin : 25,
      breakMin: isNum(p.breakMin) && p.breakMin > 0 ? p.breakMin : 5,
      longBreakMin: isNum(p.longBreakMin) && p.longBreakMin > 0 ? p.longBreakMin : 15,
      cyclesBeforeLong: isNum(p.cyclesBeforeLong) && p.cyclesBeforeLong >= 1 ? Math.floor(p.cyclesBeforeLong) : 4,
    };
  }
  return cfg;
}

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isStr) : []);

/** A plan: up to 12 short tasks. Anything malformed is dropped; no plan at all stays undefined. */
export function sanitizeTasks(v: unknown): PlanTask[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: PlanTask[] = [];
  for (const x of v) {
    if (!isObj(x) || !isStr(x.id) || !isStr(x.text)) continue;
    const text = x.text.trim().slice(0, 100);
    if (!text || out.some((t) => t.id === x.id)) continue;
    out.push({ id: x.id, text, done: x.done === true });
    if (out.length >= 12) break;
  }
  return out.length ? out : undefined;
}

const sanitizeFocus = (v: unknown): FocusRating | undefined => (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 ? v : undefined);

function sanitizeActive(v: unknown): ActiveSession | null {
  if (!isObj(v)) return null;
  const config = sanitizeConfig(v.config);
  if (!config || !isStr(v.id) || !isStr(v.subjectId) || !isNum(v.startedAt) || !isNum(v.runMs)) return null;
  return {
    id: v.id,
    subjectId: v.subjectId,
    topic: isStr(v.topic) ? v.topic : '',
    goal: isStr(v.goal) ? v.goal : '',
    config,
    startedAt: v.startedAt,
    runMs: Math.max(0, v.runMs),
    resumedAt: isNum(v.resumedAt) ? v.resumedAt : null,
    lastSeenAt: isNum(v.lastSeenAt) ? v.lastSeenAt : v.startedAt,
    friendIds: strArr(v.friendIds),
    roomId: isStr(v.roomId) ? v.roomId : undefined,
    scene: v.scene === 'car' || v.scene === 'minimal' || v.scene === 'honeycomb' ? v.scene : undefined,
    carId: isStr(v.carId) ? migrateCarId(v.carId) : undefined,
    tasks: sanitizeTasks(v.tasks),
  };
}

/** Defensive parse: keeps what is valid, drops what is not. Returns null if the shape is unusable. */
export function parseAppData(raw: unknown): AppData | null {
  if (!isObj(raw) || raw.version !== 1) return null;
  const subjects: Subject[] = (Array.isArray(raw.subjects) ? raw.subjects : [])
    .filter((x): x is Record<string, unknown> => isObj(x) && isStr(x.id) && isStr(x.name))
    .map((x) => ({ id: x.id as string, name: x.name as string, color: isNum(x.color) ? Math.abs(Math.floor(x.color)) : 0, demo: x.demo === true ? true : undefined }));
  const sessions: StudySession[] = (Array.isArray(raw.sessions) ? raw.sessions : [])
    .filter((x): x is Record<string, unknown> => isObj(x) && isStr(x.id) && isStr(x.subjectId) && isNum(x.startedAt) && isNum(x.endedAt) && isNum(x.studiedMs))
    .map((x) => ({
      id: x.id as string,
      subjectId: x.subjectId as string,
      topic: isStr(x.topic) ? x.topic : '',
      goal: isStr(x.goal) ? x.goal : '',
      notes: isStr(x.notes) ? x.notes : '',
      mode: x.mode === 'countdown' || x.mode === 'pomodoro' ? x.mode : 'stopwatch',
      startedAt: x.startedAt as number,
      endedAt: x.endedAt as number,
      studiedMs: Math.max(0, x.studiedMs as number),
      breakMs: isNum(x.breakMs) ? Math.max(0, x.breakMs) : 0,
      friendIds: strArr(x.friendIds),
      roomId: isStr(x.roomId) ? x.roomId : undefined,
      scene: x.scene === 'car' || x.scene === 'minimal' || x.scene === 'honeycomb' ? x.scene : undefined,
      carId: isStr(x.carId) ? migrateCarId(x.carId) : undefined,
      manual: x.manual === true ? true : undefined,
      demo: x.demo === true ? true : undefined,
      tasks: sanitizeTasks(x.tasks),
      focus: sanitizeFocus(x.focus),
    }));
  const exams: Exam[] = (Array.isArray(raw.exams) ? raw.exams : [])
    .filter((x): x is Record<string, unknown> => isObj(x) && isStr(x.id) && isStr(x.subjectId) && isStr(x.date))
    .map((x) => ({
      id: x.id as string,
      subjectId: x.subjectId as string,
      date: x.date as string,
      notes: isStr(x.notes) ? x.notes : '',
      targetHours: isNum(x.targetHours) && x.targetHours > 0 ? x.targetHours : 10,
      createdAt: isNum(x.createdAt) ? x.createdAt : Date.now(),
      demo: x.demo === true ? true : undefined,
    }));
  const friends: Friend[] = (Array.isArray(raw.friends) ? raw.friends : [])
    .filter((x): x is Record<string, unknown> => isObj(x) && isStr(x.id) && isStr(x.name) && isObj(x.sim))
    .map((x) => {
      const sim = x.sim as Record<string, unknown>;
      const subjects = strArr(sim.subjects);
      return {
        id: x.id as string,
        name: x.name as string,
        hue: isNum(x.hue) ? x.hue : 160,
        sharesSubject: x.sharesSubject === true,
        sim: {
          periodMin: isNum(sim.periodMin) && sim.periodMin >= 60 ? sim.periodMin : 180,
          offsetMin: isNum(sim.offsetMin) ? sim.offsetMin : 0,
          studyMin: isNum(sim.studyMin) && sim.studyMin > 0 ? sim.studyMin : 50,
          subjects: subjects.length ? subjects : ['Studying'],
        },
        demo: true as const,
      };
    });
  const garage = (Array.isArray(raw.garage) ? raw.garage : [])
    .filter((x): x is Record<string, unknown> => isObj(x) && isStr(x.carId) && isNum(x.at))
    .map((x) => ({ carId: migrateCarId(x.carId as string), at: x.at as number }))
    .filter((g, i, all) => all.findIndex((o) => o.carId === g.carId) === i);
  const builds: Record<string, number> = {};
  if (isObj(raw.builds)) for (const [k, v] of Object.entries(raw.builds)) if (isNum(v) && v > 0) builds[migrateCarId(k)] = (builds[migrateCarId(k)] ?? 0) + v;
  return { version: 1, settings: sanitizeSettings(raw.settings), subjects, sessions, exams, friends, active: sanitizeActive(raw.active), garage, builds };
}

export class LocalStorageAdapter implements StudyStorage {
  readonly kind = 'local' as const;

  static isAvailable(): boolean {
    try {
      const k = '__hexagon_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  async load(): Promise<AppData | null> {
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      throw new StorageError('unavailable', e instanceof Error ? e.message : 'Storage is unavailable');
    }
    if (raw == null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new StorageError('corrupt', 'Saved data could not be read.');
    }
    const data = parseAppData(parsed);
    if (!data) throw new StorageError('corrupt', 'Saved data has an unexpected format.');
    return data;
  }

  // Deliberately synchronous inside the promise so a write completes even if the page is closing.
  save(data: AppData): Promise<void> {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(new StorageError('unavailable', e instanceof Error ? e.message : 'Could not save'));
    }
  }

  async reset(): Promise<void> {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  quarantine(): void {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw != null) window.localStorage.setItem(STORAGE_KEY + '.corrupt', raw);
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing more we can do */
    }
  }
}

/** Fallback when browser storage is blocked (e.g. some private modes). Data lasts until the tab closes. */
export class MemoryAdapter implements StudyStorage {
  readonly kind = 'memory' as const;
  private data: AppData | null = null;
  async load() {
    return this.data;
  }
  async save(data: AppData) {
    this.data = data;
  }
  async reset() {
    this.data = null;
  }
  quarantine() {
    this.data = null;
  }
}
