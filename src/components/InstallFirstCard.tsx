import { Share, MoreVertical, Check } from 'lucide-react';
import { Card } from './ui';
import { useInstallState } from '@/hooks/useInstallState';

/**
 * "Add it to your Home Screen before you set it up."
 *
 * Ordering matters and is the whole reason this sits on the welcome screen
 * rather than in a help page. iOS has shipped versions where a Home Screen web
 * app got a different storage jar from the Safari tab it was added from, which
 * would silently strand a profile and a weekend of picks in a tab the user
 * never opens again. Installing first makes that impossible instead of
 * unlikely, and it costs a new user about fifteen seconds.
 *
 * It also front-loads the one step that genuinely cannot be done later: you
 * cannot install an app you can't reach, and in a festival field you can't
 * reach anything.
 *
 * Renders nothing once the app is running installed.
 */
export function InstallFirstCard() {
  const { installed, platform } = useInstallState();

  if (installed) {
    return (
      <Card className="mb-4 border-warp-ok/40 bg-warp-ok/10 p-3">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-primary">
          <Check size={15} className="shrink-0 text-warp-ok" aria-hidden />
          <span>Installed on your Home Screen. This is the right way to run it.</span>
        </p>
      </Card>
    );
  }

  return (
    <Card className="mb-4 border-warp-yellow/60 bg-warp-yellow/10 p-4">
      <h2 className="font-display text-[16px] text-primary">Add this to your Home Screen first</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">
        Do this before you set anything up. It&apos;s what makes the app work with no signal, and it
        keeps your plan from being stranded in a browser tab.
      </p>

      {platform === 'ios' && (
        <ol className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-primary">
          <Step n={1}>
            Tap the <Share size={13} className="inline align-[-2px]" aria-label="Share" /> Share
            button at the bottom of Safari
          </Step>
          <Step n={2}>
            Scroll down and tap <b>Add to Home Screen</b>
          </Step>
          <Step n={3}>
            Tap <b>Add</b>, then open the app from your Home Screen and start here again
          </Step>
        </ol>
      )}

      {platform === 'android' && (
        <ol className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-primary">
          <Step n={1}>
            Tap the <MoreVertical size={13} className="inline align-[-2px]" aria-label="Menu" /> menu
            in Chrome
          </Step>
          <Step n={2}>
            Tap <b>Install app</b>, or <b>Add to Home screen</b>
          </Step>
          <Step n={3}>Open it from your home screen and start here again</Step>
        </ol>
      )}

      {platform === 'desktop' && (
        <p className="mt-3 text-[13px] leading-relaxed text-primary">
          You&apos;re on a computer, so there&apos;s nothing to install — but the app is built for
          the phone you&apos;ll actually have at the festival. Open this page there and add it to
          your Home Screen.
        </p>
      )}

      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        You can carry on here without installing. It just won&apos;t be on your phone when the
        signal goes.
      </p>
    </Card>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warp-yellow text-[11px] font-bold text-warp-ink">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}
