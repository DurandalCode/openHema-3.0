# Plan: Пульт турнира и прогноз очереди

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-08-29
- Спека: `./spec.md`

## Обзор решения

**Нового модуля не появляется.** Все данные, из которых считается оценка,
уже собирает модуль `stage`: он владеет пулами и их привязкой к площадке
(`stage.pools.arena_id`), читает журнал боёв (`bout.bout_events` через
`BoutConductor`), резолвит площадки и номинации через порты `ArenaProvider`/
`NominationProvider` и уже отдаёт три агрегата — `GetArenaBoards` и
`ListStagesForTournament` (0041), `GetTournamentLive` (0034). Пульт — четвёртый
агрегат того же сервиса, прогноз — обогащение существующих проекций.

Три несущих решения:

1. **Оценка — чистая функция без состояния.** Новый пакет
   `modules/stage/domain/pace.go` (не отдельный `pkg/`: типы оценки —
   доменные, они уходят в контракт и в тесты сервиса). Вход — отметки
   «бой начат» текущего пула, дефолт площадки, наблюдения турнира; выход —
   `PaceEstimate{TickSeconds, SampleCount, Provisional}` и
   `BoutForecast{ExpectedStartAt, BoutsAhead, Imminent}`. Ничего не пишет и
   не хранит (спека FR-8) — тестируется юнитами на таблицах.
2. **Единственный новый персистентный факт — момент освобождения площадки.**
   Колонка `arena.arenas.last_freed_at`, владелец — модуль `arena`,
   проставляется из `stage.UnseatPool` через расширенный порт
   `ArenaProvider.MarkFreed`. Ни истории посадок, ни таблицы простоя (спека
   «Вне скоупа»).
**Почтового канала у прогноза пока нет.** ADR 0017 (п. 5.4) предполагала
письмо «ваш бой примерно через N минут»; решением пользователя 2026-08-29
оно выведено из этой спеки — отложено, не отменено (спека, «Вне скоупа»).
Практическое следствие для плана: `Notifier`,
`pkg/notify`, `NotificationSettings` и модули `auth`/`tournament` этой спекой
**не трогаются вовсе** — межмодульная поверхность сужается до `stage → arena`
и `stage → bout`.

Живой канал не изобретается: пульт едет тем же in-process broadcaster'ом
(ADR 0012), что публичная сводка турнира, — новая тема `console:<id>` рядом
с `tournament:<id>`.

**Требуется своя ADR** — `docs/adr/0020-operational-estimation.md` (модель
операционной оценки: почему медиана, почему окно 5/20, почему темп
привязан к текущему пулу, а не к площадке, что модель заведомо не знает и
почему у прогноза пока нет почтового канала — она же фиксирует вывод
п. 5.4 ADR 0017 из этой спеки). ADR 0017 эту ADR и предсказывает. **Написана 2026-08-29** — T1
чеклиста закрыт.

## Контракты (proto)

Меняется **один файл** — `proto/hema/v1/stage.proto`. `common.proto`,
`auth.proto` и `tournament.proto` остаются как есть.

### `proto/hema/v1/stage.proto`

Новые сообщения оценки (общие для admin и public):

- `PaceEstimate` — `int32 tick_seconds`, `int32 sample_count`,
  `bool provisional` (FR-5).
- `BoutForecast` — `google.protobuf.Timestamp expected_start_at`,
  `int32 bouts_ahead`, `bool provisional`, `bool imminent` (FR-6/FR-7).
  Отсутствие прогноза выражается незаполненным сообщением, а не нулевым
  временем (FR-24) — та же семантика, что у `LiveFeedBout.started_at`.

Обогащение существующих проекций:

- `LiveFeedBout` — `+ BoutForecast forecast = 17` (FR-20, публичная лента
  главной; она же питает карточку кабинета «Ваш следующий бой», 0038).
- `LiveArena` — `+ BoutForecast next_bout_forecast = 12` (FR-21).
  Простой сюда **не добавляется** (FR-29 — публично его нет).
- `BoardBout` — `+ BoutForecast forecast = N` (FR-22: публичная страница
  номинации через `LivePool.bouts`; тот же тип питает admin-доску).
- `ArenaBoardEntry` (0041) — `+ ArenaIdleState idle_state`,
  `+ google.protobuf.Timestamp free_since` (FR-28/FR-29: доска площадок
  админки).

Новый enum состояния простоя:

```
enum ArenaIdleState {
  ARENA_IDLE_STATE_UNSPECIFIED = 0;
  ARENA_IDLE_STATE_OCCUPIED = 1;            // пул стоит
  ARENA_IDLE_STATE_WAITING_FIRST_POOL = 2;  // ни разу не ставили
  ARENA_IDLE_STATE_FREE = 3;                // сняли, free_since заполнен
}
```

