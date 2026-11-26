import { describe, expect, it } from 'vitest';
import { isDemoMode, stripDemo } from './store';
import { createSeed } from '../data/seed';
import type { StudySession } from '../types';

const own = (subjectId: string): StudySession => ({
  id: 'mine',
  subjectId,
  topic: '',
  goal: '',
  notes: '',
  mode: 'stopwatch',
  startedAt: 1,
  endedAt: 2,
  studiedMs: 1000,
  breakMs: 0,
  friendIds: [],
});

describe('demo mode', () => {
  it('is on for the seed and off for empty data', () => {
    expect(isDemoMode(createSeed())).toBe(true);
    expect(isDemoMode({ ...createSeed(), sessions: [], exams: [] })).toBe(false);
  });

  it('stripDemo clears all sample content', () => {
    const out = stripDemo(createSeed());
    expect(out.sessions).toHaveLength(0);
    expect(out.exams).toHaveLength(0);
    expect(out.subjects).toHaveLength(0);
    expect(out.friends).toHaveLength(0);
    expect(isDemoMode(out)).toBe(false);
  });

  it('keeps the student’s own sessions and the sample subject they use, now owned by them', () => {
    const seed = createSeed();
    const out = stripDemo({ ...seed, sessions: [...seed.sessions, own('sub_biology')] });
    expect(out.sessions.map((s) => s.id)).toEqual(['mine']);
    expect(out.subjects.map((s) => s.id)).toEqual(['sub_biology']);
    expect(out.subjects[0].demo).toBeUndefined();
  });

  it('keeps the subject of a session that is in progress', () => {
    const seed = createSeed();
    const active = { id: 'a', subjectId: 'sub_calculus', topic: '', goal: '', config: { mode: 'stopwatch' as const }, startedAt: 1, runMs: 0, resumedAt: 1, lastSeenAt: 1, friendIds: [] };
    expect(stripDemo({ ...seed, active }).subjects.map((s) => s.id)).toEqual(['sub_calculus']);
  });

  it('keeps only the friends the student picked', () => {
    const out = stripDemo(createSeed(), ['frd_maya']);
    expect(out.friends.map((f) => f.id)).toEqual(['frd_maya']);
  });
});
