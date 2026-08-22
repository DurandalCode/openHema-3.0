# Plan: Редизайн публичной главной — афиша до старта и живой турнир

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: ready
- Дата: 2026-08-22
- Спека: `./spec.md`

## Обзор решения

Две несвязанные половины.

**Server** — одна новая публичная живая сводка турнира в существующем
`StagePublicService`: `GetTournamentLive` (unary, SSR-инициал и
polling-fallback) + `WatchTournamentLive` (server-streaming). Сводка
собирается сервисом модуля `stage` из того, что у него уже есть (пулы
зафиксированных этапов, их бои, обогащение именами площадок и номинаций), и
трёх аддитивных методов межмодульных портов: «все активные площадки»
(`arena`), «номинации турнира» (`nomination`), «времена начала/завершения
боёв пулов» (`bout`). Новых таблиц и миграций нет: времена читаются
агрегатом по существующему событийному журналу боя (`bout.bout_events`,
0013/ADR 0011) — тот же приём, что `EventsForPools` спеки 0033. Живой канал
— тот же `pkg/livebus` (ADR 0012) с дополнительным топиком турнира, в
который сервис публикует ровно там же, где уже публикует топик номинации.

**Web** — `app/page.tsx` сужается до server-обёртки (SSR-данные +
композиция), сама композиция переезжает в `widgets/home/` (приём NFR-2 спеки
0032). Состояние турнира (`до старта | идёт | завершён`) выводится чистой
функцией из снапшота, а не приходит с сервера отдельным полем. Живая
подписка — один хук `useTournamentLive` по образцу `useNominationLive`
(SSE + polling-fallback). Афиша «до старта» — рестайл существующего
`entities/tournament/ui/tournament-hero.tsx` **на месте**: его переиспользует
живое превью редактора турнира (0029, FR-3), и расхождение превью с главной
хуже общего компонента.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

- Файл: `proto/hema/v1/stage.proto` (сводка живёт там же, где остальные
  публичные живые чтения; чужие сообщения не переиспользуем — ADR 0002, как
  `bout.proto` не переиспользует `FighterRef`).

Новые RPC в существующем `StagePublicService`:

- `GetTournamentLive(GetTournamentLiveRequest) → GetTournamentLiveResponse`
- `WatchTournamentLive(WatchTournamentLiveRequest) → stream WatchTournamentLiveResponse`

Оба — без роли (добавить процедуры в `publicProcedures` интерсептора Auth,
как `GetNominationLive`/`WatchNominationLive`). Запрос несёт
`tournament_id`; пустая строка = активный турнир (как в остальных
tournament-scoped чтениях).

Новые сообщения и enum:

- `enum LiveArenaState { UNSPECIFIED, FREE, PREPARING, BOUT_IN_PROGRESS }` —
  состояние площадки в публичной сводке (FR-14).
- `enum LiveNominationPhase { UNSPECIFIED, UPCOMING, RUNNING, FINISHED }` —
  «скоро / идёт / итоги» для сайдбара (FR-20). Собственный enum, а не импорт
  `NominationStatus` из `nomination.proto`: ось приёма заявок
  (`OPEN`/`CLOSED`) в сводке не участвует, а исполнительная ось у `stage`
  своя (спека 0021).
- `LiveFeedBout` — строка ленты (FR-15/FR-16): `bout_id`, `nomination_id`,
  `nomination_name`, `stage_title`, `pool_name`, `arena_id`, `arena_name`,
  `sequence_number`, `pool_bout_total`, `fighter_a`/`fighter_b`
  (`FighterRef`), `state` (`BoutState`), `score_a`/`score_b`, `started_at`,
  `finished_at` (`google.protobuf.Timestamp`, не заполнены — значит нет).
- `LiveArena` — карточка площадки (FR-14): `arena_id`, `arena_name`,
  `position`, `state`, `nomination_id`, `nomination_name`, `pool_name`,
  `stage_title`, `current_bout` (`LiveFeedBout`; у `PREPARING` — первая
  непроведённая пара, у `FREE` не заполнен), `pool_bout_total`,
  `pool_bout_finished`.
- `LiveNomination` — строка сайдбара (FR-20): `nomination_id`, `title`,
  `position`, `phase`, `current_stage_title`, `bout_total`, `bout_finished`,
  `fighter_count`.
- `TournamentLiveSnapshot` — `tournament_id`, `repeated LiveArena arenas`,
  `repeated LiveFeedBout bouts`, `repeated LiveNomination nominations`,
  `server_now_unix_ms` (опора для «обновлено N сек назад», как в
  `ArenaLiveSnapshot`).
- Пары `GetTournamentLiveRequest/Response` и
  `WatchTournamentLiveRequest/Response` — отдельные сообщения на RPC (buf
  lint, см. заметку в `bout.proto`), общий payload — `TournamentLiveSnapshot`.

