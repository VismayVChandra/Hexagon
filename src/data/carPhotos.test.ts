/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { CARS } from './cars';
import { CAR_PHOTOS } from './carPhotos';

describe('car photos', () => {
  it('has a credited photo for every car, and the file exists', () => {
    for (const car of CARS) {
      expect(CAR_PHOTOS[car.id], `${car.id} has no credit entry`).toBeTruthy();
      const file = `public/cars/${car.id}.webp`;
      expect(existsSync(file), `${file} is missing`).toBe(true);
    }
  });
  it('only uses freely licensed photos, with an author and a link back to the source', () => {
    for (const [id, p] of Object.entries(CAR_PHOTOS)) {
      expect(p.license, id).toMatch(/^(CC BY(-SA)? \d|CC0)/);
      expect(p.author.length, id).toBeGreaterThan(0);
      expect(p.page, id).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      if (p.licenseUrl) expect(p.licenseUrl, id).toMatch(/^https:\/\//);
    }
  });
  it('keeps the photos small enough for phones', () => {
    for (const car of CARS) expect(statSync(`public/cars/${car.id}.webp`).size).toBeLessThan(120 * 1024);
  });
  it('has no credit entries for cars that no longer exist', () => {
    const ids = new Set(CARS.map((c) => c.id));
    for (const id of Object.keys(CAR_PHOTOS)) expect(ids.has(id), id).toBe(true);
  });
});
