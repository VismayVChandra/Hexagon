import type { SkinPref } from '../types';

/** The looks a student can pick from. Light/dark is a separate choice that works with every skin. */
export const SKINS: { id: SkinPref; label: string; blurb: string }[] = [
  { id: 'quiet', label: 'Quiet Hive', blurb: 'Calm and warm, like a good notebook.' },
  { id: 'pop', label: 'Honey Pop', blurb: 'Bold and playful, with chunky buttons.' },
];

export const SKIN_IDS = SKINS.map((s) => s.id);

export function parseSkin(v: unknown): SkinPref {
  return SKIN_IDS.find((id) => id === v) ?? 'quiet';
}

/** Browser/status-bar colour for each skin and light/dark mode (matches --bg). */
export const SKIN_COLOR: Record<SkinPref, { light: string; dark: string }> = {
  quiet: { light: '#F7F1E5', dark: '#0E1916' },
  pop: { light: '#FFF6DF', dark: '#17140D' },
};
