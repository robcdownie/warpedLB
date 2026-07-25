import type { DayId, Performance } from '@/domain/types';
import { hhmmToMinutes } from '@/domain/time';

// Helpers for the schedule editor: validation + building an updated Performance.

export interface EditResult {
  performance: Performance;
  warnings: string[];
  error?: string;
}

/**
 * Apply a stage/time edit to a performance with validation.
 * - end must not precede start
 * - warns on same-stage same-time clash with another performer
 * - warns on wrong-day assignment (handled by caller with day context)
 *
 * `day` is patchable for unplugged sets, which are seeded with `day: null`
 * because their day isn't announced until the board goes up.
 */
export function applyScheduleEdit(
  perf: Performance,
  patch: {
    stageId?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    day?: DayId | null;
  },
  allPerformances: Performance[],
): EditResult {
  const next: Performance = { ...perf, ...patch };
  const warnings: string[] = [];

  if (next.startTime && next.endTime) {
    if (hhmmToMinutes(next.endTime) <= hhmmToMinutes(next.startTime)) {
      return { performance: perf, warnings, error: 'End time must be after start time.' };
    }
  }

  // Clear a stale stored estimate when exact end provided.
  if (next.endTime) next.estimatedEndTime = null;

  // scheduleStatus reflects completeness.
  next.scheduleStatus = next.startTime && next.stageId ? 'scheduled' : 'time-pending';

  // Same-stage, same-day, overlapping-start clash with a DIFFERENT performer.
  if (next.stageId && next.startTime && next.day) {
    const clash = allPerformances.find(
      (p) =>
        p.id !== next.id &&
        p.stageId === next.stageId &&
        p.day === next.day &&
        p.startTime === next.startTime,
    );
    if (clash) {
      warnings.push('Another set is already assigned to this stage at this exact time.');
    }
  }

  return { performance: next, warnings };
}

/** Parse loose time input ("3:05 pm", "1505", "15:05") into "HH:mm" or null. */
export function parseTimeInput(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{1,2}):?(\d{2})\s*(am|pm)?$/);
  if (!m) {
    // bare hour like "3 pm"
    const h = s.match(/^(\d{1,2})\s*(am|pm)$/);
    if (h) {
      let hh = Number(h[1]) % 12;
      if (h[2] === 'pm') hh += 12;
      return `${String(hh).padStart(2, '0')}:00`;
    }
    return null;
  }
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ap = m[3];
  if (mm > 59) return null;
  if (ap) {
    hh = hh % 12;
    if (ap === 'pm') hh += 12;
  }
  if (hh > 23) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
