# Exporter Autoseed Switching Follow-Ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the approved exporter/autoseed/switching design into concrete GitHub follow-up issues without mixing repository ownership.

**Architecture:** This plan creates three independent implementation tracks: `squadjs2` exporter contract hardening, `autoseed` frontend contract fixtures, and a separate switching dry-run spike. The parent `autoseed#4` remains the design task and should close only after the design PR is reviewed/merged and child issues exist on the roadmap.

**Tech Stack:** GitHub Issues, GitHub Projects, `gh`, `squadjs2` Node tests, `autoseed` Vite/Playwright tests.

---

### Task 1: Create SquadJS Exporter Contract Issue

**Files:**
- Read: `docs/superpowers/specs/2026-07-05-exporter-autoseed-switching-design.md`
- Public issue target: `breaking-squad/squadjs2`

- [ ] **Step 1: Verify no duplicate issue exists**

Run:

```bash
gh issue list --repo breaking-squad/squadjs2 --state open --search "AutoseedExporter contract exporter v3" --limit 20
```

Expected: no issue with the same scope.

- [ ] **Step 2: Create issue**

Create `[Task] Зафиксировать контракт AutoseedExporter v3` in `breaking-squad/squadjs2` with labels:

```text
task,status:ready,priority:p1,area:plugins,area:autoseed,repo:squadjs2
```

Use this body:

```markdown
## Context

`AutoseedExporter` is now the public read-only data layer for the static AutoSeed frontend. The design split is documented in `breaking-squad/autoseed#4` and `breaking-squad/autoseed#7`.

The current plugin already exposes `healthz`, `snapshot`, `events` and `join-link`, but the public contract needs explicit regression coverage so future changes do not add write-side behavior or leak private IDs.

## Scope

- Add route/contract tests for `AutoseedExporter`.
- Assert `GET /healthz`, `GET {pathPrefix}/healthz`, `GET {pathPrefix}/snapshot`, `GET {pathPrefix}/events` and `GET {pathPrefix}/join-link` behavior.
- Assert unsupported mutating methods/routes return non-success responses.
- Assert `snapshot` and `events` do not call Squadbrowser join-link lookup.
- Assert public raffle payloads do not expose Steam, EOS or Discord IDs when raffle data is present.
- Document snapshot `version: 3` as the current public exporter contract.

## Target repos

- `breaking-squad/squadjs2`

## Current API / data sources

- `squad-server/plugins/autoseed-exporter.js`
- Existing test style: `node --test test/*.test.js`
- Current public endpoints: `healthz`, `snapshot`, `events`, `join-link`

## Acceptance criteria

- Contract tests fail if a write route is added to `AutoseedExporter`.
- Contract tests fail if `snapshot` or `events` trigger `fetchSquadbrowserJoinLink`.
- Contract tests cover stale/online snapshot fields and `version: 3`.
- Public raffle payload tests fail if private IDs appear in exported raffle history.
- Existing join-link behavior remains on-demand and non-deduplicated.

## Verification

- `node --test test/autoseed-exporter-*.test.js`
- `git diff --check`

## Links

- Parent design: `breaking-squad/autoseed#4`
- Design PR: `breaking-squad/autoseed#7`
- Related ops task: `breaking-squad/squadjs2#31`
```

- [ ] **Step 3: Add to Roadmap and fields**

Set Project fields:

```text
Status: Ready
Priority: P1
Area: plugins
Work Type: task
Next Action: Добавить contract tests для AutoseedExporter v3 и зафиксировать read-only boundary.
```

### Task 2: Create Autoseed Frontend Contract Fixtures Issue

**Files:**
- Read: `docs/superpowers/specs/2026-07-05-exporter-autoseed-switching-design.md`
- Public issue target: `breaking-squad/autoseed`

- [ ] **Step 1: Verify no duplicate issue exists**

Run:

```bash
gh issue list --repo breaking-squad/autoseed --state open --search "exporter v3 fixtures priority regression" --limit 20
```

Expected: no issue with the same scope.

- [ ] **Step 2: Create issue**

Create `[Task] Добавить frontend fixtures для exporter v3 и seed priority` in `breaking-squad/autoseed` with labels:

```text
task,status:ready,priority:p1,area:autoseed,area:site,repo:autoseed
```

Use this body:

```markdown
## Context

`autoseed` consumes public `AutoseedExporter` snapshots and owns the browser-side seed policy. The exporter/autoseed/switching boundary is documented in `breaking-squad/autoseed#4` and `breaking-squad/autoseed#7`.

The frontend already has Playwright coverage, but the exporter v3 contract and `Mix` -> `Spec Ops` -> `Invasion` priority should be represented as explicit fixtures/regression tests.

## Scope

- Add exporter v3 fixture data for `snapshot`, `events` fallback and `join-link`.
- Add regression coverage for day priority `Mix` -> `Spec Ops` -> `Invasion`.
- Add regression coverage for `switchDelta`, seed limit and night preferred server behavior.
- Add fixture coverage that public raffle data does not render Steam/EOS/Discord IDs.
- Keep policy in `runtime-config.json`; do not move policy into exporter.

## Target repos

- `breaking-squad/autoseed`