Изменений существующих сообщений нет — только добавления.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

### Модуль `stage` (владелец сводки)

- `domain/domain.go` — новые типы и аддитивные методы портов:
  - `LiveArenaState`, `NominationPhase` (строковые литералы, как
    `BoutState`), `FeedBout`, `LiveArenaView`, `LiveNominationView`,
    `TournamentSnapshot`.
  - `BoutTimes{ StartedAt, FinishedAt *time.Time }`.
  - `ArenaProvider` += `ActiveArenas(ctx) ([]ArenaRef, error)` — неархивные
    площадки турнира в admin-порядке (0027). `ArenaRef` += `Position int`
    (аддитивно, существующие вызовы не ломаются).
  - `NominationProvider` += `NominationsByTournament(ctx, tournamentID)
    ([]NominationRef, error)`. `NominationRef` += `Position int`.
  - `BoutConductor` += `BoutTimesForPools(ctx, poolIDs []string)
    (map[string]BoutTimes, error)` — пустой список пулов валиден, no-op →
    пустая карта (правило `AnyStartedInPools`/`EventsForPools`).
  - `LiveNotifier` += `PublishTournamentChanged()`; `LiveSubscriber` +=
    `SubscribeTournament() (<-chan struct{}, func())`. Без аргумента: топик
    один на процесс — в MVP активный турнир один (`GetActiveTournament`/
    `UpdateActiveTournament`), см. «Риски».
- `service/tournament_live.go` (новый файл, чтобы не раздувать
  `service.go`):
  - `TournamentLive(ctx, tournamentID) (domain.TournamentSnapshot, error)`:
    1. `NominationsByTournament` → список номинаций с позициями;
    2. для каждой — уже существующий путь чтения (`stagesForRead`,
       загрузка пулов зафиксированных этапов, `BoutsByPool`,
       `enrichPools`); черновые раскладки отфильтрованы тем же гейтом, что
       в `NominationLive` (FR-24 = 0014 FR-12, поведение не дублируется, а
       переиспользуется);
    3. `BoutTimesForPools` по всем собранным пулам разом (один вызов, не
       на пул);
    4. `ActiveArenas` → карточки площадок: сопоставление по `Pool.ArenaID`,
       состояние `BOUT_IN_PROGRESS` (есть бой в `in_progress`) /
       `PREPARING` (пул стоит, начатых боёв нет) / `FREE` (пула нет);
    5. лента — все собранные бои плоским списком, **без сортировки**:
       порядок ленты (FR-17) — представление, считается на web
       (детерминированная чистая функция, дешевле тестируется);
    6. фаза номинации — из `execution_status` её этапов (0021): все
       `finished` → `FINISHED`, есть `active` → `RUNNING`, иначе
       `UPCOMING`.
  - `SubscribeTournament()` — тонкий passthrough, как
    `SubscribeNomination`.
  - Публикация: в существующий приватный хелпер публикации (все ~14 мест
    вызова `PublishNominationChanged` в `service.go`/`seeding.go`/
    `bracket.go`/`schema.go`) добавляется парный
    `PublishTournamentChanged()`. Отдельным шагом рефакторинга сначала
    сводим эти вызовы в один хелпер `s.notifyNominationChanged(id)`, потом
    добавляем второй Publish внутри него — иначе четырнадцать точек правки
    разъедутся.
- `api/handler.go` — `PublicHandler.GetTournamentLive` и
  `.WatchTournamentLive`: маппинг domain→proto (`toProtoTournamentSnapshot`)
  и стриминг по образцу `WatchNominationLive` (первый кадр сразу, дальше по
  сигналу шины, выход по отмене контекста).
- `repo/`, `migrations/` — **без изменений**.

### Модуль `bout` (источник времён)

- `repo/queries/bout.sql` — `-- name: BoutTimesForPools :many`: агрегат по
  `bout.bout_events` с join на проекцию:
  ```sql
  SELECT b.id AS bout_id,
         MAX(e.occurred_at) FILTER (WHERE e.event_type = 'started')  AS started_at,
         MAX(e.occurred_at) FILTER (WHERE e.event_type = 'finished') AS finished_at
  FROM bout.bouts b
  JOIN bout.bout_events e ON e.bout_id = b.id
  WHERE b.pool_id = ANY(sqlc.arg(pool_ids)::uuid[])
  GROUP BY b.id;
  ```
  `MAX` (последнее событие вида), а не `MIN`: переоткрытие и сброс делают
  ранние отметки неактуальными (AC-14). Отсечение по состоянию боя —
  в сервисе `stage`, не в SQL.
