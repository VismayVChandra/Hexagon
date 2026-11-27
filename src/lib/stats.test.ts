import { describe, expect, it } from 'vitest';
import type { Exam, StudySession } from '../types';
import { buildBuckets, currentStreak, dayPartOf, focusInsights, longestStreak, recentWeeklyAverage, subjectTotals, todayMs, weekMs } from './stats';
import { suggestWeeklyGoal, examPlan } from './goals';
import { DAY, HOUR, MIN, addDays, dayKey, weekStartKey } from './time';

// Wednesday, 2026-11-25, 15:00 local
const NOW = new Date(2026, 10, 25, 15, 0, 0).getTime();
const TODAY = dayKey(NOW);

function ses(daysAgo: number, minutes: number, subjectId = 'a', id = Math.random().toString()): StudySession {
  const start = new Date(NOW - daysAgo * DAY);
  start.setHours(10, 0, 0, 0);
  return { id, subjectId, topic: '', goal: '', notes: '', mode: 'stopwatch', startedAt: start.getTime(), endedAt: start.getTime() + minutes * MIN, studiedMs: minutes * MIN, breakMs: 0, friendIds: [] };
}

describe('time helpers', () => {
  it('week starts on Monday', () => {
    expect(weekStartKey('2026-11-25')).toBe('2026-11-23');
    expect(weekStartKey('2026-11-29')).toBe('2026-11-23');
    expect(weekStartKey('2026-11-23')).toBe('2026-11-23');
  });
});

describe('totals derive from saved sessions', () => {
  it('sums today and this week', () => {
    const sessions = [ses(0, 30), ses(0, 15), ses(1, 60), ses(3, 40)];
    expect(todayMs(sessions, NOW)).toBe(45 * MIN);
    // Wed -> Mon is 2 days back; 3 days ago is the previous Sunday, so it is excluded.
    expect(weekMs(sessions, NOW)).toBe(105 * MIN);
  });

  it('groups by subject, largest first', () => {
    const t = subjectTotals([ses(0, 30, 'a'), ses(1, 90, 'b'), ses(2, 10, 'a')]);
    expect(t.map((x) => x.subjectId)).toEqual(['b', 'a']);
    expect(t[1]).toMatchObject({ ms: 40 * MIN, count: 2 });
  });
});

describe('streaks', () => {
  it('counts consecutive qualifying days ending today', () => {
    const s = [ses(0, 20), ses(1, 20), ses(2, 20), ses(4, 20)];
    expect(currentStreak(s, NOW)).toEqual({ days: 3, todayDone: true });
  });
  it('keeps the streak alive until the day is over', () => {
    const s = [ses(1, 20), ses(2, 20)];
    expect(currentStreak(s, NOW)).toEqual({ days: 2, todayDone: false });
  });
  it('ignores days under the minimum', () => {
    expect(currentStreak([ses(0, 5), ses(1, 5)], NOW).days).toBe(0);
  });
  it('breaks on a gap', () => {
    expect(currentStreak([ses(2, 30), ses(3, 30)], NOW).days).toBe(0);
  });
  it('finds the longest streak', () => {
    const s = [ses(10, 20), ses(9, 20), ses(8, 20), ses(7, 20), ses(3, 20), ses(2, 20)];
    expect(longestStreak(s)).toBe(4);
  });
});

describe('buckets', () => {
  const weekday = (k: string) => k;
  it('builds one bucket per day for short ranges and fills totals', () => {
    const start = addDays(TODAY, -6);
    const b = buildBuckets([ses(0, 30, 'a'), ses(0, 30, 'b'), ses(6, 45, 'a')], start, TODAY, weekday, weekday);
    expect(b).toHaveLength(7);
    expect(b[6].totalMs).toBe(60 * MIN);
    expect(b[6].bySubject).toHaveLength(2);
    expect(b[0].totalMs).toBe(45 * MIN);
  });
  it('switches to weekly buckets beyond 31 days and conserves the total', () => {
    const start = addDays(TODAY, -89);
    const sessions = [ses(0, 30), ses(20, 40), ses(60, 50), ses(89, 20)];
    const b = buildBuckets(sessions, start, TODAY, weekday, weekday);
    expect(b.length).toBeLessThan(20);
    expect(b.reduce((a, x) => a + x.totalMs, 0)).toBe(140 * MIN);
  });
});

describe('weekly average', () => {
  it('averages the preceding full weeks', () => {
    // Last week (Mon 16 - Sun 22) 5h, the week before 3h -> avg 4h over 2 usable weeks.
    const s = [ses(7, 300), ses(14, 180)];
    expect(recentWeeklyAverage(s, NOW, 4)).toBeCloseTo(4 * HOUR, -3);
  });
  it('is zero with no history', () => {
    expect(recentWeeklyAverage([], NOW)).toBe(0);
  });
});

