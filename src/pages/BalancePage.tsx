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
import { EmptyState, ServerSelector } from '../components/Primitives';
import { getServerSelectionKey } from '../lib/server';
import { classNames } from '../lib/ui';
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
  const [selectedServerKey, setSelectedServerKey] = useState('');
  const defaultServer =
    snapshot.servers.find((server) => server.online && server.teamBalancer) ||
    snapshot.servers.find((server) => server.teamBalancer) ||
    snapshot.servers.find((server) => server.online) ||
    snapshot.servers[0] ||
    null;
  const selectedServer =
    snapshot.servers.find(
      (server) => getServerSelectionKey(server) === selectedServerKey
    ) || defaultServer;

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

      {selectedServer ? (
        <>
          <ServerSelector
            label="Сервер балансера"
            className="section-shell balance-server-selector"
            testId="balance-server-selector"
          >
            <div className="section-head">
              <div>
                <span className="section-eyebrow">Сервер</span>
                <h2>Выберите расчёт</h2>
              </div>
              <p>На странице остаётся только выбранный сервер.</p>
            </div>
            <div className="balance-server-selector-grid">
              {snapshot.servers.map((server) => {
                const serverKey = getServerSelectionKey(server);
                const isActive =
                  serverKey === getServerSelectionKey(selectedServer);
                return (
                  <button
                    key={serverKey}
                    type="button"
                    className={classNames(
                      'balance-server-button',
                      isActive && 'balance-server-button-active'
                    )}
                    aria-pressed={isActive}
                    data-testid={`balance-server-selector-${server.id}`}
                    onClick={() => setSelectedServerKey(serverKey)}
                  >
                    <strong>{formatServerDisplayName(server)}</strong>
                    <span>
                      {server.online ? 'В сети' : 'Оффлайн'} ·{' '}
                      {server.teamBalancer ? 'расчёт готов' : 'расчёта пока нет'}
                    </span>
                  </button>
                );
              })}
            </div>
          </ServerSelector>

          <section
            className="section-shell"
            data-testid={`balance-server-${selectedServer.id}`}
          >
            <div className="section-head">
              <div>
                <span className="section-eyebrow">
                  {selectedServer.online ? 'В сети' : 'Оффлайн'}
                </span>
                <h2>{formatServerDisplayName(selectedServer)}</h2>
              </div>
              <p>Предварительный расчёт и итог последнего выполнения.</p>
            </div>
            <TeamBalancerPanel
              snapshot={selectedServer.teamBalancer}
              proposalMode={proposalMode}
              visibleAssignmentTones={buildTeamBalancerVisibleTones(
                selectedServer,
                proposalMode
              )}
              onProposalModeChange={setProposalMode}
            />
            <TeamBalancerHistoryPanel server={selectedServer} />
          </section>
        </>
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