- `service/service.go` — `TimesForPools(ctx, poolIDs) (map[string]domain.BoutTimes, error)`.
- `domain/domain.go` — `BoutTimes` (собственный тип модуля).
- Миграций нет; индекс `idx_bout_events_bout (bout_id, version)` покрывает
  join, отдельного индекса не заводим (см. «Риски»).

### Модули `arena` и `nomination` (источники списков)

Новых методов сервиса не требуется — существующие `arena.Service.List` и
`nomination.Service.List` (обе по `tournamentID`) достаточны; вся работа —
в адаптерах платформы.

### Wiring (`internal/platform`)

- `stage_arena_provider.go` — `ActiveArenas`: `arena.Service.List` →
  фильтр по неархивным → `[]domain.ArenaRef` с `Position`.
- `stage_nomination_provider.go` — `NominationsByTournament`:
  `nomination.Service.List` → `[]domain.NominationRef` с `Position`.
- `stage_bout_conductor.go` — `BoutTimesForPools` → `bout.Service.TimesForPools`.
- `stage_live_bus.go` — топик турнира: `PublishTournamentChanged()` →
  `bus.Publish(topicTournament)`, `SubscribeTournament()` →
  `bus.Subscribe(topicTournament)`, где `topicTournament` — константа
  пакета, не пересекающаяся с id номинаций (например `"tournament:*"`).
- `platform.go` — регистрация новых публичных процедур в списке
  `publicProcedures` интерсептора Auth.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

### BFF (Route Handlers, Node runtime)

- `app/api/tournament/live/route.ts` — SSE-мост к `WatchTournamentLive`
  (копия паттерна `app/api/nominations/[id]/live/route.ts`).
- `app/api/tournament/live-snapshot/route.ts` — unary
  `GetTournamentLive` для polling-fallback и SSR.

### Слои

- `entities/tournament-live/`
  - `lib/types.ts` — DTO снапшота (`TournamentLiveSnapshotDto`,
    `LiveArenaDto`, `LiveFeedBoutDto`, `LiveNominationDto`).
  - `lib/phase.ts` — `tournamentPhase(snapshot, nominations)`:
    `"before" | "running" | "finished"` (FR-1) — чистая функция.
  - `lib/feed.ts` — `sortFeed(bouts)` (FR-17), `filterFeed(bouts, nominationId)`
    (FR-18), `boutTimeLabel(bout)` (FR-16), `boutOutcomeLabel(bout)`
    (победа/ничья, FR-15) — чистые функции.
  - `lib/arena.ts` — `arenaStateLabel`, `arenaSubtitle` (FR-14).
  - `lib/counters.ts` — `boutsDone/boutsTotal`, `arenasBusy/arenasTotal`
    (FR-13), `tournamentDayNumber(startAt, now)` (FR-12).
  - `model/get-tournament-live.ts` — server-side чтение снапшота для SSR.
- `entities/tournament/lib/format.ts` += `daysUntil(startAt, now)` (FR-4).
- `entities/nomination/lib/…` — без изменений; сводка приёма заявок (FR-5)
  считается чистой функцией `applicationsSummary(nominations, participants)`
  в `entities/application/lib/summary.ts`.
- `features/tournament-live/api/use-tournament-live.ts` — SSE + polling
  fallback, дословно по образцу `features/nomination-live/api/use-nomination-live.ts`
  (локальный стрим-стейт, не TanStack Query — случай, явно допущенный ADR
  0006). Подписка **не открывается** в фазе `finished` (FR-23) и `before`.
- `widgets/home/`
  - `home-screen.tsx` — клиентская композиция: выбирает по фазе, что
    рендерить; держит единственный `useTournamentLive`.
  - `tournament-strip.tsx` (FR-12/FR-13, полоса «идёт»/«завершён»)
  - `arenas-now.tsx` (FR-14) + `arena-card.tsx`
  - `bout-feed.tsx` (FR-15..FR-18) + `bout-feed-row.tsx`
  - `nominations-rail.tsx` (FR-20)
  - `applications-summary.tsx` (FR-5), `join-steps.tsx` (FR-9),
    `venue-contacts.tsx` (FR-10/FR-22), `registration-closed.tsx` (FR-21)
  - `home-skeleton.tsx` (NFR-5)
- `entities/tournament/ui/tournament-hero.tsx` — рестайл на месте под афишу
  «до старта» (FR-3/FR-4); остаётся презентационным без хуков (его
  рендерит и превью редактора турнира, 0029).
- `widgets/nominations-list/nominations-list.tsx` — рестайл под карточки
  FR-6..FR-8 (полоса заполнения, «осталось K мест»); используется только в
  фазе «до старта».
- `app/page.tsx` — server component: `getActiveTournament`,
  `getNominations`, участники/ростеры (как сейчас) + `getTournamentLive` →
  отдаёт всё пропами в `widgets/home/home-screen`. Своей разметки не
  держит (приём NFR-2 спеки 0032).

