import type { Selection, Performance, Artist, MapLocation, User, DayId } from './types';
import { withEffectiveEnds } from './endTimes';
import { formatTime, formatMinutes, hhmmToMinutes } from './time';
import { EVENT } from '@/config/event';
import type { MeetupSuggestion } from './meetups';

// Plain-text emergency schedule (spec §35). Human-readable, printable, and
// viewable with no app at all — the last-resort backup.

export interface EmergencyInput {
  user: User;
  selections: Selection[];
  performanceById: Map<string, Performance>;
  artistById: Map<string, Artist>;
  locationById: Map<string, MapLocation>;
  allPerformances: Performance[];
  turnoverBuffer: number;
  meetupsByDay: Record<DayId, MeetupSuggestion[]>;
}

export function buildEmergencyText(input: EmergencyInput): string {
  const ends = withEffectiveEnds(input.allPerformances, input.turnoverBuffer);
  const lines: string[] = [];
  lines.push(`WARPED LONG BEACH 2026 — ${input.user.name.toUpperCase()}'S PLAN`);
  lines.push(`${EVENT.venue}`);
  lines.push('Unofficial personal companion. Times you entered.');
  lines.push('');

  for (const d of EVENT.days) {
    const day = d.id as DayId;
    lines.push('========================================');
    lines.push(`${d.label.toUpperCase()} — ${d.date}`);
    lines.push('========================================');

    const stops = input.selections
      .filter((s) => {
        if (s.userId !== input.user.id || !s.selected || s.attendanceDecision === 'skipping') return false;
        const p = input.performanceById.get(s.performanceId);
        return p?.day === day && p.type === 'main' && p.startTime;
      })
      .map((s) => input.performanceById.get(s.performanceId)!)
      .sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1));

    if (!stops.length) {
      lines.push('(no sets planned)');
      lines.push('');
      continue;
    }

    const dayMeetups = input.meetupsByDay[day] ?? [];
    let prevEnd = 0;

    for (const p of stops) {
      const start = hhmmToMinutes(p.startTime!);
      // Insert an OPEN gap with a meetup suggestion if there's a sizeable gap.
      if (prevEnd && start - prevEnd >= 25) {
        const m = dayMeetups.find((x) => x.startMinute >= prevEnd - 5 && x.startMinute < start);
        lines.push('');
        lines.push(`${formatMinutes(prevEnd)}  OPEN`);
        if (m) lines.push(`   Suggested meetup at ${m.location.name} (${formatMinutes(m.startMinute)})`);
      }
      const artist = input.artistById.get(p.artistId)?.name ?? 'Artist';
      const stage = p.stageId ? input.locationById.get(p.stageId)?.name ?? 'Stage TBA' : 'Stage TBA';
      const end = ends.get(p.id);
      lines.push('');
      lines.push(`${formatTime(p.startTime)}${end?.hhmm ? ` – ${formatTime(end.hhmm)}${end.kind !== 'exact' ? ' (est)' : ''}` : ''}`);
      lines.push(`   ${artist}`);
      lines.push(`   ${stage}`);
      prevEnd = end?.minutes ?? start + 30;
    }
    lines.push('');
  }

  lines.push('----------------------------------------');
  lines.push('Not affiliated with or endorsed by Vans or Vans Warped Tour.');
  return lines.join('\n');
}
