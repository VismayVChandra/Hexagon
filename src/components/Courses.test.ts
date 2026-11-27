import { describe, expect, it } from 'vitest';
import { checkSetup, examLine, hasProblems, nextExamBySubject } from './Courses';
import type { Exam, Subject } from '../types';

const today = '2026-11-28';
const subj = (id: string, name: string): Subject => ({ id, name, color: 0 });
const exam = (id: string, subjectId: string, date: string): Exam => ({ id, subjectId, date, notes: '', targetHours: 10, createdAt: 1 });

describe('course setup', () => {
  it('accepts new subjects with or without exam dates, ignoring blank rows', () => {
    const p = checkSetup({ rows: [{ name: 'Thermodynamics', date: '2026-12-20' }, { name: 'Fluid Mechanics', date: '' }, { name: '', date: '' }], dates: {} }, [], [], today);
    expect(hasProblems(p)).toBe(false);
  });

  it('flags a name that exists already, a repeat, a missing name and a date in the past', () => {
    const p = checkSetup(
      { rows: [{ name: 'biology', date: '' }, { name: 'Maths', date: '' }, { name: 'maths', date: '' }, { name: '', date: '2026-12-01' }, { name: 'Physics', date: '2026-01-01' }], dates: {} },
      [subj('a', 'Biology')],
      [],
      today,
    );
    expect(p.rows[0].name).toMatch(/already/);
    expect(p.rows[1]).toBeUndefined();
    expect(p.rows[2].name).toMatch(/twice/);
    expect(p.rows[3].name).toMatch(/name/);
    expect(p.rows[4].date).toMatch(/today or later/);
  });

  it('checks dates typed for subjects you already have, but only when changed', () => {
    const subjects = [subj('a', 'Biology'), subj('b', 'Maths')];
    const exams = [exam('e1', 'a', '2026-12-10')];
    const ok = checkSetup({ rows: [], dates: { a: '2026-12-10', b: '' } }, subjects, exams, today);
    expect(hasProblems(ok)).toBe(false);
    const bad = checkSetup({ rows: [], dates: { a: '2026-12-12', b: '2020-01-01' } }, subjects, exams, today);
    expect(bad.dates.a).toBeUndefined(); // moving an existing exam is fine
    expect(bad.dates.b).toMatch(/today or later/); // a brand new exam in the past is not
  });

  it('finds the next exam per subject and words the countdown', () => {
    const m = nextExamBySubject([exam('e1', 'a', '2026-12-10'), exam('e2', 'a', '2026-12-02'), exam('e3', 'a', '2026-11-01')], today);
    expect(m.get('a')?.id).toBe('e2');
    expect(examLine('2026-11-28', today)).toBe('Exam today');
    expect(examLine('2026-11-29', today)).toBe('Exam tomorrow');
    expect(examLine('2026-12-10', today)).toBe('Exam in 12 days');
  });
});
