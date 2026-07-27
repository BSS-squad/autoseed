type ServerIdentity = {
  code?: string | null;
  name?: string | null;
};

type TeamIdentity = {
  id?: string | number | null;
  teamID?: string | number | null;
  name?: string | null;
};

const SERVER_NAMES: Array<{
  label: string;
  patterns: RegExp[];
}> = [
  {
    label: 'MIX',
    patterns: [/\bsquadjs1\b/i, /\bmix\b/i, /\bмикс\b/i]
  },
  {
    label: 'SPEC OPS',
    patterns: [/\bsquadjs2\b/i, /\bspec[\s_-]*ops\b/i]
  },
  {
    label: 'INVASION',
    patterns: [/\bsquadjs3\b/i, /\binvasion\b/i, /\bинвейжен\b/i]
  },
  {
    label: 'MDC CUSTOM',
    patterns: [/\bsquadjs6\b/i, /\bmdc\b/i, /\bмдц\b/i]
  }
];

export const ROLE_LABELS = {
  squadLeader: 'Сквадной',
  commander: 'Командир'
} as const;

export const USER_STATE_COPY = {
  loading: {
    title: 'Загружаем данные',
    description: 'Обычно это занимает несколько секунд.'
  },
  forming: {
    title: 'Данные ещё формируются',
    description: 'Раздел заполнится после следующих завершённых матчей.'
  },
  unavailable: {
    title: 'Данные временно недоступны',
    description: 'Показываем всё, что успели получить. Обновление продолжится автоматически.'
  },
  actionError: {
    title: 'Действие не выполнено',
    description: 'Повторите попытку через несколько минут.'
  }
} as const;

export function formatServerDisplayName(server: ServerIdentity): string {
  const code = String(server.code || '').trim();
  const name = String(server.name || '').trim();
  const identity = `${code} ${name}`;

  for (const entry of SERVER_NAMES) {
    if (entry.patterns.some((pattern) => pattern.test(identity))) {
      return entry.label;
    }
  }

  if (/\bsquadjs\d*\b/i.test(identity)) return 'Сервер BSS';
  return name || 'Сервер BSS';
}

export function formatTeamDisplayName(team: TeamIdentity): string {
  const name = String(team.name || '').trim();
  const rawId = String(team.id ?? team.teamID ?? '').trim();
  const teamMatch = name.match(/^(?:team|сторона)\s*([0-9]+)$/i);
  const id = teamMatch?.[1] || rawId;

  if (teamMatch || !name) {
    return id ? `Сторона ${id}` : 'Сторона не указана';
  }

  return name;
}

export function formatSquadDisplayName(value: string | null | undefined): string {
  const name = String(value || '').trim();
  if (!name || /^(?:unassigned|без\s+(?:сквада|отряда))$/i.test(name)) {
    return 'Без отряда';
  }

  const squadMatch = name.match(/^(?:squad|сквад|отряд)\s*([0-9]+)$/i);
  return squadMatch ? `Отряд ${squadMatch[1]}` : name;
}

export function formatPlayerRole(value: string | null | undefined): string | null {
  const role = String(value || '').trim();
  if (!role) return null;

  const normalized = role.replace(/[^a-zа-яё0-9]/gi, '').toLocaleLowerCase('ru');
  const normalizedWithoutPrefix = normalized.replace(/^(?:bp|role|class)/, '');
  const canonicalRole = /_c(?:_|$)/i.test(role)
    ? normalizedWithoutPrefix.replace(/c\d*$/, '')
    : normalizedWithoutPrefix;
  const roles: Array<[patterns: string[], label: string]> = [
    [['commander', 'командир'], ROLE_LABELS.commander],
    [['squadleader', 'squadlead', 'сквадный'], ROLE_LABELS.squadLeader],
    [['automaticrifleman', 'autorifleman'], 'Автоматический стрелок'],
    [['machinegunner'], 'Пулемётчик'],
    [['rifleman'], 'Стрелок'],
    [['medic'], 'Медик'],
    [['crewman'], 'Член экипажа'],
    [['pilot'], 'Пилот'],
    [['grenadier'], 'Гренадёр'],
    [['marksman'], 'Марксман'],
    [['sniper'], 'Снайпер'],
    [['engineer', 'sapper'], 'Сапёр'],
    [['heavyantitank', 'hat'], 'Тяжёлый ПТ'],
    [['lightantitank', 'lat'], 'Лёгкий ПТ'],
    [['unarmed'], 'Безоружный']
  ];

  for (const [patterns, label] of roles) {
    if (
      patterns.some(
        (pattern) =>
          canonicalRole === pattern ||
          (pattern.length > 3 && canonicalRole.includes(pattern))
      )
    ) {
      return label;
    }
  }

  if (/[_./\\]|(?:^|[^a-z])(?:bp|role|class)(?:[^a-z]|$)/i.test(role)) {
    return 'Роль не указана';
  }
  return role;
}
