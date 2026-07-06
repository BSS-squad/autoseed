# Exporter API, Autoseed Consumer, And Switching Automation Design

Дата решения: 2026-07-05.

## Context

`autoseed` уже работает как статический GitHub Pages frontend: он читает
публичные `AutoseedExporter` endpoint-ы, объединяет snapshots, выбирает target
server по frontend policy и получает `join-link` только перед redirect.

Следующий концептуальный шаг не должен смешивать три разные ответственности:

- публичный read-only exporter runtime data;
- player-facing autoseed UI/consumer policy;
- mutating server switching automation.

Смешивание этих слоев в одном plugin/surface является антипаттерном: публичный
monitoring становится зависимым от write-side логики, tests начинают требовать
опасные side effects, а ownership между `squadjs2` и `autoseed` размывается.

## Goals

- Зафиксировать exporter как отдельный read-only data layer в `squadjs2`.
- Зафиксировать `autoseed` как static consumer/UI, который не владеет сырыми
  server-event контрактами и не делает mutating actions.
- Спроектировать будущий action/orchestration layer для switching отдельно от
  exporter, с safety rules, audit trail и ручными overrides.
- Сохранить текущий порядок seed-приоритета: `Mix` -> `Spec Ops` -> `Invasion`.
- Дать основу для дальнейших task issues без дублирования scope.

## Non-Goals

- Не добавлять write endpoint-ы в `AutoseedExporter`.
- Не переносить frontend policy в exporter.
- Не добавлять Steam auth, user sessions или player-specific presence в
  `autoseed`.
- Не выполнять автоматический `setmap`/server switch в этой design-задаче.
- Не менять deployment topology в рамках этого документа.

## Architecture

### Layer 1: SquadJS Exporter

Owner: `breaking-squad/squadjs2`.

Purpose: publish public, sanitized, read-only server state.

Allowed responsibilities:

- `GET {baseUrl}/healthz`;
- `GET {baseUrl}/snapshot`;
- `GET {baseUrl}/events`;
- `GET {baseUrl}/join-link`;
- CORS, rate limits, stale/online state, SSE heartbeat;
- public snapshot normalization from SquadJS runtime data;
- optional read-only sections such as raffle public state.

Explicitly forbidden responsibilities:

- server switching;
- `setmap`;
- writing to admin/server state;
- owning frontend seed policy;
- exposing private player IDs in public raffle payloads;
- storing or accepting secrets from browser clients.

`join-link` remains a read-side adapter call. It may call Squadbrowser on demand,
but must not mutate server state and must not be emitted through `snapshot` or
`events`.

### Layer 2: Autoseed Consumer/UI

Owner: `breaking-squad/autoseed`.

Purpose: static public site that consumes exporter data and helps users connect
to the current seed target.

Allowed responsibilities:

- load `runtime-config.json`;
- subscribe to exporter `events` and fallback to `snapshot`;
- merge multiple exporter snapshots;
- choose target server from frontend policy;
- perform client-side redirect through on-demand `join-link`;
- render monitoring, roster/playtime summary and raffle public UI;
- store only browser-local state such as enabled mode, cooldown and permissions.

Explicitly forbidden responsibilities:

- mutating server state;
- storing secrets;
- deciding private admin actions;
- calling SQSTAT/admin write APIs directly from the browser;
- becoming a backend for server lifecycle operations.

The policy remains public client configuration. For BSS this means:

- timezone: `Europe/Moscow`;
- night preferred server: `Spec Ops`;
- day priority order: `Mix` -> `Spec Ops` -> `Invasion`;
- seed limit and `switchDelta` stay in runtime config.

### Layer 3: Switching Action/Orchestration

Owner: separate implementation task after this design, target repo to be chosen
by the concrete API surface. The first candidate is `squadjs2` when the action is
closest to SquadJS/RCON/runtime. A separate service is acceptable if it needs its
own auth, audit store or scheduling surface.

Purpose: make controlled mutating decisions such as map/server switching.

Required responsibilities:

- evaluate switching candidates from read-only exporter data;
- produce dry-run decisions before real actions;
- require explicit enablement per environment/server;
- enforce safety rules before `setmap`, `next map`, `skip` or future actions;
- write audit records for every decision and every skipped action;
- expose manual override state separately from exporter snapshot;
- provide runbook-level observability for operators.

Explicitly forbidden responsibilities:

- replacing public exporter snapshot;
- embedding mutating controls inside the static frontend without auth;
- relying on browser clients to trigger write-side actions;
- silently changing maps during active unsafe conditions.

## Data Flow

### Current Read Flow

1. SquadJS runtime updates player/server state.
2. `AutoseedExporter` builds a sanitized snapshot.
3. Browser receives updates through `GET /events` or `GET /snapshot`.
4. `autoseed` merges snapshots from configured exporters.
5. `autoseed` chooses the current target with public runtime policy.
6. On redirect/direct connect, browser calls `GET /join-link`.
7. Exporter asks Squadbrowser for a lobby link and returns it to the browser.

