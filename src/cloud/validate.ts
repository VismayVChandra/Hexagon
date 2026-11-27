export function isValidEmail(s: string): boolean {
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72; // the limit of the hashing scheme Supabase uses

/** A short, specific reason a password isn't acceptable, or null if it is fine. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (pw.length > MAX_PASSWORD) return `Use ${MAX_PASSWORD} characters or fewer.`;
  if (/^\s+$/.test(pw)) return 'A password can’t be only spaces.';
  return null;
}

export type AuthLinkType = 'signup' | 'recovery' | 'magiclink' | 'invite' | 'email_change' | string;

export interface ParsedAuthHash {
  accessToken?: string;
  refreshToken?: string;
  type?: AuthLinkType;
  error?: string;
}

/**
 * Supabase email links send people back with the result in the URL hash, e.g.
 *   #access_token=...&refresh_token=...&type=signup      (confirmed)
 *   #access_token=...&refresh_token=...&type=recovery    (password reset)
 *   #error=access_denied&error_code=otp_expired&...      (link used up or expired)
 * Returns null if the hash isn't one of those.
 */
export function parseAuthHash(hash: string): ParsedAuthHash | null {
  if (!/^#(access_token|error|error_code)=/.test(hash)) return null;
  const p = new URLSearchParams(hash.slice(1));
  if (p.get('access_token') && p.get('refresh_token')) {
    return { accessToken: p.get('access_token')!, refreshToken: p.get('refresh_token')!, type: p.get('type') ?? undefined };
  }
  if (p.get('error') || p.get('error_code')) {
    const expired = p.get('error_code') === 'otp_expired';
    return {
      error: expired
        ? 'That email link was already used or has expired. Mail apps sometimes open links before you do. If you just signed up, your email may already be confirmed, so try signing in with your password.'
        : 'That email link didn’t work. Try signing in, or request a new link.',
    };
  }
  return null;
}
