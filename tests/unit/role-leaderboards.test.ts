import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRoleLeaderboardHash,
  fetchRoleLeaderboard,
  getCurrentRolePeriodId,
  readRoleLeaderboardSelection,
  resolveRoleLeaderboardUrl,
  shiftRolePeriodId
} from '../../src/lib/leaderboards.ts';

test('restores and serializes role leaderboard selection without internal ids', () => {
  const selection = readRoleLeaderboardSelection(
    '#leaderboards?period=week&role=squad_leader&squadSize=medium&periodId=2026-07-20'
  );
  assert.deepEqual(selection, {
    period: 'week',
    role: 'squad_leader',
    squadSize: 'medium',
    periodId: '2026-07-20'
  });
  assert.equal(
    buildRoleLeaderboardHash(selection),
    '#leaderboards?period=week&role=squad_leader&squadSize=medium&periodId=2026-07-20'
  );
});

test('selection rejects malformed values and period ids', () => {
  assert.deepEqual(
    readRoleLeaderboardSelection(
      '#leaderboards?period=year&role=pilot&squadSize=large&periodId=secret'
    ),
    {
      period: 'day',
      role: 'player',
      squadSize: 'full',
      periodId: null
    }
  );
  assert.equal(
    buildRoleLeaderboardHash({
      period: 'month',
      role: 'commander',
      squadSize: 'small',
      periodId: null
    }),
    '#leaderboards?period=month&role=commander'
  );
});

test('derives V2 endpoint and shifts canonical Moscow archive periods', () => {
  assert.equal(
    resolveRoleLeaderboardUrl({
      url: 'https://statistics.example.invalid/api/leaderboards'
    }),
    'https://statistics.example.invalid/api/leaderboards/v2'
  );
  assert.equal(
    resolveRoleLeaderboardUrl({
      url: 'https://statistics.example.invalid/api/leaderboards',
      roleUrl: 'https://statistics.example.invalid/public/roles'
    }),
    'https://statistics.example.invalid/public/roles'
  );
  assert.equal(getCurrentRolePeriodId('day', new Date('2026-07-25T22:00:00Z')), '2026-07-26');
  assert.equal(getCurrentRolePeriodId('week', new Date('2026-07-26T12:00:00Z')), '2026-07-20');
  assert.equal(getCurrentRolePeriodId('month', new Date('2026-07-26T12:00:00Z')), '2026-07');
  assert.equal(shiftRolePeriodId('day', '2026-07-26', -1), '2026-07-25');
  assert.equal(shiftRolePeriodId('week', '2026-07-20', -1), '2026-07-13');
  assert.equal(shiftRolePeriodId('month', '2026-01', -1), '2025-12');
});

