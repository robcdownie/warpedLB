import { useEffect, useRef, useState } from 'react';
import {
  Star,
  Users,
  WifiOff,
  Check,
  Loader2,
  ArrowRight,
  Plane,
  QrCode,
  ListChecks,
  UserPlus,
} from 'lucide-react';
import { Button, Card, cx } from '@/components/ui';
import { FriendAvatar } from '@/components/FriendAvatar';
import { WarpedWordmark } from '@/components/WarpedWordmark';
import { ProfileForm } from '@/components/ProfileForm';
import { useApp } from '@/store/appStore';
import {
  prepareForOffline,
  runOfflineTests,
  friendlyGroups,
  allEssentialPass,
  type FriendlyGroupResult,
} from '@/domain/offlineTests';
import { ART, APP_DISCLAIMER } from '@/config/event';
import type { User } from '@/domain/types';
import type { TabId } from '@/store/appStore';
import type { MenuRoute } from '@/components/MenuDrawer';

type Step = 'welcome' | 'profile' | 'offline' | 'plan';

/**
 * First-run setup (plan §"First Fix").
 *
 * Not a splash screen: every step completes a real task — create the profile
 * this phone belongs to, actually cache the app for offline use, and land on the
 * screen that does the next useful thing.
 *
 * There is deliberately NO "paste a set-times code" step here. It used to be
 * step two, and it tested badly: someone arriving from a link has no code yet,
 * so being asked for one up front reads as a requirement they can't meet, and
 * the honest reaction is to close the app. The prompt now lives where it's an
 * answer rather than a gate — on the Enter Times board (ScheduleScreen), next to
 * the work it saves you.
 */
export function OnboardingFlow({
  onFinish,
}: {
  onFinish: (dest: { tab?: TabId; menu?: MenuRoute }) => void;
}) {
  const users = useApp((s) => s.users);
  const activeUserId = useApp((s) => s.settings.activeUserId);
  const completeOnboarding = useApp((s) => s.completeOnboarding);
  const putUser = useApp((s) => s.putUser);

  const [step, setStep] = useState<Step>('welcome');
  const [picked, setPicked] = useState<string | null>(null);
  /** True only when the user took the "I've used this app before" door. */
  const [returning, setReturning] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to each new heading so VoiceOver announces the step change.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const chosenId = picked ?? (activeUserId || null);
  const chosenUser = users.find((u) => u.id === chosenId);

  const afterProfile = () => setStep(returning ? 'plan' : 'offline');

  const finish = async (dest: { tab?: TabId; menu?: MenuRoute }) => {
    // Defensive: App.tsx bounces straight back here if activeUserId doesn't
    // resolve, so finishing without a real profile would be an infinite loop.
    if (!chosenUser) {
      setStep('profile');
      return;
    }
    await completeOnboarding(chosenUser.id);
    onFinish(dest);
  };

  return (
    <div className="surface-app flex h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col px-5 pb-[calc(var(--safe-bottom)+1.5rem)] pt-[calc(var(--safe-top)+1.25rem)]">
        <StepDots step={step} />

        {step === 'welcome' && (
          <PurposeStep
            headingRef={headingRef}
            onStart={() => setStep('profile')}
            onReturning={() => {
              setReturning(true);
              setStep('profile');
            }}
          />
        )}

        {step === 'profile' && (
          <ProfileStep
            headingRef={headingRef}
            users={users}
            picked={picked}
            onPick={setPicked}
            onCreate={async (u) => {
              await putUser(u);
              setPicked(u.id);
              afterProfile();
            }}
            onContinue={afterProfile}
            returning={returning}
          />
        )}

        {step === 'offline' && (
          <OfflineStep
            headingRef={headingRef}
            onContinue={() => setStep('plan')}
          />
        )}

        {step === 'plan' && (
          <PlanStep
            headingRef={headingRef}
            userName={chosenUser?.name ?? 'you'}
            onPickBands={() => void finish({ tab: 'bands' })}
            onImportTimes={() => void finish({ menu: 'schedule-io' })}
            onSkip={() => void finish({ tab: 'now' })}
          />
        )}
      </div>
    </div>
  );
}

const STEPS: Step[] = ['welcome', 'profile', 'offline', 'plan'];

