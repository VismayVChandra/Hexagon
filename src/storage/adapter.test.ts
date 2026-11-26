import { describe, expect, it } from 'vitest';
import { parseAppData } from './adapter';
import { createSeed, emptyData } from '../data/seed';

describe('parseAppData', () => {
  it('round-trips the seed data', () => {
    const seed = createSeed();
    const parsed = parseAppData(JSON.parse(JSON.stringify(seed)));
    expect(parsed).not.toBeNull();
    expect(parsed!.sessions).toHaveLength(seed.sessions.length);
    expect(parsed!.exams).toHaveLength(seed.exams.length);
    expect(parsed!.friends).toHaveLength(seed.friends.length);
  });

  it('rejects wrong shapes and versions', () => {
    expect(parseAppData(null)).toBeNull();
    expect(parseAppData([])).toBeNull();
    expect(parseAppData({ version: 2 })).toBeNull();
  });

  it('drops invalid records but keeps valid ones', () => {
    const d = emptyData() as unknown as Record<string, unknown>;
    d.sessions = [
      { id: 'ok', subjectId: 's', startedAt: 1, endedAt: 2, studiedMs: 1000 },
      { id: 'bad', subjectId: 's', startedAt: 'x', endedAt: 2, studiedMs: 1000 },
      'nonsense',
    ];
    const parsed = parseAppData(d)!;
    expect(parsed.sessions.map((s) => s.id)).toEqual(['ok']);
  });

  it('clamps out-of-range settings and keeps privacy defaults off', () => {
    const d = emptyData() as unknown as Record<string, unknown>;
    d.settings = { dailyGoalMin: 999999, pomodoro: { focusMin: -4 } };
    const s = parseAppData(d)!.settings;
    expect(s.dailyGoalMin).toBe(720);
    expect(s.pomodoro.focusMin).toBe(1);
    expect(s.sharePresence).toBe(false);
    expect(s.shareSubject).toBe(false);
  });

  it('drops an active session with an invalid timer config', () => {
    const d = emptyData() as unknown as Record<string, unknown>;
    d.active = { id: 'a', subjectId: 's', startedAt: 1, runMs: 0, config: { mode: 'weird' } };
    expect(parseAppData(d)!.active).toBeNull();
  });
});

describe('seed data', () => {
  it('has realistic, populated history flagged as demo', () => {
    const seed = createSeed();
    expect(seed.sessions.length).toBeGreaterThan(30);
    expect(seed.sessions.every((s) => s.demo)).toBe(true);
    expect(seed.sessions.every((s) => s.studiedMs > 0 && s.endedAt > s.startedAt)).toBe(true);
    expect(seed.active).toBeNull();
  });
});
