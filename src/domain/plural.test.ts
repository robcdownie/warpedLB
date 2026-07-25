import { describe, it, expect } from 'vitest';
import { plural } from './plural';

describe('plural', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'band')).toBe('1 band');
  });

  it('pluralises zero, which reads as a plural in English', () => {
    expect(plural(0, 'band')).toBe('0 bands');
  });

  it('pluralises anything above one', () => {
    expect(plural(2, 'band')).toBe('2 bands');
    expect(plural(76, 'set')).toBe('76 sets');
  });

  it('accepts an irregular plural', () => {
    expect(plural(1, 'person', 'people')).toBe('1 person');
    expect(plural(3, 'person', 'people')).toBe('3 people');
  });
});
