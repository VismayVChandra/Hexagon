import { useEffect } from 'react';
import type { SkinPref, ThemePref } from '../types';
import { useMediaQuery } from '../hooks/hooks';
import { SKIN_COLOR } from './skins';

export type ResolvedTheme = 'light' | 'dark';

/** Browser/status-bar colour for a skin in light or dark mode (matches --bg). */
export function themeColor(skin: SkinPref, theme: ResolvedTheme): string {
  return SKIN_COLOR[skin][theme];
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
}

/** The theme currently in effect, following the device when the preference is "system". */
export function useResolvedTheme(pref: ThemePref): ResolvedTheme {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  return resolveTheme(pref, systemDark);
}

/**
 * Writes the resolved light/dark mode to <html data-theme>, the skin to <html data-skin>, and the theme-color meta tag.
 * Pass null to leave the pre-paint values from index.html alone (e.g. while data is still loading).
 */
export function useApplyTheme(pref: ThemePref | null, skin: SkinPref = 'quiet', readable = false) {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  useEffect(() => {
    if (pref == null) return;
    const theme = resolveTheme(pref, systemDark);
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.skin = skin;
    if (readable) document.documentElement.dataset.readable = 'on';
    else delete document.documentElement.dataset.readable;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor(skin, theme));
  }, [pref, skin, readable, systemDark]);
}
