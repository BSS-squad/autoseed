import assert from 'node:assert/strict';
import test from 'node:test';

import { SCOREBOARD_METRICS, sortScoreboardPlayers } from '../../src/journal/scoreboard.ts';

test('scoreboard keeps the requested metric order', () => {
  assert.deepEqual(
    SCOREBOARD_METRICS.map((metric) => metric.key),
    ['revives', 'knockdowns', 'kills', 'deaths']
  );
});

test('scoreboard ranks kills, fewer deaths, then revives', () => {
  const players = [
    { name: 'Equal Name', squad: null, role: null, kills: 12, deaths: 4, revives: 3, knockdowns: 9 },
    { name: 'More Revives', squad: null, role: null, kills: 12, deaths: 4, revives: 5, knockdowns: 1 },
    { name: 'Fewer Deaths', squad: null, role: null, kills: 12, deaths: 2, revives: 0, knockdowns: 0 },
    { name: 'More Kills', squad: null, role: null, kills: 13, deaths: 20, revives: 0, knockdowns: 0 },
    { name: 'Alpha', squad: null, role: null, kills: 12, deaths: 4, revives: 3, knockdowns: 4 }
  ];

  assert.deepEqual(
    sortScoreboardPlayers(players).map((player) => player.name),
    ['More Kills', 'Fewer Deaths', 'More Revives', 'Alpha', 'Equal Name']
  );
});
