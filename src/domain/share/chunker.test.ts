import { describe, it, expect } from 'vitest';
import { toChunks, ChunkCollector } from './chunker';

describe('chunker', () => {
  it('keeps a short code as a single part', () => {
    const chunks = toChunks('WLB1.short', 700);
    expect(chunks).toHaveLength(1);
  });

  it('splits a long code and reassembles in any order', () => {
    const big = 'WLB1.' + 'x'.repeat(2000);
    const chunks = toChunks(big, 500);
    expect(chunks.length).toBeGreaterThan(1);
    const c = new ChunkCollector();
    // feed out of order
    const shuffled = [...chunks].reverse();
    let result: ReturnType<ChunkCollector['add']> = { complete: false };
    for (const ch of shuffled) result = c.add(ch);
    expect(result.complete).toBe(true);
    expect(result.code).toBe(big);
  });

  it('reports progress until all parts arrive', () => {
    const big = 'WLB1.' + 'y'.repeat(1600);
    const chunks = toChunks(big, 500);
    const c = new ChunkCollector();
    c.add(chunks[0]);
    expect(c.received).toBe(1);
    expect(c.total).toBe(chunks.length);
  });
});
