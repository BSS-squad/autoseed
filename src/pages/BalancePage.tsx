import { useState } from 'react';

import {
  PageHeader,
  PageShell,
  type AppRoute
} from '../components/PageShell';
import {
  buildTeamBalancerVisibleTones,
  TeamBalancerHistoryPanel,
  TeamBalancerPanel
} from '../components/TeamBalancer';
import { EmptyState } from '../components/Primitives';
import { getServerSelectionKey } from '../lib/server';
import { formatServerDisplayName } from '../lib/ui-copy';
import type {
  CombinedSnapshot,
  TeamBalancerProposalMode
} from '../types';

type BalancePageProps = {
  snapshot: CombinedSnapshot;
  route: AppRoute;
  vipShopUrl: string | null;
};

export function BalancePage({ snapshot, route, vipShopUrl }: BalancePageProps) {
  const [proposalMode, setProposalMode] = useState<TeamBalancerProposalMode>('squad');

  return (
    <PageShell
      currentRoute={route}
      vipShopUrl={vipShopUrl}
      testId="balance-page"
    >
      <PageHeader
        eyebrow="Серверы"
        title="Балансер"
        description="Состояние голосования, предварительный расчёт и только реально выполненные межматчевые перемещения."
        className="section-shell"
      />

      {snapshot.servers.length ? (
        snapshot.servers.map((server) => (
          <section
            className="section-shell"
            key={getServerSelectionKey(server)}
            data-testid={`balance-server-${server.id}`}
          >
            <div className="section-head">
              <div>
                <span className="section-eyebrow">{server.online ? 'В сети' : 'Оффлайн'}</span>
                <h2>{formatServerDisplayName(server)}</h2>
              </div>
              <p>
                Расчёт состава не перемещает игроков: исполнение возможно только после матча.
              </p>
            </div>
            <TeamBalancerPanel
              snapshot={server.teamBalancer}
              proposalMode={proposalMode}
              visibleAssignmentTones={buildTeamBalancerVisibleTones(server, proposalMode)}
              onProposalModeChange={setProposalMode}
            />
            <TeamBalancerHistoryPanel server={server} />
          </section>
        ))
      ) : (
        <section className="section-shell">
          <EmptyState
            className="server-activity-empty"
            title="Данные о серверах пока не поступили."
          />
        </section>
      )}
    </PageShell>
  );
}
