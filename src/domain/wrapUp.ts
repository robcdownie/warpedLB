import { EVENT } from '@/config/event';
import { itinerary, selectedMainByDay } from '@/store/selectors';
import type { CheckIn, DayId, Performance, Selection } from './types';

/**
 * What the app can honestly tell you about your weekend once it's over.
 *
 * The hard rule here is the trust model's "planned ≠ live": this app never
 * knew where anyone actually was. It knows what you *picked*, and it knows the
 * times somebody typed in. So every number below describes a plan, and the UI
 * has to say so — "you saw 14 bands" would be a fabrication, and a pleasing one,
 * which is exactly the kind this app is supposed to refuse.
 *
 * Manual check-ins are the one exception. You tapped those yourself, on this
 * phone, so they are evidence of intent at a moment in time and are counted
 * separately rather than blended into the plan totals.
 */
export interface WrapUpDay {
  day: DayId;
  label: string;
  /** Main-lineup sets selected, whether or not anyone entered a time. */
  planned: number;
  /** Chronological, times-known subset. Empty when the board was never typed. */
  timeline: Performance[];
}

export interface WrapUp {
  /** Total main-lineup picks across both days. */
  totalPlanned: number;
  mustSee: number;
  days: WrapUpDay[];
  /** Own manual check-ins — the only attendance evidence that exists. */
  checkIns: number;
  /** Other people whose plans were on this phone. */
  friendPlans: number;
  /**
   * False when not one pick had a time, so there is nothing to lay out on a
   * clock and the UI must fall back to counts alone.
   */
  hasTimeline: boolean;
  /** True when the user never picked anything — show an honest empty state. */
  empty: boolean;
}

export function buildWrapUp({
  selections,
  performanceById,
  checkins,
  userId,
  friendPlanCount,
}: {
  selections: Selection[];
  performanceById: Map<string, Performance>;
  checkins: CheckIn[];
  userId: string;
  friendPlanCount: number;
}): WrapUp {
  const days: WrapUpDay[] = EVENT.days.map((d) => {
    const day = d.id as DayId;
    return {
      day,
      label: d.label,
      planned: selectedMainByDay(selections, performanceById, userId, day).length,
      timeline: itinerary(selections, performanceById, userId, day),
    };
  });

  const mine = selections.filter((s) => s.userId === userId && s.selected);
  const mustSee = mine.filter((s) => {
    const p = performanceById.get(s.performanceId);
    return p?.type === 'main' && s.priority === 'must-see';
  }).length;

  const totalPlanned = days.reduce((n, d) => n + d.planned, 0);

  return {
    totalPlanned,
    mustSee,
    days,
    checkIns: checkins.filter((c) => c.userId === userId).length,
    friendPlans: friendPlanCount,
    hasTimeline: days.some((d) => d.timeline.length > 0),
    empty: totalPlanned === 0,
  };
}