function StepDots({ step }: { step: Step }) {
  const i = STEPS.indexOf(step);
  return (
    <div className="mb-5 flex items-center gap-1.5" aria-label={`Step ${i + 1} of ${STEPS.length}`}>
      {STEPS.map((s, n) => (
        <span
          key={s}
          className={cx(
            'h-1.5 flex-1 rounded-full transition',
            n <= i ? 'bg-warp-pink' : 'bg-[var(--surface-sunken)]',
          )}
        />
      ))}
    </div>
  );
}

function Heading({
  headingRef,
  children,
}: {
  headingRef: React.RefObject<HTMLHeadingElement>;
  children: React.ReactNode;
}) {
  return (
    <h1
      ref={headingRef}
      tabIndex={-1}
      className="font-display text-[26px] leading-tight text-primary outline-none"
    >
      {children}
    </h1>
  );
}

// --------------------------------------------------------------- 1. welcome
function PurposeStep({
  headingRef,
  onStart,
  onReturning,
}: {
  headingRef: React.RefObject<HTMLHeadingElement>;
  onStart: () => void;
  onReturning: () => void;
}) {
  return (
    <>
      <div className="relative -mx-5 mb-5 overflow-hidden">
        <img src={ART.hero} alt="" aria-hidden className="h-36 w-full object-cover object-[center_35%]" />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(8,36,80,0.15), rgba(5,25,58,0.85))' }}
        />
        <WarpedWordmark className="absolute bottom-3 left-5 h-7" />
      </div>

      <Heading headingRef={headingRef}>Plan Warped Tour without depending on cell service</Heading>
      <p className="mt-2 text-[15px] leading-relaxed text-secondary">
        Pick your bands, compare plans with friends, find schedule conflicts, and keep the
        festival map available offline.
      </p>

      <ul className="mt-6 space-y-3">
        <Benefit Icon={Star} title="Build your personal band list" body="Must See, Want to See, Maybe — and spot clashes before you're standing in one." />
        <Benefit Icon={Users} title="Share plans using QR or text codes" body="Scan or paste. No accounts, no signal needed." />
        <Benefit Icon={ListChecks} title="Find conflicts and meetup windows" body="Including windows where everyone is actually free." />
        <Benefit Icon={WifiOff} title="Reopen the app without service" body="Schedule, map and your plan all live on this phone." />
      </ul>

      <div className="flex-1" />
      <p className="mt-6 text-[13px] leading-relaxed text-muted">
        No account required. Your data stays on your phone.
      </p>
      <div className="mt-3 space-y-2">
        <Button variant="yellow" className="w-full py-3 text-[16px]" onClick={onStart}>
          Get Started <ArrowRight size={18} aria-hidden />
        </Button>
        <Button variant="ghost" className="w-full text-[14px]" onClick={onReturning}>
          I&apos;ve used this app before
        </Button>
      </div>
      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">{APP_DISCLAIMER}</p>
    </>
  );
}

/**
 * The whole app in three lines (plan §"Simple mental model"). Nobody should
 * have to work out what each tab is for — the app has three modes, and which
 * one you're in depends only on what the festival has announced.
 */
