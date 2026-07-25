import { describe, it, expect } from 'vitest';
import { travelMinutes, baseMinutes, pairKey } from './travel';
import type { MapLocation, TravelOverride } from './types';

const ghost: MapLocation = { id: 'ghost', name: 'Ghost', category: 'stage', xPercent: 93, yPercent: 45 };
const beatbox: MapLocation = { id: 'beatbox', name: 'BeatBox', category: 'stage', xPercent: 84, yPercent: 45 };
const rex: MapLocation = { id: 'rex', name: 'Rex', category: 'stage', xPercent: 26, yPercent: 70 };

describe('travel estimates (spec §27)', () => {
  it('adjacent stages are much closer than distant ones', () => {
    expect(baseMinutes(ghost, beatbox)).toBeLessThan(baseMinutes(ghost, rex));
  });

  it('matches the spec examples in spirit (Ghost→BeatBox short, Ghost→Rex longer)', () => {
    const near = travelMinutes(ghost, beatbox, 'normal', new Map());
    const far = travelMinutes(ghost, rex, 'normal', new Map());
    expect(near.minutes).toBeLessThanOrEqual(3);
    expect(far.minutes).toBeGreaterThanOrEqual(6);
    expect(near.approximate).toBe(true);
  });

  it('crowd level increases the estimate', () => {
    const light = travelMinutes(ghost, rex, 'light', new Map());
    const heavy = travelMinutes(ghost, rex, 'heavy', new Map());
    expect(heavy.minutes).toBeGreaterThan(light.minutes);
  });

  it('an admin override wins and is marked as such', () => {
    const overrides = new Map<string, TravelOverride>([[pairKey('ghost', 'rex'), { pairKey: pairKey('ghost', 'rex'), minutes: 3 }]]);
    const r = travelMinutes(ghost, rex, 'heavy', overrides);
    expect(r.minutes).toBe(3);
    expect(r.source).toBe('override');
  });
});
