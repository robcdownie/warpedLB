import { useMemo, useState } from 'react';
import { LifeBuoy, Download, Copy, Check } from 'lucide-react';
import { Screen, Card, Button } from '@/components/ui';
import { useApp } from '@/store/appStore';
import { useMeetups } from '@/hooks/useMeetups';
import { buildEmergencyText } from '@/domain/emergency';
import { downloadText, copyToClipboard, timestampSlug } from '@/domain/share/files';

export function EmergencyScreen() {
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const users = useApp((s) => s.users);
  const selections = useApp((s) => s.selections);
  const performanceById = useApp((s) => s.performanceById);
  const artistById = useApp((s) => s.artistById);
  const locationById = useApp((s) => s.locationById);
  const performances = useApp((s) => s.performances);
  const turnoverBuffer = useApp((s) => s.settings.turnoverBuffer);
  const satMeetups = useMeetups('saturday');
  const sunMeetups = useMeetups('sunday');
  const acknowledged = useApp((s) => s.settings.emergencyAcknowledged);
  const updateSettings = useApp((s) => s.updateSettings);
  const [copied, setCopied] = useState(false);

  const user = users.find((u) => u.id === activeUserId);
  const acknowledge = () => updateSettings({ emergencyAcknowledged: true });

  const text = useMemo(() => {
    if (!user) return '';
    return buildEmergencyText({
      user,
      selections,
      performanceById,
      artistById,
      locationById,
      allPerformances: performances,
      turnoverBuffer,
      meetupsByDay: { saturday: satMeetups, sunday: sunMeetups },
    });
  }, [user, selections, performanceById, artistById, locationById, performances, turnoverBuffer, satMeetups, sunMeetups]);

  const doCopy = async () => {
    if (await copyToClipboard(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <Screen>
      <Card className="mb-4 border-warp-pink/30 bg-warp-pink/5 p-4">
        <div className="flex items-start gap-3">
          <LifeBuoy size={24} className="mt-0.5 shrink-0 text-warp-pink" aria-hidden />
          <div>
            <h2 className="font-display text-[15px] text-primary">Emergency schedule</h2>
            <p className="text-[13px] text-secondary">
              A plain-text copy of your plan — it needs no app and no signal. Take a screenshot
              so it&apos;s in your Photos even if the phone acts up.
            </p>
          </div>
        </div>
      </Card>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Button
          variant="yellow"
          onClick={() => {
            downloadText(`warped-${activeUserId}-emergency-${timestampSlug()}.txt`, text, 'text/plain');
            void acknowledge();
          }}
        >
          <Download size={16} aria-hidden /> Save .txt
        </Button>
        <Button variant="secondary" onClick={doCopy}>
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copied ? 'Copied' : 'Copy text'}
        </Button>
      </div>

      {/* The setup checklist's last step. Saving the file counts, but so does
          "I screenshotted it" — the point is that a copy exists off the app. */}
      {!acknowledged && (
        <button
          type="button"
          onClick={() => void acknowledge()}
          className="mb-3 flex min-h-touch w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-subtle text-[13px] font-semibold text-secondary active:bg-[var(--press)]"
        >
          <Check size={15} aria-hidden /> I&apos;ve saved a copy outside the app
        </button>
      )}
      {acknowledged && (
        <p className="mb-3 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-ok">
          <Check size={14} aria-hidden /> Emergency backup marked saved
        </p>
      )}

      <Card className="p-3">
        <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-primary">
          {text}
        </pre>
      </Card>
    </Screen>
  );
}
