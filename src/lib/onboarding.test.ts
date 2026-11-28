import { describe, expect, it } from 'vitest';
import { GOAL_MAX, GOAL_MIN, addCustomName, comebackWanted, daysAway, needsWelcome, stepGoal, suggestDailyMin, toggleName } from './onboarding';
import { emptyData, createSeed } from '../data/seed';
import { dayKey } from './time';
import type { AppData, StudySession } from '../types';

const DAY = 86_400_000;
const NOW = new Date('2026-11-28T12:00:00').getTime();

function session(endedAt: number, demo = false): StudySession {
  return { id: `s${endedAt}`, subjectId: 'a', topic: '', goal: '', notes: '', mode: 'stopwatch', startedAt: endedAt - 1_800_000, endedAt, studiedMs: 1_800_000, breakMs: 0, friendIds: [], ...(demo ? { demo: true } : {}) } as StudySession;
}
function withSessions(sessions: StudySession[]): AppData {
  return { ...emptyData(), sessions };
}

describe('daily goal', () => {
  it('steps by 15 minutes and stays in range', () => {
    expect(stepGoal(90, 1)).toBe(105);
    expect(stepGoal(90, -1)).toBe(75);
    expect(stepGoal(GOAL_MIN, -1)).toBe(GOAL_MIN);
    expect(stepGoal(GOAL_MAX, 1)).toBe(GOAL_MAX);
  });

  it('suggests a goal that reaches the exam target, rounded to 15 minutes within 30 to 240', () => {
    expect(suggestDailyMin(10)).toBe(60);
    expect(suggestDailyMin(18)).toBe(45); // 600/18 = 33.3 -> 45
    expect(suggestDailyMin(1)).toBe(240); // capped
    expect(suggestDailyMin(400)).toBe(30); // floor
    expect(suggestDailyMin(0)).toBe(240); // an exam today is treated as one day left
  });
});

describe('subject picking', () => {
  it('toggles a name on and off, ignoring case', () => {
    expect(toggleName([], 'Physics')).toEqual(['Physics']);
    expect(toggleName(['Physics'], 'physics')).toEqual([]);
  });

  it('adds typed subjects with sensible limits', () => {
    expect(addCustomName(['Physics'], '  Thermodynamics ').list).toEqual(['Physics', 'Thermodynamics']);
    expect(addCustomName(['Physics'], 'PHYSICS').list).toEqual(['Physics']);
    expect(addCustomName([], '   ').error).toBeTruthy();
    expect(addCustomName([], 'x'.repeat(41)).error).toBeTruthy();
    const full = Array.from({ length: 12 }, (_, i) => `S${i}`);
    expect(addCustomName(full, 'One more').error).toBeTruthy();
  });
});

describe('welcome and come-back', () => {
  it('welcomes only a new student who is still on the sample data', () => {
    expect(needsWelcome(createSeed())).toBe(true);
    const done = createSeed();
    done.settings.onboarded = true;
    expect(needsWelcome(done)).toBe(false);
    expect(needsWelcome(emptyData())).toBe(false); // an empty space is not first launch
  });

  it('counts days away from real sessions only', () => {
    expect(daysAway(withSessions([]), NOW)).toBeNull();
    expect(daysAway(withSessions([session(NOW - 5 * DAY, true)]), NOW)).toBeNull();
    expect(daysAway(withSessions([session(NOW - 5 * DAY), session(NOW - 3 * DAY)]), NOW)).toBe(3);
  });

  it('shows the come-back screen after two or more days, once a day, never during a session', () => {
    const d = withSessions([session(NOW - 3 * DAY)]);
    expect(comebackWanted(d, NOW, false)).toBe(true);
    expect(comebackWanted(d, NOW, true)).toBe(false);
    expect(comebackWanted(withSessions([session(NOW - 1 * DAY)]), NOW, false)).toBe(false);
    expect(comebackWanted(withSessions([]), NOW, false)).toBe(false);
    expect(comebackWanted({ ...d, active: { id: 'x' } as AppData['active'] }, NOW, false)).toBe(false);
    expect(dayKey(NOW)).toBe('2026-11-28');
  });
});
