import { describe, expect, it } from 'vitest';
import { applySyncDoc, docKey, isEmptyDoc, mergeDocs, parseSyncDoc, toSyncDoc, type SyncDoc } from './syncMerge';
import { createSeed, emptyData } from '../data/seed';
import type { AppData, Exam, StudySession, Subject } from '../types';

const subject = (id: string, name: string): Subject => ({ id, name, color: 0 });
const session = (id: string, subjectId: string, over: Partial<StudySession> = {}): StudySession => ({
  id,
  subjectId,
  topic: '',
  goal: '',
  notes: '',
  mode: 'stopwatch',
  startedAt: 1_000,
  endedAt: 2_000,
  studiedMs: 60 * 60_000,
  breakMs: 0,
  friendIds: [],
  ...over,
});
const exam = (id: string, subjectId: string, over: Partial<Exam> = {}): Exam => ({ id, subjectId, date: '2030-01-01', notes: '', targetHours: 10, createdAt: 1, ...over });

function data(over: Partial<AppData> = {}): AppData {
  return { ...emptyData(), ...over };
}
const doc = (over: Partial<AppData> = {}) => toSyncDoc(data(over));

describe('toSyncDoc', () => {
  it('leaves out the sample data that comes with a first launch', () => {
    const d = toSyncDoc(createSeed());
    expect(isEmptyDoc(d)).toBe(true);
  });

  it('keeps a sample subject once real sessions use it, without the demo flag', () => {
    const seed = createSeed();
    const d = toSyncDoc({ ...seed, sessions: [...seed.sessions, session('mine', 'sub_biology')] });
    expect(d.sessions.map((s) => s.id)).toEqual(['mine']);
    expect(d.subjects.map((s) => s.id)).toEqual(['sub_biology']);
    expect(d.subjects[0].demo).toBeUndefined();
  });

  it('gives the same fingerprint however the lists were ordered', () => {
    const a = doc({ sessions: [session('a', 's'), session('b', 's')], subjects: [subject('s', 'Bio')] });
    const b = doc({ sessions: [session('b', 's'), session('a', 's')], subjects: [subject('s', 'Bio')] });
    expect(docKey(a)).toBe(docKey(b));
  });

  it('only carries the settings that should follow the student', () => {
    const d = toSyncDoc(data({ settings: { ...emptyData().settings, theme: 'dark', cueVolume: 0.2, dailyGoalMin: 120 } }));
    expect(d.settings.dailyGoalMin).toBe(120);
    expect('theme' in d.settings).toBe(false);
    expect('cueVolume' in d.settings).toBe(false);
  });
});

