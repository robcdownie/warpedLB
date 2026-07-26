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

const PART_START = /^(?:WLBQ\||WLB1\.)/;

/**
 * Group pasted text into logical parts.
 *
 * A part starts at a line carrying a known prefix; a line without one is a
 * continuation of the part above it. Codes are long unbroken strings, so
 * anything that carries them — a forum post, a chat message, an email client —
 * is liable to hard-wrap them, and the pieces arrive as prefix-less lines.
 * Rejoining them here is what stops a wrapped code from being read as a
 * complete single part with everything after the first newline dropped.
 */
export function splitPastedParts(text: string): string[] {
  const parts: string[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (PART_START.test(line) || parts.length === 0) parts.push(line);
    else parts[parts.length - 1] += line;
  }
  return parts;
}

/**
 * Turn pasted text into one share code, or explain what is still missing.
 * Handles both shapes the paste box accepts: a single code (wrapped or not) and
 * the parts of a multi-part code, one per line.
 */
export function collectPastedCode(text: string): { code?: string; error?: string } {
  const parts = splitPastedParts(text);
  if (parts.length === 0) return {};
  const collector = new ChunkCollector();
  let code: string | undefined;
  for (const part of parts) {
    const res = collector.add(part);
    // Unprefixed and alone: hand it to the decoder, which can say why it fails.
    if (res.error && parts.length === 1) return { code: part };
    if (res.complete && res.code) code = res.code;
  }
  if (code) return { code };
  return { error: `Have all parts? Collected ${collector.received}/${collector.total || '?'}.` };
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
