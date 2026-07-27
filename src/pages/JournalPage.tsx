import { JournalWorkspace } from '../journal/JournalWorkspace';
import {
  PageHeader,
  PageShell,
  type AppRoute
} from '../components/PageShell';
import type { CombinedSnapshot } from '../types';

type JournalPageProps = {
  snapshot: CombinedSnapshot;
  route: AppRoute;
  vipShopUrl: string | null;
};

export function JournalPage({ snapshot, route, vipShopUrl }: JournalPageProps) {
  return (
    <PageShell
      currentRoute={route}
      vipShopUrl={vipShopUrl}
      testId="journal-page"
    >
      <PageHeader
        eyebrow="После матча"
        title="Журнал матчей"
        description="Выберите сервер и завершённый матч. Итоги игроков и журнал событий появляются только после конца игры."
        className="section-shell journal-page-intro"
      >
        <div className="journal-privacy-note">
          <span aria-hidden="true">●</span>
          Только завершённые матчи · последние 10 записей на сервер
        </div>
      </PageHeader>
      <JournalWorkspace servers={snapshot.servers} />
    </PageShell>
  );
}
