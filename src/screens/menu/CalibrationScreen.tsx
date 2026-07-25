import { useMemo, useRef, useState } from 'react';
import {
  Lock, Plus, Trash2, Undo2, Download, Upload, RotateCcw, ChevronsUpDown, Move, Pencil,
} from 'lucide-react';
import { Screen, Card, Button, cx } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { MapCanvas, type MapCanvasHandle } from '../map/MapCanvas';
import { LocationPin } from '../map/MapPins';
import { ExportPanel } from '@/components/ExportPanel';
import { ImportPanel } from '@/components/ImportPanel';
import { useApp } from '@/store/appStore';
import { STAGES } from '@/data/stages';
import { NAMED_LOCATIONS } from '@/data/locations';
import { AMENITY_CATEGORIES, amenitySlug } from '@/data/amenity-categories';
import { encodeCoordinates } from '@/domain/share/payloads';
import { timestampSlug } from '@/domain/share/files';
import type { LocationCategory, MapLocation } from '@/domain/types';

const CATEGORIES: LocationCategory[] = [
  'stage', 'entrance', 'experience', 'extreme-sports', 'bar', 'sponsor',
  'service', 'vendor', 'amenity', 'custom',
];

export function CalibrationScreen() {
  const adminUnlocked = useApp((s) => s.settings.adminUnlocked);
  const mapEditingEnabled = useApp((s) => s.settings.mapEditingEnabled);
  const updateSettings = useApp((s) => s.updateSettings);

  // Two gates on purpose: "allow map editing" is the festival-day safety
  // switch set in Map Setup, the unlock below is the one-time admin
  // acknowledgement (plan §P1-12).
  if (!mapEditingEnabled) {
    return (
      <Screen>
        <Card className="mt-6 p-6 text-center">
          <Lock size={36} className="mx-auto mb-3 text-muted" aria-hidden />
          <h2 className="font-display text-[17px] text-primary">Map editing is off</h2>
          <p className="mx-auto mt-1 max-w-[40ch] text-[13px] text-secondary">
            Turn on <b>Allow map editing</b> in Map Setup first. It stays off during the festival so
            a mis-tap can&apos;t move a stage.
          </p>
        </Card>
      </Screen>
    );
  }

  if (!adminUnlocked) {
    return (
      <Screen>
        <Card className="mt-6 p-6 text-center">
          <Lock size={36} className="mx-auto mb-3 text-accent" aria-hidden />
          <h2 className="font-display text-[17px] text-primary">Map Calibration</h2>
          <p className="mx-auto mt-1 max-w-[40ch] text-[13px] text-secondary">
            Admin tool for fine-tuning where pins sit on the map. Changes affect everyone who
            imports your coordinates. Unlock to continue.
          </p>
          <Button variant="primary" className="mx-auto mt-4" onClick={() => updateSettings({ adminUnlocked: true })}>
            Unlock calibration
          </Button>
        </Card>
      </Screen>
    );
  }
  return <Calibrator />;
}

interface UndoItem {
  locationId: string;
  prev: { xPercent: number; yPercent: number };
}