Лента внимания:

```
enum ConsoleAlertKind {
  CONSOLE_ALERT_KIND_UNSPECIFIED = 0;
  CONSOLE_ALERT_KIND_ARENA_IDLE = 1;              // FR-15.1
  CONSOLE_ALERT_KIND_BOUT_STUCK = 2;              // FR-15.2
  CONSOLE_ALERT_KIND_POOL_NOT_STARTED = 3;        // FR-15.3
  CONSOLE_ALERT_KIND_POOL_DONE_NOT_UNSEATED = 4;  // FR-15.4
  CONSOLE_ALERT_KIND_NEXT_STAGE_NOT_BUILT = 5;    // FR-15.5
  CONSOLE_ALERT_KIND_NOMINATION_STALLED = 6;      // FR-15.6
}
```

Пульт — новые сообщения и RPC в `StageAdminService`:

- `ConsoleArena` — `arena_id`, `arena_name`, `position`, `ArenaIdleState
  idle_state`, `free_since`, `nomination_id/name`, `stage_title`,
  `pool_name`, `pool_id`, `BoardBout current_bout`, `int32 bout_total`,
  `int32 bout_finished`, `PaceEstimate pace`,
  `Timestamp pool_expected_finish_at` (FR-11).
- `ConsoleNomination` — `nomination_id`, `title`, `position`,
  `LiveNominationPhase phase`, `current_stage_title`, `bout_total`,
  `bout_finished`, `int32 bout_remaining_unseated`,
  `Timestamp expected_finish_at`, `bool provisional` (FR-12).
- `ConsoleQueueItem` — `pool_id`, `nomination_id/name`, `stage_title`,
  `pool_name`, `int32 bout_count`, `int32 estimated_seconds` (FR-13).
- `ConsoleAlert` — `ConsoleAlertKind kind`, `Timestamp since`,
  `arena_id/arena_name`, `nomination_id/nomination_name`, `pool_id`,
  `pool_name`, `bout_id` (заполняются те, что осмысленны для вида; FR-14).
- `TournamentConsoleSnapshot` — `tournament_id`, `repeated ConsoleArena
  arenas`, `repeated ConsoleNomination nominations`, `repeated
  ConsoleQueueItem queue`, `repeated ConsoleAlert alerts`,
  `int64 server_now_unix_ms`.
- `rpc GetTournamentConsole(GetTournamentConsoleRequest) returns
  (GetTournamentConsoleResponse)` — RequireAdmin, одно обращение (FR-19).
- `rpc WatchTournamentConsole(WatchTournamentConsoleRequest) returns
  (stream WatchTournamentConsoleResponse)` — RequireAdmin, первый кадр —
  снапшот, дальше — при изменениях (FR-18), по образцу
  `WatchTournamentLive`.

`arena.proto`: `Arena` **не расширяется**. Простой — операционная проекция,
её место в `ArenaBoardEntry`/`ConsoleArena`, а не в карточке площадки
(CRUD-экран площадок про простой ничего не знает).

## Server (модули и слои)

### `modules/stage` — основной объём

- `domain/pace.go` (**новый файл**) — модель оценки:
  - `PaceEstimate`, `BoutForecast`, `PaceSample` (интервал между началами).
  - `ComputePace(samples []time.Duration, fallbackTournament PaceEstimate,
    arenaDefault time.Duration) PaceEstimate` — медиана окна 5, порог 3,
    каскад резервов (FR-1..FR-4). Константы окон/порогов — здесь, рядом с
    формулой: `paceWindow = 5`, `tournamentWindow = 20`, `minSamples = 3`,
    `interBoutPause = 60 * time.Second`.
  - `ForecastPool(bouts []BoardBout, pace PaceEstimate, now,
    currentStartedAt time.Time) map[boutID]BoutForecast` — FR-6/FR-7,
    включая `Imminent` вместо отрицательного интервала.
- `domain/alerts.go` (**новый файл**) — `ConsoleAlert`, `ConsoleAlertKind`,
  `DetectAlerts(snapshot ConsoleInput, now time.Time) []ConsoleAlert`.
  Пороги — константы файла (FR-15): `idleThreshold = 3m`,
  `boutStuckThreshold = 15m`, `poolNotStartedThreshold = 10m`,
  `poolDoneThreshold = 5m`, `nominationStalledThreshold = 15m`. Чистая
  функция над уже собранным входом — юнит-тесты на таблицах, без БД.
