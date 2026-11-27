import { describe, expect, it } from 'vitest';
import { SPECS, buildShape, curve } from './carShape';
import { CARS } from '../data/cars';

describe('3D car shapes', () => {
  it('has a shape for every body style used by the cars', () => {
    for (const car of CARS) expect(SPECS[car.style], car.id).toBeTruthy();
  });

  for (const [style, spec] of Object.entries(SPECS)) {
    it(`${style}: the body is sound (finite, above the road, nose and tail inside the length)`, () => {
      const shape = buildShape(spec);
      const pos = shape.paint.getAttribute('position');
      let minY = Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        expect(Number.isFinite(x + y + z)).toBe(true);
        minY = Math.min(minY, y);
        expect(Math.abs(x)).toBeLessThanOrEqual(spec.L / 2 + 1e-6);
        expect(Math.abs(z)).toBeLessThanOrEqual(spec.W / 2 + 1e-6);
      }
      expect(minY).toBeGreaterThan(0.05);
    });

    it(`${style}: the underside never crosses the roof line and the wheels fit under the body`, () => {
      const shape = buildShape(spec);
      for (let i = 0; i <= 80; i++) {
        const t = i / 80;
        expect(shape.botAt(t)).toBeLessThan(shape.topAt(t));
      }
      for (const wx of [spec.wb / 2, -spec.wb / 2]) {
        const t = wx / spec.L + 0.5;
        // the top of the wheel must not poke through the bonnet or boot
        expect(shape.topAt(t)).toBeGreaterThan(spec.R * 2 - 0.02);
      }
    });

    it(`${style}: has glass for the windows`, () => {
      const shape = buildShape(spec);
      expect(shape.glass.getIndex()!.count).toBeGreaterThan(30);
    });
  }

  it('the profile curve passes through its control points and stays smooth', () => {
    const pts: [number, number][] = [[0, 0], [0.5, 1], [1, 0]];
    expect(curve(pts, 0)).toBeCloseTo(0);
    expect(curve(pts, 0.5)).toBeCloseTo(1);
    expect(curve(pts, 1)).toBeCloseTo(0);
    expect(curve(pts, 0.25)).toBeGreaterThan(0);
    expect(curve(pts, 0.25)).toBeLessThan(1);
  });
});
