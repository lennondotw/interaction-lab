import { describe, expect, it } from 'vitest';

import {
  indicatorCenter,
  indicatorDash,
  indicatorLength,
  measureIndicatorGeometry,
  type IndicatorGeometry,
} from '../resize-indicator-geometry.js';

const geometry: IndicatorGeometry = {
  path: '',
  origin: { x: -0.5, y: -0.5 },
  length: 1000,
  cornerStart: 520,
  cornerLength: 30,
  start: { width: 260, height: 800 },
};

describe('resize indicator continuous contour', () => {
  it('reuses the continuous corner controls and measures only its curved section', () => {
    let measuredPath = '';
    const result = measureIndicatorGeometry(
      { x: -0.5, y: -0.5, width: 1000, height: 1000, radius: 100 },
      { x: 499.5, y: 517.5 },
      (path) => {
        measuredPath = path;
        return 250;
      }
    );
    // Control points from Apple's continuous-corner probe, also used by the component's golden tests.
    const controls = measuredPath.replace(/[MC]/g, '').trim().split(/\s+/).map(Number);
    for (const [index, expected] of [1000, 847.1335, 1000, 891.151, 1000, 913.1593, 992.5089, 936.8506].entries()) {
      expect(controls[index]).toBeCloseTo(expected, 4);
    }
    expect(result.path).toBe(`M 1000 0 L ${measuredPath.slice(2)} L 0 1000`);
    expect(result.cornerStart).toBeCloseTo(847.1335, 4);
    expect(result.length).toBeCloseTo(1944.267, 3);
    expect(result.start.width).toBe(518);
    expect(result.start.height).toBeCloseTo(result.length - 500, 10);
  });

  it('keeps the visible dash straight until its leading cap reaches the corner', () => {
    const length = 28;
    const thickness = 4;
    const halfLength = (length - thickness) / 2;
    const target = indicatorCenter(geometry, 'width', 1);
    for (const axis of ['width', 'height'] as const) {
      const tangentCenter =
        axis === 'width' ? geometry.cornerStart - halfLength : geometry.cornerStart + 30 + halfLength;
      const contact = (tangentCenter - geometry.start[axis]) / (target - geometry.start[axis]);
      for (const delta of [-0.000001, 0.000001]) {
        const dash = indicatorDash(geometry, axis, contact + delta, length, thickness);
        const leading = axis === 'width' ? -dash.offset + length - thickness : -dash.offset;
        expect(axis === 'width' ? leading > geometry.cornerStart : leading < geometry.cornerStart + 30).toBe(delta > 0);
      }
    }
  });

  it('uses the same fraction of each route despite different starting distances', () => {
    const target = indicatorCenter(geometry, 'width', 1);
    for (const progress of [0, 0.1, 0.4, 0.85, 1]) {
      for (const axis of ['width', 'height'] as const) {
        const start = geometry.start[axis];
        expect((indicatorCenter(geometry, axis, progress) - start) / (target - start)).toBeCloseTo(progress, 12);
      }
    }
  });

  it('ends with identical dashes at the midpoint of the same continuous corner', () => {
    for (const start of [
      { width: 260, height: 800 },
      { width: 490.25, height: 650.5 },
    ]) {
      const measured = { ...geometry, start };
      expect(indicatorDash(measured, 'width', 1, 33.6, 4)).toEqual(indicatorDash(measured, 'height', 1, 33.6, 4));
      expect(indicatorCenter(measured, 'width', 1)).toBe(535);
    }
  });

  it('grows toward 1.2 times the hover length about its own center using the shared travel progress', () => {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const length = indicatorLength(progress, 24, 33.6);
      expect(length).toBeCloseTo(24 + (33.6 - 24) * progress, 12);
      const dash = indicatorDash(geometry, 'width', progress, length, 3 + progress);
      const visibleLength = Number(dash.array.split(' ')[0]) + 3 + progress;
      expect(visibleLength).toBeCloseTo(length, 12);
      expect(-dash.offset + (visibleLength - 3 - progress) / 2).toBeCloseTo(
        indicatorCenter(geometry, 'width', progress),
        12
      );
    }
    expect(indicatorLength(0, 28, 33.6)).toBe(28);
    expect(indicatorLength(1, 24, 33.6)).toBeCloseTo(33.6, 12);
    expect(indicatorLength(1, 28, 33.6)).toBeCloseTo(33.6, 12);
  });

  it('keeps the active size while travelling and applies the same 1.2 growth factor', () => {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const length = indicatorLength(progress, 26, 31.2);
      const thickness = 3.5;
      expect(length).toBeCloseTo(26 * (1 + 0.2 * progress), 12);
      const dash = indicatorDash(geometry, 'width', progress, length, thickness);
      const centerlineLength = Number(dash.array.split(' ')[0]);
      expect(centerlineLength + thickness).toBeCloseTo(length, 12);
      expect(-dash.offset + centerlineLength / 2).toBeCloseTo(indicatorCenter(geometry, 'width', progress), 12);
    }
    expect(indicatorLength(0, 26, 31.2)).toBe(26);
    expect(indicatorDash(geometry, 'width', 1, 31.2, 3.5)).toEqual(indicatorDash(geometry, 'height', 1, 31.2, 3.5));
  });
});
