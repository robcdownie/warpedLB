import { describe, it, expect } from 'vitest';
import { buildSelectionsData, buildScheduleData, MAX_SHARED_AVATAR_CHARS } from './payloads';
import { toChunks } from './chunker';
import { encodeEnvelope } from './codec';
import type { Performance, Selection, User } from '@/domain/types';

const NOW = '2026-07-26T12:00:00.000Z';

function user(avatar: string | null): User {
  return { id: 'ari', name: 'Ari', initials: 'AR', avatar, colorKey: 'pink' as User['colorKey'] };
}

function sel(performanceId: string): Selection {
  return {
    userId: 'ari',
    performanceId,
    priority: 'want-to-see',
    selected: true,
    attendanceDecision: 'undecided',
    notes: '',
  };
}

function perf(id: string, over: Partial<Performance> = {}): Performance {
  return {
    id,
    artistId: `artist-${id}`,
    type: 'main',
    day: 'saturday',
    stageId: null,
    startTime: null,
    endTime: null,
    estimatedEndTime: null,
    scheduleStatus: 'time-pending',
    ...over,
  };
}

describe('what goes into a share code', () => {
  it('keeps a small avatar', () => {
    const small = `data:image/webp;base64,${'a'.repeat(500)}`;
    expect(buildSelectionsData(user(small), [sel('p1')]).a).toBe(small);
  });

  it('drops a photo-sized avatar rather than exploding the QR count', () => {
    // A normal iPhone photo as a data URL. Base64 doesn't deflate, so this
    // used to turn a one-frame code into thousands of QR images rendered on
    // the main thread — a frozen or dead phone for the sender.
    const photo = `data:image/jpeg;base64,${'a'.repeat(1_200_000)}`;
    const data = buildSelectionsData(user(photo), [sel('p1')]);
    expect(data.a).toBeNull();

    const frames = toChunks(encodeEnvelope('selections', 'ari', data, NOW)).length;
    expect(frames).toBe(1);
  });

  it('states the limit it enforces', () => {
    const justOver = `data:image/jpeg;base64,${'a'.repeat(MAX_SHARED_AVATAR_CHARS)}`;
    expect(buildSelectionsData(user(justOver), [sel('p1')]).a).toBeNull();
  });
});

describe('what a schedule code carries', () => {
  it('leaves out unplugged sets that have no times', () => {
    // These carry a permanent stage from the seed, so "has a stage" let all 32
    // ride along empty — a whole wasted QR frame on every send.
    const perfs = [
      perf('main-1', { startTime: '13:00', stageId: 'ghost-stage' }),
      perf('unplugged-1', { type: 'unplugged', stageId: 'warped-unplugged-stage', day: null }),
    ];
    const rows = buildScheduleData(perfs).p.map((r) => r[0]);
    expect(rows).toEqual(['main-1']);
  });

  it('still carries an unplugged set once it has a time', () => {
    const perfs = [
      perf('unplugged-1', {
        type: 'unplugged',
        stageId: 'warped-unplugged-stage',
        startTime: '14:00',
      }),
    ];
    expect(buildScheduleData(perfs).p).toHaveLength(1);
  });
});