describe('merging', () => {
  it('a new device signing in gets everything the account holds', () => {
    const remote = doc({ subjects: [subject('s1', 'Biology')], sessions: [session('a', 's1')], garage: [{ carId: 'x', at: 5 }] });
    const { doc: out } = mergeDocs(null, doc(), remote);
    expect(out.sessions.map((s) => s.id)).toEqual(['a']);
    expect(out.subjects).toHaveLength(1);
    expect(out.garage).toHaveLength(1);
  });

  it('a device with history signing in to an empty account sends it all up', () => {
    const local = doc({ subjects: [subject('s1', 'Biology')], sessions: [session('a', 's1')] });
    expect(mergeDocs(null, local, null).doc).toEqual(local);
    expect(mergeDocs(null, local, doc()).doc.sessions.map((s) => s.id)).toEqual(['a']);
  });

  it('two devices that both studied before ever syncing end up with both histories', () => {
    const phone = doc({ subjects: [subject('p', 'Biology')], sessions: [session('a', 'p')] });
    const laptop = doc({ subjects: [subject('l', 'Maths')], sessions: [session('b', 'l')] });
    const { doc: out } = mergeDocs(null, laptop, phone);
    expect(out.sessions.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(out.subjects.map((s) => s.name).sort()).toEqual(['Biology', 'Maths']);
  });

  it('the same subject name on two devices becomes one subject, with sessions repointed', () => {
    const phone = doc({ subjects: [subject('sub_a', 'Biology')], sessions: [session('a', 'sub_a')] });
    const laptop = doc({ subjects: [subject('sub_b', 'biology')], sessions: [session('b', 'sub_b')] });
    const r1 = mergeDocs(null, laptop, phone);
    expect(r1.doc.subjects).toHaveLength(1);
    expect(r1.doc.subjects[0].id).toBe('sub_a'); // the smaller id wins
    expect(new Set(r1.doc.sessions.map((s) => s.subjectId))).toEqual(new Set(['sub_a']));
    expect(r1.remap).toEqual({ sub_b: 'sub_a' });
    // From the other side the answer is the same, so devices settle on one result.
    const r2 = mergeDocs(null, phone, laptop);
    expect(docKey(r2.doc)).toBe(docKey(r1.doc));
  });

  it('a session deleted on one device is deleted on the other, not brought back', () => {
    const s = [subject('s', 'Bio')];
    const base = doc({ subjects: s, sessions: [session('a', 's'), session('b', 's')] });
    const remote = doc({ subjects: s, sessions: [session('a', 's')] }); // the laptop deleted b
    const local = base; // the phone still has both
    const { doc: out } = mergeDocs(base, local, remote);
    expect(out.sessions.map((x) => x.id)).toEqual(['a']);
  });

  it('a session deleted here is not brought back by the account', () => {
    const s = [subject('s', 'Bio')];
    const base = doc({ subjects: s, sessions: [session('a', 's'), session('b', 's')] });
    const local = doc({ subjects: s, sessions: [session('a', 's')] });
    const { doc: out } = mergeDocs(base, local, base);
    expect(out.sessions.map((x) => x.id)).toEqual(['a']);
  });

  it('keeps what was added on both sides since the last sync', () => {
    const s = [subject('s', 'Bio')];
    const base = doc({ subjects: s, sessions: [session('a', 's')] });
    const local = doc({ subjects: s, sessions: [session('a', 's'), session('b', 's')] });
    const remote = doc({ subjects: s, sessions: [session('a', 's'), session('c', 's')] });
    expect(mergeDocs(base, local, remote).doc.sessions.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('an edit on one side wins over the untouched copy on the other; if both edited, this device wins', () => {
    const s = [subject('s', 'Bio')];
    const base = doc({ subjects: s, exams: [exam('e', 's', { date: '2030-01-01' })] });
    const edited = doc({ subjects: s, exams: [exam('e', 's', { date: '2030-02-02' })] });
    expect(mergeDocs(base, edited, base).doc.exams[0].date).toBe('2030-02-02');
    expect(mergeDocs(base, base, edited).doc.exams[0].date).toBe('2030-02-02');
    const other = doc({ subjects: s, exams: [exam('e', 's', { date: '2030-03-03' })] });
    expect(mergeDocs(base, edited, other).doc.exams[0].date).toBe('2030-02-02');
  });

  it('never loses a session whose subject was removed on the other side', () => {
    const base = doc({ subjects: [subject('s', 'Bio')], sessions: [] });
    const local = doc({ subjects: [subject('s', 'Bio')], sessions: [session('a', 's')] });
    const remote = doc({ subjects: [], sessions: [] }); // subject deleted elsewhere
    const out = mergeDocs(base, local, remote).doc;
    expect(out.sessions.map((x) => x.id)).toEqual(['a']);
    expect(out.subjects.map((x) => x.id)).toEqual(['s']);
  });

  it('cars: finished stays finished, progress takes the larger figure and never lingers for a finished car', () => {
    const local = doc({ garage: [{ carId: 'a', at: 10 }], builds: { b: 30 } });
    const remote = doc({ garage: [{ carId: 'a', at: 5 }], builds: { a: 99, b: 50, c: 7 } });
    const out = mergeDocs(null, local, remote).doc;
    expect(out.garage).toEqual([{ carId: 'a', at: 5 }]);
    expect(out.builds).toEqual({ b: 50, c: 7 });
  });

  it('settings: a first sync prefers a choice over a default; later syncs follow whoever changed it', () => {
    const custom = { ...emptyData().settings, dailyGoalMin: 120 };
    const withGoal = doc({ settings: custom });
    expect(mergeDocs(null, doc(), withGoal).doc.settings.dailyGoalMin).toBe(120);
    expect(mergeDocs(null, withGoal, doc()).doc.settings.dailyGoalMin).toBe(120);
    const base = doc();
    expect(mergeDocs(base, withGoal, base).doc.settings.dailyGoalMin).toBe(120);
    expect(mergeDocs(base, base, withGoal).doc.settings.dailyGoalMin).toBe(120);
    // setting it back to the default is also a change
    expect(mergeDocs(withGoal, doc(), withGoal).doc.settings.dailyGoalMin).toBe(90);
  });

  it('is stable: merging a result with itself changes nothing', () => {
    const a = doc({ subjects: [subject('s', 'Bio')], sessions: [session('a', 's')], exams: [exam('e', 's')] });
    const once = mergeDocs(a, a, a).doc;
    expect(docKey(once)).toBe(docKey(a));
  });
});

describe('applySyncDoc', () => {
  it('replaces sample data with the account’s real data', () => {
    const remote = doc({ subjects: [subject('s1', 'Biology')], sessions: [session('a', 's1')] });
    const out = applySyncDoc(createSeed(), remote);
    expect(out.sessions.map((s) => s.id)).toEqual(['a']);
    expect(out.subjects.map((s) => s.id)).toEqual(['s1']);
    expect(out.friends).toHaveLength(0);
    expect(out.sessions.some((s) => s.demo)).toBe(false);
  });

  it('keeps the sample data if the account has nothing yet', () => {
    const out = applySyncDoc(createSeed(), doc());
    expect(out.sessions.some((s) => s.demo)).toBe(true);
  });

  it('leaves the running session alone, repointing its subject if two subjects were joined', () => {
    const local = data({
      subjects: [subject('sub_b', 'Biology')],
      active: { id: 'x', subjectId: 'sub_b', topic: '', goal: '', config: { mode: 'stopwatch' }, startedAt: 1, runMs: 0, resumedAt: 1, lastSeenAt: 1, friendIds: [] },
    });
    const merged = doc({ subjects: [subject('sub_a', 'Biology')] });
    const out = applySyncDoc(local, merged, { sub_b: 'sub_a' });
    expect(out.active?.subjectId).toBe('sub_a');
  });

  it('keeps per-device settings and applies the shared ones', () => {
    const local = data({ settings: { ...emptyData().settings, theme: 'dark', dailyGoalMin: 60 } });
    const merged = doc({ settings: { ...emptyData().settings, dailyGoalMin: 150 } });
    const out = applySyncDoc(local, merged);
    expect(out.settings.theme).toBe('dark');
    expect(out.settings.dailyGoalMin).toBe(150);
  });

  it('after applying, the device’s own document equals the merged one', () => {
    const phone = doc({ subjects: [subject('p', 'Biology')], sessions: [session('a', 'p')] });
    const laptop = data({ subjects: [subject('l', 'Maths')], sessions: [session('b', 'l')] });
    const { doc: merged, remap } = mergeDocs(null, toSyncDoc(laptop), phone);
    expect(docKey(toSyncDoc(applySyncDoc(laptop, merged, remap)))).toBe(docKey(merged));
  });
});

describe('parseSyncDoc', () => {
  it('reads what it wrote', () => {
    const d: SyncDoc = doc({ subjects: [subject('s', 'Bio')], sessions: [session('a', 's')], garage: [{ carId: 'ferrari-f40', at: 3 }] });
    expect(docKey(parseSyncDoc(JSON.parse(JSON.stringify(d))))).toBe(docKey(d));
  });
  it('rejects things that are not documents and drops junk entries', () => {
    expect(parseSyncDoc(null)).toBeNull();
    expect(parseSyncDoc([])).toBeNull();
    const p = parseSyncDoc({ sessions: [{ nope: 1 }, session('a', 's')], subjects: 'x' });
    expect(p?.sessions.map((s) => s.id)).toEqual(['a']);
    expect(p?.subjects).toEqual([]);
  });
});
