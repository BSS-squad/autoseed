# Private Raffle Participants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish only raffle participant nicknames and show a compact, expandable participant list for every completed raffle.

**Architecture:** Sanitize participant objects at the `Raffle.getSnapshot()` boundary while retaining full identifiers in SQL and in-memory plugin state. On the frontend, normalize only public fields and render each history entry with a native `details` disclosure containing participant nicknames.

**Tech Stack:** Node.js, SquadJS, React 19, TypeScript, Vite, Playwright.

---

### Task 1: Sanitize the public SquadJS raffle snapshot

**Files:**
- Modify: `squadjs2/test/raffle.test.js`
- Modify: `squadjs2/squad-server/plugins/raffle.js`
- Modify: `squadjs2/docs/raffle.md`

- [ ] Add a failing test that completes a raffle with participants containing `eosID`, `steamID`, `name`, and `joinedAt`, then asserts:

```js
assert.deepEqual(snapshot.history[0].participants[0], {
  name: 'Player',
  joinedAt: snapshot.history[0].participants[0].joinedAt
});
assert.equal('eosID' in snapshot.history[0].winner, false);
assert.equal('steamID' in snapshot.history[0].winner, false);
assert.equal(server.rcon.warns.at(-1).eosID, 'player-eos');
```

- [ ] Run `node --test test/raffle.test.js` and confirm the test fails because IDs are present in the public snapshot.
- [ ] Add a `buildPublicParticipant()` helper that returns only normalized `name` and `joinedAt`, and apply it to `participants`, `winner`, and `startedBy` in `buildHistorySnapshot()`.
- [ ] Run `node --test test/raffle.test.js` and the complete `node --test test/*.test.js` suite.
- [ ] Update `docs/raffle.md` to state that public history intentionally omits player identifiers.

### Task 2: Lock the frontend privacy and participant-list behavior

**Files:**
- Modify: `autoseed/tests/e2e/app.spec.ts`
- Modify: `autoseed/src/types.ts`
- Modify: `autoseed/src/lib/snapshot.ts`

- [ ] Add a failing Playwright test that opens `/#winners`, expands the first `Участники (2)` disclosure, and asserts:

```ts
await expect(page.getByTestId('winner-participants-12')).toContainText('Winner One');
await expect(page.getByTestId('winner-participants-12')).toContainText('Runner Up');
await expect(page.locator('body')).not.toContainText('76561198000000001');
await expect(page.locator('body')).not.toContainText('winner-eos');
await expect(page.locator('body')).not.toContainText('discord-user-42');
```

- [ ] Run the focused test and confirm it fails because the disclosure does not exist.
- [ ] Narrow `ExporterRaffleParticipantSnapshot` to `name` and `joinedAt`.
- [ ] Keep parsing backward-compatible payloads, but make `mapRaffleParticipant()` return only those public fields.
- [ ] Run the focused test far enough to confirm the remaining failure is the missing UI.

### Task 3: Render participant nicknames in each history entry

**Files:**
- Modify: `autoseed/src/App.tsx`
- Modify: `autoseed/src/styles.css`
- Modify: `autoseed/tests/e2e/app.spec.ts`

- [ ] Add a `details` element to every `winner-row`:

```tsx
<details className="winner-participants" data-testid={`winner-participants-${entry.id}`}>
  <summary>Участники ({entry.participants.length})</summary>
  {entry.participants.length ? (
    <ul>{entry.participants.map((participant) => <li>{participant.name}</li>)}</ul>
  ) : (
    <p>Участников не было.</p>
  )}
</details>
```

- [ ] Use a stable key derived from the participant name and `joinedAt`, without IDs.
- [ ] Add restrained disclosure/list styling with `overflow-wrap: anywhere` and no nested card surface.
- [ ] Run the focused Playwright test and confirm it passes.
- [ ] Add an empty-participant assertion and a long-nickname mobile overflow assertion.

### Task 4: Update contract documentation and verify locally

**Files:**
- Modify: `autoseed/docs/setup.md`
- Modify: `autoseed/docs/autoseed-tz.md`

- [ ] Document the public participant shape and the expandable history list.
- [ ] Run `npm run build`.
- [ ] Run `npx playwright test`.
- [ ] Start the local app and verify `/#winners` at `1440x1000` and `390x844`: disclosure interaction, nickname-only DOM, no console warnings/errors, no overlay, no horizontal overflow.

### Task 5: Publish backend and frontend

**Files:**
- Modify: GitHub issue `breaking-squad/autoseed#6`
- Comment: GitHub issue `breaking-squad/squadjs2#28`

- [ ] Review both diffs and run fresh backend/frontend verification.
- [ ] Commit and push the `squadjs2` change to `master`; wait for the Docker workflow.
- [ ] Redeploy production SquadJS services and confirm public snapshots omit participant IDs.
- [ ] Commit and push `autoseed` to both repositories; wait for public `Deploy Pages` and private `skipped`.
- [ ] Verify production `/#winners` on desktop/mobile.
- [ ] Record deployment evidence, move `autoseed#6` to `Done`, and add the privacy-contract result to `squadjs2#28`.
