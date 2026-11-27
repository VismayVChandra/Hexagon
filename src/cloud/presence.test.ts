import { describe, expect, it } from 'vitest';
import { FINISHED_WINDOW_MS, FRESH_MS, desiredPresence, effectiveSessionMs, effectiveState, formatFriendCode, normalizeFriendCode } from './presence';
import { MIN } from '../lib/time';

const NOW = Date.UTC(2026, 10, 27, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('effectiveState', () => {
  it('shows studying only while heartbeats are fresh', () => {
    expect(effectiveState({ state: 'studying', updatedAt: ago(30_000) }, NOW)).toBe('studying');
    expect(effectiveState({ state: 'studying', updatedAt: ago(FRESH_MS + 1000) }, NOW)).toBe('offline');
  });
  it('shows online only while fresh', () => {
    expect(effectiveState({ state: 'online', updatedAt: ago(60_000) }, NOW)).toBe('online');
    expect(effectiveState({ state: 'online', updatedAt: ago(10 * MIN) }, NOW)).toBe('offline');
  });
  it('keeps finished for a while, then expires', () => {
    expect(effectiveState({ state: 'finished', updatedAt: ago(20 * MIN) }, NOW)).toBe('finished');
    expect(effectiveState({ state: 'finished', updatedAt: ago(FINISHED_WINDOW_MS + 1000) }, NOW)).toBe('offline');
  });
  it('treats missing presence (not sharing) as offline', () => {
    expect(effectiveState({ state: null, updatedAt: null }, NOW)).toBe('offline');
    expect(effectiveState({ state: 'studying', updatedAt: 'not a date' }, NOW)).toBe('offline');
  });
  it('tolerates clock skew (updates slightly in the future)', () => {
    expect(effectiveState({ state: 'studying', updatedAt: new Date(NOW + 5000).toISOString() }, NOW)).toBe('studying');
  });
});

describe('effectiveSessionMs', () => {
  it('adds time since the last heartbeat while studying', () => {
    expect(effectiveSessionMs({ state: 'studying', updatedAt: ago(40_000), sessionMs: 10 * MIN }, NOW)).toBe(10 * MIN + 40_000);
  });
  it('does not grow after finishing', () => {
    expect(effectiveSessionMs({ state: 'finished', updatedAt: ago(5 * MIN), sessionMs: 50 * MIN }, NOW)).toBe(50 * MIN);
  });
});

describe('desiredPresence (privacy)', () => {
  const base = { sharing: true, shareSubject: false, running: false, studiedMs: 0, finished: null, now: NOW };
  it('publishes nothing unless sharing is on', () => {
    expect(desiredPresence({ ...base, sharing: false, running: true, subjectName: 'Biology' })).toBeNull();
  });
  it('never includes the subject unless it is shared', () => {
    expect(desiredPresence({ ...base, running: true, studiedMs: 5 * MIN, subjectName: 'Biology' })?.subject).toBeNull();
    expect(desiredPresence({ ...base, shareSubject: true, running: true, subjectName: 'Biology' })?.subject).toBe('Biology');
  });
  it('is studying while running, finished shortly after, otherwise online', () => {
    expect(desiredPresence({ ...base, running: true })?.state).toBe('studying');
    const fin = { at: NOW - 5 * MIN, studiedMs: 30 * MIN, subjectName: 'Biology' };
    expect(desiredPresence({ ...base, finished: fin })).toMatchObject({ state: 'finished', sessionMs: 30 * MIN, subject: null });
    expect(desiredPresence({ ...base, finished: { ...fin, at: NOW - FINISHED_WINDOW_MS - 1000 } })?.state).toBe('online');
    expect(desiredPresence(base)?.state).toBe('online');
  });
  it('carries the room only while studying', () => {
    expect(desiredPresence({ ...base, running: true, roomId: 'quiet-library' })?.roomId).toBe('quiet-library');
    expect(desiredPresence({ ...base, roomId: 'quiet-library' })?.roomId).toBeNull();
  });
});

describe('friend codes', () => {
  it('accepts 6 digits, ignoring spaces and dashes', () => {
    expect(normalizeFriendCode('482913')).toBe('482913');
    expect(normalizeFriendCode('482 913')).toBe('482913');
    expect(normalizeFriendCode(' 482-913 ')).toBe('482913');
  });
  it('rejects anything else', () => {
    expect(normalizeFriendCode('48291')).toBeNull();
    expect(normalizeFriendCode('4829133')).toBeNull();
    expect(normalizeFriendCode('48291a')).toBeNull();
    expect(normalizeFriendCode('')).toBeNull();
  });
  it('keeps leading zeros', () => {
    expect(normalizeFriendCode('004 219')).toBe('004219');
  });
  it('formats for reading aloud', () => {
    expect(formatFriendCode('482913')).toBe('482 913');
  });
});

describe('isCurrentCode', () => {
  it('accepts only 6-digit codes, so old letter codes are recognised', async () => {
    const { isCurrentCode } = await import('./presence');
    expect(isCurrentCode('482913')).toBe(true);
    expect(isCurrentCode('004219')).toBe(true);
    expect(isCurrentCode('K7M2QX9P')).toBe(false);
    expect(isCurrentCode('48291')).toBe(false);
    expect(isCurrentCode('')).toBe(false);
  });
});