## Current API / data sources

- `src/lib/snapshot.ts`
- `src/lib/seed-policy.ts`
- `tests/e2e/app.spec.ts`
- `public/runtime-config.example.json`

## Acceptance criteria

- E2E tests fail if exporter v3 required fields stop being normalized.
- E2E tests fail if priority order no longer chooses `Mix` before `Spec Ops` before `Invasion` when thresholds allow it.
- E2E tests cover `switchDelta` selecting a stronger server only when the delta is above policy threshold.
- E2E tests cover night mode selecting configured preferred server.
- UI tests still reject internal terms and private raffle IDs in rendered output.

## Verification

- `npm run build`
- `npm run test:e2e`
- `git diff --check`

## Links

- Parent design: `breaking-squad/autoseed#4`
- Design PR: `breaking-squad/autoseed#7`
- Exporter contract follow-up: `breaking-squad/squadjs2#32`
```

- [ ] **Step 3: Add to Roadmap and fields**

Set Project fields:

```text
Status: Ready
Priority: P1
Area: autoseed
Work Type: task
Next Action: Добавить exporter v3 fixtures и regression tests для seed priority.
```

### Task 3: Create Switching Dry-Run Spike

**Files:**
- Read: `docs/superpowers/specs/2026-07-05-exporter-autoseed-switching-design.md`
- Public issue target: `breaking-squad/squadjs2`

- [ ] **Step 1: Verify no duplicate issue exists**

Run:

```bash
gh issue list --repo breaking-squad/squadjs2 --state open --search "switching dry-run orchestration setmap" --limit 20
```

Expected: no issue with the same scope.

- [ ] **Step 2: Create issue**

Create `[Spike] Спроектировать dry-run switching orchestration` in `breaking-squad/squadjs2` with labels:

```text
spike,status:ready,priority:p1,area:autoseed,area:plugins,repo:squadjs2,repo:cross-repo
```

Use this body:

```markdown
## Context

The public exporter must remain read-only. Mutating actions such as server switching, `setmap`, next map or skip need a separate action/orchestration layer with safety rules. The boundary is documented in `breaking-squad/autoseed#4` and `breaking-squad/autoseed#7`.

## Scope

- Design the first dry-run decision engine for switching automation.
- Decide whether the first implementation belongs in `squadjs2` plugin/runtime or a separate service.
- Define decision output: `noop`, `recommend`, `blocked`, `execute`.
- Define safety blockers for stale data, high player count, disallowed layer/mode, freeze window, manual override, cooldown and unavailable write API.
- Define audit shape for every decision.
- Define how dry-run output is exposed to operators without changing public exporter contract.

## Target repos

- Primary candidate: `breaking-squad/squadjs2`
- Related consumer: `breaking-squad/autoseed`
- Coordination: `breaking-squad/development-context`

## Current API / data sources

- Read model: `AutoseedExporter` snapshots or an internal equivalent.
- Current external write candidate: SQSTAT `POST /api/server/setmap.php`.
- Possible internal write candidate: SquadJS/RCON runtime command, if safer for deployment.

## Acceptance criteria

- There is a short design note or issue comment with the chosen target repo and API surface.
- Dry-run decision inputs and outputs are specified.
- Safety blockers are specified as machine-readable reason codes.
- Audit record shape is specified.
- Follow-up task for implementation can be created without adding write routes to `AutoseedExporter`.

## Verification

- Design review in issue comments.
- No runtime code required for the spike.

## Links

- Parent design: `breaking-squad/autoseed#4`
- Design PR: `breaking-squad/autoseed#7`
- Related ops task: `breaking-squad/squadjs2#31`
```

- [ ] **Step 3: Add to Roadmap and fields**

Set Project fields:

```text
Status: Ready
Priority: P1
Area: autoseed
Work Type: spike
Next Action: Выбрать target repo/API surface для dry-run switching orchestration.
```

### Task 4: Close Design Decomposition Loop

**Files:**
- Modify: `docs/superpowers/plans/2026-07-05-exporter-autoseed-switching-followups.md`
- Public issue target: `breaking-squad/autoseed#4`
- PR target: `breaking-squad/autoseed#7`

- [ ] **Step 1: Comment on parent issue**

After creating the three child issues, comment on `breaking-squad/autoseed#4`:

```markdown
Follow-up implementation issues created from PR #7 design:

- `breaking-squad/squadjs2#32` — exporter v3 contract hardening.
- `breaking-squad/autoseed#8` — frontend exporter fixtures and priority regressions.
- `breaking-squad/squadjs2#33` — dry-run switching orchestration spike.

Parent design can move to done after PR #7 is reviewed and merged.
```

- [ ] **Step 2: Update project fields**

Set `breaking-squad/autoseed#4`:

```text
Status: Review
Next Action: Review/merge PR #7; после merge закрыть design task и вести follow-up issues отдельно.
```

- [ ] **Step 3: Verify**

Run:

```bash
bash scripts/check-github-leaks.sh
bash scripts/audit-project-board.sh
```

Expected:

```text
No local path leaks found in checked GitHub issues/comments.
missingPriority: 0
missingArea: 0
missingWorkType: 0
missingNextAction: 0
```
