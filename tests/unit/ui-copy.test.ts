import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatServerDisplayName,
  formatPlayerRole,
  formatSquadDisplayName,
  formatTeamDisplayName,
  ROLE_LABELS,
  USER_STATE_COPY
} from '../../src/lib/ui-copy.ts';

test('hides internal server codes behind stable public names', () => {
  assert.equal(
    formatServerDisplayName({ code: 'squadjs1', name: '[RU] BSS Classic' }),
    'MIX'
  );
  assert.equal(
    formatServerDisplayName({ code: 'squadjs2', name: '[RU] BSS Spec Ops' }),
    'SPEC OPS'
  );
  assert.equal(
    formatServerDisplayName({ code: 'squadjs3', name: '[RU] BSS Invasion' }),
    'INVASION'
  );
  assert.equal(
    formatServerDisplayName({ code: 'squadjs6', name: 'Mdc Server' }),
    'MDC CUSTOM'
  );
  assert.equal(
    formatServerDisplayName({ code: 'squadjs9', name: 'squadjs9' }),
    'Сервер BSS'
  );
});

test('normalizes technical side and squad labels', () => {
  assert.equal(formatTeamDisplayName({ id: 1, name: 'Team 1' }), 'Сторона 1');
  assert.equal(formatTeamDisplayName({ id: 2, name: 'Сторона 2' }), 'Сторона 2');
  assert.equal(formatTeamDisplayName({ id: 1, name: 'Vanguard' }), 'Vanguard');
  assert.equal(formatSquadDisplayName('Squad 4'), 'Отряд 4');
  assert.equal(formatSquadDisplayName('Без сквада'), 'Без отряда');
  assert.equal(formatPlayerRole('Rifleman'), 'Стрелок');
  assert.equal(formatPlayerRole('Medic'), 'Медик');
  assert.equal(formatPlayerRole('BP_Rifleman_C'), 'Стрелок');
  assert.equal(formatPlayerRole('Role_Unknown_C'), 'Роль не указана');
});

test('keeps role and state vocabulary human-readable', () => {
  const visibleCopy = JSON.stringify({ ROLE_LABELS, USER_STATE_COPY }).toLowerCase();
  assert.doesNotMatch(
    visibleCopy,
    /\b(?:api|snapshot|exporter|endpoint|diff|dry-run|sl|cmd)\b/
  );
  assert.equal(ROLE_LABELS.squadLeader, 'Сквадной');
  assert.equal(USER_STATE_COPY.unavailable.title, 'Данные временно недоступны');
});
