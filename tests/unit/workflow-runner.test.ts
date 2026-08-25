import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('Pages workflow uses only the dedicated self-hosted runner group', () => {
  const workflow = fs.readFileSync(
    path.resolve('.github/workflows/deploy-pages.yml'),
    'utf8'
  );
  const jobs = workflow.match(/^  (?:quality|package|upload|deploy|smoke):$/gm) ?? [];
  const dedicatedRunners = workflow.match(
    /^    runs-on:\n      group: selfhost-group-1$/gm
  ) ?? [];

  assert.equal(jobs.length, 5);
  assert.equal(dedicatedRunners.length, jobs.length);
  assert.doesNotMatch(workflow, /^    runs-on:[ \t]+\S+/gm);
  assert.doesNotMatch(workflow, /ubuntu-latest/);
});
