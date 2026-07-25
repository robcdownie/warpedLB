// Multi-part QR support (spec §20). A long code is split so each part fits in a
// single scannable QR; parts carry an index + total so they reassemble in any
// order. The data itself is in the chunks — never a URL.

const CHUNK_PREFIX = 'WLBQ';

/** Split a code into QR-sized chunks. Every emitted chunk (prefix included) fits maxChunkChars. */
export function toChunks(code: string, maxChunkChars = 700): string[] {
  if (code.length + `${CHUNK_PREFIX}|1|1|`.length <= maxChunkChars) {
    return [`${CHUNK_PREFIX}|1|1|${code}`];
  }
  // Budget the "WLBQ|index|total|" prefix into each piece so the final chunk
  // strings stay within the scannable-QR limit (3-digit worst case).
  const prefixBudget = CHUNK_PREFIX.length + 9;
  const pieceSize = Math.max(1, maxChunkChars - prefixBudget);
  const pieces: string[] = [];
  for (let i = 0; i < code.length; i += pieceSize) {
    pieces.push(code.slice(i, i + pieceSize));
  }
  const total = pieces.length;
  return pieces.map((p, i) => `${CHUNK_PREFIX}|${i + 1}|${total}|${p}`);
}

export interface ParsedChunk {
  index: number; // 1-based
  total: number;
  piece: string;
}

export function parseChunk(text: string): ParsedChunk | null {
  const t = text.trim();
  if (!t.startsWith(CHUNK_PREFIX + '|')) {
    // A bare, unchunked code counts as a single complete part.
    if (t.startsWith('WLB1.')) return { index: 1, total: 1, piece: t };
    return null;
  }
  const m = t.match(/^WLBQ\|(\d+)\|(\d+)\|([\s\S]*)$/);
  if (!m) return null;
  return { index: Number(m[1]), total: Number(m[2]), piece: m[3] };
}

/** Collects chunk parts until all are present, then returns the joined code. */
export class ChunkCollector {
  private parts = new Map<number, string>();
  total = 0;

  add(text: string): { complete: boolean; code?: string; error?: string } {
    const parsed = parseChunk(text);
    if (!parsed) return { complete: false, error: 'Unrecognized code.' };
    if (this.total && parsed.total !== this.total) {
      return { complete: false, error: 'Mixed codes from different exports.' };
    }
    this.total = parsed.total;
    this.parts.set(parsed.index, parsed.piece);
    if (this.parts.size === this.total) {
      let code = '';
      for (let i = 1; i <= this.total; i++) {
        const p = this.parts.get(i);
        if (p == null) return { complete: false, error: `Missing part ${i}.` };
        code += p;
      }
      return { complete: true, code };
    }
    return { complete: false };
  }

  get received(): number {
    return this.parts.size;
  }

  reset() {
    this.parts.clear();
    this.total = 0;
  }
}
