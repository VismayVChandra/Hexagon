import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';
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
});
