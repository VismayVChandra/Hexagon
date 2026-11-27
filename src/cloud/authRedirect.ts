/**
 * Supabase email links send people back to the site with the result in the URL hash, e.g.
 *   #access_token=...&refresh_token=...      (link worked)
 *   #error=access_denied&error_code=otp_expired&error_description=...   (link expired or was pre-opened by a mail scanner)
 * The app's router also uses the hash, so it would treat that as an unknown page and throw the information away.
 * This runs before the app renders: it reads the result, then points the address bar at the Friends page.
 */

export interface AuthRedirect {
  error?: string;
  accessToken?: string;
  refreshToken?: string;
}

let captured: AuthRedirect | null = null;

export function captureAuthRedirect() {
  const hash = location.hash;
  if (!/^#(access_token|error|error_code)=/.test(hash)) return;
  const p = new URLSearchParams(hash.slice(1));
  if (p.get('access_token') && p.get('refresh_token')) {
    captured = { accessToken: p.get('access_token')!, refreshToken: p.get('refresh_token')! };
  } else if (p.get('error') || p.get('error_code')) {
    const expired = p.get('error_code') === 'otp_expired';
    captured = {
      error: expired
        ? 'That email link expired or was already used. Mail apps often open links before you do, which uses them up. Request a new code and type it in here instead.'
        : 'That sign-in link didn’t work. Request a new code and type it in here instead.',
    };
  }
  // Drop the tokens from the address bar and land on the Friends page.
  history.replaceState(null, '', `${location.pathname}${location.search}#/friends`);
}

/** Returns what the redirect carried (once), or null. */
export function takeAuthRedirect(): AuthRedirect | null {
  const r = captured;
  captured = null;
  return r;
}
