import { parseAuthHash, type ParsedAuthHash } from './validate';

/**
 * Email links (confirm your account, reset your password) return to the site with the result in the URL hash. The app's
 * router also uses the hash, so it would treat that as an unknown page and discard it. This runs before the app renders:
 * it reads the result, then points the address bar at the Friends page.
 */
let captured: ParsedAuthHash | null = null;

export function captureAuthRedirect() {
  const parsed = parseAuthHash(location.hash);
  if (!parsed) return;
  captured = parsed;
  // Drop the tokens from the address bar and land on the Friends page.
  history.replaceState(null, '', `${location.pathname}${location.search}#/friends`);
}

/** Returns what the link carried (once), or null. */
export function takeAuthRedirect(): ParsedAuthHash | null {
  const r = captured;
  captured = null;
  return r;
}
