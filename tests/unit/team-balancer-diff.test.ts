import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTeamBalancerDiffView,
  buildTeamBalancerRosterMark,
  TEAM_BALANCER_FRESHNESS_MS
} from '../../src/lib/team-balancer-diff.ts';
import type { ExporterPlayerSnapshot, ExporterTeamBalancerSnapshot } from '../../src/types.ts';

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
      triggerReason: 'impact_diff',
      teamSize: {
        before: { 1: 6, 2: 2 },
        after: { 1: 4, 2: 4 },
        diffBefore: 4,
        diffAfter: 0
      },
      impact: {
        available: true,
        metric: 'autobalancerScore',
        unit: 'score',
        before: { 1: 1800, 2: 900 },
        after: { 1: 1440, 2: 1260 },
        diffBefore: 900,
        diffAfter: 180,
        moved: 360
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
        score: 360
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
        score: 200
      },
      {
        name: 'Player alpha-2',
        fromTeamID: '1',
        toTeamID: '2',
        squadID: 'alpha',
        status: 'recommended',
        confidence: null,
        score: 160
      }
    ],
    voteGate: null,
    moderatorDecision: null,
    execution: null,
    ...overrides
  };
}

function buildRosterPlayer(overrides: Partial<ExporterPlayerSnapshot> = {}): ExporterPlayerSnapshot {
  return {
    eosId: 'eos-alpha-1',
    steamId: 'steam-alpha-1',
    name: 'Player alpha-1',
    teamId: 1,
    teamName: 'Vanguard',
    squadId: 10,
    squadName: 'Vanguard Alpha',
    role: 'Rifleman',
    isLeader: false,
    isCommander: false,
    playtimeSeconds: 7200,
    playtimeHours: 2,
    playtimeSource: 'test',
    ...overrides
  };
}

test('returns a degraded state when no Team Balancer report is available', () => {
  const view = buildTeamBalancerDiffView(null, 'squad', { nowMs: NOW_MS });

  assert.equal(view.state, 'missing');
  assert.equal(view.tone, 'neutral');
  assert.equal(view.roundSignals.length, 0);
  assert.equal(view.rows.length, 0);
  assert.match(view.message, /dry-run балансу/i);
});

test('marks recommended squad impact proposals inside the current roster', () => {
  const view = buildTeamBalancerDiffView(buildProposalSnapshot(), 'squad', { nowMs: NOW_MS });
  const mark = buildTeamBalancerRosterMark(
    buildProposalSnapshot(),
    'squad',
    1,
    buildRosterPlayer(),
    { nowMs: NOW_MS }
  );
  const serialized = JSON.stringify({ view, mark });

  assert.equal(view.state, 'proposal');
  assert.equal(view.mode, 'squad');
  assert.equal(view.triggerLabel, 'Перекос импакта');
  assert.equal(view.teamSizeSummary, 'сейчас 6:2 · dry-run 4:4');
  assert.equal(view.impactSummary, 'сейчас 1 800:900 · dry-run 1 440:1 260');
  assert.equal(view.rows.length, 0);
  assert.deepEqual(mark, {
    tone: 'conflict',
    label: 'В плане баланса',
    detail: 'Ожидаемая сторона: Сторона 2',
    impactLabel: 'score 360'
  });
  assert.doesNotMatch(serialized, /->|\d+\s*ч|Рекомендуется перенести|Уже на нужной стороне/);
});

test('summarizes Team Balancer safety gates without leaking private identifiers', () => {
  const view = buildTeamBalancerDiffView(
    buildProposalSnapshot({
      voteGate: {
        enabled: true,
        quorumPercent: 25,
        passThresholdPercent: 60,
        eligiblePlayerCount: 10,
        requiredVotes: 3,
        totalVotes: 3,
        yesVotes: 2,
        noVotes: 1,
        quorumMet: true,
        passThresholdMet: true,
        approved: true
      },
      moderatorDecision: {
        required: true,
        approved: false,
        vetoed: true,
        action: 'veto',
        reason: 'technical',
        note: 'wait for next round',
        moderatorName: 'Moderator',
        createdAt: '2026-07-06T12:00:30.000Z'
      },
      execution: {
        enabled: true,
        status: 'blocked',
        plannedMoves: 1,
        plannedPlayers: 2,
        attemptedPlayers: 0,
        succeededPlayers: 0,
        failedPlayers: 0,
        totalRconAttempts: 0,
        maxAttemptsPerPlayer: 2,
        completedAt: null
      }
    }),
    'squad',
    { nowMs: NOW_MS }
  );
  const serialized = JSON.stringify(view.safetyCards);

  assert.deepEqual(view.safetyCards, [
    {
      id: 'vote',
      tone: 'success',
      label: 'Голосование',
      value: '2/3',
      detail: 'за 2 · против 1 · кворум 25% · проход 60%'
    },
    {
      id: 'moderator',
      tone: 'conflict',
      label: 'Модератор',
      value: 'Veto: technical',
      detail: 'Moderator · wait for next round'
    },
    {
      id: 'execution',
      tone: 'conflict',
      label: 'Исполнение',
      value: 'Заблокировано',
      detail: 'игроки 0/2 · попытки 0 · лимит 2'
    }
  ]);
  assert.doesNotMatch(serialized, /eosID|steamID|discordID|playerIds|7656119|->/);
});

