import { describe, expect, it } from 'vitest';
import { parseAppData, sanitizeTasks } from './adapter';
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

describe('scenes, garage and builds', () => {
  it('defaults the scene to honeycomb and starts with an empty garage', () => {
    const parsed = parseAppData(JSON.parse(JSON.stringify(emptyData())))!;
    expect(parsed.settings.scene).toBe('honeycomb');
    expect(parsed.garage).toEqual([]);
    expect(parsed.builds).toEqual({});
  });
  it('keeps valid garage items and build progress, and drops junk', () => {
    const d = JSON.parse(JSON.stringify(emptyData()));
    d.settings.scene = 'car';
    d.garage = [{ carId: 'porsche-911', at: 5 }, { carId: 7 }, 'x'];
    d.builds = { 'toyota-corolla': 120000, bad: -5, worse: 'lots' };
    const parsed = parseAppData(d)!;
    expect(parsed.settings.scene).toBe('car');
    expect(parsed.garage).toEqual([{ carId: 'porsche-911', at: 5 }]);
    expect(parsed.builds).toEqual({ 'toyota-corolla': 120000 });
  });
  it('rejects an unknown scene', () => {
    const d = JSON.parse(JSON.stringify(emptyData()));
    d.settings.scene = 'disco';
    expect(parseAppData(d)!.settings.scene).toBe('honeycomb');
  });
  it('loads data saved before scenes existed', () => {
    const d = JSON.parse(JSON.stringify(emptyData()));
    delete d.garage;
    delete d.builds;
    delete d.settings.scene;
    const parsed = parseAppData(d)!;
    expect(parsed.garage).toEqual([]);
    expect(parsed.settings.scene).toBe('honeycomb');
  });
});

describe('cars from the first garage', () => {
  it('moves old car ids onto the new catalog, keeping progress and finished cars', () => {
    const d = JSON.parse(JSON.stringify(emptyData()));
    d.garage = [{ carId: 'street-coupe', at: 9 }];
    d.builds = { 'mini-hatch': 600000, executive: 60000 };
    d.active = { id: 'a', subjectId: 's', startedAt: 1, runMs: 0, resumedAt: 1, config: { mode: 'stopwatch' }, scene: 'car', carId: 'supercar' };
    const parsed = parseAppData(d)!;
    expect(parsed.garage).toEqual([{ carId: 'toyota-corolla', at: 9 }]);
    expect(parsed.builds).toEqual({ 'maruti-alto': 600000, 'bmw-3-series': 60000 });
    expect(parsed.active?.carId).toBe('bmw-m4');
  });
  it('does not duplicate a car that appears under both ids', () => {
    const d = JSON.parse(JSON.stringify(emptyData()));
    d.garage = [{ carId: 'street-coupe', at: 1 }, { carId: 'toyota-corolla', at: 2 }];
    expect(parseAppData(d)!.garage).toHaveLength(1);
  });
});

describe('plans, focus ratings and ambient sound', () => {
  it('keeps valid tasks and drops malformed, blank and repeated ones', () => {
    const tasks = sanitizeTasks([
      { id: 'a', text: '  Past paper  ', done: true },
      { id: 'a', text: 'duplicate id', done: false },
      { id: 'b', text: '   ', done: false },
      { id: 'c', text: 42 },
      'nope',
      { id: 'd', text: 'x'.repeat(300) },
    ]);
    expect(tasks).toEqual([
      { id: 'a', text: 'Past paper', done: true },
      { id: 'd', text: 'x'.repeat(100), done: false },
    ]);
  });

  it('caps a plan at 12 tasks and returns nothing for an empty or missing plan', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, text: `task ${i}`, done: false }));
    expect(sanitizeTasks(many)).toHaveLength(12);
    expect(sanitizeTasks([])).toBeUndefined();
    expect(sanitizeTasks(undefined)).toBeUndefined();
  });

  it('round-trips tasks and the focus rating on a saved session, and rejects out-of-range ratings', () => {
    const seed = createSeed();
    const base = { ...seed.sessions[0] };
    const raw = JSON.parse(JSON.stringify({ ...seed, sessions: [{ ...base, focus: 4, tasks: [{ id: 'a', text: 'Read ch. 3', done: true }] }, { ...base, id: 'other', focus: 9 }] }));
    const parsed = parseAppData(raw)!;
    expect(parsed.sessions[0].focus).toBe(4);
    expect(parsed.sessions[0].tasks).toEqual([{ id: 'a', text: 'Read ch. 3', done: true }]);
    expect(parsed.sessions[1].focus).toBeUndefined();
  });

  it('defaults ambient sound to off and clamps the volume', () => {
    const seed = createSeed();
    expect(parseAppData(JSON.parse(JSON.stringify(seed)))!.settings.ambient).toBe('off');
    const odd = parseAppData(JSON.parse(JSON.stringify({ ...seed, settings: { ...seed.settings, ambient: 'thunder', ambientVolume: 7 } })))!;
    expect(odd.settings.ambient).toBe('off');
    expect(odd.settings.ambientVolume).toBe(1);
    const ok = parseAppData(JSON.parse(JSON.stringify({ ...seed, settings: { ...seed.settings, ambient: 'rain', ambientVolume: 0.25 } })))!;
    expect(ok.settings.ambient).toBe('rain');
    expect(ok.settings.ambientVolume).toBe(0.25);
  });
});

describe('sound and notification settings', () => {
  const settingsOf = (over: Record<string, unknown>) => {
    const seed = createSeed();
    return parseAppData(JSON.parse(JSON.stringify({ ...seed, settings: { ...seed.settings, ...over } })))!.settings;
  };

  it('accepts every ambient sound and falls back to off for anything unknown', () => {
    for (const id of ['rain', 'storm', 'waves', 'stream', 'forest', 'fire', 'night', 'wind', 'brown', 'white']) expect(settingsOf({ ambient: id }).ambient).toBe(id);
    expect(settingsOf({ ambient: 'cafe' }).ambient).toBe('off');
  });

  it('keeps timer sound choices valid', () => {
    expect(settingsOf({ cueTone: 'harp', cueVolume: 0.3, stopwatchChimeMin: 15, cueRepeat: false })).toMatchObject({ cueTone: 'harp', cueVolume: 0.3, stopwatchChimeMin: 15, cueRepeat: false });
    expect(settingsOf({ cueTone: 'laser', cueVolume: 9, stopwatchChimeMin: 7, cueRepeat: 'yes' })).toMatchObject({ cueTone: 'bell', cueVolume: 1, stopwatchChimeMin: 30, cueRepeat: true });
  });

  it('keeps notifications off until asked for, and the reminder hour in range', () => {
    const d = settingsOf({});
    expect(d.notify).toBe(false);
    expect(d.notifyTimer && d.notifyRewards && d.notifyNudges).toBe(true);
    expect(settingsOf({ notify: 'true' }).notify).toBe(false);
    expect(settingsOf({ nudgeHour: 99 }).nudgeHour).toBe(23);
    expect(settingsOf({ nudgeHour: 'x' }).nudgeHour).toBe(18);
  });
});

