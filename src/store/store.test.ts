import { describe, expect, it } from 'vitest';
import { isDemoMode, makeTasks, stripDemo } from './store';
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

describe('session plans', () => {
  it('turns typed lines into tasks, trimming and dropping blanks and repeats', () => {
    const tasks = makeTasks(['  Past paper 2022 ', '', 'past paper 2022', 'Flashcards'])!;
    expect(tasks.map((t) => t.text)).toEqual(['Past paper 2022', 'Flashcards']);
    expect(tasks.every((t) => !t.done && t.id.startsWith('tsk'))).toBe(true);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(2);
  });

  it('has no plan when there is nothing to plan, and caps it at 12', () => {
    expect(makeTasks(undefined)).toBeUndefined();
    expect(makeTasks(['', '  '])).toBeUndefined();
    expect(makeTasks(Array.from({ length: 30 }, (_, i) => `task ${i}`))).toHaveLength(12);
  });
});
