import { useState } from 'react';
import { MapPinned, Check, TriangleAlert, SlidersHorizontal, Lock, LockOpen } from 'lucide-react';
import { Screen, Card, Button, Pill, cx } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useApp } from '@/store/appStore';
import { formatRelative } from '@/domain/time';
import type { MenuRoute } from '@/components/MenuDrawer';

/** What a person must actually eyeball before the map can be called verified. */
const VERIFY_ITEMS = [
  'Every stage name matches the official map',
  'Stage pins sit on the right stages',
  'Entrances are in the right places',
  'Water, restrooms and First Aid pins are right',
  'Named meetup landmarks exist and are placed',
  'Walk-time overrides still look sane',
];

/**
 * Map provenance and admin setup (plan §P0-6 + §P1-12).
 *
 * Calibration used to live behind a floating button on the live map, one
 * mis-tap away during the festival. It belongs here, behind an explicit
 * "allow map editing" switch, alongside the record of whether this map has
 * actually been checked against the official 2026 layout — because caching
 * the image successfully proves nothing about whether it's the right image.
 */
export function MapSetupScreen({ onOpenMenu }: { onOpenMenu: (r: MenuRoute) => void }) {
  const map = useApp((s) => s.settings.map);
  const editing = useApp((s) => s.settings.mapEditingEnabled);
  const activeUser = useApp((s) => s.userById.get(s.settings.activeUserId));
  const updateSettings = useApp((s) => s.updateSettings);
  const updateMapMeta = useApp((s) => s.updateMapMeta);
  const resetMap = useApp((s) => s.resetMap);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [confirmReset, setConfirmReset] = useState(false);

  const allChecked = checked.size === VERIFY_ITEMS.length;

  const verify = () =>
    void updateMapMeta({
      verified: true,
      verifiedAt: new Date().toISOString(),
      sourceLabel: `Checked against the official ${map.mapYear} festival map by ${activeUser?.name ?? 'you'}`,
    });

  const unverify = () =>
    void updateMapMeta({
      verified: false,
      verifiedAt: null,
      sourceLabel: 'Reference layout (not yet checked against the official 2026 map)',
    });

  return (
    <Screen>
      <Card className={cx('mb-4 p-4', map.verified ? 'border-warp-ok/40' : 'border-warp-warn/50')}>
        <div className="mb-2 flex items-center gap-2">
          <MapPinned size={18} className={map.verified ? 'text-ok' : 'text-warn'} aria-hidden />
          <h2 className="flex-1 font-display text-[15px] text-primary">Festival map</h2>
          <Pill color={map.verified ? 'ok' : 'warn'}>{map.verified ? 'Verified' : 'Unverified'}</Pill>
        </div>
        <dl className="space-y-1 text-[13px]">
          <Row label="Map year" value={String(map.mapYear)} />
          <Row label="Revision" value={String(map.mapRevision)} />
          <Row label="Source" value={map.sourceLabel} />
          <Row
            label="Verified"
            value={map.verifiedAt ? formatRelative(map.verifiedAt) : 'Not yet'}
          />
          <Row
            label="Pins calibrated"
            value={map.calibratedAt ? formatRelative(map.calibratedAt) : 'Seed positions'}
          />
        </dl>
        {!map.verified && (
          <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-warn">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
            The shipped layout was traced from an earlier Long Beach map. The image being cached
            offline says nothing about whether it matches the 2026 site.
          </p>
        )}
      </Card>

      {/* Verification checklist */}
      <Card className="mb-4 p-4">
        <h2 className="mb-2 font-display text-[14px] uppercase tracking-wide text-secondary">
          {map.verified ? 'Verified against' : 'Before marking verified'}
        </h2>
        {map.verified ? (
          <>
            <p className="mb-3 flex items-center gap-1.5 text-[13px] text-ok">
              <Check size={15} aria-hidden /> {map.sourceLabel}
            </p>
            <Button variant="secondary" className="w-full" onClick={unverify}>
              Mark unverified again
            </Button>
          </>
        ) : (
          <>
            <ul className="mb-3 space-y-1">
              {VERIFY_ITEMS.map((item, i) => (
                <li key={item}>
                  <label className="flex min-h-touch cursor-pointer items-center gap-2.5 text-[13px] text-primary">
                    <input
                      type="checkbox"
                      checked={checked.has(i)}
                      onChange={(e) => {
                        const next = new Set(checked);
                        e.target.checked ? next.add(i) : next.delete(i);
                        setChecked(next);
                      }}
                      className="h-5 w-5 shrink-0 accent-warp-pink"
                    />
                    <span className="flex-1">{item}</span>
                  </label>
                </li>
              ))}
            </ul>
            <Button variant="yellow" className="w-full" disabled={!allChecked} onClick={verify}>
              {allChecked ? 'Mark map verified' : `Check all ${VERIFY_ITEMS.length} first`}
            </Button>
          </>
        )}
      </Card>

      {/* Editing gate + calibration */}
      <Card className="mb-4 p-4">
        <h2 className="mb-2 font-display text-[14px] uppercase tracking-wide text-secondary">Editing</h2>
        <label className="flex items-center justify-between gap-3 py-1">
          <span className="flex-1">
            <span className="block text-[14px] font-semibold text-primary">Allow map editing</span>
            <span className="block text-[12px] text-muted">
              Off during the festival so a mis-tap can&apos;t move a stage.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={editing}
            onClick={() => void updateSettings({ mapEditingEnabled: !editing })}
            className="min-h-touch min-w-touch -m-2 flex shrink-0 items-center justify-center p-2"
          >
            <span className={cx('relative block h-7 w-12 rounded-full transition', editing ? 'bg-warp-ok' : 'bg-[var(--track-off)]')}>
              <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition', editing ? 'left-[22px]' : 'left-0.5')} />
            </span>
          </button>
        </label>

        <button
          type="button"
          disabled={!editing}
          onClick={() => onOpenMenu('calibration')}
          className={cx(
            'mt-2 flex w-full items-center gap-3 rounded-xl bg-[var(--surface-sunken)] p-3 text-left',
            !editing && 'opacity-45',
          )}
        >
          <SlidersHorizontal size={20} className="text-accent" aria-hidden />
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-primary">Calibration</div>
            <div className="text-[12px] text-secondary">Drag pins to match the real site</div>
          </div>
          {editing ? (
            <LockOpen size={16} className="text-ok" aria-hidden />
          ) : (
            <Lock size={16} className="text-muted" aria-hidden />
          )}
        </button>
      </Card>

      <Button variant="secondary" className="w-full" onClick={() => setConfirmReset(true)}>
        Reset pins to shipped positions
      </Button>

      <ConfirmDialog
        open={confirmReset}
        danger
        title="Reset map pins?"
        message="Every pin goes back to its shipped position and any walk-time overrides are cleared. The map also drops back to unverified."
        confirmLabel="Reset pins"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          void resetMap();
          setConfirmReset(false);
        }}
      />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 border-b border-subtle py-1 last:border-0">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="flex-1 text-primary">{value}</dd>
    </div>
  );
}
