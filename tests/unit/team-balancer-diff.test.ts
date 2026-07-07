import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTeamBalancerCompositionKey,
  buildTeamBalancerDiffView,
  buildTeamBalancerRosterMark,
  buildTeamBalancerSquadMark,
  TEAM_BALANCER_FRESHNESS_MS
} from '../../src/lib/team-balancer-diff.ts';
import type { ExporterPlayerSnapshot, ExporterTeamBalancerSnapshot } from '../../src/types.ts';

const NOW_MS = Date.parse('2026-07-06T12:01:00.000Z');
const ALPHA_SQUAD_PLAYERS = [{ matchKey: 'steam:alpha-1' }, { matchKey: 'steam:alpha-2' }];
const ALPHA_COMPOSITION_KEY = buildTeamBalancerCompositionKey(ALPHA_SQUAD_PLAYERS);

function buildProposalSnapshot(
  overrides: Partial<ExporterTeamBalancerSnapshot> = {}
): ExporterTeamBalancerSnapshot {
  return {
    version: 1,
    schemaVersion: 2,
    algorithm: 'mikebjoyce-squad-preserving-scramble',
    generatedAt: '2026-07-06T12:00:00.000Z',
    decisionId: 'decision-1',
    serverId: 'squadjs2',
    mode: 'dry-run',
    action: 'recommend',
    result: 'proposal',
    trigger: 'manual',
    snapshotTimestamp: '2026-07-06T11:59:55.000Z',
    availableProposalModes: ['squad', 'player'],
    defaultProposalMode: 'squad',
    reasonCodes: [],
    signals: {
      triggerReason: 'scramble_dry_run',
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
    summary: 'Team Balancer dry-run proposal.',
    cohorts: [
      {
        type: 'squad',
        cohortKey: 'squad:1:alpha',
        fromTeamID: '1',
        toTeamID: '2',
        currentTeamID: '1',
        expectedTeamID: '2',
        squadID: 'alpha',
        squadName: 'Alpha',
        compositionKey: ALPHA_COMPOSITION_KEY,
        playerCount: 2,
        status: 'move_pending',
        confidence: null,
        score: null
      }
    ],
    players: [
      {
        name: 'Player alpha-1',
        matchKey: 'steam:alpha-1',
        fromTeamID: '1',
        toTeamID: '2',
        currentTeamID: '1',
        expectedTeamID: '2',
        squadID: 'alpha',
        squadName: 'Alpha',
        status: 'move_pending',
        confidence: null,
        score: null,
        reward: null
      },
      {
        name: 'Player bravo-1',
        matchKey: 'steam:bravo-1',
        fromTeamID: '1',
        toTeamID: '1',
        currentTeamID: '1',
        expectedTeamID: '1',
        squadID: 'bravo',
        squadName: 'Bravo',
        status: 'already_target',
        confidence: null,
        score: null,
        reward: null
      },
      {
        name: 'Player opfor-1',
        matchKey: 'steam:opfor-1',
        fromTeamID: '1',
        toTeamID: '2',
        currentTeamID: '2',
        expectedTeamID: '2',
        squadID: 'opfor',
        squadName: 'Opfor',
        status: 'moved',
        confidence: null,
        score: null,
        reward: null
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
    matchKey: 'steam:alpha-1',
    name: 'Player alpha-1',
    teamId: 1,
    teamName: 'Vanguard',
    squadId: 10,
    squadName: 'Alpha',
    role: 'Rifleman',
    isLeader: false,
    isCommander: false,
    playtimeSeconds: 7200,
    playtimeHours: 2,
    playtimeSource: 'test',
    ...overrides
  };
}

test('returns a degraded state when no Team Balancer dry-run is available', () => {
  const view = buildTeamBalancerDiffView(null, 'squad', { nowMs: NOW_MS });

  assert.equal(view.state, 'missing');
  assert.equal(view.tone, 'neutral');
  assert.equal(view.assignmentSummary, '—');
  assert.equal(view.teamSizeSummary, '—');
  assert.match(view.message, /dry-run/i);
});

test('summarizes dry-run assignments without score or impact wording', () => {
  const snapshot = buildProposalSnapshot();
  const view = buildTeamBalancerDiffView(snapshot, 'squad', { nowMs: NOW_MS });
  const squadMark = buildTeamBalancerSquadMark(
    snapshot,
    'squad',
    1,
    { squadId: 'alpha', squadName: 'Alpha', players: ALPHA_SQUAD_PLAYERS },
    { nowMs: NOW_MS }
  );
  const playerMarkInSquadMode = buildTeamBalancerRosterMark(
    snapshot,
    'squad',
    1,
    buildRosterPlayer(),
    { nowMs: NOW_MS }
  );
  const serialized = JSON.stringify({ view, squadMark, playerMarkInSquadMode });

  assert.equal(view.state, 'proposal');
  assert.equal(view.mode, 'squad');
  assert.equal(view.message, 'Есть diff');
  assert.equal(view.triggerLabel, 'Scramble dry-run');
  assert.equal(view.assignmentSummary, '1 к смене');
  assert.equal(view.teamSizeSummary, 'сейчас 6:2 · dry-run 4:4');
  assert.deepEqual(squadMark, {
    tone: 'conflict',
    label: 'Нужна смена',
    detail: 'Сторона по dry-run: Сторона 2'
  });
  assert.equal(playerMarkInSquadMode, null);
  assert.doesNotMatch(serialized, /impact|skill|score|Ожидаемая сторона|->|\d+\s*ч/i);
});

test('marks player-level dry-run rows only in player mode', () => {
  const snapshot = buildProposalSnapshot();
  const conflictMark = buildTeamBalancerRosterMark(snapshot, 'player', 1, buildRosterPlayer(), {
    nowMs: NOW_MS
  });
  const neutralMark = buildTeamBalancerRosterMark(
    snapshot,
    'player',
    1,
    buildRosterPlayer({
      name: 'Player bravo-1',
      steamId: 'steam-bravo-1',
      matchKey: 'steam:bravo-1',
      squadId: 11,
      squadName: 'Bravo'
    }),
    { nowMs: NOW_MS }
  );
  const successMark = buildTeamBalancerRosterMark(
    snapshot,
    'player',
    2,
    buildRosterPlayer({
      name: 'Player opfor-1',
      steamId: 'steam-opfor-1',
      matchKey: 'steam:opfor-1',
      teamId: 2,
      squadId: 12,
      squadName: 'Opfor'
    }),
    { nowMs: NOW_MS }
  );
  const serialized = JSON.stringify({ conflictMark, neutralMark, successMark });

  assert.deepEqual(conflictMark, {
    tone: 'conflict',
    label: 'Нужна смена',
    detail: 'Сторона по dry-run: Сторона 2'
  });
  assert.deepEqual(neutralMark, {
    tone: 'neutral',
    label: 'На месте',
    detail: 'Сторона по dry-run: Сторона 1'
  });
  assert.deepEqual(successMark, {
    tone: 'success',
    label: 'Смена учтена',
    detail: 'Сторона по dry-run: Сторона 2'
  });
  assert.doesNotMatch(serialized, /impact|skill|score|steamID|eosID|discordID|playerIds/i);
});

test('uses mode-specific dry-run slices when proposalModes are present', () => {
  const snapshot = buildProposalSnapshot({
    proposalModes: {
      squad: {
        proposalMode: 'squad',
        action: 'recommend',
        result: 'proposal',
        reasonCodes: [],
        summary: 'Squad dry-run.',
        signals: {
          triggerReason: 'scramble_dry_run',
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
        cohorts: [
          {
            type: 'squad',
            cohortKey: 'squad:1:alpha',
            fromTeamID: '1',
            toTeamID: '2',
            currentTeamID: '1',
            expectedTeamID: '2',
            squadID: 'alpha',
            squadName: 'Alpha',
            playerCount: 2,
            status: 'move_pending',
            confidence: null,
            score: null
          }
        ],
        players: []
      },
      player: {
        proposalMode: 'player',
        action: 'recommend',
        result: 'proposal',
        reasonCodes: [],
        summary: 'Player dry-run.',
        signals: {
          triggerReason: 'scramble_dry_run',
          teamSize: {
            before: { 1: 6, 2: 2 },
            after: { 1: 5, 2: 3 },
            diffBefore: 4,
            diffAfter: 2
          },
          winStreak: null,
          ticketDiff: null,
          recentRoundSeverity: null
        },
        cohorts: [
          {
            type: 'player',
            cohortKey: 'player:1:bravo-1',
            fromTeamID: '1',
            toTeamID: '2',
            currentTeamID: '1',
            expectedTeamID: '2',
            squadID: 'bravo',
            squadName: 'Bravo',
            playerCount: 1,
            status: 'move_pending',
            confidence: null,
            score: null
          }
        ],
        players: [
          {
            name: 'Player alpha-1',
            matchKey: 'steam:alpha-1',
            fromTeamID: '1',
            toTeamID: '1',
            currentTeamID: '1',
            expectedTeamID: '1',
            squadID: 'alpha',
            squadName: 'Alpha',
            status: 'already_target',
            confidence: null,
            score: null,
            reward: null
          },
          {
            name: 'Player bravo-1',
            matchKey: 'steam:bravo-1',
            fromTeamID: '1',
            toTeamID: '2',
            currentTeamID: '1',
            expectedTeamID: '2',
            squadID: 'bravo',
            squadName: 'Bravo',
            status: 'move_pending',
            confidence: null,
            score: null,
            reward: null
          }
        ]
      }
    }
  });

  const playerView = buildTeamBalancerDiffView(snapshot, 'player', { nowMs: NOW_MS });
  const alphaPlayerMark = buildTeamBalancerRosterMark(
    snapshot,
    'player',
    1,
    buildRosterPlayer(),
    { nowMs: NOW_MS }
  );

  assert.equal(playerView.assignmentSummary, '1 к смене');
  assert.equal(playerView.teamSizeSummary, 'сейчас 6:2 · dry-run 5:3');
  assert.deepEqual(alphaPlayerMark, {
    tone: 'neutral',
    label: 'На месте',
    detail: 'Сторона по dry-run: Сторона 1'
  });
});

test('does not reuse squad-first top-level players when player dry-run slice is missing', () => {
  const snapshot = buildProposalSnapshot({
    availableProposalModes: ['squad', 'player'],
    proposalModes: {
      squad: {
        proposalMode: 'squad',
        action: 'recommend',
        result: 'proposal',
        reasonCodes: [],
        summary: 'Squad dry-run.',
        signals: {
          triggerReason: 'scramble_dry_run',
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
        cohorts: [
          {
            type: 'squad',
            cohortKey: 'squad:1:alpha',
            fromTeamID: '1',
            toTeamID: '2',
            currentTeamID: '1',
            expectedTeamID: '2',
            squadID: 'alpha',
            squadName: 'Alpha',
            playerCount: 2,
            status: 'move_pending',
            confidence: null,
            score: null
          }
        ],
        players: []
      }
    }
  });

  const view = buildTeamBalancerDiffView(snapshot, 'player', { nowMs: NOW_MS });
  const playerMark = buildTeamBalancerRosterMark(snapshot, 'player', 1, buildRosterPlayer(), {
    nowMs: NOW_MS
  });

  assert.deepEqual(view.modes, ['squad']);
  assert.equal(view.mode, 'squad');
  assert.equal(playerMark, null);
});

test('keeps squad dry-run diff visible when the live roster has no matching marks', () => {
  const staleSquadCohort = {
    type: 'squad',
    cohortKey: 'squad:1:alpha',
    fromTeamID: '1',
    toTeamID: '2',
    currentTeamID: '1',
    expectedTeamID: '2',
    squadID: 'alpha',
    squadName: 'Alpha',
    playerCount: 2,
    status: 'move_pending',
    confidence: null,
    score: null,
    compositionKey: 'players:2:stale'
  };
  const snapshot = buildProposalSnapshot({
    cohorts: [staleSquadCohort],
    proposalModes: {
      squad: {
        proposalMode: 'squad',
        action: 'recommend',
        result: 'proposal',
        reasonCodes: [],
        summary: 'Squad dry-run.',
        signals: {
          triggerReason: 'scramble_dry_run',
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
        cohorts: [staleSquadCohort],
        players: []
      },
      player: {
        proposalMode: 'player',
        action: 'recommend',
        result: 'proposal',
        reasonCodes: [],
        summary: 'Player dry-run.',
        signals: {
          triggerReason: 'scramble_dry_run',
          teamSize: {
            before: { 1: 6, 2: 2 },
            after: { 1: 5, 2: 3 },
            diffBefore: 4,
            diffAfter: 2
          },
          winStreak: null,
          ticketDiff: null,
          recentRoundSeverity: null
        },
        cohorts: [],
        players: [
          {
            name: 'Player alpha-1',
            matchKey: 'steam:alpha-1',
            fromTeamID: '1',
            toTeamID: '2',
            currentTeamID: '1',
            expectedTeamID: '2',
            squadID: 'alpha',
            squadName: 'Alpha',
            status: 'move_pending',
            confidence: null,
            score: null,
            reward: null
          }
        ]
      }
    }
  });

  const squadView = buildTeamBalancerDiffView(snapshot, 'squad', {
    nowMs: NOW_MS,
    visibleAssignmentTones: []
  });
  const playerView = buildTeamBalancerDiffView(snapshot, 'player', {
    nowMs: NOW_MS,
    visibleAssignmentTones: ['conflict']
  });

  assert.equal(squadView.state, 'proposal');
  assert.equal(squadView.tone, 'conflict');
  assert.equal(squadView.message, 'Есть diff');
  assert.equal(squadView.assignmentSummary, '1 к смене');
  assert.equal(squadView.teamSizeSummary, 'сейчас 6:2 · dry-run 4:4');
  assert.equal(squadView.rows.length, 1);
  assert.equal(squadView.rows[0]?.title, 'Alpha');
  assert.equal(squadView.rows[0]?.label, 'Нужна смена');
  assert.equal(playerView.state, 'proposal');
  assert.equal(playerView.tone, 'conflict');
  assert.equal(playerView.message, 'Есть diff');
  assert.equal(playerView.assignmentSummary, '1 к смене');
  assert.equal(playerView.teamSizeSummary, 'сейчас 6:2 · dry-run 5:3');
});

test('lists solo player cohorts in the squad dry-run slice', () => {
  const soloCohort = {
    type: 'player',
    cohortKey: 'player:2:solo-1',
    fromTeamID: '2',
    toTeamID: '1',
    currentTeamID: '2',
    expectedTeamID: '1',
    squadID: null,
    squadName: null,
    playerCount: 1,
    status: 'move_pending',
    confidence: null,
    score: null,
    compositionKey: null
  };
  const snapshot = buildProposalSnapshot({
    cohorts: [soloCohort],
    signals: {
      triggerReason: 'scramble_dry_run',
      teamSize: {
        before: { 1: 47, 2: 48 },
        after: { 1: 48, 2: 47 },
        diffBefore: 1,
        diffAfter: 1
      },
      winStreak: null,
      ticketDiff: null,
      recentRoundSeverity: null
    },
    proposalModes: {
      squad: {
        proposalMode: 'squad',
        action: 'recommend',
        result: 'proposal',
        reasonCodes: [],
        summary: 'Squad dry-run.',
        signals: {
          triggerReason: 'scramble_dry_run',
          teamSize: {
            before: { 1: 47, 2: 48 },
            after: { 1: 48, 2: 47 },
            diffBefore: 1,
            diffAfter: 1
          },
          winStreak: null,
          ticketDiff: null,
          recentRoundSeverity: null
        },
        cohorts: [soloCohort],
        players: []
      }
    }
  });

  const view = buildTeamBalancerDiffView(snapshot, 'squad', {
    nowMs: NOW_MS,
    visibleAssignmentTones: []
  });

  assert.equal(view.state, 'proposal');
  assert.equal(view.message, 'Есть diff');
  assert.equal(view.assignmentSummary, '1 к смене');
  assert.equal(view.teamSizeSummary, 'сейчас 47:48 · dry-run 48:47');
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0]?.title, 'Игрок без сквада');
  assert.equal(view.rows[0]?.detail, '1 игрок · Сторона 2 в Сторона 1');
});

test('keeps safety and recent-round cards separate from dry-run assignment diff', () => {
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
      },
      signals: {
        triggerReason: 'scramble_dry_run',
        teamSize: {
          before: { 1: 6, 2: 2 },
          after: { 1: 4, 2: 4 },
          diffBefore: 4,
          diffAfter: 0
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

  assert.equal(view.safetyCards.length, 3);
  assert.equal(view.roundSignals.length, 3);
  assert.equal(view.assignmentSummary, '1 к смене');
  assert.doesNotMatch(JSON.stringify(view), /impact|skill|score/i);
});

test('shows no-change state when the dry-run has no proposed assignments', () => {
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
  assert.equal(view.message, 'Без изменений');
  assert.equal(view.assignmentSummary, 'Без изменений');
  assert.equal(view.teamSizeSummary, 'сейчас 40:39 · dry-run 40:39');
});

test('degrades stale reports instead of displaying old dry-run diff as fresh', () => {
  const view = buildTeamBalancerDiffView(
    buildProposalSnapshot({ generatedAt: '2026-07-06T11:01:00.000Z' }),
    'squad',
    { nowMs: NOW_MS }
  );

  assert.equal(view.state, 'stale');
  assert.equal(view.assignmentSummary, '1 к смене');
  assert.equal(view.ageMs, 60 * 60 * 1000);
  assert.ok(TEAM_BALANCER_FRESHNESS_MS < view.ageMs);
});

test('computes player color from live roster team versus dry-run expected team', () => {
  const snapshot = buildProposalSnapshot();
  const movedPlayerMark = buildTeamBalancerRosterMark(
    snapshot,
    'player',
    2,
    buildRosterPlayer({ teamId: 2 }),
    { nowMs: NOW_MS }
  );
  const stillWrongSideMark = buildTeamBalancerRosterMark(
    snapshot,
    'player',
    1,
    buildRosterPlayer({ teamId: 1 }),
    { nowMs: NOW_MS }
  );

  assert.deepEqual(movedPlayerMark, {
    tone: 'success',
    label: 'Смена учтена',
    detail: 'Сторона по dry-run: Сторона 2'
  });
  assert.deepEqual(stillWrongSideMark, {
    tone: 'conflict',
    label: 'Нужна смена',
    detail: 'Сторона по dry-run: Сторона 2'
  });
});

test('computes squad color from live team versus dry-run expected team', () => {
  const snapshot = buildProposalSnapshot();
  const movedSquadMark = buildTeamBalancerSquadMark(
    snapshot,
    'squad',
    2,
    { squadId: 'alpha', squadName: 'Alpha', players: ALPHA_SQUAD_PLAYERS },
    { nowMs: NOW_MS }
  );

  assert.deepEqual(movedSquadMark, {
    tone: 'success',
    label: 'Смена учтена',
    detail: 'Сторона по dry-run: Сторона 2'
  });
});

test('matches squad dry-run marks by squad identity when composition key is absent', () => {
  const snapshot = buildProposalSnapshot({
    cohorts: [
      {
        type: 'squad',
        cohortKey: 'squad:1:10',
        fromTeamID: '1',
        toTeamID: '2',
        currentTeamID: '1',
        expectedTeamID: '2',
        squadID: 10,
        squadName: 'Alpha',
        playerCount: 2,
        status: 'move_pending',
        confidence: null,
        score: null,
        compositionKey: null
      }
    ]
  });

  const squadMark = buildTeamBalancerSquadMark(
    snapshot,
    'squad',
    1,
    { squadId: 10, squadName: 'Alpha', players: ALPHA_SQUAD_PLAYERS },
    { nowMs: NOW_MS }
  );

  assert.deepEqual(squadMark, {
    tone: 'conflict',
    label: 'Нужна смена',
    detail: 'Сторона по dry-run: Сторона 2'
  });
});

test('does not reuse a squad-level dry-run mark when the squad composition changed', () => {
  const snapshot = buildProposalSnapshot({
    cohorts: [
      {
        type: 'squad',
        cohortKey: 'squad:1:alpha',
        fromTeamID: '1',
        toTeamID: '2',
        currentTeamID: '1',
        expectedTeamID: '2',
        squadID: 'alpha',
        squadName: 'Alpha',
        playerCount: 2,
        status: 'move_pending',
        confidence: null,
        score: null,
        compositionKey: 'players:2:original'
      }
    ]
  });

  const staleSquadMark = buildTeamBalancerSquadMark(
    snapshot,
    'squad',
    1,
    {
      squadId: 'alpha',
      squadName: 'Alpha',
      players: [
        buildRosterPlayer({ matchKey: 'steam:new-alpha-1' }),
        buildRosterPlayer({
          eosId: 'eos-new-alpha-2',
          steamId: 'steam-new-alpha-2',
          matchKey: 'steam:new-alpha-2',
          name: 'Player new-alpha-2'
        })
      ]
    },
    { nowMs: NOW_MS }
  );

  assert.equal(staleSquadMark, null);
});
