# AutoSeed

Статический frontend для автоконнектора Squad и набор документов по интеграции с публичным exporter-плагином для `SquadJS`.

## Актуальное состояние

- frontend полностью статический и публикуется через GitHub Pages;
- exporter публикуется отдельно через `https://api.squad.leo-land.ru/squadjs1/v1/autoseed`, `https://api.squad.leo-land.ru/squadjs2/v1/autoseed` и `https://api.squad.leo-land.ru/squadjs3/v1/autoseed`;
- exporter отдаёт `healthz` и расширенный `snapshot` с общим онлайном, составом сторон, squad-структурой и часами из `PlaytimeTracker`;
- `joinLink` больше не живёт в snapshot: frontend запрашивает его у exporter-а только по факту redirect/direct join, а exporter уже делает lookup в `Squadbrowser API` по exact server name;
- policy живёт только во frontend runtime-config;
- текущий приоритет выбора: ночью `serverId=2`, днём `1 -> 2 -> 3` (`Mix -> Spec Ops -> Invasion`).

## Что реализовано

- frontend на Vite + React c GitHub Pages deployment;
- runtime-конфиг через `public/runtime-config.json`;
- fully-static архитектура без backend и без Steam auth;
- realtime-подписка на публичные exporter endpoint-ы через `SSE /events`;
- просмотр онлайна серверов, состава сторон и баланса часов по игрокам;
- выбор target server по frontend policy: ночному окну, приоритетам, лимиту онлайна и `switchDelta`;
- опциональный test-sequence через runtime-config, например `1 -> 2 -> 3` с задержкой `60 s`;
- хранение `enabled`, `lastProcessedTimestamp`, `cooldown` и permissions в `localStorage`;
- локальный preflight-check на странице: popup, `steam://`, и явная подсказка оставить Squad в главном меню;
- redirect через служебное popup-окно для автосценариев, чтобы страница не теряла состояние и могла выполнить follow-up redirect; ручное прямое подключение открывает `steam://` в текущей вкладке, как SquadBrowser;
- опциональная публичная ссылка на внешний VIP purchase flow через `app.vipShopUrl`;
- документация по настройке frontend, exporter-а и `Squadbrowser` join-link lookup.

## Локальный запуск

```bash
npm install
npm run dev
```

По умолчанию `prebuild` создаёт `public/runtime-config.json` из `AUTOSEED_RUNTIME_CONFIG_JSON`. Если переменная не передана, он копирует `public/runtime-config.example.json`.

## Runtime config

`baseUrl` должен указывать не просто на host, а на публичный exporter-prefix. Frontend сам использует `GET {baseUrl}/snapshot` для ручного refresh, `GET {baseUrl}/events` для realtime-подписки и `GET {baseUrl}/join-link` только по факту redirect/direct join.

Файл `public/runtime-config.json` должен содержать:

```json
{
  "app": {
    "title": "BSS AutoConnect"
  },
  "policy": {
    "timezone": "Europe/Moscow",
    "nightWindowStart": "23:00",
    "nightWindowEnd": "08:00",
    "nightPreferredServerId": 2,
    "maxSeedPlayers": 80,
    "priorityOrder": [1, 2, 3],
    "switchDelta": 10,
    "cooldownMs": 600000
  },
  "exporters": [
    {
      "name": "squadjs1",
      "baseUrl": "https://api.squad.leo-land.ru/squadjs1/v1/autoseed"
    },
    {
      "name": "squadjs2",
      "baseUrl": "https://api.squad.leo-land.ru/squadjs2/v1/autoseed"
    },
    {
      "name": "squadjs3",
      "baseUrl": "https://api.squad.leo-land.ru/squadjs3/v1/autoseed"
    }
  ]
}
```

`exporters[].name` здесь только служебная метка endpoint-а для ошибок. Отображаемое название сервера frontend берёт из `snapshot.servers[].name`, а exporter заполняет его из `ShowServerInfo`.

Опционально можно добавить `app.vipShopUrl` с абсолютным `http`/`https` URL внешнего VIP-сервиса:

```json
{
  "app": {
    "title": "BSS AutoConnect",
    "vipShopUrl": "https://vip.example.com"
  }
}
```

Если URL не задан или не является `http`/`https`, ссылка в навигации не показывается. Покупка, Steam auth, wallet ledger и purchase state остаются во внешнем VIP-сервисе; `autoseed` только ведет игрока на этот публичный entrypoint.

