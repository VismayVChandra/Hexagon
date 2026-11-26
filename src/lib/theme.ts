import { useEffect } from 'react';
import type { ThemePref } from '../types';
import { useMediaQuery } from '../hooks/hooks';

export type ResolvedTheme = 'light' | 'dark';

/** Browser/status-bar colour for each theme (matches --bg). */
export const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#F4EFE4', dark: '#121816' };

export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
}

/** The theme currently in effect, following the device when the preference is "system". */
export function useResolvedTheme(pref: ThemePref): ResolvedTheme {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  return resolveTheme(pref, systemDark);
}

/**
 * Writes the resolved theme to <html data-theme> and the theme-color meta tag.
 * Pass null to leave the pre-paint value from index.html alone (e.g. while data is still loading).
 */
export function useApplyTheme(pref: ThemePref | null) {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  useEffect(() => {
    if (pref == null) return;
    const theme = resolveTheme(pref, systemDark);
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }, [pref, systemDark]);
}