- `domain/domain.go`:
  - `ArenaRef` — `+ LastFreedAt *time.Time` (заполняется `ActiveArenas`).
  - `ArenaProvider` — `+ MarkFreed(ctx, arenaID string) error` (FR-27).
  - `BoutConductor` — `+ StartedAtByBouts` (отметки начала для наблюдений
    темпа; сам запрос живёт в модуле `bout`, см. ниже).
  - Ошибки новых RPC переиспользуют существующие (`ErrTournamentNotActive`).
- `service/console.go` (**новый файл**) — `GetTournamentConsole`: собирает
  вход из уже существующих сборщиков (`stage_aggregates.go` — площадки,
  `tournament_live.go` — номинации, `GetPoolsForArena`-логика — очередь),
  считает `pace`/`forecast`/`alerts` доменными функциями. **Одно
  прохождение по данным**, без запроса на площадку (NFR-2).
- `service/tournament_live.go` — обогащение `LiveFeedBout.Forecast` и
  `LiveArena.NextBoutForecast` (FR-20/FR-21) той же доменной функцией.
- `service/arena_room.go` / `stage_aggregates.go` — `ArenaIdleState` и
  `free_since` в `ArenaBoardEntry`; прогноз в `BoardBout`.
- `service/service.go` — единственная правка: `UnseatPool` зовёт
  `ArenaProvider.MarkFreed` после успешного снятия и **до** публикации
  живого кадра (иначе первый кадр после снятия уйдёт без `free_since`).
  Мутации боя (`Start/Finish/Score/Set/Reopen/Reset CurrentBout`) не
  меняются вовсе — прогноз считается на чтение, побочных эффектов у него
  нет.
- `repo/queries/pace.sql` (**новый файл**):
  - `PaceSamplesForPool :many` — `occurred_at` событий `started` боёв пула,
    по возрастанию, лимит окна+1 с конца.
  - `PaceSamplesForTournament :many` — то же по всем пулам активного
    турнира, лимит 21.
  - Обе читают `bout.bout_events` — **кросс-схемное чтение внутри одного
    запроса запрещено (ADR 0002)**, поэтому доступ идёт через порт
    `BoutConductor` модуля `stage` → `bout` (уже существует, см.
    `internal/platform/stage_bout_conductor.go`); запросы физически живут в
    `modules/bout/repo/queries/pace.sql`, а `stage` получает их через
    расширенный порт `BoutConductor.StartedAtByPool/ByBouts`.

### `modules/arena`

- `domain/domain.go` — `Arena` `+ LastFreedAt *time.Time`; порт
  `Repository` `+ MarkFreed(ctx, id string, at time.Time) error`.
- `service/service.go` — `MarkFreed(ctx, id)`: проставляет `now()`,
  идемпотентно (повторный вызов просто обновляет момент — снятие происходит
  один раз, гонки здесь нет).
- `repo/queries/arenas.sql` — `MarkArenaFreed :exec`.
- `migrations/00003_last_freed_at.sql`:

  ```sql
  -- Момент последнего освобождения площадки (спека 0043, FR-26) — тот
  -- самый факт, из-за отсутствия которого 0027 и 0033 отказались от
  -- «Свободна · 4 мин». NULL = площадку ни разу не освобождали: вместе с
  -- «пула нет» это состояние «ждёт первый пул» (FR-28), вместе с «пул
  -- стоит» — обычная занятая площадка. Одна nullable-колонка вместо
  -- истории посадок: история явно вне скоупа (ADR 0017).
  ALTER TABLE arena.arenas ADD COLUMN last_freed_at TIMESTAMPTZ NULL;
  ```

### `modules/bout`

- `domain` — порт `Repository` `+ StartedAtByBouts(ctx, boutIDs []string)
  (map[string]time.Time, error)`: моменты первых событий `started`.
- `repo/queries/pace.sql` — `StartedAtByBouts :many`: по `bout_id IN (...)`,
  `event_type = 'started'`, `MIN(occurred_at)` (переоткрытие/сброс дают
  несколько `started` — берётся первый; повторный старт после `reopened`
  темпа не искажает).
- `api` — публичного RPC не появляется: доступ только внутренний, через
  порт (тот же приём, что `BoutConductor`).

### `internal/platform`

- `stage_arena_provider.go` — реализация `MarkFreed`; `ActiveArenas`
  прокидывает `LastFreedAt`.
- `stage_bout_conductor.go` — `StartedAtByBouts`.
- `stage_live_bus.go` — тема `console:<tournamentID>`.
- `platform.go` — регистрация нового RPC не требует новых модулей.

### Межмодульные зависимости