### Future Switching Flow

1. Orchestrator reads exporter snapshots or an equivalent internal read model.
2. Orchestrator computes a decision:
   - `noop`;
   - `recommend`;
   - `blocked`;
   - `execute`.
3. Safety rules validate server state, time window, online thresholds and
   override state.
4. In dry-run mode, the decision is logged and exposed to operators, but no
   action is sent.
5. In execute mode, the orchestrator calls the chosen write API.
6. The orchestrator records result, error and rollback/manual-follow-up notes.
7. Exporter later reflects the changed read state through normal snapshots.

Exporter is never the write command endpoint in this flow.

## Exporter Contract

The public exporter contract stays versioned through `version` in snapshot.

Required endpoints:

| Endpoint | Method | Side effect | Browser accessible |
| --- | --- | --- | --- |
| `{baseUrl}/healthz` | `GET` | No | Yes |
| `{baseUrl}/snapshot` | `GET` | No | Yes |
| `{baseUrl}/events` | `GET` | No | Yes |
| `{baseUrl}/join-link` | `GET` | External read adapter only | Yes |

Required response behavior:

- all endpoints return no-store cache headers;
- `events` sends `snapshot` SSE events and heartbeat comments;
- `snapshot` returns `success`, `timestamp`, `generatedAt`, `version` and
  `servers[]`;
- stale runtime state marks affected server as `online: false`;
- public raffle payload must not contain Steam, EOS or Discord IDs;
- `join-link` returns `503` when Squadbrowser cannot provide a valid link.

Breaking contract changes require:

- a new snapshot `version`;
- backend unit tests in `squadjs2`;
- frontend fixture updates in `autoseed`;
- deployment note in the linked GitHub issue.

## Switching Safety Rules

The first implementation of mutating automation must start as dry-run.

An action is blocked when any of these conditions is true:

- target server is offline or stale;
- source data is older than the configured freshness window;
- current player count is above the seed automation threshold;
- current layer/game mode is outside the allowed rotation set;
- manual override disables automation;
- another switching action is already in progress or still cooling down;
- required write API is unavailable;
- operator-configured freeze window is active;
- decision would skip the configured priority order without a `switchDelta`
  reason.

Every blocked decision must include a machine-readable reason and a human-readable
summary for operator review.

## Manual Overrides

Manual overrides belong to the action/orchestration layer, not to exporter.

Minimum override model:

- `automationEnabled`: global boolean;
- `serverOverrides[serverId].enabled`: per-server boolean;
- `forcedTargetServerId`: optional target for dry-run/execute decision;
- `freezeUntil`: optional timestamp;
- `reason`: operator-facing text;
- `updatedBy` and `updatedAt` audit metadata.

If no authenticated write-side surface exists, overrides must remain a manual
configuration or operator runbook step until the surface is implemented.

## Testing Strategy

### SquadJS Exporter

- Unit tests for route behavior: `healthz`, `snapshot`, `events`,
  `join-link`, rate limit and CORS.
- Contract snapshot fixture test that rejects private raffle IDs.
- Test that no write route exists on `AutoseedExporter`.
- Test that `join-link` does not run during `snapshot` or `events`.

### Autoseed Frontend

- E2E tests for runtime-config loading and priority order.
- E2E tests for SSE fallback to snapshot polling.
- E2E tests for no horizontal overflow and no internal API vocabulary in UI.
- Fixture tests for snapshot version compatibility.
- Regression test for `Mix` -> `Spec Ops` -> `Invasion`.

### Switching Orchestration

- Pure decision tests for:
  - no candidates;
  - priority order;
  - `switchDelta`;
  - stale data;
  - freeze window;
  - manual override;
  - dry-run vs execute.
- Integration test with a fake write API.
- Audit test that every blocked/executed decision is recorded.

## Rollout Plan

1. Keep current exporter and autoseed behavior unchanged.
2. Add contract tests and route tests to `squadjs2`.
3. Add frontend fixture tests for contract compatibility in `autoseed`.
4. Create a separate issue for switching orchestration dry-run design.
5. Implement dry-run decision engine before any write action.
6. Add authenticated/manual operator surface only after dry-run output is stable.
7. Enable write-side actions per server after explicit operator approval.

## Issue Decomposition

Recommended follow-up issues:

- `squadjs2`: harden `AutoseedExporter` contract tests and document versioned
  public snapshot schema.
- `autoseed`: add contract fixtures for exporter v3 and explicit priority-order
  regression coverage.
- `squadjs2` or a future orchestrator repo: design and implement switching
  dry-run decision engine.
- `development-context`: keep repository ownership map updated after target repo
  for switching is chosen.

## Acceptance Criteria

- Design clearly separates exporter, autoseed consumer/UI and future switching
  action/orchestration.
- No write-side responsibility is assigned to public exporter.
- Current frontend behavior remains valid.
- `Mix` -> `Spec Ops` -> `Invasion` priority is preserved.
- Safety rules for future mutating automation are explicit.
- Follow-up implementation tasks can be created without duplicating scope.
