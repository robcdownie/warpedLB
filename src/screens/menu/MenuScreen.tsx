import { ArrowLeft } from 'lucide-react';
import type { MenuRoute } from '@/components/MenuDrawer';
import { OfflineTestScreen } from './OfflineTestScreen';
import { AboutScreen } from './AboutScreen';
import { ScheduleIoScreen } from './ScheduleIoScreen';
import { FriendsScreen } from './FriendsScreen';
import { CalibrationScreen } from './CalibrationScreen';
import { MapSetupScreen } from './MapSetupScreen';
import { TravelScreen } from './TravelScreen';
import { EmergencyScreen } from './EmergencyScreen';
import { SettingsScreen } from './SettingsScreen';
import { DataScreen } from './DataScreen';
import { DemoScreen } from './DemoScreen';

const TITLES: Record<MenuRoute, string> = {
  settings: 'Settings',
  friends: 'Friends & Sharing',
  'schedule-io': 'Schedule Import / Export',
  data: 'Backup & Data',
  'offline-test': 'Offline Test',
  demo: 'Demo Mode',
  about: 'About',
  'map-setup': 'Map Setup',
  calibration: 'Map Calibration',
  travel: 'Travel & Crowd',
  emergency: 'Emergency Schedule',
};

export function MenuScreen({
  route,
  onBack,
  onNavigate,
}: {
  route: MenuRoute;
  onBack: () => void;
  onNavigate: (r: MenuRoute) => void;
}) {
  return (
    <div>
      <div
        className="sticky top-0 z-20 flex items-center gap-2 px-2 py-2 pt-1"
        style={{ background: 'var(--surface-app)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="min-h-touch min-w-touch flex items-center justify-center rounded-xl text-primary active:bg-[var(--press)]"
          aria-label="Back"
        >
          <ArrowLeft size={22} aria-hidden />
        </button>
        <h1 className="font-display text-[17px] text-primary">{TITLES[route]}</h1>
      </div>
      <RouteBody route={route} onNavigate={onNavigate} />
    </div>
  );
}

function RouteBody({ route, onNavigate }: { route: MenuRoute; onNavigate: (r: MenuRoute) => void }) {
  switch (route) {
    case 'offline-test':
      return <OfflineTestScreen />;
    case 'about':
      return <AboutScreen />;
    case 'schedule-io':
      return <ScheduleIoScreen />;
    case 'friends':
      return <FriendsScreen />;
    case 'map-setup':
      return <MapSetupScreen onOpenMenu={onNavigate} />;
    case 'calibration':
      return <CalibrationScreen />;
    case 'travel':
      return <TravelScreen />;
    case 'emergency':
      return <EmergencyScreen />;
    case 'settings':
      return <SettingsScreen onOpenMenu={onNavigate} />;
    case 'data':
      return <DataScreen />;
    case 'demo':
      return <DemoScreen />;
  }
}
