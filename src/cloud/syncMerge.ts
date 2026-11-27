import type { AppData, Exam, GarageItem, Settings, StudySession, Subject } from '../types';
import { DEFAULT_SETTINGS } from '../data/seed';
import { parseAppData } from '../storage/adapter';
import { isDemoMode, stripDemo } from '../store/store';

/**
 * Whole-app sync, the pure part. A device keeps its own copy of the data; the account holds one shared copy. To bring
 * them together we do a three-way merge of (what this device had at the last sync, what it has now, what the account has now):
 *   - something new on either side is kept,
 *   - something removed on one side (it was in the last sync, and is gone now) is removed on both,
 *   - something changed on one side only takes that change,
 *   - if both changed it, this device's version wins.
 * Without a last sync (a device's first time) nothing is ever removed, so signing in can never lose what a device holds.
 * Everything here is deterministic and free of the clock, so it can be tested.
 */

/** Settings that follow the student from device to device. (Theme, volume, haptics, notifications and the like stay per device.) */
export const SYNCED_SETTING_KEYS = ['displayName', 'dailyGoalMin', 'weeklyGoalMin', 'pomodoro', 'sound', 'cueTone', 'cueRepeat', 'stopwatchChimeMin', 'ambient'] as const;
export type SyncedSettingKey = (typeof SYNCED_SETTING_KEYS)[number];
export type SyncedSettings = Pick<Settings, SyncedSettingKey>;

export interface SyncDoc {
  v: 1;
  settings: SyncedSettings;
  subjects: Subject[];
  sessions: StudySession[];
  exams: Exam[];
  garage: GarageItem[];
  builds: Record<string, number>;
}

