import type {
  ExporterRaffleCampaignSnapshot,
  ExporterTeamBalancerHistoryEntrySnapshot
} from '../types';

export function formatCompactTimestamp(value: number | string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function formatBool(value: boolean): string {
  return value ? 'Да' : 'Нет';
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0 с';
  return `${Math.ceil(ms / 1000)} с`;
}

export function formatHours(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: value >= 100 ? 0 : 1,
    maximumFractionDigits: 1
  }).format(value)} ч`;
}

export function formatDateTime(value: number | string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function formatCurrencyRubles(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0
  }).format(Math.round(value))} ₽`;
}

export function formatLeaderboardNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0
  }).format(Math.round(value));
}

export function formatLeaderboardDecimal(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatParticipantCount(value: number): string {
  const count = Math.max(0, Math.round(value));
  const mod10 = count % 10;
  const mod100 = count % 100;
  const suffix =
    mod10 === 1 && mod100 !== 11
      ? 'участник'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'участника'
        : 'участников';
  return `${count} ${suffix}`;
}

export function formatGameCount(value: number): string {
  const count = Math.max(0, Math.round(value));
  const mod10 = count % 10;
  const mod100 = count % 100;
  const suffix =
    mod10 === 1 && mod100 !== 11
      ? 'игра'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'игры'
        : 'игр';
  return `${count} ${suffix}`;
}

export function formatPlayerMoveCount(value: number): string {
  const count = Math.max(0, Math.round(value));
  const mod10 = count % 10;
  const mod100 = count % 100;
  const suffix =
    mod10 === 1 && mod100 !== 11
      ? 'игрок'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'игрока'
        : 'игроков';
  return `${count} ${suffix}`;
}

export function formatSideLabel(value: string | number | null | undefined): string {
  const text = String(value ?? '').trim();
  return text ? `Сторона ${text}` : 'Сторона не указана';
}

export function formatSideMoveSummary(move: { fromTeamID?: string | null; toTeamID?: string | null } | null | undefined): string | null {
  if (!move?.fromTeamID || !move?.toTeamID) return null;
  return `${formatSideLabel(move.fromTeamID)} в ${formatSideLabel(move.toTeamID)}`;
}

export function formatBalancerModeLabel(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase() === 'dry-run'
    ? 'Без перемещений'
    : 'С перемещениями';
}

export function formatBalancerStatusLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    evaluated: 'рассчитано',
    proposal: 'предложено',
    executed: 'выполнено',
    completed: 'выполнено',
    success: 'выполнено',
    failed: 'ошибка',
    partial_failed: 'частично',
    blocked: 'заблокировано',
    noop: 'без изменений'
  };
  const status = String(value || '').trim().toLowerCase();
  return labels[status] || 'состояние уточняется';
}

export function formatBalancerHistoryStatus(entry: ExporterTeamBalancerHistoryEntrySnapshot): string {
  const modeLabel = formatBalancerModeLabel(entry.mode);
  if (String(entry.mode || '').trim().toLowerCase() === 'dry-run') {
    return `${modeLabel} · ${formatBalancerStatusLabel(entry.status)}`;
  }

  if (entry.execution?.enabled) {
    return `${modeLabel} · ${formatBalancerStatusLabel(entry.execution.status)} ${
      entry.execution.succeededPlayers
    }/${entry.execution.plannedPlayers}`;
  }

  return `${modeLabel} · ${formatBalancerStatusLabel(entry.status)}`;
}

export function formatRaffleSource(value: string): string {
  return value === 'auto' ? 'запущен автоматически' : 'запущен администратором';
}

export function parseIsoDateParts(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

export function formatCampaignDate(value: string | null | undefined): string {
  const parts = parseIsoDateParts(value);
  if (!parts) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

export function formatCampaignRange(campaign: ExporterRaffleCampaignSnapshot | null): string {
  if (!campaign) return '—';
  return `${formatCampaignDate(campaign.startsAt)} - ${formatCampaignDate(campaign.endsAt)}`;
}

export function formatCampaignCancellation(campaign: ExporterRaffleCampaignSnapshot): string {
  const cancelledAt = formatCampaignDate(campaign.cancelledAt);
  return cancelledAt === '—' ? 'Отменена' : `Отменена ${cancelledAt}`;
}

export function formatCampaignHour(value: number): string {
  const hour = Math.floor(value);
  const minutes = Math.round((value - hour) * 60);
  return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatTimezoneOffset(minutes: number): string {
  return minutes === 180 ? 'по московскому времени' : 'по времени организаторов';
}

export function formatPrimeWindow(campaign: ExporterRaffleCampaignSnapshot | null): string {
  if (!campaign) return '—';
  return `${formatCampaignHour(campaign.primeTimeStartHour)}-${formatCampaignHour(
    campaign.primeTimeEndHour
  )} ${formatTimezoneOffset(campaign.timezoneOffsetMinutes)}`;
}
