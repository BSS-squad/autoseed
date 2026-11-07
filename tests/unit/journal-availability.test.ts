import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('журнал отличает недоступную историю от пустой', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { JournalWorkspace } = await vite.ssrLoadModule('/src/journal/JournalWorkspace.tsx');
    const server = { id: 1, code: 'squadjs1', name: 'Server', online: true,
      activity: { historyAvailable: false, sessions: [], recentRounds: [], topWindow: null } };
    const unavailable = renderToStaticMarkup(React.createElement(JournalWorkspace, { servers: [server] }));
    assert.match(unavailable, /История временно недоступна/);
    assert.doesNotMatch(unavailable, /Завершённых матчей ещё нет|0 матчей/);
    server.activity.historyAvailable = true;
    const empty = renderToStaticMarkup(React.createElement(JournalWorkspace, { servers: [server] }));
    assert.match(empty, /Завершённых матчей ещё нет/);
    assert.match(empty, /0 матчей/);
  } finally {
    await vite.close();
  }
});
