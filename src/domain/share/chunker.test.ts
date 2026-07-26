import { describe, it, expect } from 'vitest';
import { toChunks, ChunkCollector, splitPastedParts, collectPastedCode } from './chunker';
import { encodeEnvelope, decodeEnvelope } from './codec';

/** Hard-wrap a string the way a forum post or email client would. */
const wrap = (s: string, cols: number) => s.match(new RegExp(`.{1,${cols}}`, 'g'))!.join('\n');

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

describe('pasted text', () => {
  // A real schedule code is ~2400 chars, so anything that carries it is liable
  // to wrap it. Reading only the first line used to surface as "corrupt".
  const code = encodeEnvelope(
    'schedule',
    'robbie',
    { p: Array.from({ length: 40 }, (_, i) => [`set-${i}`, 'rex-stage', '16:50', '17:10']) },
    '2026-07-25T18:00:00.000Z',
  );

  it('rejoins a single code that was hard-wrapped in transit', () => {
    expect(code.length).toBeGreaterThan(300);
    for (const cols of [76, 100, 512]) {
      const { code: out, error } = collectPastedCode(wrap(code, cols));
      expect(error).toBeUndefined();
      expect(out).toBe(code);
      expect(decodeEnvelope(out!).type).toBe('schedule');
    }
  });

  // Small enough to force several parts out of the fixture above.
  const MULTIPART = 200;

  it('rejoins multi-part chunks that were each hard-wrapped', () => {
    const chunks = toChunks(code, MULTIPART);
    expect(chunks.length).toBeGreaterThan(1);
    const { code: out } = collectPastedCode(chunks.map((c) => wrap(c, 76)).join('\n'));
    expect(out).toBe(code);
  });

  it('still accepts one part per line, unwrapped', () => {
    const { code: out } = collectPastedCode(toChunks(code, MULTIPART).join('\n'));
    expect(out).toBe(code);
  });

  it('ignores prose pasted above the code', () => {
    const { code: out } = collectPastedCode(`here's my schedule:\n\n${code}`);
    expect(out).toBe(code);
  });

  it('reports missing parts rather than a truncated code', () => {
    const chunks = toChunks(code, MULTIPART);
    expect(chunks.length).toBeGreaterThan(1);
    const { code: out, error } = collectPastedCode(chunks.slice(0, -1).join('\n'));
    expect(out).toBeUndefined();
    expect(error).toContain(`/${chunks.length}`);
  });

  it('hands unrecognized text to the decoder instead of swallowing it', () => {
    const { code: out } = collectPastedCode('not a code at all');
    expect(out).toBe('not a code at all');
  });

  it('groups continuation lines under the part above them', () => {
    expect(splitPastedParts('WLBQ|1|2|aaa\nbbb\nWLBQ|2|2|ccc')).toEqual([
      'WLBQ|1|2|aaabbb',
      'WLBQ|2|2|ccc',
    ]);
  });
});
