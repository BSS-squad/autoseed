# User-Friendly Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace technical user-facing terminology across AutoSeed with the approved plain Russian vocabulary without changing API contracts or application behavior.

**Architecture:** Keep the existing React structure and internal names. Lock visible copy through Playwright assertions, then edit only rendered strings in `App.tsx`, the startup fallback in `main.tsx`, and public page metadata in `index.html`.

**Tech Stack:** React 19, TypeScript, Vite, Playwright.

---

### Task 1: Lock the approved vocabulary with failing tests

**Files:**
- Modify: `tests/e2e/app.spec.ts`

- [ ] Add a helper that checks rendered text against the banned user-facing terms:

```ts
async function expectPlayerFriendlyLanguage(page: Page) {
  const visibleText = await page.locator('body').innerText();
  expect(visibleText).not.toMatch(
    /\b(snapshot|raffle|exporter|endpoint)\b|снимок|экспортер|коннектор|текущая цель|боевой режим/i
  );
}
```

- [ ] Add home-page assertions for `Обычный`, `Автоподключение`, `Выбранный сервер`, `Обновлено` and `Связь с серверами`.
- [ ] Add winners-page assertions for `Розыгрыши BSS`, the plain source description, `по московскому времени` and the plain empty state.
- [ ] Run `npx playwright test tests/e2e/app.spec.ts --grep "player-friendly language"`.
- [ ] Confirm RED failures point to the old visible vocabulary.

### Task 2: Replace visible copy without changing internal contracts

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Modify: `index.html`

- [ ] Replace rendered `Raffle`, `snapshot`, `снимок`, `exporter`, `endpoint`, `коннектор`, `цель` and `Боевой режим` strings with the approved vocabulary.
- [ ] Change campaign time copy to `по московскому времени` for the configured `+180` minute offset and `по времени организаторов` for other offsets.
- [ ] Expand raffle source labels to `запущен автоматически` and `запущен администратором`.
- [ ] Keep internal identifiers such as `snapshot`, `raffles`, `exporters`, routes and `data-testid` unchanged.
- [ ] Run the focused Playwright test and confirm GREEN.

### Task 3: Update existing expectations and inspect all visible states

**Files:**
- Modify: `tests/e2e/app.spec.ts`

- [ ] Update existing assertions that intentionally referenced the previous copy.
- [ ] Exercise the normal home page, winners with campaign data, winners empty state and the autoconnect popup.
- [ ] Run `npx playwright test` and fix only copy-related regressions.

### Task 4: Verify rendered layout

**Files:**
- Modify only if QA finds a real layout issue: `src/styles.css`

- [ ] Run `npm run build`.
- [ ] Start the Vite app on an unused local port.
- [ ] Check `/#winners` and the home screen at `1440x1000` and `390x844` with Playwright.
- [ ] Confirm page identity, meaningful content, no framework overlay, no console error/warn, no horizontal overflow and no clipped replacement text.

### Task 5: Publish and update the roadmap

**Files:**
- Modify: GitHub issue `breaking-squad/autoseed#5`

- [ ] Review the final diff and run fresh build/e2e verification.
- [ ] Commit the implementation, integrate it into `main`, and push both `breaking-squad/autoseed` and `BSS-squad/autoseed`.
- [ ] Wait for the public `Deploy Pages` workflow; confirm the private mirror skips Pages.
- [ ] Verify production copy on desktop/mobile.
- [ ] Move issue #5 to `Review` with deployment evidence and a concrete next action.
