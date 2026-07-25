import { describe, it, expect } from 'vitest';
import { newUserId, initialsFor, nextFreeColor } from './ids';
import type { ColorKey } from './types';

// The id shape that domain/share/validate.ts accepts. Kept in sync by hand
// because importing it would drag the whole validator into this test.
const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

describe('newUserId', () => {
  it('produces ids the share validator accepts', () => {
    for (const name of ['Sam', 'Sam Lee', 'ALEX', 'Jo-Anne', "O'Brien", 'Zoë', 'M&M']) {
      expect(newUserId(name)).toMatch(ID_RE);
    }
  });

  it('never returns a bare slug, so two people with one name cannot collide', () => {
    // This is the whole point: importing a plan replaces that id's selections
    // wholesale, so two "Alex"es sharing an id would destroy each other's plan.
    const a = newUserId('Alex');
    const b = newUserId('Alex');
    expect(a).not.toBe('alex');
    expect(a).not.toBe(b);
  });

  it('avoids ids already on this device', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = newUserId('Alex', taken);
      expect(taken.has(id)).toBe(false);
      taken.add(id);
    }
    expect(taken.size).toBe(200);
  });

  it('still yields a valid id when the name has no usable characters', () => {
    for (const name of ['', '   ', '???', '!!!']) {
      expect(newUserId(name)).toMatch(ID_RE);
    }
  });

  it('keeps a recognisable prefix so imports read as a person, not a UUID', () => {
    expect(newUserId('Sam Lee')).toMatch(/^sam-lee-/);
  });
});

describe('initialsFor', () => {
  it('takes one letter from a single name and two from a full name', () => {
    expect(initialsFor('Sam')).toBe('S');
    expect(initialsFor('Sam Lee')).toBe('SL');
    expect(initialsFor('Mary Jane Watson')).toBe('MW');
  });

  it('handles padding and empty input', () => {
    expect(initialsFor('  sam  ')).toBe('S');
    expect(initialsFor('')).toBe('');
    expect(initialsFor('   ')).toBe('');
  });

  it('does not split an astral character in half', () => {
    // Array.from, not [0] — a surrogate half renders as a replacement glyph.
    expect(Array.from(initialsFor('😀 Sam')).length).toBe(2);
  });
});

describe('nextFreeColor', () => {
  const choices: ColorKey[] = ['pink', 'blue', 'orange', 'teal', 'yellow', 'purple'];

  it('picks the first unused colour', () => {
    expect(nextFreeColor([], choices)).toBe('pink');
    expect(nextFreeColor(['pink'], choices)).toBe('blue');
    expect(nextFreeColor(['pink', 'blue'], choices)).toBe('orange');
  });

  it('falls back to the first choice once every colour is taken', () => {
    expect(nextFreeColor(choices, choices)).toBe('pink');
  });
});