Новых направлений не появляется, и после отказа от письма их всего два:
`stage → arena` (`MarkFreed`, `LastFreedAt`) и `stage → bout`
(`StartedAtByBouts`) — оба поверх уже существующих портов. Прямых обращений
к чужим схемам нет (ADR 0002).

## Web (FSD + BFF)

### BFF (Route Handlers, Node runtime)

- `app/api/admin/console/route.ts` — GET → `GetTournamentConsole`.
- `app/api/admin/console/stream/route.ts` — SSE → `WatchTournamentConsole`
  (по образцу существующего стрима сводки турнира).
- Существующие ручки сводки/досок/номинации отдают обогащённые типы без
  изменения формы маршрутов.

### Слои

- `entities/arena/lib/types.ts` — `ArenaIdleState`, `freeSince`.
- `features/tournament-console/` (**новая фича**):
  - `api/` — `requests.ts`, `keys.ts`, RQ-хук `useTournamentConsole` + SSE-
    подписка (тот же паттерн, что `features/tournament-live`).
  - `ui/` — `console-arena-card.tsx`, `console-nomination-row.tsx`,
    `console-queue-list.tsx`, `attention-feed.tsx`, `alert-row.tsx`.
  - `model/` — не нужен: экран без собственного UI-состояния, кроме
    фильтра ленты (`useState`).
- `features/tournament-live/`, `features/nomination-live/`,
  `features/arena-management/` — проброс прогноза и простоя в существующие
  проекции.
- `shared/ui/` — `forecast-time.tsx`: единственное место, которое
  форматирует «ориентировочно 11:20 · через ~14 мин · вот-вот» и рисует
  пометку «предварительно». Ни один экран не форматирует прогноз сам
  (NFR-1, FR-4).
- `widgets/tournament-console/console-screen.tsx` — композиция.
- `widgets/home/*`, `widgets/nomination-public/*`,
  `widgets/dashboard/next-bout-card.tsx` — показ прогноза (FR-20..FR-24).
- `widgets/admin-shell/admin-nav-links.tsx` — пункт **«Пульт»** первым в
  навигации: это экран, на котором оператор проводит турнир.
- `app/(admin)/admin/console/page.tsx` — серверный компонент, SSR-снапшот +
  клиентское подключение к SSE (паттерн 0034/0033).

### Server components vs client

Страница пульта — server component, тянет первый снапшот на SSR (как
главная в 0034) и передаёт его в клиентский виджет, который дальше живёт на
SSE и падает на polling. Все карточки — presentational, без запросов.

### State

Server-state → TanStack Query + SSE-инвалидация (ADR 0006); UI-state
(фильтр ленты) → `useState`; Zustand не нужен.

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей).

- Издаёт: нет. Оценка считается на чтение и побочных эффектов не имеет —
  издавать нечего. Отказ от прогнозного письма (спека, «Вне скоупа») убрал
  единственное место, где спеке понадобился бы триггер.
- Потребляет: нет.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит (`domain/`, без БД)** — основной вес спеки:
  - `pace_test.go` — таблицы: медиана нечётного/чётного окна, окно длиннее
    истории, ровно порог 3, каскад «пул → турнир → дефолт», признак
    `Provisional` на каждом уровне, устойчивость медианы к одному выбросу.
  - `forecast_test.go` — отсчёт от идущего боя и от `now`, `BoutsAhead`,
    `Imminent` при прошедшем расчётном времени, пустой прогноз у
    непоставленного пула (FR-9/FR-24).
  - `alerts_test.go` — шесть видов, каждый: порог не достигнут → записи
    нет; порог перейдён → запись с верным `since`; условие снято → записи
    нет (AC-15).
- **Юнит (`service/` с fake-репо и fake-портами)**:
  - `console_test.go` — сборка снапшота: все площадки в ответе, очередь без
    стоящих пулов, номинация с непоставленными пулами отдаёт остаток числом
    без времени.
  - `unseat_test.go` — `UnseatPool` зовёт `MarkFreed` ровно один раз; при
    отказе снятия не зовёт.
- **E2E ручек (`api/` через httptest + Connect, fake-репо)**:
  - `GetTournamentConsole` — счастливый путь, `RequireAdmin` → `Unauthorized`
    гостю и `PermissionDenied` не-админу, неактивный турнир →
    `FailedPrecondition`.
  - `WatchTournamentConsole` — первый кадр = снапшот.
  - `GetArenaBoards` — `idle_state`/`free_since` в ответе.
- **Интеграционные с БД (testcontainers)**: `MarkArenaFreed` (проставление
  и чтение `last_freed_at`, идемпотентность повторного вызова);
  `StartedAtByBouts` с несколькими `started` у переоткрытого боя — берётся
  первый.
