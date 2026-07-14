import type { ExporterActivityScoreboardPlayerSnapshot } from '../types';

export const SCOREBOARD_METRICS = [
  { key: 'revives', label: 'Поднятия' },
  { key: 'knockdowns', label: 'Нокауты' },
  { key: 'kills', label: 'Убийства' },
  { key: 'deaths', label: 'Смерти' }
] as const;

export function sortScoreboardPlayers(
  players: ExporterActivityScoreboardPlayerSnapshot[]
): ExporterActivityScoreboardPlayerSnapshot[] {
  return players.slice().sort((left, right) => {
    const killsDifference = right.kills - left.kills;
    if (killsDifference) return killsDifference;

    const deathsDifference = left.deaths - right.deaths;
    if (deathsDifference) return deathsDifference;

    const revivesDifference = right.revives - left.revives;
    if (revivesDifference) return revivesDifference;

    return left.name.localeCompare(right.name, 'ru', { numeric: true, sensitivity: 'base' });
  });
}
