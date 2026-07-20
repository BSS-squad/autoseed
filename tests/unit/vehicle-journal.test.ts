import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatVehicleActor,
  formatDamageSource,
  formatVehicleEventKind,
  formatVehicleName,
  summarizeVehicleEvents
} from '../../src/lib/vehicle-journal.ts';
import { collapseTerminalVehicleEvents } from '../../src/lib/snapshot.ts';
import type { ExporterActivityKillfeedEventSnapshot } from '../../src/types.ts';

function vehicleEvent(
  overrides: Partial<ExporterActivityKillfeedEventSnapshot>
): ExporterActivityKillfeedEventSnapshot {
  return {
    type: 'vehicle',
    attackerName: null,
    victimName: null,
    count: 1,
    weapon: null,
    damage: null,
    occurredAt: null,
    roundEndedAt: null,
    vehicleName: null,
    healthRemaining: null,
    destroyed: false,
    ...overrides
  };
}

test('formats Unreal vehicle and damage identifiers without technical instance suffixes', () => {
  assert.equal(formatVehicleName('BP_CPV_Transport_Blue_C_2147481862'), 'CPV Transport Blue');
  assert.equal(formatVehicleName('BP_minsk_C_2146128567'), 'Minsk');
  assert.equal(formatVehicleName('M1A2 Abrams'), 'M1A2 Abrams');
  assert.equal(
    formatVehicleName(
      "BlueprintGeneratedClass'/Game/Vehicles/CPV/BP_CPV_Transport_Blue.BP_CPV_Transport_Blue_C'"
    ),
    'CPV Transport Blue'
  );

  assert.equal(formatDamageSource('BP_HAT_DamageType_C'), 'HAT');
  assert.equal(formatDamageSource('BP_Explosives_Damagetype_C'), 'Explosives');
  assert.equal(formatDamageSource('SQDamageType_Thermite'), 'Thermite');
  assert.equal(formatDamageSource('7.62mm AP'), '7.62mm AP');
  assert.equal(formatDamageSource('M2 .50 cal'), 'M2 .50 cal');
  assert.equal(
    formatDamageSource('BP_Deployable_TNT_600g_Explosive_Timed_C_2146147035'),
    'Deployable TNT 600g Explosive Timed'
  );
});

test('calls anonymous vehicle traces impacts and does not imply that a source was lost', () => {
  const anonymousImpact = vehicleEvent({ destroyed: false, attackerName: null });
  const knownDestruction = vehicleEvent({ destroyed: true, attackerName: 'Сапёр' });

  assert.equal(formatVehicleEventKind(anonymousImpact), 'Попадание');
  assert.equal(formatVehicleActor(anonymousImpact), 'Источник не подтверждён');
  assert.equal(formatVehicleEventKind(knownDestruction), 'Уничтожена');
  assert.equal(formatVehicleActor(knownDestruction), 'Сапёр');
});

test('separates vehicle impacts from confirmed destructions in the journal counter', () => {
  const summary = summarizeVehicleEvents([
    vehicleEvent({ destroyed: false }),
    vehicleEvent({ destroyed: false }),
    vehicleEvent({ destroyed: true })
  ]);

  assert.deepEqual(summary, { impacts: 2, destroyed: 1 });
});

test('collapses only a proven terminal damage and destruction pair', () => {
  const damage = vehicleEvent({
    occurredAt: '2026-07-16T12:12:48.389Z',
    vehicleName: 'BP_CPV_Transport_Blue_C_2147481862',
    weapon: 'BP_Explosives_Damagetype_C',
    damage: 500,
    healthRemaining: null,
    destroyed: false
  });
  const destroyed = vehicleEvent({
    occurredAt: '2026-07-16T12:12:48.389Z',
    attackerName: 'Сапёр',
    vehicleName: 'BP_CPV_Transport_Blue_C_2147481862',
    weapon: 'BP_Deployable_TNT_600g_Explosive_Timed_C_2146147035',
    damage: 500,
    healthRemaining: 0,
    destroyed: true
  });

  const collapsed = collapseTerminalVehicleEvents([damage, destroyed]);

  assert.equal(collapsed.length, 1);
  assert.deepEqual(collapsed[0], destroyed);
  assert.equal(damage.destroyed, false, 'source events must not be mutated');
});

test('does not merge ordinary hits or merely similar vehicle events', () => {
  const base = vehicleEvent({
    occurredAt: '2026-07-16T12:12:48.389Z',
    vehicleName: 'BP_CPV_Transport_Blue_C_2147481862',
    weapon: 'BP_Explosives_Damagetype_C',
    damage: 500,
    healthRemaining: null,
    destroyed: false
  });
  const tooLate = vehicleEvent({
    ...base,
    occurredAt: '2026-07-16T12:12:48.490Z',
    healthRemaining: 0,
    destroyed: true
  });
  const knownHealth = vehicleEvent({
    ...base,
    occurredAt: '2026-07-16T12:12:48.390Z',
    healthRemaining: 25,
    destroyed: false
  });
  const differentDamage = vehicleEvent({
    ...base,
    occurredAt: '2026-07-16T12:12:48.391Z',
    damage: 499,
    healthRemaining: 0,
    destroyed: true
  });
  const inconsistentDestroyedHealth = vehicleEvent({
    ...base,
    occurredAt: '2026-07-16T12:12:48.390Z',
    healthRemaining: 25,
    destroyed: true
  });

  assert.equal(collapseTerminalVehicleEvents([base, tooLate]).length, 2);
  assert.equal(collapseTerminalVehicleEvents([knownHealth, { ...tooLate, occurredAt: '2026-07-16T12:12:48.390Z' }]).length, 2);
  assert.equal(collapseTerminalVehicleEvents([base, differentDamage]).length, 2);
  assert.equal(collapseTerminalVehicleEvents([base, inconsistentDestroyedHealth]).length, 2);
});