describe('goal suggestion', () => {
  const exam = (daysAhead: number, targetHours: number, createdDaysAgo = 7): Exam => ({
    id: 'e' + daysAhead,
    subjectId: 'a',
    date: addDays(TODAY, daysAhead),
    notes: '',
    targetHours,
    createdAt: NOW - createdDaysAgo * DAY,
  });

  it('returns null with no upcoming exams', () => {
    expect(suggestWeeklyGoal([], [], 0, NOW)).toBeNull();
    expect(suggestWeeklyGoal([exam(-3, 10)], [], 0, NOW)).toBeNull();
  });

  it('subtracts logged study from the need', () => {
    const e = exam(14, 10);
    const plan = examPlan(e, [ses(2, 120)], NOW);
    expect(plan.loggedMs).toBe(120 * MIN);
    expect(plan.remainingMs).toBe(8 * HOUR);
    expect(plan.perWeekMs).toBeCloseTo(4 * HOUR, -3);
  });

  it('only counts study for the exam subject after it was added', () => {
    const plan = examPlan(exam(14, 10, 3), [ses(2, 60, 'a'), ses(2, 60, 'b'), ses(10, 60, 'a')], NOW);
    expect(plan.loggedMs).toBe(60 * MIN);
  });

  it('caps a big jump relative to recent habits and flags the ramp-up', () => {
    const sg = suggestWeeklyGoal([exam(7, 20)], [], 5 * HOUR, NOW)!;
    expect(sg.rampUp).toBe(true);
    expect(sg.suggestedMs).toBeLessThanOrEqual(5 * HOUR * 1.4 + 15 * MIN);
    expect(sg.neededMs).toBe(20 * HOUR);
  });

  it('uses the full need when it is close to current habits', () => {
    const sg = suggestWeeklyGoal([exam(14, 12, 1)], [], 5 * HOUR, NOW)!;
    expect(sg.rampUp).toBe(false);
    expect(sg.suggestedMs).toBe(6 * HOUR);
  });
});

describe('streak milestones', () => {
  it('points at the next milestone', async () => {
    const { nextMilestone } = await import('./stats');
    expect(nextMilestone(0)).toEqual({ target: 3, remaining: 3 });
    expect(nextMilestone(3)).toEqual({ target: 7, remaining: 4 });
    expect(nextMilestone(29)).toEqual({ target: 30, remaining: 1 });
    expect(nextMilestone(365)).toBeNull();
  });
});

describe('focus insights', () => {
  const at = (hour: number, minutes: number, extra: Partial<StudySession> = {}): StudySession => {
    const start = new Date(2026, 10, 20, hour, 0, 0).getTime();
    return { id: Math.random().toString(), subjectId: 'a', topic: '', goal: '', notes: '', mode: 'stopwatch', startedAt: start, endedAt: start + minutes * MIN, studiedMs: minutes * MIN, breakMs: 0, friendIds: [], ...extra };
  };

  it('sorts start times into parts of the day', () => {
    const t = (h: number) => new Date(2026, 10, 20, h, 30).getTime();
    expect([4, 5, 11, 12, 16, 17, 21, 22, 23].map((h) => dayPartOf(t(h)))).toEqual(['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night']);
  });

  it('says nothing about a best time until there are enough sessions', () => {
    expect(focusInsights([at(20, 30), at(20, 30)]).bestPart).toBeNull();
    expect(focusInsights([at(20, 30), at(20, 30), at(21, 30), at(9, 10)]).bestPart).toBe('evening');
  });

  it('weights parts by study time, not by number of sessions', () => {
    const ins = focusInsights([at(9, 10), at(9, 10), at(9, 10), at(19, 120)]);
    expect(ins.bestPart).toBe('evening');
    expect(ins.parts.find((p) => p.id === 'evening')!.share).toBeCloseTo(120 / 150);
  });

  it('ignores manual and under-a-minute sessions', () => {
    const ins = focusInsights([at(9, 30, { manual: true }), { ...at(9, 1), studiedMs: 30_000 }, at(10, 20)]);
    expect(ins.sessions).toBe(1);
    expect(ins.longestMs).toBe(20 * MIN);
  });

  it('averages focus ratings and counts ticked tasks', () => {
    const task = (done: boolean) => ({ id: Math.random().toString(), text: 't', done });
    const ins = focusInsights([at(9, 30, { focus: 4, tasks: [task(true), task(false)] }), at(9, 30, { focus: 2 }), at(14, 30, { focus: 5, tasks: [task(true)] })]);
    expect(ins.rated).toBe(3);
    expect(ins.avgFocus).toBeCloseTo((4 + 2 + 5) / 3);
    expect(ins.parts.find((p) => p.id === 'morning')!.avgFocus).toBeCloseTo(3);
    expect(ins.tasksDone).toBe(2);
    expect(ins.tasksTotal).toBe(3);
  });

  it('is all zeros for no sessions', () => {
    const ins = focusInsights([]);
    expect(ins.sessions).toBe(0);
    expect(ins.avgFocus).toBeNull();
    expect(ins.bestPart).toBeNull();
    expect(ins.parts.every((p) => p.ms === 0 && p.share === 0)).toBe(true);
  });
});
