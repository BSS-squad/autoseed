import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import test from 'node:test';

import {
  ACHIEVEMENT_ICON_FILES,
  resolveAchievementIconUrl
} from '../../src/lib/achievement-icons.ts';

test('builds achievement icon paths for root and GitHub Pages base paths', () => {
  assert.equal(
    resolveAchievementIconUrl('against_odds', '/'),
    '/achievements/against-odds.webp'
  );
  assert.equal(
    resolveAchievementIconUrl('against_odds', '/autoseed'),
    '/autoseed/achievements/against-odds.webp'
  );
  assert.equal(
    resolveAchievementIconUrl('against_odds', '/autoseed/'),
    '/autoseed/achievements/against-odds.webp'
  );
  assert.equal(resolveAchievementIconUrl('unknown', '/autoseed'), null);
});

test('keeps every mapped achievement icon in the public bundle', async () => {
  const iconFiles = Object.values(ACHIEVEMENT_ICON_FILES);
  assert.equal(iconFiles.length, 21);
  assert.equal(new Set(iconFiles).size, iconFiles.length);

  await Promise.all(
    iconFiles.map(async (iconFile) => {
      const iconPath = new URL(`../../public/achievements/${iconFile}`, import.meta.url);
      const iconStat = await stat(iconPath);
      assert.ok(iconStat.isFile());
      assert.ok(iconStat.size > 0);
    })
  );
});