test('adapter reads only allowed public fields and preserves API order', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        status: 'partial',
        available: true,
        stale: true,
        rulesVersion: 'observed-impact-v2',
        revision: 'safe-revision',
        scope: 'public',
        period: 'day',
        periodId: '2026-07-26',
        role: 'player',
        squadSize: null,
        timeZone: 'Europe/Moscow',
        startAt: '2026-07-25T21:00:00.000Z',
        endAt: '2026-07-26T21:00:00.000Z',
        minimumMatches: 2,
        generatedAt: '2026-07-26T11:55:00.000Z',
        dataThrough: '2026-07-26T11:50:00.000Z',
        dataQuality: {
          sourceMatches: 12,
          achievementHistoryMatches: 120,
          factsCoverage: 0.9,
          hoursCoverage: 0.85,
          hoursCoverageThreshold: 0.8,
          vehicleAttribution: {
            eventCoverage: 0.8,
            sessionId: 'must-not-enter-state'
          },
          factsRevisions: [{ serverId: 'must-not-enter-state' }]
        },
        progress: {
          candidates: 20,
          qualified: 2,
          minimumMatches: 2
        },
        ranking: {
          sortKeys: ['resourceSwingPer90', 'resourceSwing']
        },
        methodology: {
          rulesVersion: 'observed-impact-v2',
          role: 'player',
          roleTitle: 'Игроки',
          summary: 'Понятное объяснение места.',
          participation: ['Не меньше 15 минут.'],
          achievementRules: ['Ачивки не меняют место.'],
          limitations: ['Логистика пока не измеряется.'],
          ranking: [
            {
              key: 'resourceSwingPer90',
              label: 'Полезный размен / 90 мин',
              description: 'Засчитанные убийства и поднятия минус потери.',
              internalFormula: 'must-not-enter-state'
            }
          ],
          formulas: [
            {
              label: 'Полезный размен',
              expression: 'убийства + поднятия − смерти − тимкиллы',
              description: 'Нок и смерть образуют один эпизод.'
            }
          ],
          achievements: [
            {
              code: 'against_odds',
              title: 'Вопреки',
              description: 'Сильный результат менее опытной стороны.',
              criteria: 'Полезный размен вошёл в лучшие 20% группы.'
            }
          ],
          internalNotes: ['must-not-enter-state']
        },
        entries: [
          {
            rank: 2,
            playerId: 'hidden-player',
            name: 'Второй',
            matches: 2,
            indicators: {
              resourceSwingPer90: 4,
              hiddenMetric: 999
            },
            totals: {
              teamkills: 0,
              memberIds: ['hidden']
            },
            achievements: [
              {
                code: 'against_odds',
                title: 'Вопреки',
                description: 'Описание.',
                reason: 'Причина.',
                value: 4,
                threshold: 3,
                comparison: 'gte',
                playerId: 'hidden-player'
              }
            ]
          },
          {
            rank: 1,
            name: 'Первый',
            matches: 2,
            indicators: { resourceSwingPer90: 5 }
          }
        ],
        totalPendingEntries: 1,
        pendingTruncated: false,
        pendingEntries: [
          {
            rank: null,
            playerId: 'hidden-pending-player',
            name: 'Почти прошёл',
            matches: 1,
            qualified: false,
            matchesNeeded: 1,
            indicators: { resourceSwingPer90: 3 },
            achievements: []
          }
        ]
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }) as typeof fetch;

  try {
    const result = await fetchRoleLeaderboard(
      'https://statistics.example.invalid/api/leaderboards/v2',
      {
        period: 'day',
        role: 'player',
        squadSize: 'full',
        periodId: null
      }
    );
    const serialized = JSON.stringify(result);

    assert.equal(requestedUrl.includes('period=day'), true);
    assert.equal(requestedUrl.includes('role=player'), true);
    assert.equal(requestedUrl.includes('scope=public'), true);
    assert.equal(requestedUrl.includes('limit=500'), true);
    assert.equal(requestedUrl.includes('squadSize'), false);
    assert.equal(result.entries[0]?.rank, 2);
    assert.equal(result.entries[1]?.rank, 1);
    assert.equal(result.entries[0]?.indicators.resourceSwingPer90, 4);
    assert.equal(result.entries[0]?.achievements[0]?.description, 'Описание.');
    assert.equal(result.pendingEntries[0]?.rank, null);
    assert.equal(result.pendingEntries[0]?.matchesNeeded, 1);
    assert.equal(result.dataQuality.achievementHistoryMatches, 120);
    assert.equal(result.methodology?.roleTitle, 'Игроки');
    assert.equal(
      result.methodology?.ranking[0]?.label,
      'Полезный размен / 90 мин'
    );
    assert.equal(result.methodology?.achievements[0]?.code, 'against_odds');
    assert.equal(serialized.includes('playerId'), false);
    assert.equal(serialized.includes('sessionId'), false);
    assert.equal(serialized.includes('serverId'), false);
    assert.equal(serialized.includes('hiddenMetric'), false);
    assert.equal(serialized.includes('memberIds'), false);
    assert.equal(serialized.includes('internalFormula'), false);
    assert.equal(serialized.includes('internalNotes'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
