import type { MapLocation } from '@/domain/types';

// Nine performance stages (spec §13). Starter % coordinates; editable via calibration.
export const STAGES: MapLocation[] = [
  {
    id: 'warped-unplugged-stage',
    name: 'Warped Unplugged Stage',
    shortName: 'Unplugged',
    category: 'stage',
    xPercent: 30,
    yPercent: 47,
  },
  {
    id: 'vans-stage',
    name: 'Vans Stage',
    shortName: 'Vans',
    category: 'stage',
    xPercent: 58,
    yPercent: 42,
  },
  {
    id: 'off-the-wall-stage',
    name: 'Off The Wall Stage',
    shortName: 'Off The Wall',
    category: 'stage',
    xPercent: 66,
    yPercent: 46,
  },
  {
    id: 'beatbox-stage',
    name: 'BeatBox Stage',
    shortName: 'BeatBox',
    category: 'stage',
    xPercent: 84,
    yPercent: 45,
  },
  {
    id: 'ghost-stage',
    name: 'Ghost Stage',
    shortName: 'Ghost',
    category: 'stage',
    xPercent: 93,
    yPercent: 45,
  },
  {
    id: 'rex-stage',
    name: 'Rex Stage',
    shortName: 'Rex',
    category: 'stage',
    xPercent: 26,
    yPercent: 70,
  },
  {
    id: 'octopus-stage',
    name: 'Octopus Stage',
    shortName: 'Octopus',
    category: 'stage',
    xPercent: 35,
    yPercent: 70,
  },
  {
    id: 'doordash-stage',
    name: 'DoorDash Stage',
    shortName: 'DoorDash',
    category: 'stage',
    xPercent: 77,
    yPercent: 72,
  },
  {
    id: 'verizon-stage',
    name: 'Verizon Stage',
    shortName: 'Verizon',
    category: 'stage',
    xPercent: 88,
    yPercent: 72,
  },
];

export const STAGE_IDS = STAGES.map((s) => s.id);