test('summarizes Team Balancer round-history signals without raw identifiers', () => {
  const view = buildTeamBalancerDiffView(
    buildProposalSnapshot({
      signals: {
        triggerReason: 'impact_diff',
        teamSize: {
          before: { 1: 6, 2: 2 },
          after: { 1: 4, 2: 4 },
          diffBefore: 4,
          diffAfter: 0
        },
        impact: {
          available: true,
          metric: 'autobalancerScore',
          unit: 'score',
          before: { 1: 1800, 2: 900 },
          after: { 1: 1440, 2: 1260 },
          diffBefore: 900,
          diffAfter: 180,
          moved: 360
        },
        ticketDiff: {
          winnerTeamID: '1',
          loserTeamID: '2',
          winnerTickets: 260,
          loserTickets: 20,
          diff: 240
        },
        winStreak: {
          teamID: '1',
          count: 2,
          threshold: 2
        },
        recentRoundSeverity: {
          level: 'severe',
          reasons: ['ticket_diff', 'win_streak'],
          ticketDiff: 240,
          winStreak: 2
        }
      }
    }),
    'squad',
    { nowMs: NOW_MS }
  );
  const serialized = JSON.stringify(view.roundSignals);

  assert.deepEqual(view.roundSignals, [
    {
      id: 'severity',
      tone: 'conflict',
      label: 'Последние раунды',
      value: 'Сильный перекос',
      detail: 'ticket diff 240 · серия 2'
    },
    {
      id: 'ticketDiff',
      tone: 'neutral',
      label: 'Последний счет',
      value: 'Сторона 1 +240',
      detail: '260:20 против Сторона 2'
    },
    {
      id: 'winStreak',
      tone: 'neutral',
      label: 'Серия побед',
      value: 'Сторона 1 x2',
      detail: 'порог 2'
    }
  ]);
  assert.doesNotMatch(serialized, /eosID|steamID|discordID|playerIds|7656119|->/);
});

test('marks player-level proposals without exposing private identifiers', () => {
  const snapshot = buildProposalSnapshot();
  const view = buildTeamBalancerDiffView(snapshot, 'player', { nowMs: NOW_MS });
  const mark = buildTeamBalancerRosterMark(snapshot, 'player', 1, buildRosterPlayer(), {
    nowMs: NOW_MS
  });
  const serialized = JSON.stringify({ view, mark });

  assert.equal(view.mode, 'player');
  assert.equal(view.rows.length, 0);
  assert.deepEqual(mark, {
    tone: 'conflict',
    label: 'В плане баланса',
    detail: 'Ожидаемая сторона: Сторона 2',
    impactLabel: 'score 200'
  });
  assert.doesNotMatch(serialized, /eosID|steamID|discordID|playerIds|7656119/);
});

