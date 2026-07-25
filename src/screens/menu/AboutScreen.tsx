import { Screen, Card } from '@/components/ui';
import { WarpedWordmark } from '@/components/WarpedWordmark';
import { APP_NAME, APP_DISCLAIMER, EVENT } from '@/config/event';

export function AboutScreen() {
  return (
    <Screen>
      <Card className="mb-4 p-5">
        <div className="mb-3 flex justify-center">
          <WarpedWordmark className="h-12 scale-125" />
        </div>
        <h1 className="text-center font-display text-[18px] text-primary">{APP_NAME}</h1>
        <p className="mt-1 text-center text-[13px] text-secondary">
          Public build {__BUILD_HASH__} · {__BUILD_DATE__}
        </p>
      </Card>

      <Card className="mb-4 p-4">
        <h2 className="mb-1 font-display text-[14px] uppercase tracking-wide text-secondary">
          Event
        </h2>
        <p className="text-[14px] text-primary">{EVENT.name}</p>
        <p className="text-[13px] text-secondary">{EVENT.venue}</p>
        <p className="text-[13px] text-secondary">{EVENT.address}</p>
        <p className="mt-1 text-[13px] text-secondary">Saturday July 25 &amp; Sunday July 26, 2026</p>
      </Card>

      <Card className="mb-4 border-warp-yellow/40 bg-warp-yellow/5 p-4">
        <h2 className="mb-1 font-display text-[14px] uppercase tracking-wide text-secondary">
          Disclaimer
        </h2>
        <p className="text-[13px] leading-relaxed text-primary">{APP_DISCLAIMER}</p>
      </Card>

      <Card className="mb-4 p-4">
        <h2 className="mb-2 font-display text-[14px] uppercase tracking-wide text-secondary">
          How it works
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-secondary">
          <li>Everything is stored on your phone. No account, no server, no login.</li>
          <li>Works fully offline after your first visit — built for weak festival signal.</li>
          <li>
            Friends&apos; plans move between phones by QR code or a short text code, not the
            internet. Two offline phones can&apos;t sync on their own — that&apos;s a real limit,
            not a bug.
          </li>
          <li>
            Set times aren&apos;t published in advance. Type them off the board yourself, or paste a
            code from someone who already did — either way, check the official board.
          </li>
        </ul>
      </Card>

      <p className="px-1 text-center text-[11px] text-muted">
        Made by a fan, for fans. Have a great show.
      </p>
    </Screen>
  );
}
