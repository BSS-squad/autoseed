import assert from 'node:assert/strict';
import test from 'node:test';

import { ACHIEVEMENT_ICON_FILES } from '../../src/lib/achievement-icons.ts';
import {
  ACHIEVEMENT_COPY,
  getRoleMetricCopy,
  ROLE_LEADERBOARD_GUIDES,
  ROLE_METRIC_COPY
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
  const hiddenVehicleCodes = new Set(['armor_piercer', 'squad_armor_piercer']);
  assert.deepEqual(
    [...explainedCodes].sort(),
    Object.keys(ACHIEVEMENT_ICON_FILES)
      .filter((code) => !hiddenVehicleCodes.has(code))
      .sort()
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
    'weakSideHoursGap',
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
    'Ноки без убийства / 90 мин'
  );
  assert.equal(getRoleMetricCopy('averageSurprise')?.label, 'Выше прогноза');
});

test('attributes role metrics to the player, squad and side correctly', () => {
  assert.match(ROLE_LEADERBOARD_GUIDES.player.ranking, /Все показатели личные/);
  assert.match(ROLE_LEADERBOARD_GUIDES.squad_leader.ranking, /K\/D всего отряда/);
  assert.match(ROLE_METRIC_COPY.kd.explanation, /не личный K\/D сквадного/);
  assert.match(ROLE_LEADERBOARD_GUIDES.commander.ranking, /всей стороны/);
});

test('uses explicit Squad hours wording instead of the rare term', () => {
  const visibleCopy = JSON.stringify({
    achievements: ACHIEVEMENT_COPY,
    guides: ROLE_LEADERBOARD_GUIDES,
    metrics: ROLE_METRIC_COPY
  }).toLowerCase();

  assert.doesNotMatch(visibleCopy, /наигрыш/);
  assert.match(ROLE_METRIC_COPY.weakSideHoursGap.explanation, /часов в Squad/);
  assert.match(
    ROLE_METRIC_COPY.weakSideHoursGap.explanation,
    /некомандирского состава/
  );
});

test('does not advertise unattributed vehicle statistics or achievements', () => {
  for (const role of ['player', 'squad_leader'] as const) {
    const guide = ROLE_LEADERBOARD_GUIDES[role];
    assert.doesNotMatch(JSON.stringify(guide.achievements), /armor_piercer/);
    assert.match(guide.limitation, /не становятся.*статистик/);
  }

  assert.equal(ROLE_METRIC_COPY.vehicleDamage, undefined);
  assert.equal(ROLE_METRIC_COPY.vehicleKills, undefined);
});
