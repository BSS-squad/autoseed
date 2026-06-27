# Planned Raffle Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show one or more future raffle campaigns as deduplicated notifications while reserving the «Серия» summary card for a currently running campaign.

**Architecture:** Extend the normalized raffle snapshot with an optional campaign array while preserving the legacy single campaign. Build a derived campaign collection in `App.tsx`, classify it against `now`, and render future and current campaigns in separate surfaces.

**Tech Stack:** React 19, TypeScript, Vite, Playwright.

---

### Task 1: Lock the behavior with E2E coverage

**Files:**
- Modify: `tests/e2e/app.spec.ts`

- [ ] Add a fixture with two future campaigns and a duplicate campaign from another exporter.
- [ ] Assert two notification items render, the duplicate is removed, and `winners-campaign-card` is absent before campaign start.
- [ ] Add a current-campaign case that asserts `winners-campaign-card` is visible.
- [ ] Run `npx playwright test tests/e2e/app.spec.ts --grep "planned raffle campaigns"` and confirm failure is caused by the missing notification behavior.

### Task 2: Normalize multiple campaigns

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/snapshot.ts`

- [ ] Add `campaigns: ExporterRaffleCampaignSnapshot[]` to `ExporterRaffleSnapshot`.
- [ ] Normalize `raffles.campaigns` and append legacy `raffles.campaign` when present.
- [ ] Keep malformed entries out through the existing `mapRaffleCampaign` parser.

### Task 3: Render future notifications and current series

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] Collect and deduplicate campaigns by dates and campaign settings.
- [ ] Classify campaigns as planned, current, or finished against the supplied `now` value.
- [ ] Render planned campaigns in a full-width notification section above the summary.
- [ ] Render the «Серия» summary card only when a current campaign exists.
- [ ] Keep active raffle, budget, server count, and history cards unchanged.
- [ ] Run the focused E2E test and confirm it passes.

### Task 4: Document and verify

**Files:**
- Modify: `docs/setup.md`
- Modify: `docs/autoseed-tz.md`

- [ ] Document `campaigns`, legacy compatibility, deduplication, and planned/current display rules.
- [ ] Run `npm run build` and `npx playwright test`.
- [ ] Start the local app and inspect `/#winners` at desktop and mobile widths with Playwright.
- [ ] Confirm no console error/warn, framework overlay, horizontal overflow, or overlapping content.

### Task 5: Publish and deploy

**Files:**
- Modify: GitHub issue `breaking-squad/squadjs2#28`

- [ ] Inspect the final diff and repository status.
- [ ] Commit only the planned-campaign files and push `main` to the deployment remote.
- [ ] Wait for the `Deploy Pages` workflow and confirm success.
- [ ] Verify the production page and update issue #28 with implementation and deployment evidence.