test('marks scramble-v2 roster rows by backend current and expected side', () => {
  const snapshot = buildProposalSnapshot({
    version: 1,
    schemaVersion: 2,
    algorithm: 'mikebjoyce-squad-preserving-scramble',
    signals: {
      triggerReason: 'scramble_elo',
      teamSize: {
        before: { 1: 4, 2: 4 },
        after: { 1: 4, 2: 4 },
        diffBefore: 0,
        diffAfter: 0
      },
      skill: {
        available: true,
        metric: 'eloMu',
        unit: 'rating',
        before: { 1: 148, 2: 64 },
        after: { 1: 93, 2: 119 },
        diffBefore: 84,
        diffAfter: 26,
        moved: 109
      },
      impact: {
        available: true,
        metric: 'eloMu',
        unit: 'rating',
        before: { 1: 148, 2: 64 },
        after: { 1: 93, 2: 119 },
        diffBefore: 84,
        diffAfter: 26,
        moved: 109
      },
      winStreak: null,
      ticketDiff: null,
      recentRoundSeverity: null
    },
    cohorts: [],
    players: [
      {
        name: 'Player alpha-1',
        fromTeamID: '1',
        toTeamID: '2',
        currentTeamID: '1',
        expectedTeamID: '2',
        squadID: 'alpha',
        squadName: 'Alpha',
        status: 'move_pending',
        confidence: 1,
        score: 42,
        reward: {
          type: 'balance_acceptance',
          acceptanceMultiplier: 1.5,
          reason: 'high_skill_weak_side'
        }
      },
      {
        name: 'Player bravo-1',
        fromTeamID: '1',
        toTeamID: '1',
        currentTeamID: '1',
        expectedTeamID: '1',
        squadID: 'bravo',
        squadName: 'Bravo',
        status: 'already_target',
        confidence: 1,
        score: 34,
        reward: null
      },
      {
        name: 'Player opfor-1',
        fromTeamID: '1',
        toTeamID: '2',
        currentTeamID: '2',
        expectedTeamID: '2',
        squadID: 'opfor',
        squadName: 'Opfor',
        status: 'moved',
        confidence: 1,
        score: 19,
        reward: null
      }
    ]
  });
  const view = buildTeamBalancerDiffView(snapshot, 'squad', { nowMs: NOW_MS });
  const conflictMark = buildTeamBalancerRosterMark(snapshot, 'squad', 1, buildRosterPlayer(), {
    nowMs: NOW_MS
  });
  const neutralMark = buildTeamBalancerRosterMark(
    snapshot,
    'squad',
    1,
    buildRosterPlayer({
      name: 'Player bravo-1',
      squadId: 11,
      squadName: 'Bravo'
    }),
    { nowMs: NOW_MS }
  );
  const successMark = buildTeamBalancerRosterMark(
    snapshot,
    'squad',
    2,
    buildRosterPlayer({
      name: 'Player opfor-1',
      teamId: 2,
      squadId: 12,
      squadName: 'Opfor'
    }),
    { nowMs: NOW_MS }
  );
  const serialized = JSON.stringify({ view, conflictMark, neutralMark, successMark });

  assert.equal(view.triggerLabel, 'Scramble по ELO');
  assert.equal(view.impactSummary, 'сейчас 148:64 · dry-run 93:119');
  assert.deepEqual(conflictMark, {
    tone: 'conflict',
    label: 'Нужна смена',
    detail: 'Ожидаемая сторона: Сторона 2',
    impactLabel: 'score 42'
  });
  assert.deepEqual(neutralMark, {
    tone: 'neutral',
    label: 'На месте',
    detail: 'Ожидаемая сторона: Сторона 1',
    impactLabel: 'score 34'
  });
  assert.deepEqual(successMark, {
    tone: 'success',
    label: 'Смена учтена',
    detail: 'Ожидаемая сторона: Сторона 2',
    impactLabel: 'score 19'
  });
  assert.doesNotMatch(serialized, /->|steamID|eosID|discordID|playerIds|7656119/);
});

test('uses neutral roster tone when the player is already aligned with the report', () => {
  const snapshot = buildProposalSnapshot({
    cohorts: [
      {
        type: 'squad',
        cohortKey: 'squad:1:alpha',
        fromTeamID: '1',
        toTeamID: '2',
        squadID: 'alpha',
        playerCount: 2,
        status: 'already_target',
        confidence: null,
        score: 360
      }
    ],
    players: []
  });

  const mark = buildTeamBalancerRosterMark(
    snapshot,
    'squad',
    2,
    buildRosterPlayer({ teamId: 2 }),
    { nowMs: NOW_MS }
  );

  assert.deepEqual(mark, {
    tone: 'neutral',
    label: 'На месте',
    detail: 'Ожидаемая сторона: Сторона 2',
    impactLabel: 'score 360'
  });
});

test('uses success roster tone for moves confirmed by the balancer window', () => {
  const snapshot = buildProposalSnapshot({
    action: 'noop',
    result: 'balanced',
    players: [
      {
        name: 'Player alpha-1',
        fromTeamID: '1',
        toTeamID: '2',
        squadID: 'alpha',
        status: 'moved',
        confidence: null,
        score: 200
      }
    ]
  });

  const mark = buildTeamBalancerRosterMark(
    snapshot,
    'player',
    2,
    buildRosterPlayer({ teamId: 2 }),
    { nowMs: NOW_MS }
  );

  assert.deepEqual(mark, {
    tone: 'success',
    label: 'Смена учтена',
    detail: 'Ожидаемая сторона: Сторона 2',
    impactLabel: 'score 200'
  });
});

test('shows healthy state when the dry run does not propose moves', () => {
  const view = buildTeamBalancerDiffView(
    buildProposalSnapshot({
      action: 'noop',
      result: 'balanced',
      reasonCodes: ['team_impact_within_tolerance'],
      signals: {
        triggerReason: 'team_impact_within_tolerance',
        teamSize: {
          before: { 1: 40, 2: 39 },
          after: { 1: 40, 2: 39 },
          diffBefore: 1,
          diffAfter: 1
        },
        impact: {
          available: true,
          metric: 'autobalancerScore',
          unit: 'score',
          before: { 1: 1200, 2: 1180 },
          after: { 1: 1200, 2: 1180 },
          diffBefore: 20,
          diffAfter: 20,
          moved: 0
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
  assert.equal(view.teamSizeSummary, 'сейчас 40:39 · dry-run 40:39');
  assert.equal(view.impactSummary, 'сейчас 1 200:1 180 · dry-run 1 200:1 180');
  assert.equal(view.message, 'Импакт в допуске');
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