export function PhaseModel({ className }: { className?: string }) {
  const phases: [string, string][] = [
    ['Before the festival', 'Pick your bands and trade plans with friends.'],
    ['When the board goes up', 'Paste a set-times code, or type the board in yourself.'],
    ['During the festival', 'Open Now to see what’s next. Open Map to find the crew.'],
  ];
  return (
    <ol className={cx('space-y-1.5', className)}>
      {phases.map(([when, what], i) => (
        <li key={when} className="flex gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
            {i + 1}
          </span>
          <span className="text-[13px] leading-snug">
            <span className="font-semibold text-primary">{when}</span>
            <span className="block text-secondary">{what}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Benefit({
  Icon,
  title,
  body,
}: {
  Icon: typeof Star;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Icon size={20} aria-hidden />
      </span>
      <span>
        <span className="block text-[15px] font-semibold text-primary">{title}</span>
        <span className="block text-[13px] leading-snug text-secondary">{body}</span>
      </span>
    </li>
  );
}

// ---------------------------------------------------------------- 2. profile
/**
 * Who is holding this phone. Two shapes, because the roster ships empty:
 *
 * - nobody on the device yet → create a profile
 * - somebody already here (a restored backup, or a returning user) → pick
 *   yourself from the list, or add a new person
 *
 * Whichever path, this step is the only way out of onboarding — App.tsx will
 * not show the app until activeUserId resolves to a real user.
 */
function ProfileStep({
  headingRef,
  users,
  picked,
  onPick,
  onCreate,
  onContinue,
  returning,
}: {
  headingRef: React.RefObject<HTMLHeadingElement>;
  users: User[];
  picked: string | null;
  onPick: (id: string) => void;
  onCreate: (u: User) => void | Promise<void>;
  onContinue: () => void;
  returning: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const chosen = users.find((u) => u.id === picked);
  const showForm = users.length === 0 || creating;

  if (showForm) {
    return (
      <>
        <Heading headingRef={headingRef}>
          {users.length === 0 ? 'Set up your profile' : 'Add yourself'}
        </Heading>
        <p className="mt-2 text-[15px] leading-relaxed text-secondary">
          Just a name and a colour so your picks are yours and your friends can tell you apart. No
          account, no email, no password.
        </p>

        <Card className="mt-5 p-4">
          <ProfileForm
            takenIds={users.map((u) => u.id)}
            takenColors={users.map((u) => u.colorKey)}
            onSave={onCreate}
            onCancel={users.length ? () => setCreating(false) : undefined}
            submitLabel="Continue"
          />
        </Card>

        <div className="flex-1" />
        <p className="mt-6 text-center text-[12px] leading-relaxed text-muted">
          Your group information stays on this device unless you choose to share an offline code.
        </p>
      </>
    );
  }

  return (
    <>
      <Heading headingRef={headingRef}>Which one is you?</Heading>
      <p className="mt-2 text-[15px] text-secondary">
        {returning
          ? 'Pick the profile this phone belongs to.'
          : 'These profiles are already on this phone. Tap whichever one is you, or add yourself.'}
      </p>

      <div className="mt-6 space-y-2.5" role="radiogroup" aria-label="Choose your profile">
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            role="radio"
            aria-checked={picked === u.id}
            onClick={() => onPick(u.id)}
            className={cx(
              'flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left transition',
              picked === u.id
                ? 'border-warp-pink bg-warp-pink/5'
                : 'border-subtle bg-[var(--surface-card)]',
            )}
          >
            <FriendAvatar user={u} size={52} ring />
            <span className="flex-1 font-display text-[19px] text-primary">{u.name}</span>
            {picked === u.id && <Check size={22} className="text-warp-pink" aria-hidden />}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-subtle p-4 text-left"
        >
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-muted">
            <UserPlus size={22} aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block font-display text-[17px] text-primary">I&apos;m not listed</span>
            <span className="block text-[13px] leading-snug text-secondary">
              Add yourself as a new person.
            </span>
          </span>
        </button>
      </div>

      {chosen && (
        <p className="mt-4 rounded-xl bg-accent-soft px-3 py-2.5 text-[13px] leading-relaxed text-accent">
          You&apos;re setting up {chosen.name}&apos;s plan. You can change this later in Settings.
        </p>
      )}

      <div className="flex-1" />
      <Button
        variant="yellow"
        className="mt-8 w-full py-3 text-[16px]"
        disabled={!chosen}
        onClick={onContinue}
      >
        {chosen ? `Continue as ${chosen.name}` : 'Pick a profile to continue'}
      </Button>
      {returning && (
        <p className="mt-2 text-center text-[12px] text-muted">
          Your saved picks and imports are untouched.
        </p>
      )}
    </>
  );
}

// --------------------------------------------------------------- 4. offline
function OfflineStep({
  headingRef,
  onContinue,
}: {
  headingRef: React.RefObject<HTMLHeadingElement>;
  onContinue: () => void;
}) {
  const updateSettings = useApp((s) => s.updateSettings);
  const [groups, setGroups] = useState<FriendlyGroupResult[] | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void runOfflineTests().then((r) => {
      if (!alive) return;
      setGroups(friendlyGroups(r));
      setReady(allEssentialPass(r));
    });
    return () => {
      alive = false;
    };
  }, []);

  const prepare = async () => {
    setBusy(true);
    const results = await prepareForOffline();
    setGroups(friendlyGroups(results));
    const pass = allEssentialPass(results);
    setReady(pass);
    // Store the real result, not the attempt.
    await updateSettings({ offlineReady: pass });
    setBusy(false);
  };

  return (
    <>
      <Heading headingRef={headingRef}>Make it work without service</Heading>
      <p className="mt-2 text-[15px] leading-relaxed text-secondary">
        Warped Tour cell service can be unreliable. We&apos;ll save the app, festival map, band
        lineup, and your plans to this phone.
      </p>

      <Card className="mt-6 p-4">
        <ul className="space-y-2.5" aria-live="polite">
          {(groups ?? [
            { id: 'app', label: 'App files', pass: false },
            { id: 'map', label: 'Festival map', pass: false },
            { id: 'lineup', label: 'Band lineup', pass: false },
            { id: 'storage', label: 'Local storage', pass: false },
          ]).map((g) => (
            <li key={g.id} className="flex items-center gap-2.5">
              <span
                className={cx(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                  g.pass ? 'bg-warp-ok text-white' : 'bg-[var(--surface-sunken)] text-muted',
                )}
              >
                {busy && !g.pass ? (
                  <Loader2 size={13} className="animate-spin" aria-hidden />
                ) : g.pass ? (
                  <Check size={14} aria-hidden />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                )}
              </span>
              <span className="flex-1 text-[14px] font-semibold text-primary">{g.label}</span>
              <span className={cx('text-[12px]', g.pass ? 'text-ok' : 'text-muted')}>
                {g.pass ? 'Saved' : busy ? 'Saving…' : 'Not saved yet'}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {ready && (
        <div className="mt-4 rounded-xl border border-warp-ok/40 bg-warp-ok/10 p-3">
          <p className="flex items-center gap-2 font-display text-[15px] text-ok">
            <Check size={17} aria-hidden /> Ready for airplane mode
          </p>
          <p className="mt-1.5 flex items-start gap-2 text-[13px] leading-relaxed text-primary">
            <Plane size={15} className="mt-0.5 shrink-0 text-ok" aria-hidden />
            Before the festival, close the app, turn on Airplane Mode, and reopen it once.
          </p>
        </div>
      )}

      <div className="flex-1" />
      <div className="mt-8 space-y-2">
        <Button
          variant={ready ? 'secondary' : 'yellow'}
          className="w-full py-3 text-[16px]"
          onClick={prepare}
          disabled={busy}
        >
          {busy ? (
            <>
              <Loader2 size={17} className="animate-spin" aria-hidden /> Preparing…
            </>
          ) : ready ? (
            'Check again'
          ) : (
            'Prepare for Offline Use'
          )}
        </Button>
        <Button variant={ready ? 'yellow' : 'ghost'} className="w-full py-3 text-[15px]" onClick={onContinue}>
          {ready ? 'Continue' : 'Skip for now'}
        </Button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------- 5. plan
function PlanStep({
  headingRef,
  userName,
  onPickBands,
  onImportTimes,
  onSkip,
}: {
  headingRef: React.RefObject<HTMLHeadingElement>;
  userName: string;
  onPickBands: () => void;
  onImportTimes: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <Heading headingRef={headingRef}>Build your festival plan</Heading>
      <p className="mt-2 text-[15px] text-secondary">
        Two ways in, {userName}. You can do both — they don&apos;t overwrite each other.
      </p>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={onPickBands}
          className="flex w-full items-start gap-3 rounded-2xl border-2 border-warp-pink bg-warp-pink/5 p-4 text-left"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warp-pink text-white">
            <ListChecks size={22} aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block font-display text-[17px] text-primary">Pick My Bands</span>
            <span className="block text-[13px] leading-snug text-secondary">
              Choose your Must See, Want to See, and Maybe bands.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onImportTimes}
          className="flex w-full items-start gap-3 rounded-2xl border-2 border-subtle bg-[var(--surface-card)] p-4 text-left"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <QrCode size={22} aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block font-display text-[17px] text-primary">Add Set Times</span>
            <span className="block text-[13px] leading-snug text-secondary">
              Paste a code someone already typed off the board, or scan a friend&apos;s plan.
            </span>
          </span>
        </button>
      </div>

      <p className="mt-4 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-[13px] leading-relaxed text-secondary">
        Set times and band picks are stored separately — importing times will never replace the
        bands you chose.
      </p>

      {/* Three phases, so nobody has to remember what each tab is for. */}
      <PhaseModel className="mt-5" />

      <div className="flex-1" />
      <Button variant="ghost" className="mt-8 w-full py-3 text-[15px]" onClick={onSkip}>
        I&apos;ll do this later — take me in
      </Button>
    </>
  );
}
