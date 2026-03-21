export type AppConfig = {
  app: {
    title: string;
    pollIntervalMs: number;
    debugLogLimit?: number;
    testMode?: TestModeConfig;
  };
  policy?: Partial<SeedPolicy>;
  exporters: ExporterEndpointConfig[];
};

export type TestModeConfig = {
  sequenceServerIds: number[];
  delayMs: number;
  cooldownMs: number;
};

export type SeedPolicy = {
  timezone: string;
  nightWindowStart: string;
  nightWindowEnd: string;
  nightPreferredServerId: number;
  maxSeedPlayers: number;
  priorityOrder: number[];
  switchDelta: number;
  cooldownMs: number;
};

export type ExporterEndpointConfig = {
  name: string;
  baseUrl: string;
};

export type ExporterServerSnapshot = {
  id: number;
  code: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  queueLength?: number;
  currentLayer?: string;
  gameMode?: string;
  isSeedCandidate: boolean;
  online: boolean;
  joinLink?: string;
  updatedAt: number;
  sourceUrl: string;
  error?: string | null;
};

export type ExporterSnapshotResponse = {
  success: boolean;
  timestamp: number;
  generatedAt: string;
  version: number;
  servers: Array<Partial<Omit<ExporterServerSnapshot, 'sourceUrl' | 'error'>>>;
};

export type CombinedSnapshot = {
  timestamp: number;
  generatedAt: string;
  servers: ExporterServerSnapshot[];
  errors: string[];
};

export type SelectionState = {
  targetServer: ExporterServerSnapshot | null;
  reason: 'target_found' | 'no_suitable_server';
  nightMode: boolean;
};

export type BrowserPermissions = {
  popupAllowed: boolean;
  steamProtocolReady: boolean;
  checkedAt: number;
};

export type StoredState = {
  enabled: boolean;
  mode: AppMode;
  lastProcessedTimestamp: number;
  cooldownUntil: number;
  permissions: BrowserPermissions | null;
};

export type AppMode = 'production' | 'test';