function Calibrator() {
  const locations = useApp((s) => s.locations);
  const putLocation = useApp((s) => s.putLocation);
  const deleteLocation = useApp((s) => s.deleteLocation);
  const updateSettings = useApp((s) => s.updateSettings);

  const [selectedId, setSelectedId] = useState<string>(STAGES[0].id);
  const [picker, setPicker] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [io, setIo] = useState<null | 'export' | 'import'>(null);
  const [undoStack, setUndoStack] = useState<UndoItem[]>([]);
  const mapRef = useRef<MapCanvasHandle>(null);

  const selected = locations.find((l) => l.id === selectedId);

  const place = async (x: number, y: number) => {
    if (!selected) return;
    setUndoStack((s) => [...s, { locationId: selected.id, prev: { xPercent: selected.xPercent, yPercent: selected.yPercent } }].slice(-30));
    await putLocation({ ...selected, xPercent: round(x), yPercent: round(y) });
  };

  const nudge = async (dx: number, dy: number) => {
    if (!selected) return;
    setUndoStack((s) => [...s, { locationId: selected.id, prev: { xPercent: selected.xPercent, yPercent: selected.yPercent } }].slice(-30));
    await putLocation({
      ...selected,
      xPercent: clamp(round(selected.xPercent + dx)),
      yPercent: clamp(round(selected.yPercent + dy)),
    });
  };

  const undo = async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    const loc = locations.find((l) => l.id === last.locationId);
    if (loc) await putLocation({ ...loc, ...last.prev });
    setUndoStack((s) => s.slice(0, -1));
  };

  const resetToSeed = async () => {
    // Restore seed coordinates for seed pins; remove custom pins.
    const seedById = new Map([...STAGES, ...NAMED_LOCATIONS].map((l) => [l.id, l]));
    for (const loc of locations) {
      if (loc.custom || !seedById.has(loc.id)) {
        await deleteLocation(loc.id);
      } else {
        const seed = seedById.get(loc.id)!;
        await putLocation({ ...loc, xPercent: seed.xPercent, yPercent: seed.yPercent });
      }
    }
    setUndoStack([]);
  };

  const exportCode = useMemo(
    () => encodeCoordinates(locations, 'calibration', new Date().toISOString()),
    [locations],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Selected readout */}
      <div className="border-b border-subtle bg-[var(--surface-card)] px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPicker(true)}
            className="flex flex-1 items-center gap-2 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-left"
          >
            <span className="h-3 w-3 rounded-full bg-warp-yellow ring-2 ring-warp-blue-500" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-primary">
              {selected?.name ?? 'Pick a location'}
            </span>
            <ChevronsUpDown size={16} className="text-muted" aria-hidden />
          </button>
          <Button variant="secondary" className="px-2.5" onClick={() => setEditing(true)} aria-label="Rename or recategorize" disabled={!selected}>
            <Pencil size={18} aria-hidden />
          </Button>
          <Button variant="secondary" className="px-2.5" onClick={() => setAdding(true)} aria-label="Add pin">
            <Plus size={18} aria-hidden />
          </Button>
        </div>
        {selected && (
          <div className="mt-1.5 flex items-center gap-3 text-[12px] text-secondary">
            <span className="font-mono">x {selected.xPercent.toFixed(1)}%</span>
            <span className="font-mono">y {selected.yPercent.toFixed(1)}%</span>
            <span className="flex items-center gap-1 text-accent">
              <Move size={12} aria-hidden /> Tap the map to place
            </span>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="relative flex-1 px-3 pt-2">
        <MapCanvas ref={mapRef} className="h-full min-h-[340px]" onBackgroundTap={place}>
          {locations.map((loc) => (
            <LocationPin
              key={loc.id}
              loc={loc}
              labeled={loc.category === 'stage'}
              highlighted={loc.id === selectedId}
              onClick={() => setSelectedId(loc.id)}
            />
          ))}
        </MapCanvas>
      </div>

      {/* Toolbar */}
      <div className="border-t border-subtle bg-[var(--surface-card)] px-3 pb-[calc(var(--safe-bottom)+5rem)] pt-2">
        {/* Nudge pad */}
        <div className="mb-2 flex items-center justify-center gap-2">
          <NudgeBtn label="Left" onClick={() => nudge(-0.5, 0)}>←</NudgeBtn>
          <div className="flex flex-col gap-1">
            <NudgeBtn label="Up" onClick={() => nudge(0, -0.5)}>↑</NudgeBtn>
            <NudgeBtn label="Down" onClick={() => nudge(0, 0.5)}>↓</NudgeBtn>
          </div>
          <NudgeBtn label="Right" onClick={() => nudge(0.5, 0)}>→</NudgeBtn>
          <div className="ml-2 flex gap-1.5">
            <Button variant="secondary" className="px-3 py-1.5" onClick={undo} disabled={!undoStack.length}>
              <Undo2 size={15} aria-hidden /> Undo
            </Button>
            {selected?.custom && (
              <Button variant="danger" className="px-3 py-1.5" onClick={() => { deleteLocation(selected.id); setSelectedId(STAGES[0].id); }}>
                <Trash2 size={15} aria-hidden />
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <Button variant="secondary" className="py-1.5 text-[12px]" onClick={() => setIo('export')}>
            <Upload size={14} aria-hidden /> Export
          </Button>
          <Button variant="secondary" className="py-1.5 text-[12px]" onClick={() => setIo('import')}>
            <Download size={14} aria-hidden /> Import
          </Button>
          <Button variant="secondary" className="py-1.5 text-[12px]" onClick={resetToSeed}>
            <RotateCcw size={14} aria-hidden /> Reset
          </Button>
          <Button variant="secondary" className="py-1.5 text-[12px]" onClick={() => updateSettings({ adminUnlocked: false })}>
            <Lock size={14} aria-hidden /> Lock
          </Button>
        </div>
      </div>

      {/* Location picker */}
      <Sheet open={picker} onClose={() => setPicker(false)} title="Choose a location" size="tall">
        <LocationList
          locations={locations}
          selectedId={selectedId}
          onPick={(id) => {
            setSelectedId(id);
            setPicker(false);
            const l = locations.find((x) => x.id === id);
            if (l) mapRef.current?.centerOn(l.xPercent, l.yPercent, 2.4);
          }}
        />
      </Sheet>

      {/* Add pin */}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a pin">
        <AddPinForm
          onAdd={async (loc) => {
            await putLocation(loc);
            setSelectedId(loc.id);
            setAdding(false);
          }}
        />
      </Sheet>

      {/* Rename / recategorize selected */}
      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit location">
        {selected && (
          <EditPinForm
            loc={selected}
            onSave={async (patch) => {
              await putLocation({ ...selected, ...patch });
              setEditing(false);
            }}
          />
        )}
      </Sheet>

      {/* Import/Export */}
      <Sheet open={io === 'export'} onClose={() => setIo(null)} title="Export coordinates">
        <ExportPanel code={exportCode} filename={`warped-map-coords-${timestampSlug()}.json`} hint="Others import this to get your calibrated pins." />
      </Sheet>
      <Sheet open={io === 'import'} onClose={() => setIo(null)} title="Import coordinates" size="tall">
        <ImportPanel accept={['coordinates']} onDone={() => setIo(null)} />
      </Sheet>
    </div>
  );
}

function LocationList({
  locations,
  selectedId,
  onPick,
}: {
  locations: MapLocation[];
  selectedId: string;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const filtered = locations.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()));
    const byCat = new Map<string, MapLocation[]>();
    for (const l of filtered) {
      const arr = byCat.get(l.category) ?? [];
      arr.push(l);
      byCat.set(l.category, arr);
    }
    return [...byCat.entries()];
  }, [locations, q]);
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search locations"
        className="mb-3 min-h-touch w-full rounded-xl border border-subtle bg-[var(--surface-sunken)] px-3 text-[14px] text-primary outline-none"
      />
      {groups.map(([cat, list]) => (
        <div key={cat} className="mb-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">{cat.replace('-', ' ')}</div>
          <div className="space-y-1">
            {list.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onPick(l.id)}
                className={cx(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[14px]',
                  l.id === selectedId ? 'bg-accent-soft text-accent' : 'text-primary active:bg-[var(--press)]',
                )}
              >
                <span className="truncate">{l.name}</span>
                <span className="ml-2 shrink-0 font-mono text-[11px] text-muted">
                  {l.xPercent.toFixed(0)},{l.yPercent.toFixed(0)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddPinForm({ onAdd }: { onAdd: (loc: MapLocation) => void }) {
  const locations = useApp((s) => s.locations);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<LocationCategory>('amenity');
  const [amenityType, setAmenityType] = useState(AMENITY_CATEGORIES[0]);

  const makeId = () => {
    if (category === 'amenity') {
      const base = amenitySlug(amenityType);
      let n = 1;
      while (locations.some((l) => l.id === `${base}-${String(n).padStart(2, '0')}`)) n++;
      return `${base}-${String(n).padStart(2, '0')}`;
    }
    const base = (name || 'pin').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let id = `custom-${base}`;
    let n = 2;
    while (locations.some((l) => l.id === id)) id = `custom-${base}-${n++}`;
    return id;
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-[13px] font-semibold text-secondary">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={category === 'amenity' ? amenityType : 'e.g. Meet spot by the palm tree'}
          className="min-h-touch w-full rounded-xl border border-subtle bg-[var(--surface-sunken)] px-3 text-[14px] text-primary outline-none"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[13px] font-semibold text-secondary">Category</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as LocationCategory)}
          className="min-h-touch w-full rounded-xl border border-subtle bg-[var(--surface-sunken)] px-3 text-[14px] text-primary outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.replace('-', ' ')}</option>
          ))}
        </select>
      </label>
      {category === 'amenity' && (
        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-secondary">Amenity type</span>
          <select
            value={amenityType}
            onChange={(e) => setAmenityType(e.target.value)}
            className="min-h-touch w-full rounded-xl border border-subtle bg-[var(--surface-sunken)] px-3 text-[14px] text-primary outline-none"
          >
            {AMENITY_CATEGORIES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
      )}
      <p className="text-[12px] text-muted">
        The pin drops at the map center. Select it, then tap the map to place it exactly.
      </p>
      <Button
        variant="yellow"
        className="w-full"
        onClick={() =>
          onAdd({
            id: makeId(),
            name: name || amenityType,
            category,
            amenityType: category === 'amenity' ? amenityType : undefined,
            xPercent: 50,
            yPercent: 50,
            custom: true,
          })
        }
      >
        Add pin
      </Button>
    </div>
  );
}

function EditPinForm({
  loc,
  onSave,
}: {
  loc: MapLocation;
  onSave: (patch: Partial<MapLocation>) => void;
}) {
  const [name, setName] = useState(loc.name);
  const [category, setCategory] = useState<LocationCategory>(loc.category);
  const [amenityType, setAmenityType] = useState(loc.amenityType ?? AMENITY_CATEGORIES[0]);
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-[13px] font-semibold text-secondary">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-touch w-full rounded-xl border border-subtle bg-[var(--surface-sunken)] px-3 text-[14px] text-primary outline-none"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[13px] font-semibold text-secondary">Category</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as LocationCategory)}
          className="min-h-touch w-full rounded-xl border border-subtle bg-[var(--surface-sunken)] px-3 text-[14px] text-primary outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.replace('-', ' ')}</option>
          ))}
        </select>
      </label>
      {category === 'amenity' && (
        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-secondary">Amenity type</span>
          <select
            value={amenityType}
            onChange={(e) => setAmenityType(e.target.value)}
            className="min-h-touch w-full rounded-xl border border-subtle bg-[var(--surface-sunken)] px-3 text-[14px] text-primary outline-none"
          >
            {AMENITY_CATEGORIES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
      )}
      <Button
        variant="yellow"
        className="w-full"
        onClick={() =>
          onSave({
            name,
            category,
            amenityType: category === 'amenity' ? amenityType : undefined,
          })
        }
      >
        Save
      </Button>
    </div>
  );
}

function NudgeBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[16px] font-bold text-primary active:bg-[var(--press)]"
    >
      {children}
    </button>
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
