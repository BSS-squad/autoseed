import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTeamBalancerDiffView,
  TEAM_BALANCER_FRESHNESS_MS
} from '../../src/lib/team-balancer-diff.ts';
import type { ExporterTeamBalancerSnapshot } from '../../src/types.ts';

const NOW_MS = Date.parse('2026-07-06T12:01:00.000Z');

function buildProposalSnapshot(
  overrides: Partial<ExporterTeamBalancerSnapshot> = {}
): ExporterTeamBalancerSnapshot {
  return {
    version: 1,
    generatedAt: '2026-07-06T12:00:00.000Z',
    decisionId: 'decision-1',
    serverId: 'squadjs2',
    mode: 'dry-run',
    action: 'recommend',
    result: 'proposal',
    trigger: 'UPDATED_PLAYER_INFORMATION',
    snapshotTimestamp: '2026-07-06T11:59:55.000Z',
    availableProposalModes: ['squad', 'player'],
    defaultProposalMode: 'squad',
    reasonCodes: [],
    signals: {
      triggerReason: 'team_size_diff',
      teamSize: {
        before: { 1: 6, 2: 2 },
        after: { 1: 4, 2: 4 },
        diffBefore: 4,
        diffAfter: 0
      },
      winStreak: null,
      ticketDiff: null,
      recentRoundSeverity: null
    },
    summary: 'Recommended 2 player move from Team 1 to Team 2.',
    cohorts: [
      {
        type: 'squad',
        cohortKey: 'squad:1:alpha',
        fromTeamID: '1',
        toTeamID: '2',
        squadID: 'alpha',
        playerCount: 2,
        status: 'recommended',
        confidence: null,
        score: null
      }
    ],
    players: [
      {
        name: 'Player alpha-1',
        fromTeamID: '1',
        toTeamID: '2',
        squadID: 'alpha',
        status: 'recommended',
        confidence: null,
        score: null
      },
      {
        name: 'Player alpha-2',
        fromTeamID: '1',
        toTeamID: '2',
        squadID: 'alpha',
        status: 'recommended',
        confidence: null,
        score: null
      }
    ],
    ...overrides
  };
}

test('returns a degraded state when no Team Balancer report is available', () => {
  const view = buildTeamBalancerDiffView(null, 'squad', { nowMs: NOW_MS });

  assert.equal(view.state, 'missing');
  assert.equal(view.tone, 'neutral');
  assert.equal(view.rows.length, 0);
  assert.match(view.message, /отчета балансировки/i);
});

test('marks recommended squad proposals as conflicting red rows', () => {
  const view = buildTeamBalancerDiffView(buildProposalSnapshot(), 'squad', { nowMs: NOW_MS });

  assert.equal(view.state, 'proposal');
  assert.equal(view.mode, 'squad');
  assert.equal(view.triggerLabel, 'Разница по размеру сторон');
  assert.equal(view.teamSizeSummary, '6:2 -> 4:4');
  assert.deepEqual(view.rows, [
    {
      id: 'squad:1:alpha',
      title: 'Сквад alpha',
      subtitle: '2 игрока',
      route: 'Сторона 1 -> Сторона 2',
      tone: 'conflict',
      statusLabel: 'Рекомендуется перевести'
    }
  ]);
});

test('builds player-level proposal rows without exposing private identifiers', () => {
  const view = buildTeamBalancerDiffView(buildProposalSnapshot(), 'player', { nowMs: NOW_MS });
  const serialized = JSON.stringify(view);

  assert.equal(view.mode, 'player');
  assert.equal(view.rows.length, 2);
  assert.equal(view.rows[0].title, 'Player alpha-1');
  assert.equal(view.rows[0].subtitle, 'Сквад alpha');
  assert.equal(view.rows[0].tone, 'conflict');
  assert.doesNotMatch(serialized, /eosID|steamID|discordID|playerIds|7656119/);
});

test('shows healthy state when the dry run does not propose moves', () => {
  const view = buildTeamBalancerDiffView(
    buildProposalSnapshot({
      action: 'noop',
      result: 'balanced',
      reasonCodes: ['team_size_within_tolerance'],
      signals: {
        triggerReason: 'team_size_within_tolerance',
        teamSize: {
          before: { 1: 40, 2: 39 },
          after: { 1: 40, 2: 39 },
          diffBefore: 1,
          diffAfter: 1
        },
        winStreak: null,
        ticketDiff: null,
        recentRoundSeverity: null
      },
      cohorts: [],
      players: []
    }),
    'squad',
    { nowMs: NOW_MS }
  );

  assert.equal(view.state, 'healthy');
  assert.equal(view.tone, 'neutral');
  assert.equal(view.teamSizeSummary, '40:39 -> 40:39');
  assert.match(view.message, /в допуске/i);
});

test('degrades stale reports instead of displaying old proposals as fresh', () => {
  const view = buildTeamBalancerDiffView(
    buildProposalSnapshot({ generatedAt: '2026-07-06T11:01:00.000Z' }),
    'squad',
    { nowMs: NOW_MS }
  );

  assert.equal(view.state, 'stale');
  assert.equal(view.rows.length, 0);
  assert.equal(view.ageMs, 60 * 60 * 1000);
  assert.ok(TEAM_BALANCER_FRESHNESS_MS < view.ageMs);
});