/** JSON with sorted keys and no undefined, so equal things always give equal text. */
export function stable(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`;
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function pickSettings(s: Settings): SyncedSettings {
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_SETTING_KEYS) out[k] = s[k];
  return out as unknown as SyncedSettings;
}

/** Puts every list in a fixed order so two devices holding the same things produce the very same document. */
function canon(d: SyncDoc): SyncDoc {
  return {
    v: 1,
    settings: d.settings,
    subjects: [...d.subjects].sort(byId),
    sessions: [...d.sessions].sort(byId),
    exams: [...d.exams].sort(byId),
    garage: [...d.garage].sort((a, b) => (a.carId < b.carId ? -1 : a.carId > b.carId ? 1 : 0)),
    builds: d.builds,
  };
}

/** What this device would put in the account: its own data, never the sample data that comes with a first launch. */
export function toSyncDoc(data: AppData): SyncDoc {
  const sessions = data.sessions.filter((s) => !s.demo);
  const exams = data.exams.filter((e) => !e.demo);
  const used = new Set<string>([...sessions.map((s) => s.subjectId), ...exams.map((e) => e.subjectId)]);
  const subjects = data.subjects.filter((s) => !s.demo || used.has(s.id)).map((s) => ({ ...s, demo: undefined }));
  return canon({ v: 1, settings: pickSettings(data.settings), subjects, sessions, exams, garage: data.garage, builds: data.builds });
}

/** A stable fingerprint of a document, used to tell whether anything changed. */
export const docKey = (d: SyncDoc | null): string => (d ? stable(d) : '');

/** Reads a document that came from the server. Anything malformed is dropped rather than trusted. */
export function parseSyncDoc(raw: unknown): SyncDoc | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const parsed = parseAppData({ version: 1, settings: r.settings, subjects: r.subjects, sessions: r.sessions, exams: r.exams, friends: [], garage: r.garage, builds: r.builds, active: null });
  if (!parsed) return null;
  return canon({ v: 1, settings: pickSettings(parsed.settings), subjects: parsed.subjects.map((s) => ({ ...s, demo: undefined })), sessions: parsed.sessions, exams: parsed.exams, garage: parsed.garage, builds: parsed.builds });
}

export const isEmptyDoc = (d: SyncDoc | null): boolean => !d || (d.sessions.length === 0 && d.exams.length === 0 && d.subjects.length === 0 && d.garage.length === 0 && Object.keys(d.builds).length === 0);

// ---------- merging ----------

/** One list, merged by id. */
function mergeById<T extends { id: string }>(base: T[] | null, local: T[], remote: T[]): T[] {
  const b = new Map((base ?? []).map((x) => [x.id, x]));
  const l = new Map(local.map((x) => [x.id, x]));
  const r = new Map(remote.map((x) => [x.id, x]));
  const out: T[] = [];
  for (const id of new Set([...l.keys(), ...r.keys()])) {
    const lv = l.get(id);
    const rv = r.get(id);
    const bv = b.get(id);
    const changed = (x: T) => !bv || stable(x) !== stable(bv);
    if (lv && rv) {
      if (!base || !bv) out.push(stable(lv) === stable(rv) ? lv : rv); // first time together: the account's version stands
      else out.push(changed(lv) ? lv : rv); // changed here → mine; otherwise whatever the account has
    } else if (lv) {
      // Gone from the account. If it was part of the last sync, someone removed it there. A change made here since is kept.
      if (bv && !changed(lv)) continue;
      out.push(lv);
    } else if (rv) {
      // Missing here but present in the account: removed on this device if it was part of the last sync.
      if (bv && !changed(rv)) continue;
      out.push(rv);
    }
  }
  return out;
}

const isDefault = <K extends SyncedSettingKey>(k: K, v: unknown) => stable(DEFAULT_SETTINGS[k]) === stable(v);

function mergeSettings(base: SyncedSettings | null, local: SyncedSettings, remote: SyncedSettings): SyncedSettings {
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_SETTING_KEYS) {
    const lv = local[k];
    const rv = remote[k];
    if (stable(lv) === stable(rv)) out[k] = lv;
    else if (base) {
      const lChanged = stable(lv) !== stable(base[k]);
      const rChanged = stable(rv) !== stable(base[k]);
      out[k] = lChanged ? lv : rChanged ? rv : lv;
    } else {
      // First sync: a choice somebody made beats a default; if both made one, the account's wins.
      out[k] = isDefault(k, rv) ? lv : rv;
    }
  }
  return out as unknown as SyncedSettings;
}

/**
 * The same subject made on two devices (say "Biology" typed on both) has two different ids. Treat them as one:
 * the smaller id is kept on both sides, so every device settles on the same answer.
 */
function unifySubjects(local: SyncDoc, remote: SyncDoc): { local: SyncDoc; remote: SyncDoc; remap: Record<string, string> } {
  const remap: Record<string, string> = {};
  const kept: Record<string, Subject> = {};
  const key = (s: Subject) => s.name.trim().toLowerCase();
  const remoteByName = new Map(remote.subjects.map((s) => [key(s), s]));
  const localIds = new Set(local.subjects.map((s) => s.id));
  const remoteIds = new Set(remote.subjects.map((s) => s.id));
  for (const ls of local.subjects) {
    const rs = remoteByName.get(key(ls));
    if (!rs || rs.id === ls.id || remoteIds.has(ls.id) || localIds.has(rs.id)) continue;
    // The kept one's name and colour are used on both sides, so the result doesn't depend on which device merged.
    const keep = ls.id < rs.id ? ls : rs;
    remap[ls.id < rs.id ? rs.id : ls.id] = keep.id;
    kept[keep.id] = keep;
  }
  if (!Object.keys(remap).length) return { local, remote, remap };
  const fix = (id: string) => remap[id] ?? id;
  const apply = (d: SyncDoc): SyncDoc => {
    const seen = new Set<string>();
    const subjects = d.subjects.map((s) => kept[fix(s.id)] ?? { ...s, id: fix(s.id) }).filter((s) => !seen.has(s.id) && !!seen.add(s.id));
    return { ...d, subjects, sessions: d.sessions.map((s) => (remap[s.subjectId] ? { ...s, subjectId: fix(s.subjectId) } : s)), exams: d.exams.map((e) => (remap[e.subjectId] ? { ...e, subjectId: fix(e.subjectId) } : e)) };
  };
  return { local: apply(local), remote: apply(remote), remap };
}

export interface MergeResult {
  doc: SyncDoc;
  /** Subject ids replaced by another (same name on two devices). Used to repair things outside the document, like a session in progress. */
  remap: Record<string, string>;
}

/**
 * Three-way merge. `base` is the document at the last successful sync on this device (null the first time).
 * `remote` is what the account holds (null if it holds nothing yet; then the device's own data simply goes up).
 */
export function mergeDocs(base: SyncDoc | null, local: SyncDoc, remote: SyncDoc | null): MergeResult {
  if (!remote) return { doc: local, remap: {} };
  const u = unifySubjects(local, remote);
  const l = u.local;
  const r = u.remote;
  const b = base;

  const subjects = mergeById(b?.subjects ?? null, l.subjects, r.subjects);
  const sessions = mergeById(b?.sessions ?? null, l.sessions, r.sessions);
  const exams = mergeById(b?.exams ?? null, l.exams, r.exams);

  // Every session and exam needs its subject. Bring one back (from whichever side knew it) rather than leave a gap.
  const have = new Set(subjects.map((s) => s.id));
  const known = new Map<string, Subject>([...(b?.subjects ?? []), ...r.subjects, ...l.subjects].map((s) => [s.id, s]));
  for (const id of new Set([...sessions.map((s) => s.subjectId), ...exams.map((e) => e.subjectId)])) {
    if (have.has(id)) continue;
    subjects.push(known.get(id) ?? { id, name: 'Subject', color: 0 });
    have.add(id);
  }

  // Cars are only ever finished, never un-finished: keep the earliest finish. Unfinished progress takes the larger figure.
  const garageMap = new Map<string, GarageItem>();
  for (const g of [...l.garage, ...r.garage]) {
    const cur = garageMap.get(g.carId);
    if (!cur || g.at < cur.at) garageMap.set(g.carId, g);
  }
  const builds: Record<string, number> = {};
  for (const car of new Set([...Object.keys(l.builds), ...Object.keys(r.builds)])) {
    if (garageMap.has(car)) continue;
    builds[car] = Math.max(l.builds[car] ?? 0, r.builds[car] ?? 0);
  }

  return { doc: canon({ v: 1, settings: mergeSettings(b?.settings ?? null, l.settings, r.settings), subjects, sessions, exams, garage: [...garageMap.values()], builds }), remap: u.remap };
}

/**
 * Puts a merged document into the app's data. The session in progress, sample data and per-device settings are left alone.
 * Sample data from a first launch is dropped once there is real data to show in its place.
 */
export function applySyncDoc(local: AppData, doc: SyncDoc, remap: Record<string, string> = {}): AppData {
  const demo = isDemoMode(local);
  const hasContent = !isEmptyDoc(doc);
  const settings: Settings = { ...local.settings, ...doc.settings, ...(local.settings.lastSubjectId && remap[local.settings.lastSubjectId] ? { lastSubjectId: remap[local.settings.lastSubjectId] } : {}) };
  if (demo && !hasContent) return { ...local, settings };

  const base = demo ? stripDemo(local) : local;
  const active = base.active && remap[base.active.subjectId] ? { ...base.active, subjectId: remap[base.active.subjectId] } : base.active;
  const subjects = [...doc.subjects];
  // The session in progress may use a subject the account doesn't have (yet): keep it.
  if (active && !subjects.some((s) => s.id === active.subjectId)) {
    const mine = base.subjects.find((s) => s.id === active.subjectId);
    if (mine) subjects.push(mine);
  }
  const sessions = [...doc.sessions].sort((a, b) => a.startedAt - b.startedAt || byId(a, b));
  return { ...base, settings, subjects, sessions, exams: [...doc.exams], garage: [...doc.garage], builds: { ...doc.builds }, active };
}
