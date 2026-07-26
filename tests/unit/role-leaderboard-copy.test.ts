import assert from 'node:assert/strict';
import test from 'node:test';

import { ACHIEVEMENT_ICON_FILES } from '../../src/lib/achievement-icons.ts';
import {
  ACHIEVEMENT_COPY,
  getRoleMetricCopy,
  ROLE_LEADERBOARD_GUIDES
} from '../../src/lib/role-leaderboard-copy.ts';

test('explains every achievement that has an icon', () => {
  assert.deepEqual(
    Object.keys(ACHIEVEMENT_COPY).sort(),
    Object.keys(ACHIEVEMENT_ICON_FILES).sort()
  );

  const explainedCodes = new Set(
    Object.values(ROLE_LEADERBOARD_GUIDES).flatMap(({ achievements }) =>
      achievements.map(({ code }) => code)
    )
  );
  assert.deepEqual(
    [...explainedCodes].sort(),
    Object.keys(ACHIEVEMENT_ICON_FILES).sort()
  );
});

test('uses Squad-facing labels and gives every ranking metric an explanation', () => {
  for (const key of [
    'resourceSwingPer90',
    'resourceSwing',
    'temporaryPressurePer90',
    'combatConversion',
    'kd',
    'knockdownsPer100PersonHours',
    'revivesPer100PersonHours',
    'winRate',
    'averageSurprise',
    'averageHoursGap',
    'matches',
    'name'
  ]) {
    const copy = getRoleMetricCopy(key);
    assert.ok(copy);
    assert.ok(copy.label.length > 2);
    assert.ok(copy.explanation.length > 20);
  }

  assert.equal(getRoleMetricCopy('resourceSwing')?.label, 'Полезный размен');
  assert.equal(
    getRoleMetricCopy('temporaryPressurePer90')?.label,
    'Нокауты без смерти / 90 мин'
  );
  assert.equal(getRoleMetricCopy('averageSurprise')?.label, 'Выше прогноза');
});
