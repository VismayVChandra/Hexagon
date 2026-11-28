import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAR_MODELS } from './carModels';
import { carById } from './cars';

describe('real 3D car models', () => {
  const entries = Object.entries(CAR_MODELS);

  it('belong to cars in the garage and have a file on disk', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [id] of entries) {
      expect(carById(id), `${id} is not a car`).toBeTruthy();
      expect(existsSync(`public/models/${id}.glb`), `public/models/${id}.glb is missing`).toBe(true);
    }
  });

  it('are credited with author, licence and a link back, and are freely licensed', () => {
    for (const [id, m] of entries) {
      expect(m.author.length, id).toBeGreaterThan(0);
      expect(m.title.length, id).toBeGreaterThan(0);
      expect(m.license, id).toMatch(/^CC BY 4\.0$|^CC0/);
      expect(m.page, id).toMatch(/^https:\/\/sketchfab\.com\/3d-models\/[0-9a-f]{32}$/);
      expect(m.licenseUrl, id).toMatch(/^https:\/\/creativecommons\.org\//);
    }
  });

  it('are small enough to load when a car is finished', () => {
    for (const [id] of entries) expect(statSync(`public/models/${id}.glb`).size, id).toBeLessThan(6 * 1024 * 1024);
  });
});
