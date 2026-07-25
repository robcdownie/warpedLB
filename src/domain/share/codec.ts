import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import { EVENT } from '@/config/event';

// Compact, offline share codec. Data (not a URL) is encoded so QR/text codes
// work with no internet (spec §20). Envelope carries schema version, event id,
// source, type, timestamp, and a checksum.

export const SCHEMA_VERSION = 1;

export type PayloadType =
  | 'selections'
  | 'schedule'
  | 'coordinates'
  | 'checkin'
  | 'backup';

export interface Envelope<T = unknown> {
  v: number; // schema version
  event: string; // event id
  type: PayloadType;
  source: string; // source user id / "system"
  exportedAt: string; // ISO
  checksum: string; // crc32 hex of canonical data JSON
  data: T;
}

/** CRC32 (hex) of a string. */
export function crc32(str: string): string {
  let crc = ~0;
  const bytes = strToU8(str);
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ((~crc) >>> 0).toString(16).padStart(8, '0');
}

function base64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeEnvelope<T>(type: PayloadType, source: string, data: T, exportedAt: string): string {
  const env: Envelope<T> = {
    v: SCHEMA_VERSION,
    event: EVENT.id,
    type,
    source,
    exportedAt,
    checksum: crc32(JSON.stringify(data)),
    data,
  };
  const json = JSON.stringify(env);
  const compressed = deflateSync(strToU8(json), { level: 9 });
  return `WLB1.${base64urlEncode(compressed)}`;
}

export class DecodeError extends Error {
  constructor(
    message: string,
    public code: 'format' | 'version' | 'event' | 'checksum' | 'corrupt',
  ) {
    super(message);
  }
}

export function decodeEnvelope(raw: string): Envelope {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('WLB1.')) {
    throw new DecodeError('This does not look like a Warped share code.', 'format');
  }
  let env: Envelope;
  try {
    const bytes = base64urlDecode(trimmed.slice(5));
    const json = strFromU8(inflateSync(bytes));
    env = JSON.parse(json);
  } catch {
    throw new DecodeError('The code is corrupt or incomplete.', 'corrupt');
  }
  if (env.v !== SCHEMA_VERSION) {
    throw new DecodeError(
      `This code is version ${env.v}; this app expects version ${SCHEMA_VERSION}.`,
      'version',
    );
  }
  if (env.event !== EVENT.id) {
    throw new DecodeError('This code is for a different event.', 'event');
  }
  const expected = crc32(JSON.stringify(env.data));
  if (expected !== env.checksum) {
    throw new DecodeError('Checksum mismatch — the data may be damaged.', 'checksum');
  }
  return env;
}
