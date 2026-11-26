import { describe, expect, it } from 'vitest';
import { FINISHED_WINDOW_MS, FRESH_MS, desiredPresence, effectiveSessionMs, effectiveState, formatFriendCode, isValidEmail, normalizeFriendCode } from './presence';
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
  it('normalises pasted codes', () => {
    expect(normalizeFriendCode('abcd-2345')).toBe('ABCD2345');
    expect(normalizeFriendCode('  abcd 2345 ')).toBe('ABCD2345');
  });
  it('rejects wrong length and ambiguous characters', () => {
    expect(normalizeFriendCode('ABC')).toBeNull();
    expect(normalizeFriendCode('ABCD234')).toBeNull();
    expect(normalizeFriendCode('ABCD234I')).toBeNull();
    expect(normalizeFriendCode('ABCD2340')).toBeNull();
  });
  it('formats for reading', () => {
    expect(formatFriendCode('ABCD2345')).toBe('ABCD-2345');
  });
});

describe('email check', () => {
  it('accepts normal addresses and rejects junk', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
  });
});
