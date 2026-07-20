function normalizeAssetName(value: string | null | undefined, removeDamageType: boolean): string {
  let normalized = String(value || '').trim();
  if (!normalized) return '';

  const hasUnrealWrapper = /^(?:BlueprintGeneratedClass|Class)'/i.test(normalized);
  normalized = normalized
    .replace(/^BlueprintGeneratedClass'/i, '')
    .replace(/^Class'/i, '')
    .replace(/^['"]|['"]$/g, '');
  const pathSeparator = normalized.lastIndexOf('/');
  if (pathSeparator >= 0) normalized = normalized.slice(pathSeparator + 1);

  const isUnrealObjectName =
    hasUnrealWrapper ||
    /(?:^|[.])(?:Default__|BP_|SQDamageType_|DamageType_)/i.test(normalized) ||
    /_C(?:_\d+)?$/i.test(normalized);
  const objectSeparator = normalized.lastIndexOf('.');
  if (isUnrealObjectName && objectSeparator >= 0) {
    normalized = normalized.slice(objectSeparator + 1);
  }

  normalized = normalized
    .replace(/^Default__/, '')
    .replace(/_C_\d+$/i, '')
    .replace(/_C$/i, '')
    .replace(/^BP_/i, '')
    .replace(/^SQDamageType_/i, '');

  if (removeDamageType) {
    normalized = normalized.replace(/_?damage_?type$/i, '');
  }

  normalized = normalized
    .replace(/_/g, ' ')
    .replace(/([a-zа-я])([A-ZА-Я])/g, '$1 $2')
    .replace(/([a-zа-я])(\d)(?=[A-ZА-Я])/g, '$1 $2')
    .replace(/(\d)([A-ZА-Я][a-zа-я])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized
    ? normalized.charAt(0).toLocaleUpperCase('ru-RU') + normalized.slice(1)
    : '';
}

export function formatVehicleName(value: string | null | undefined): string {
  return normalizeAssetName(value, false) || 'Техника не записана';
}

export function formatDamageSource(value: string | null | undefined): string {
  return normalizeAssetName(value, true) || 'оружие не записано';
}

export function formatVehicleEventKind(
  event: Pick<ExporterActivityKillfeedEventSnapshot, 'destroyed'>
): string {
  return event.destroyed ? 'Уничтожена' : 'Попадание';
}

export function formatVehicleActor(
  event: Pick<ExporterActivityKillfeedEventSnapshot, 'attackerName'>
): string {
  return String(event.attackerName || '').trim() || 'Источник не передан игрой';
}

export function summarizeVehicleEvents(
  events: Array<Pick<ExporterActivityKillfeedEventSnapshot, 'destroyed'>>
): { impacts: number; destroyed: number } {
  return events.reduce(
    (summary, event) => {
      if (event.destroyed) summary.destroyed += 1;
      else summary.impacts += 1;
      return summary;
    },
    { impacts: 0, destroyed: 0 }
  );
}
import type { ExporterActivityKillfeedEventSnapshot } from '../types';
