import { describe, expect, it } from 'vitest';
import { isValidEmail, parseAuthHash, passwordProblem } from './validate';

describe('email and password checks', () => {
  it('accepts normal addresses and rejects junk', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('first.last+tag@school.edu')).toBe(true);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
  });
  it('requires 8 to 72 characters', () => {
    expect(passwordProblem('short')).toMatch(/at least 8/);
    expect(passwordProblem('longenough')).toBeNull();
    expect(passwordProblem('x'.repeat(73))).toMatch(/72/);
    expect(passwordProblem('        ')).toBeTruthy();
  });
});

describe('parseAuthHash (links from emails)', () => {
  it('reads a confirmed signup', () => {
    expect(parseAuthHash('#access_token=AAA&refresh_token=BBB&expires_in=3600&type=signup')).toEqual({ accessToken: 'AAA', refreshToken: 'BBB', type: 'signup' });
  });
  it('reads a password-reset link', () => {
    expect(parseAuthHash('#access_token=AAA&refresh_token=BBB&type=recovery')?.type).toBe('recovery');
  });
  it('turns an expired link into a friendly message', () => {
    const r = parseAuthHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=');
    expect(r?.accessToken).toBeUndefined();
    expect(r?.error).toMatch(/already used or has expired/);
    expect(r?.error).toMatch(/try signing in/i);
  });
  it('handles other errors', () => {
    expect(parseAuthHash('#error=server_error')?.error).toBeTruthy();
  });
  it('ignores ordinary app routes', () => {
    expect(parseAuthHash('#/friends')).toBeNull();
    expect(parseAuthHash('')).toBeNull();
    expect(parseAuthHash('#/friends?code=482913')).toBeNull();
  });
});
