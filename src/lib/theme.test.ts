import { describe, expect, it } from 'vitest';
import { resolveTheme, themeColor } from './theme';
import { SKINS } from './skins';
import { parseAppData } from '../storage/adapter';
import { emptyData } from '../data/seed';

describe('theme', () => {
  it('follows the device only when the preference is "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('defaults to system and rejects unknown values when loading saved data', () => {
    expect(parseAppData(JSON.parse(JSON.stringify(emptyData())))!.settings.theme).toBe('system');
    const d = JSON.parse(JSON.stringify(emptyData()));
    d.settings.theme = 'neon';
    expect(parseAppData(d)!.settings.theme).toBe('system');
    d.settings.theme = 'dark';
    expect(parseAppData(d)!.settings.theme).toBe('dark');
  });

  it('defaults the skin to Quiet Hive, keeps Honey Pop, and rejects unknown skins', () => {
    const d = JSON.parse(JSON.stringify(emptyData()));
    expect(parseAppData(d)!.settings.skin).toBe('quiet');
    delete d.settings.skin;
    expect(parseAppData(d)!.settings.skin).toBe('quiet');
    d.settings.skin = 'pop';
    expect(parseAppData(d)!.settings.skin).toBe('pop');
    d.settings.skin = 'neon';
    expect(parseAppData(d)!.settings.skin).toBe('quiet');
  });

  it('has a status-bar colour for every skin in light and dark', () => {
    for (const s of SKINS) {
      expect(themeColor(s.id, 'light')).toMatch(/^#[0-9A-F]{6}$/i);
      expect(themeColor(s.id, 'dark')).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