- **Web (Vitest)**:
  - `forecast-time.test.tsx` — «ориентировочно 11:20», «через ~14 мин»,
    «вот-вот», пометка «предварительно», прочерк при пустом прогнозе.
  - `attention-feed.test.tsx` — шесть видов рендерятся, у каждого верный
    переход.
  - `console-screen.test.tsx` — SSR-снапшот, пустой турнир без падения.
  - `next-bout-card.test.tsx` — дополнение существующих кейсов 0038: время
    при поставленном пуле, «вы следующий», объяснение при непоставленном.
  - BFF-тесты новых маршрутов (mock connect, маппинг кодов в HTTP).

## Риски и открытые вопросы

- **Качество оценки на старте пула.** Пока в пуле <3 наблюдений, оценка
  идёт по темпу турнира — на первом турнире это дефолт площадки, заведомо
  оптимистичный. Смягчение — честная пометка «предварительно» (FR-4) и
  формулировки «ориентировочно» (NFR-1). Риск принят спекой, не устраняется
  реализацией.
- **Зависший бой отравляет темп.** Бой, который забыли завершить, даёт
  один огромный интервал. Медиана окна 5 его переживает (один выброс из
  пяти), а сам зависший бой попадает в ленту внимания (FR-15.2) — два
  механизма прикрывают друг друга. Если на практике выбросов окажется
  больше одного за окно, следующим шагом — отсечка интервалов сверху, но
  вводить её вперёд наблюдений не стоит.
- **Стоимость сборки пульта.** Снапшот трогает все площадки, все
  номинации и очередь готовых пулов. Опасность — вернуться к N+1 через
  резолв имён. Держать сборку на существующих батч-путях
  (`ArenasByIDs`/`NominationsByIDs`) и покрыть тестом «одно обращение»
  (AC-8).
- **Точка вызова `MarkFreed` и живой кадр.** `UnseatPool` должен
  проставить момент **до** публикации кадра, иначе первый кадр после
  снятия покажет площадку без `free_since`. Проверяется тестом сервиса.
- **`ArenaIdleState` в `ArenaBoardEntry`, а не в `Arena`** — если позже
  понадобится простой на CRUD-экране площадок, решение придётся
  пересмотреть; сейчас смешивать операционную проекцию с карточкой
  сущности незачем.

## Как построено на самом деле (T1–T26 пройдены)

Расхождения с этим планом, обнаруженные и принятые при реализации —
каждое зафиксировано doc-комментарием на месте, здесь только сводка:

- **Живой канал пульта переиспользует существующий топик
  `SubscribeTournament`** (0034), а не заводит отдельную тему `console:*`.
  Причина: каждая мутация, влияющая на пульт, уже публикует
  `PublishTournamentChanged` рядом с сигналом номинации
  (`notifyNominationChanged`) — второй синхронный канал не добавил бы
  пользы. См. `AdminHandler.WatchTournamentConsole`.
- **BFF-путь — `/api/tournaments/[id]/console` и `.../console/stream`**,
  не `/api/admin/console/*` — под реальную конвенцию соседнего
  `arena-boards` (0041), обнаруженную при чтении кода, а не под
  изначальную догадку плана.
- **Экран пульта — `features/tournament-console/ui/console-screen.tsx`**,
  без отдельного `widgets/tournament-console/`: `widgets/` в этой кодовой
  базе заводится только для композиции нескольких фич (см.
  `features/arena-management/ui/arenas-screen.tsx` → `arenas/page.tsx`
  напрямую, тот же паттерн).
- **Нет `requests.ts`/`keys.ts`/TanStack Query у фичи пульта** — живой
  push-канал (SSE + polling-fallback) идёт мимо RQ, тем же приёмом, что
  уже использует сосед `useTournamentLive` (0034); ADR 0006 явно допускает
  этот случай.
- **Два из шести видов ленты внимания не подают условие срабатывания**:
  `POOL_NOT_STARTED` и `NOMINATION_STALLED` требуют момента фиксации
  состояния (когда пул поставлен / когда раскладка стала ready), которого
  `domain.Pool`/`domain.Stage` сегодня не отдают ни на одном пути чтения
  (колонка `updated_at` есть в БД, не выведена в Go-типы). Сама модель
  (`domain.DetectAlerts`) реализована и протестирована полностью
  (Track A, `alerts_test.go`) — не хватает только входных данных для этих
  двух видов. Заводить их потребовало бы правки пяти+ SQL-запросов пула и
  семи+ запросов этапа — отдельный, самостоятельный инкремент, не часть
  этого прохода. См. doc-комментарий `service.GetTournamentConsole`.