При необходимости можно добавить отдельный `app.testMode`:

```json
{
  "sequenceServerIds": [1, 2, 3],
  "delayMs": 60000,
  "cooldownMs": 30000
}
```

Порядок `[1, 2, 3]` соответствует ротации `Mix -> Spec Ops -> Invasion`. Тогда в интерфейсе появится отдельный тестовый режим, который не подменяет боевой. При включении тестового режима первый redirect запускается сразу, а `delayMs` относится только к follow-up hop. Задержку follow-up можно локально перекрыть прямо на странице; значение сохраняется в `localStorage` и не меняет общий runtime-config для остальных пользователей.

Важно: это публичный клиентский конфиг. Даже если он подставляется через GitHub Secrets, после билда значения становятся видимыми в браузере. Не кладите туда приватные ключи.

Frontend не знает пользователя, не хранит `steamId` и не обращается к Steam OpenID. Exporter отдаёт только факты по серверам, а все правила выбора живут во frontend runtime-config. Это общий autoconnect на правильный seed-сервер по публичному правилу.

## Squadbrowser Join Link

Локальный файл [docs/squadbrowser-openapi.json](./docs/squadbrowser-openapi.json) описывает ручку `POST /pub/join-link`. Exporter в `squadjs2` умеет:

- брать exact server name из SquadJS;
- звать `Squadbrowser API` с `x-api-key`;
- держать `GET {baseUrl}/join-link` как on-demand lookup;
- не кешировать и не дедуплицировать lookup в нашем слое: каждый запрос подключения должен заново сходить в `Squadbrowser API`;
- не считать разные запросы гарантией разных URL: `Squadbrowser API` может возвращать один и тот же стабильный `steam://joinlobby/...` для активного server lobby;
- не поллить `Squadbrowser API` из `snapshot`/`events`;
- возвращать ошибку, если `Squadbrowser API` не вернул валидный lobby link.

Для включения этого пути на стороне SquadJS нужен:

- `SQUADBROWSER_API_KEY`

По умолчанию exporter ходит в `https://api.squadbrowser.app/api`. При необходимости URL можно переопределить опцией `squadbrowserApiBaseUrl`, но для обычного деплоя это не требуется.

## Быстрый тест

Перед проверкой GitHub Pages убедитесь, что exporter отвечает:

- `https://api.squad.leo-land.ru/squadjs1/v1/autoseed/healthz`
- `https://api.squad.leo-land.ru/squadjs1/v1/autoseed/snapshot`
- `https://api.squad.leo-land.ru/squadjs1/v1/autoseed/join-link`
- `https://api.squad.leo-land.ru/squadjs2/v1/autoseed/healthz`
- `https://api.squad.leo-land.ru/squadjs2/v1/autoseed/snapshot`
- `https://api.squad.leo-land.ru/squadjs2/v1/autoseed/join-link`
- `https://api.squad.leo-land.ru/squadjs3/v1/autoseed/healthz`
- `https://api.squad.leo-land.ru/squadjs3/v1/autoseed/snapshot`
- `https://api.squad.leo-land.ru/squadjs3/v1/autoseed/join-link`

Дальше:

1. Обновите secret `AUTOSEED_RUNTIME_CONFIG_JSON`.
2. Дождитесь успешного workflow `Deploy Pages`.
3. Откройте GitHub Pages URL.
4. Пройдите preflight-check на странице.
5. Держите Steam и Squad открытыми, Squad в главном меню.
6. Включите автоконнектор и дождитесь нового snapshot.

## GitHub Pages

CI workflow лежит в `.github/workflows/deploy-pages.yml`.

1. В `Settings -> Pages` включите `GitHub Actions`.
2. Создайте secret `AUTOSEED_RUNTIME_CONFIG_JSON` и положите туда итоговый JSON-конфиг frontend-а.
3. При необходимости создайте variable `VITE_BASE_PATH`, если сайт публикуется не из корня домена.
4. Пуш в `main` соберёт сайт и выложит его на Pages.

## Документация

- [README.md](./README.md)
- [docs/autoseed-tz.md](./docs/autoseed-tz.md)
- [docs/setup.md](./docs/setup.md)
- [docs/superpowers/specs/2026-07-05-exporter-autoseed-switching-design.md](./docs/superpowers/specs/2026-07-05-exporter-autoseed-switching-design.md)