### Server components vs client

- Server: `app/page.tsx`, `TournamentHero`, `NominationsList` (остаются
  серверными — данные приходят пропами).
- Client: `home-screen.tsx` и всё живое под ним (нужен хук подписки и
  клиентский фильтр ленты). Первый рендер — по SSR-снапшоту из пропа, как
  на публичной странице номинации (NFR-1/AC-20).

### State

Server-state → SSR-пропы + `useTournamentLive` (push-канал); UI-state
(выбранный фильтр номинации) → `useState` внутри `bout-feed.tsx`. Zustand и
TanStack Query здесь не нужны.

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей).

- Издаёт: нет доменных событий. Сигнал «турнир мог измениться» —
  `pkg/livebus` (ADR 0012), не событийная шина: без типа, payload и
  гарантий доставки.
- Потребляет: нет.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит, `modules/stage/service`** (fake-порты из `testutil`):
  сборка сводки — площадка с идущим боем / с готовящимся пулом / свободная
  (AC-7..AC-9); черновая раскладка не попадает ни в ленту, ни в список
  номинаций фильтра (AC-10); фаза номинации из статусов этапов; времена
  проставляются только по состоянию боя (AC-11..AC-14); `BoutTimesForPools`
  зовётся один раз на все пулы, а не на пул.
- **Юнит, `modules/bout/service`**: `TimesForPools` на пустом списке пулов —
  no-op без похода в репо.
- **Интеграционный с БД (`modules/bout`, testcontainers)**: `BoutTimesForPools`
  на реальном журнале — начат / завершён / переоткрыт после завершения
  (последняя отметка выигрывает) / сброшен.
- **E2E ручек (`modules/stage/api`, httptest + Connect, fake-репо)**:
  `GetTournamentLive` без токена (NFR-3); `WatchTournamentLive` отдаёт
  первый кадр сразу и следующий по сигналу шины; поток закрывается по
  отмене контекста.
- **Web (Vitest)**:
  - чистые функции `entities/tournament-live/lib/*` — фаза (AC-1/AC-6/AC-18),
    порядок ленты (FR-17), фильтр (AC-15), подписи времени (AC-11..AC-14),
    счётчики и номер дня;
  - `daysUntil` (AC-2), `applicationsSummary` (AC-3/AC-4);
  - BFF-роуты — маппинг `connect.Code` → HTTP и форма SSE-кадра;
  - `use-tournament-live` — переход на polling после серии ошибок SSE
    (AC-17), отсутствие подписки в фазах `before`/`finished`;
  - рендер-тесты виджетов: заглушка без турнира (AC-19), карточка
    номинации с/без вместимости (AC-3/AC-4), «приём завершён» вместо кнопки
    (AC-5), полоса «турнир завершён» без блока площадок (AC-18).

## Риски и открытые вопросы

- **Топик турнира — один на процесс.** `SubscribeTournament()` без
  аргумента опирается на «активный турнир один» — допущение, на котором уже
  стоит весь остальной код (`GetActiveTournament`). Если появится
  мультитурнирность, топик станет `tournament:<id>`, а сервису потребуется
  резолв `nominationID → tournamentID`; правка локальная (порт + адаптер),
  но её стоит сделать вместе с мультитурнирностью, а не заранее.
- **Стоимость сборки сводки.** `TournamentLive` читает пулы и бои всех
  номинаций турнира на каждый кадр. При десятке номинаций это десятки
  запросов на кадр, а кадры приходят на каждое изменение счёта. Смягчение
  первого шага: один `BoutTimesForPools` на все пулы и коалесинг сигналов
  самим `livebus`. Если на нагрузочной проверке станет узко — следующий шаг
  батч-чтение пулов/боёв по списку номинаций одним запросом (`BoutsByPools`),
  а не рефакторинг схемы.
- **Порядок ленты считается на клиенте.** Осознанно: FR-17 — правило
  представления, и на web оно тестируется чистой функцией дешевле, чем
  через RPC. Риск — второй потребитель сводки заведёт свой порядок; тогда
  правило переезжает в сервис.
- **`ArenaRef.Position`** добавляется в существующую структуру: нужно
  проверить, что ни один текущий вызов не собирает `ArenaRef` литералом с
  позиционными полями (иначе компиляция сломается неочевидно).
- **Рестайл `tournament-hero.tsx` затрагивает экран 0029** (живое превью
  редактора турнира). Регресс-проверка превью — обязательный пункт
  верификации, не «заодно посмотрим».
- **Второй потребитель `publicProcedures`.** Забыть внести новые процедуры в
  список публичных — самая вероятная ошибка инкремента: проявится не
  компиляцией, а 401 у гостя. Покрыто e2e-тестом «без токена».
