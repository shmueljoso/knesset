import { useGame, useStore, type Panel } from '../store';
import type { LocationId } from '../engine/types';
import { Dashboard } from './Dashboard';
import { LegacyModal } from './Legacy';
import { CaucusSheet } from './PowerMap';
import { CoalitionSheet, MinistrySheet, NegotiationBanner, NegotiationSheet } from './Government';
import { EventModal } from './EventModal';
import { Hud, TabBar } from './Hud';
import { BillBuilder, BillSheet, LegislationView, VoteSheet } from './Legislation';
import { LocationSheet } from './LocationSheet';
import { MapView } from './MapView';
import { HelpSheet, NewsView, PartySheet, SettingsSheet, StaffSheet } from './Panels';
import { NpcSheet, PeopleView } from './People';
import { ElectionModal, ReportModal } from './ReportModal';

function PanelView({ p }: { p: Panel }) {
  switch (p.kind) {
    case 'location':
      return <LocationSheet id={p.id as LocationId} />;
    case 'npc':
      return <NpcSheet id={p.id} />;
    case 'bill':
      return <BillSheet id={p.id} />;
    case 'vote':
      return <VoteSheet id={p.id} />;
    case 'billBuilder':
      return <BillBuilder />;
    case 'bills':
      return null;
    case 'staff':
      return <StaffSheet />;
    case 'party':
      return <PartySheet />;
    case 'settings':
      return <SettingsSheet />;
    case 'help':
      return <HelpSheet />;
    case 'coalition':
      return <CoalitionSheet />;
    case 'ministry':
      return <MinistrySheet />;
    case 'negotiation':
      return <NegotiationSheet />;
    case 'caucus':
      return <CaucusSheet />;
  }
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} onClick={() => dismiss(t.id)}>
          {t.text}
          {t.lines?.map((l, i) => (
            <div key={i} className="small muted">
              {l}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function GameScreen() {
  const g = useGame();
  const tab = useStore((s) => s.tab);
  const panels = useStore((s) => s.panels);
  const showReport = useStore((s) => s.showReport);
  const top = panels[panels.length - 1];
  return (
    <>
      <Hud />
      {tab === 'map' && <MapView />}
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'people' && <PeopleView />}
      {tab === 'laws' && <LegislationView />}
      {tab === 'news' && <NewsView />}
      <TabBar />
      {tab === 'map' && !top && <NegotiationBanner />}
      {top && <PanelView key={panels.length + top.kind} p={top} />}
      {g.gameOver ? <LegacyModal /> : g.flags.showElection ? <ElectionModal /> : showReport && g.report ? <ReportModal /> : g.eventQueue.length > 0 ? <EventModal /> : null}
      <Toasts />
    </>
  );
}
