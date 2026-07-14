import { useEffect, useMemo, useRef, useState } from 'react';

import { fetchActivitySession } from '../lib/snapshot';
import {
  buildTimeline,
  buildTimelineIntensity,
  EVENT_PAGE_SIZE_OPTIONS,
  findTimelineEventIndex,
  getPageCount,
  getPageForEventIndex,
  getPageRange,
  type EventPageSize
} from './event-navigation';
import { SCOREBOARD_METRICS, sortScoreboardPlayers } from './scoreboard';
import type {
  ExporterActivityEventCountsSnapshot,
  ExporterActivityKillfeedEventSnapshot,
  ExporterActivityRecentRoundSnapshot,
  ExporterActivitySessionEventsSnapshot,
  ExporterActivitySessionResponse,
  ExporterActivityTopWindowSnapshot,
  ExporterServerSnapshot
} from '../types';

type JournalWorkspaceProps = {
  servers: ExporterServerSnapshot[];
};

type JournalTab = 'scoreboard' | 'kills' | 'damage' | 'vehicles' | 'revives';
type DetailState = {
  key: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  response: ExporterActivitySessionResponse | null;
  partial: boolean;
  error: string | null;
};

const EMPTY_COUNTS: ExporterActivityEventCountsSnapshot = {
  kills: 0,
  damage: 0,
  knockdowns: 0,
  revives: 0,
  vehicles: 0
};

const EMPTY_EVENTS: ExporterActivitySessionEventsSnapshot = {
  kills: [],
  damage: [],
  knockdowns: [],
  revives: [],
  vehicles: []
};

const DEFAULT_EVENT_PAGE_SIZE: EventPageSize = 10;

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function parseJournalSelection(): {
  server: string;
  session: string;
  tab: JournalTab | null;
} {
  if (typeof window === 'undefined') return { server: '', session: '', tab: null };
  const [, query = ''] = window.location.hash.split('?');
  const params = new URLSearchParams(query);
  const tab = params.get('tab');
  return {
    server: params.get('server') || '',
    session: params.get('session') || '',
    tab:
      tab === 'scoreboard' ||
      tab === 'kills' ||
      tab === 'damage' ||
      tab === 'vehicles' ||
      tab === 'revives'
        ? tab
        : null
  };
}

function updateJournalLocation(server: string, session: string, tab: JournalTab): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  if (server) params.set('server', server);
  if (session) params.set('session', session);
  params.set('tab', tab);
  const suffix = params.toString();
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}#journal${suffix ? `?${suffix}` : ''}`
  );
}

function getSessions(server: ExporterServerSnapshot | null): ExporterActivityRecentRoundSnapshot[] {
  if (!server?.activity) return [];
  const sessions = server.activity.sessions.length
    ? server.activity.sessions
    : server.activity.recentRounds;
  return sessions.slice(0, 10);
}

function formatMatchDate(value: string | null): string {
  if (!value) return 'Время не записано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Время не записано';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatServerName(server: ExporterServerSnapshot): string {
  const identity = `${server.code} ${server.name}`.toLocaleLowerCase('ru');
  if (identity.includes('squadjs1') || identity.includes('[mix]') || identity.includes('[микс]')) {
    return 'MIX';
  }
  if (identity.includes('squadjs2') || identity.includes('spec ops')) return 'SPEC OPS';
  if (
    identity.includes('squadjs3') ||
    identity.includes('invasion') ||
    identity.includes('инвейжен')
  ) {
    return 'INVASION';
  }
  return server.name;
}

function formatEventTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

function formatTimelineTime(value: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value));
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
}

function formatWeapon(value: string | null): string {
  if (!value) return 'оружие не записано';
  return value
    .replace(/^BP_/i, '')
    .replace(/_C$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatTeamName(
  team: ExporterActivityRecentRoundSnapshot['winner'],
  fallback: string
): string {
  return team?.faction || team?.subfaction || (team?.team ? `Сторона ${team.team}` : fallback);
}

function formatResult(session: ExporterActivityRecentRoundSnapshot): string {
  if (!session.winner && !session.loser) return 'Результат не записан';
  const winner = formatTeamName(session.winner, 'Победитель');
  const loser = formatTeamName(session.loser, 'Проигравший');
  const winnerTickets = session.winner?.tickets;
  const loserTickets = session.loser?.tickets;
  const tickets =
    winnerTickets !== null && winnerTickets !== undefined
      ? ` · ${winnerTickets}:${loserTickets ?? 0}`
      : '';
  return `${winner} победил ${loser}${tickets}`;
}

function legacySessionKey(value: string | null): string {
  if (!value) return '';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? `legacy-${Math.floor(timestamp / 1000)}` : '';
}

function matchesSession(
  event: ExporterActivityKillfeedEventSnapshot,
  session: ExporterActivityRecentRoundSnapshot
): boolean {
  if (!event.roundEndedAt) return false;
  return legacySessionKey(event.roundEndedAt) === legacySessionKey(session.endedAt);
}

function groupLegacyEvents(
  server: ExporterServerSnapshot,
  session: ExporterActivityRecentRoundSnapshot
): ExporterActivitySessionEventsSnapshot {
  const grouped: ExporterActivitySessionEventsSnapshot = {
    kills: [],
    damage: [],
    knockdowns: [],
    revives: [],
    vehicles: []
  };

  for (const event of server.activity?.killfeed?.events || []) {
    if (!matchesSession(event, session)) continue;
    const type = event.type.trim().toLowerCase();
    if (event.vehicleName || type.startsWith('vehicle')) grouped.vehicles.push(event);
    else if (type === 'damage') grouped.damage.push(event);
    else if (type === 'revive') grouped.revives.push(event);
    else if (type === 'knockdown' || type === 'wound') grouped.knockdowns.push(event);
    else grouped.kills.push(event);
  }

  return grouped;
}

function countEvents(events: ExporterActivitySessionEventsSnapshot): ExporterActivityEventCountsSnapshot {
  return {
    kills: events.kills.length,
    damage: events.damage.length,
    knockdowns: events.knockdowns.length,
    revives: events.revives.length,
    vehicles: events.vehicles.length
  };
}

function buildLegacyResponse(
  server: ExporterServerSnapshot,
  session: ExporterActivityRecentRoundSnapshot
): ExporterActivitySessionResponse {
  const events = groupLegacyEvents(server, session);
  const inferredCounts = countEvents(events);
  const hasIndexCounts = Object.values(session.eventCounts).some((value) => value > 0);
  const hasEvents = Object.values(events).some((entries) => entries.length > 0);
  return {
    generatedAt: server.activity?.generatedAt || null,
    session: {
      ...session,
      journalAvailable: session.journalAvailable || hasEvents,
      journalComplete: false,
      eventCounts: hasIndexCounts ? session.eventCounts : inferredCounts
    },
    events
  };
}

function sortEvents(events: ExporterActivityKillfeedEventSnapshot[]) {
  return events.slice().sort((left, right) => {
    const leftTime = Date.parse(left.occurredAt || '') || 0;
    const rightTime = Date.parse(right.occurredAt || '') || 0;
    return leftTime - rightTime;
  });
}

function getTabEvents(
  events: ExporterActivitySessionEventsSnapshot,
  tab: JournalTab
): ExporterActivityKillfeedEventSnapshot[] {
  if (tab === 'kills') return sortEvents([...events.kills, ...events.knockdowns]);
  if (tab === 'damage') return sortEvents(events.damage);
  if (tab === 'vehicles') return sortEvents(events.vehicles);
  if (tab === 'revives') return sortEvents(events.revives);
  return [];
}

function matchesSearch(event: ExporterActivityKillfeedEventSnapshot, search: string): boolean {
  const normalizedSearch = search.trim().toLocaleLowerCase('ru');
  if (!normalizedSearch) return true;
  return [
    event.attackerName,
    event.victimName,
    event.vehicleName,
    event.weapon,
    event.type
  ].some((value) => String(value || '').toLocaleLowerCase('ru').includes(normalizedSearch));
}

function getEventTone(event: ExporterActivityKillfeedEventSnapshot): string {
  const type = event.type.toLowerCase();
  if (event.vehicleName || type.startsWith('vehicle')) return 'vehicle';
  if (type === 'revive') return 'revive';
  if (type === 'damage') return 'damage';
  if (type === 'knockdown' || type === 'wound') return 'knockdown';
  return 'kill';
}

function getEventLabel(event: ExporterActivityKillfeedEventSnapshot): string {
  const tone = getEventTone(event);
  if (tone === 'vehicle') return event.destroyed ? 'Уничтожена' : 'Повреждена';
  if (tone === 'revive') return 'Поднятие';
  if (tone === 'damage') return 'Урон';
  if (tone === 'knockdown') return 'Нокаут';
  return event.type.toLowerCase() === 'teamkill' ? 'Тимкилл' : 'Убийство';
}

function SessionTopSummary({ topWindow }: { topWindow: ExporterActivityTopWindowSnapshot | null }) {
  if (!topWindow?.entries.length) return null;
  return (
    <details className="journal-top-summary">
      <summary>
        <span>Сводка {topWindow.roundCount} матчей</span>
        <strong>{topWindow.entries.length} игроков</strong>
      </summary>
      <div className="journal-top-list">
        {topWindow.entries.map((entry) => (
          <div className="journal-top-row" key={`${entry.rank}:${entry.name}`}>
            <span>#{entry.rank}</span>
            <strong>{entry.name}</strong>
            <p>{entry.kills} убийств · {entry.roundsPlayed} матчей · K/D {entry.kdRatio}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function ScoreboardView({ response }: { response: ExporterActivitySessionResponse }) {
  const teams = response.session.scoreboard?.teams || [];
  if (!teams.length) {
    return (
      <div className="journal-empty-state">
        <strong>Итоговые табы не сохранились</strong>
        <p>Матч завершён, но сервер не передал состав сторон и показатели игроков.</p>
      </div>
    );
  }

  return (
    <div className="journal-scoreboard" data-testid="journal-scoreboard">
      <div className="journal-toolbar journal-scoreboard-toolbar">
        <div>
          <strong>Итоговая таблица</strong>
          <span>По убийствам, затем по меньшему числу смертей и поднятиям</span>
        </div>
      </div>

      <div className="journal-scoreboard-teams">
        {teams.map((team) => {
          const unknown = team.teamID === 'unknown' || team.result === null;
          return (
            <section
              className={classNames('journal-team-card', unknown && 'journal-team-card-unknown')}
              key={team.teamID}
            >
              <header>
                <div>
                  <span>{team.result === 'winner' ? 'Победа' : team.result === 'loser' ? 'Поражение' : 'Без стороны'}</span>
                  <h3>{team.name}</h3>
                </div>
                <p>
                  {team.totals.revives || 0} поднятий · {team.totals.knockdowns} нокаутов ·{' '}
                  {team.totals.kills} убийств · {team.totals.deaths || 0} смертей
                </p>
              </header>
              {unknown ? (
                <div className="journal-data-note">
                  Сервер не успел сохранить сторону части игроков — они вынесены отдельно.
                </div>
              ) : null}
              <div className="journal-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Игрок</th>
                      <th>Отряд / роль</th>
                      {SCOREBOARD_METRICS.map((metric) => (
                        <th key={metric.key}>{metric.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortScoreboardPlayers(team.players).map((player, index) => (
                      <tr key={`${player.name}:${index}`}>
                        <td>{player.name}</td>
                        <td>{[player.squad, player.role].filter(Boolean).join(' · ') || '—'}</td>
                        {SCOREBOARD_METRICS.map((metric) => (
                          <td key={metric.key}>{player[metric.key]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function EventRow({
  event,
  eventRef
}: {
  event: ExporterActivityKillfeedEventSnapshot;
  eventRef?: (element: HTMLElement | null) => void;
}) {
  const tone = getEventTone(event);
  const actor = event.attackerName || 'Источник не определён';
  const target = event.vehicleName || event.victimName || 'Цель не определена';
  const damage = typeof event.damage === 'number' ? `${formatNumber(event.damage)} урона` : null;
  const health =
    tone === 'vehicle' && typeof event.healthRemaining === 'number'
      ? `осталось ${formatNumber(event.healthRemaining)}`
      : null;

  return (
    <article
      className={classNames('journal-event-row', `tone-${tone}`)}
      ref={eventRef}
      tabIndex={-1}
    >
      <time dateTime={event.occurredAt || undefined}>{formatEventTime(event.occurredAt)}</time>
      <span className="journal-event-kind">{getEventLabel(event)}</span>
      <div className="journal-event-main">
        <strong>{actor}</strong>
        <span aria-hidden="true">→</span>
        <strong>{target}</strong>
      </div>
      <p>{[formatWeapon(event.weapon), damage, health].filter(Boolean).join(' · ')}</p>
    </article>
  );
}

function EventJournal({
  events,
  tab,
  search,
  page,
  pageSize,
  onSearchChange,
  onPageChange,
  onPageSizeChange
}: {
  events: ExporterActivitySessionEventsSnapshot;
  tab: JournalTab;
  search: string;
  page: number;
  pageSize: EventPageSize;
  onSearchChange: (value: string) => void;
  onPageChange: (value: number) => void;
  onPageSizeChange: (value: EventPageSize) => void;
}) {
  const allEvents = useMemo(() => getTabEvents(events, tab), [events, tab]);
  const filteredEvents = allEvents.filter((event) => matchesSearch(event, search));
  const pageRange = getPageRange(filteredEvents.length, page, pageSize);
  const pageCount = getPageCount(filteredEvents.length, pageSize);
  const visibleEvents = filteredEvents.slice(pageRange.start, pageRange.end);
  const timeline = buildTimeline(filteredEvents);
  const timelineIntensity = useMemo(
    () => (timeline ? buildTimelineIntensity(filteredEvents, timeline) : []),
    [filteredEvents, timeline]
  );
  const [timelineMinute, setTimelineMinute] = useState(0);
  const [pendingEventIndex, setPendingEventIndex] = useState<number | null>(null);
  const eventRefs = useRef(new Map<number, HTMLElement>());
  const eventListRef = useRef<HTMLDivElement | null>(null);
  const previousPageStartRef = useRef(pageRange.start);
  const selectedTimelineAt = timeline
    ? Math.min(
        timeline.endAt,
        timeline.startAt + Math.min(timelineMinute, timeline.durationMinutes) * 60_000
      )
    : null;

  useEffect(() => {
    setTimelineMinute(0);
    setPendingEventIndex(null);
  }, [events, tab]);

  useEffect(() => {
    if (!timeline) return;
    setTimelineMinute((value) => Math.min(value, timeline.durationMinutes));
  }, [timeline?.durationMinutes]);

  useEffect(() => {
    if (pendingEventIndex === null) return;
    const row = eventRefs.current.get(pendingEventIndex);
    if (!row) return;
    const eventList = eventListRef.current;
    if (eventList) {
      const rowBounds = row.getBoundingClientRect();
      const listBounds = eventList.getBoundingClientRect();
      eventList.scrollTo({
        top:
          eventList.scrollTop +
          rowBounds.top -
          listBounds.top -
          Math.max(0, (eventList.clientHeight - row.clientHeight) / 2),
        behavior: 'smooth'
      });
    } else {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setPendingEventIndex(null);
  }, [pageRange.start, pendingEventIndex, visibleEvents.length]);

  useEffect(() => {
    if (previousPageStartRef.current === pageRange.start) return;
    previousPageStartRef.current = pageRange.start;
    if (pendingEventIndex !== null) return;
    eventListRef.current?.scrollTo({ top: 0 });
  }, [pageRange.start]);

  const selectedCountLabel = filteredEvents.length
    ? `Показано ${pageRange.start + 1}–${pageRange.end} из ${filteredEvents.length}`
    : 'Событий не найдено';

  const handleTimelineChange = (value: number) => {
    if (!timeline) return;
    setTimelineMinute(value);
    const eventIndex = findTimelineEventIndex(filteredEvents, timeline, value);
    if (eventIndex === null) return;
    setPendingEventIndex(eventIndex);
    onPageChange(getPageForEventIndex(eventIndex, filteredEvents.length, pageSize));
  };

  return (
    <div className="journal-events" data-testid={`journal-events-${tab}`}>
      <div className="journal-toolbar">
        <div>
          <strong>Полный журнал сессии</strong>
          <span>
            {selectedCountLabel}
            {pageSize === 'all' && filteredEvents.length ? ' · целиком' : ''}
            {search ? ` · всего ${allEvents.length}` : ''}
          </span>
        </div>
        <div className="journal-toolbar-controls">
          <label className="journal-search">
            <span>Поиск</span>
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Игрок, цель или оружие"
            />
          </label>
          <label className="journal-page-size">
            <span>Событий на странице</span>
            <select
              aria-label="Событий на странице"
              data-testid="journal-page-size"
              value={String(pageSize)}
              onChange={(event) => {
                const next = event.target.value;
                onPageSizeChange(next === 'all' ? 'all' : Number(next) as EventPageSize);
              }}
            >
              {EVENT_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
              <option value="all">Целиком</option>
            </select>
          </label>
        </div>
      </div>

      {timeline && timeline.durationMinutes > 0 ? (
        <section
          className="journal-timeline"
          aria-label="Переход по времени матча"
          data-testid="journal-timeline-panel"
        >
          <div className="journal-timeline-copy">
            <strong>Шкала времени</strong>
            <span>Пики показывают плотность событий; выберите момент или перетащите ползунок.</span>
          </div>
          <div className="journal-timeline-control">
            <div
              className="journal-timeline-intensity"
              aria-label="Плотность событий по времени"
              data-testid="journal-timeline-intensity"
              style={{ gridTemplateColumns: `repeat(${timelineIntensity.length}, minmax(2px, 1fr))` }}
            >
              {timelineIntensity.map((bucket, index) => {
                const bucketMinute = Math.min(
                  timeline.durationMinutes,
                  Math.max(0, Math.round((bucket.startAt - timeline.startAt) / 60_000))
                );
                const selected =
                  selectedTimelineAt !== null &&
                  selectedTimelineAt >= bucket.startAt &&
                  (selectedTimelineAt < bucket.endAt || index === timelineIntensity.length - 1);
                const intensity = bucket.eventCount ? Math.max(0.12, bucket.relativeIntensity) : 0;
                const label = `${formatTimelineTime(bucket.startAt)}–${formatTimelineTime(bucket.endAt)}: ${bucket.eventCount} событий, ${formatNumber(bucket.eventsPerSecond)} в секунду`;

                return (
                  <button
                    className={classNames('journal-timeline-bar', selected && 'is-selected')}
                    type="button"
                    key={`${bucket.startAt}:${index}`}
                    aria-label={label}
                    data-testid={`journal-timeline-bucket-${index}`}
                    title={label}
                    onClick={() => handleTimelineChange(bucketMinute)}
                  >
                    <span aria-hidden="true" style={{ height: `${intensity * 100}%` }} />
                  </button>
                );
              })}
            </div>
            <label>
              <span className="sr-only">Минута события</span>
              <input
                aria-label="Минута события"
                data-testid="journal-timeline"
                type="range"
                min="0"
                max={timeline.durationMinutes}
                step="1"
                value={Math.min(timelineMinute, timeline.durationMinutes)}
                onChange={(event) => handleTimelineChange(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="journal-timeline-scale" aria-live="polite">
            <time dateTime={new Date(timeline.startAt).toISOString()}>{formatTimelineTime(timeline.startAt)}</time>
            <strong>{selectedTimelineAt ? formatTimelineTime(selectedTimelineAt) : '—'}</strong>
            <time dateTime={new Date(timeline.endAt).toISOString()}>{formatTimelineTime(timeline.endAt)}</time>
          </div>
        </section>
      ) : null}

      {visibleEvents.length ? (
        <div className="journal-event-list" ref={eventListRef}>
          {visibleEvents.map((event, index) => (
            <EventRow
              event={event}
              key={`${event.type}:${event.occurredAt || 'no-time'}:${event.attackerName || ''}:${event.victimName || event.vehicleName || ''}:${index}`}
              eventRef={(element) => {
                const eventIndex = pageRange.start + index;
                if (element) eventRefs.current.set(eventIndex, element);
                else eventRefs.current.delete(eventIndex);
              }}
            />
          ))}
        </div>
      ) : (
        <div className="journal-empty-state">
          <strong>{search ? 'Ничего не найдено' : 'В этой категории нет событий'}</strong>
          <p>
            {tab === 'vehicles'
              ? 'Техника появляется здесь только по реальным событиям повреждения или уничтожения — по названию оружия мы её не угадываем.'
              : search
                ? 'Попробуйте другое имя игрока, цели или оружия.'
                : 'Сервер не записал таких событий в выбранном матче.'}
          </p>
        </div>
      )}

      {pageSize !== 'all' && filteredEvents.length > 0 ? (
        <nav className="journal-pagination" aria-label="Страницы журнала">
          <button
            className="journal-pagination-button"
            type="button"
            onClick={() => onPageChange(pageRange.page - 1)}
            disabled={pageRange.page <= 1}
          >
            Назад
          </button>
          <span>Страница {pageRange.page} из {pageCount}</span>
          <button
            className="journal-pagination-button"
            type="button"
            onClick={() => onPageChange(pageRange.page + 1)}
            disabled={pageRange.page >= pageCount}
          >
            Вперёд
          </button>
        </nav>
      ) : null}
    </div>
  );
}

export function JournalWorkspace({ servers }: JournalWorkspaceProps) {
  const initialSelection = useMemo(parseJournalSelection, []);
  const [selectedServerCode, setSelectedServerCode] = useState(initialSelection.server);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSelection.session);
  const [tab, setTab] = useState<JournalTab>(initialSelection.tab || 'scoreboard');
  const [detail, setDetail] = useState<DetailState>({
    key: '',
    status: 'idle',
    response: null,
    partial: false,
    error: null
  });
  const [search, setSearch] = useState('');
  const [eventPage, setEventPage] = useState(1);
  const [eventPageSize, setEventPageSize] = useState<EventPageSize>(DEFAULT_EVENT_PAGE_SIZE);

  const selectedServer = useMemo(() => {
    const requestedCode = selectedServerCode.trim();
    if (requestedCode) {
      return (
        servers.find(
          (server) => server.code === requestedCode || String(server.id) === requestedCode
        ) || null
      );
    }
    return servers.find((server) => getSessions(server).length > 0) || servers[0] || null;
  }, [selectedServerCode, servers]);
  const sessions = useMemo(() => getSessions(selectedServer), [selectedServer]);
  const selectedSession = useMemo(
    () => sessions.find((session) => session.sessionId === selectedSessionId) || sessions[0] || null,
    [selectedSessionId, sessions]
  );
  const detailKey =
    selectedServer && selectedSession
      ? `${selectedServer.activitySessionBaseUrl}:${selectedSession.sessionId}`
      : '';

  useEffect(() => {
    if (!selectedServer) return;
    if (selectedServerCode !== selectedServer.code) setSelectedServerCode(selectedServer.code);
  }, [selectedServer, selectedServerCode]);

  useEffect(() => {
    if (!selectedServer) return;
    if (!selectedSession) {
      if (!sessions.length) return;
      if (selectedSessionId) setSelectedSessionId('');
      return;
    }
    if (selectedSessionId !== selectedSession.sessionId) {
      setSelectedSessionId(selectedSession.sessionId);
    }
  }, [selectedServer, selectedSession, selectedSessionId, sessions.length]);

  useEffect(() => {
    if (!selectedServer && selectedServerCode) return;
    updateJournalLocation(selectedServer?.code || '', selectedSession?.sessionId || '', tab);
  }, [selectedServer?.code, selectedServerCode, selectedSession?.sessionId, tab]);

  useEffect(() => {
    setSearch('');
    setEventPage(1);
  }, [selectedServer?.code, selectedSession?.sessionId, tab]);

  useEffect(() => {
    if (!selectedServer || !selectedSession) {
      setDetail({ key: '', status: 'idle', response: null, partial: false, error: null });
      return;
    }

    const key = detailKey;
    const legacyResponse = buildLegacyResponse(selectedServer, selectedSession);
    if (selectedSession.sessionId.startsWith('legacy-')) {
      setDetail({
        key,
        status: 'ready',
        response: legacyResponse,
        partial: true,
        error: null
      });
      return;
    }

    let cancelled = false;
    const hasLegacyData = Boolean(
      legacyResponse.session.scoreboard?.teams.length ||
        Object.values(legacyResponse.events).some((events) => events.length > 0)
    );
    setDetail({
      key,
      status: 'loading',
      response: hasLegacyData ? legacyResponse : null,
      partial: hasLegacyData,
      error: null
    });
    void fetchActivitySession(selectedServer, selectedSession.sessionId)
      .then((response) => {
        if (cancelled) return;
        setDetail({
          key,
          status: 'ready',
          response,
          partial: !response.session.journalComplete,
          error: null
        });
      })
      .catch(() => {
        if (cancelled) return;
        setDetail({
          key,
          status: hasLegacyData ? 'ready' : 'error',
          response: hasLegacyData ? legacyResponse : null,
          partial: hasLegacyData,
          error: hasLegacyData ? null : 'Подробности матча пока недоступны.'
        });
      });

    return () => {
      cancelled = true;
    };
  }, [detailKey]);

  const activeDetail = detail.key === detailKey ? detail : null;
  const response = activeDetail?.response || null;
  const counts = response?.session.eventCounts || selectedSession?.eventCounts || EMPTY_COUNTS;
  const tabs: Array<{ id: JournalTab; label: string; count: number | null }> = [
    { id: 'scoreboard', label: 'Табы', count: response?.session.scoreboard?.teams.length || null },
    { id: 'kills', label: 'Убийства', count: counts.kills + counts.knockdowns },
    { id: 'damage', label: 'Урон', count: counts.damage },
    { id: 'vehicles', label: 'Техника', count: counts.vehicles },
    { id: 'revives', label: 'Поднятия', count: counts.revives }
  ];

  if (!servers.length) {
    return (
      <section className="journal-empty-state journal-page-empty">
        <strong>Серверы пока не ответили</strong>
        <p>Журнал появится после получения данных мониторинга.</p>
      </section>
    );
  }

  return (
    <>
      <section className="journal-server-switcher" aria-label="Выбор сервера">
        {servers.map((server) => {
          const serverSessions = getSessions(server);
          const active = server.code === selectedServer?.code;
          return (
            <button
              type="button"
              className={classNames('journal-server-button', active && 'is-active')}
              onClick={() => {
                setSelectedServerCode(server.code);
                setSelectedSessionId('');
              }}
              key={`${server.code}:${server.id}`}
              aria-pressed={active}
              title={server.name}
              data-testid={`journal-server-${server.id}`}
            >
              <span>{server.online ? 'В сети' : 'Оффлайн'}</span>
              <strong>{formatServerName(server)}</strong>
              <p>
                {serverSessions.length} матчей ·{' '}
                {serverSessions[0] ? formatMatchDate(serverSessions[0].endedAt) : 'истории нет'}
              </p>
            </button>
          );
        })}
      </section>

      <section className="journal-workspace" data-testid="journal-workspace">
        <aside className="journal-session-sidebar">
          <div className="journal-sidebar-head">
            <span>Последние матчи</span>
            <strong>{sessions.length} / 10</strong>
          </div>
          {sessions.length ? (
            <ul className="journal-session-list">
              {sessions.map((session) => {
                const active = session.sessionId === selectedSession?.sessionId;
                return (
                  <li className="journal-session-item" key={session.sessionId}>
                    <button
                      type="button"
                      className={classNames('journal-session-button', active && 'is-active')}
                      onClick={() => setSelectedSessionId(session.sessionId)}
                      aria-pressed={active}
                      data-testid={`journal-session-${session.sessionId}`}
                    >
                      <time dateTime={session.endedAt || undefined}>
                        {formatMatchDate(session.endedAt)}
                      </time>
                      <strong>{session.layer || 'Карта не записана'}</strong>
                      <span>{formatResult(session)}</span>
                      <p>
                        {session.playerCount} игроков · {session.totals.kills} убийств
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="journal-empty-state journal-sidebar-empty">
              <strong>Завершённых матчей ещё нет</strong>
              <p>Запись появится только после конца игры.</p>
            </div>
          )}
          <SessionTopSummary topWindow={selectedServer?.activity?.topWindow || null} />
        </aside>

        <main className="journal-match-panel">
          {selectedSession ? (
            <>
              <header className="journal-match-hero">
                <div className="journal-match-copy">
                  <span className="journal-complete-badge">Завершённый матч</span>
                  <h2>{selectedSession.layer || 'Карта не записана'}</h2>
                  <p>{formatResult(selectedSession)}</p>
                </div>
                <time dateTime={selectedSession.endedAt || undefined}>
                  {formatMatchDate(selectedSession.endedAt)}
                </time>
              </header>

              <div className="journal-match-metrics">
                <div><span>Игроков</span><strong>{selectedSession.playerCount}</strong></div>
                <div><span>Поднятий</span><strong>{selectedSession.totals.revives || 0}</strong></div>
                <div><span>Нокаутов</span><strong>{selectedSession.totals.knockdowns}</strong></div>
                <div><span>Убийств</span><strong>{selectedSession.totals.kills}</strong></div>
                <div><span>Смертей</span><strong>{selectedSession.totals.deaths || 0}</strong></div>
              </div>

              {response && !response.session.journalAvailable ? (
                <div className="journal-legacy-note" role="status">
                  Итоговые табы доступны, но журнал событий этой сессии не сохранился.
                </div>
              ) : activeDetail?.partial ? (
                <div className="journal-legacy-note" role="status">
                  Эта запись создана старой версией сборщика: показываем всё, что успело
                  сохраниться, но не называем журнал полным.
                </div>
              ) : null}

              <div className="journal-tabs" role="tablist" aria-label="Раздел журнала матча">
                {tabs.map((item) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === item.id}
                    className={classNames('journal-tab', tab === item.id && 'is-active')}
                    onClick={() => setTab(item.id)}
                    key={item.id}
                    data-testid={`journal-tab-${item.id}`}
                  >
                    <span>{item.label}</span>
                    {item.count !== null ? <strong>{item.count}</strong> : null}
                  </button>
                ))}
              </div>

              <div className="journal-tab-panel" role="tabpanel">
                {(!activeDetail || activeDetail.status === 'loading') && !response ? (
                  <div className="journal-loading" role="status">Загружаем полный журнал матча…</div>
                ) : activeDetail?.status === 'error' || !response ? (
                  <div className="journal-empty-state">
                    <strong>Подробности пока недоступны</strong>
                    <p>{activeDetail?.error || 'Сервер ещё не подготовил архив выбранного матча.'}</p>
                  </div>
                ) : tab === 'scoreboard' ? (
                  <ScoreboardView response={response} />
                ) : (
                  <EventJournal
                    events={response.events || EMPTY_EVENTS}
                    tab={tab}
                    search={search}
                    page={eventPage}
                    pageSize={eventPageSize}
                    onSearchChange={(value) => {
                      setSearch(value);
                      setEventPage(1);
                    }}
                    onPageChange={setEventPage}
                    onPageSizeChange={(value) => {
                      setEventPageSize(value);
                      setEventPage(1);
                    }}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="journal-empty-state journal-match-empty">
              <strong>Выберите завершённый матч</strong>
              <p>Табы и журнал никогда не показываются до окончания игры.</p>
            </div>
          )}
        </main>
      </section>
    </>
  );
}
