# Plan: Очередь пулов на ристалище (arena pool queue)

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта.

- Статус: ready
- Дата: 2026-10-15
- Спека: `./spec.md`

## Обзор решения

Расширение модуля `stage`, нового модуля нет. Очередь — дочерняя таблица
`stage.arena_queue` (пул ↔ арена ↔ позиция): `stage` уже владеет
привязкой пула к арене (`pools.arena_id`, 0011), очередь — её продолжение, и
кросс-модульного обращения к данным `arena` не появляется (ид арены хранится
без FK, как `pools.arena_id`; имя и архивность резолвятся через существующий
`ArenaProvider`). Четыре новых RPC в `StageService` (добавить / убрать /
переставить / поставить следующий), `Pool` получает поля этапа и очереди.
Прогноз (ADR 0020) продлевается на очередь в `service/forecast.go` без новых
обращений к портам: очередь читается одним запросом на снапшот турнира.
Решение «очередь расширяет горизонт оценки» фиксируется новым ADR 0024
(переигрывает 0043 FR-9 / «Вне скоупа»).

## Контракты (proto)

Файл: `proto/hema/v1/stage.proto`.

- `Pool` — новые поля (заполняются в `enrichPools`, т.е. на всех путях,
  где сейчас резолвятся `nomination_name`/`arena_name`):
  - `string stage_title = 12;` — FR-14/FR-15, текущее название этапа.
  - `string queue_arena_id = 13;`, `string queue_arena_name = 14;`,
    `int32 queue_position = 15;` (1-индекс; 0 и пустые id — не в очереди).
- `GetPoolsForArenaResponse` — `repeated Pool queued = 3;` (очередь этой
  арены по порядку). `available` исключает пулы очереди **этой** арены, но
  включает пулы очередей других арен (у них заполнен `queue_arena_*`, UI
  рисует пометку «в очереди: …», FR-3/AC-14).
- Новые RPC `StageService` (все admin-only, как `SeatPoolOnArena`; ответ —
  `GetPoolsForArenaResponse` целевой арены, чтобы клиент перерисовался без
  второго запроса):
  - `EnqueuePool(EnqueuePoolRequest{pool_id, arena_id}) → EnqueuePoolResponse{GetPoolsForArenaResponse pools}`
    — FR-3..FR-5.
  - `DequeuePool(DequeuePoolRequest{pool_id}) → DequeuePoolResponse{pools}`
    — FR-6 (арена берётся из записи очереди).
  - `ReorderArenaQueue(ReorderArenaQueueRequest{arena_id, repeated pool_ids}) → ReorderArenaQueueResponse{pools}`
    — FR-6, полный список как `ReorderArenas`; набор id должен совпадать с
    текущей очередью, иначе `FailedPrecondition` (защита от гонки, NFR-3).
  - `SeatNextPool(SeatNextPoolRequest{arena_id}) → SeatNextPoolResponse{pools}`
    — FR-9/FR-11.
- `ConsoleArena` — `int32 queue_length = 16;`,
  `repeated ConsoleQueueItem queue = 17;` (FR-17).
- `ConsoleQueueItem` — `google.protobuf.Timestamp expected_start_at = 8;`,
  `int32 queue_position = 9;` (для очереди арены; у «Не распределены» не
  заполнены). Комментарий `TournamentConsoleSnapshot.queue` переписать:
  только нераспределённые (FR-24).
- `LiveArena` — `string next_pool_name = 13;`,
  `string next_pool_nomination_name = 14;` (FR-19; пусто — очередь пуста).
- `LiveFeedBout` (несёт `arena_name` и `forecast = 17`; его читает кабинет
  бойца, 0038/0043) — `string queue_arena_name`, `int32 queue_position`
  (FR-20). Если при T1 окажется, что кабинет читает другое сообщение, —
  поля туда же, где у него `arena_name`.
- Комментарии `SeatPoolOnArena` (убирает из очереди, FR-10),
  `SetLayoutStatus` (отказ при пуле в очереди, FR-12), `GetPoolsForArena`
  обновить.

## Server (модули и слои)

- Модуль: `modules/stage/` — расширение.
- `migrations/00007_arena_queue.sql` (goose):

  ```sql
  -- +goose Up
  -- Очередь пулов на арену (спека 0063). Отдельная таблица, а не колонки
  -- pools: позиция уникальна в пределах арены и при переупорядочивании
  -- временно дублируется — нужен DEFERRABLE UNIQUE, который недоступен
  -- partial-индексу. PK по pool_id даёт FR-2 «не более одной очереди».
  CREATE TABLE stage.arena_queue (
      pool_id    UUID PRIMARY KEY REFERENCES stage.pools(id) ON DELETE CASCADE,
      arena_id   UUID NOT NULL,          -- без FK на arena (ADR 0002)
      position   INTEGER NOT NULL,       -- 1..N без пропусков (инвариант сервиса)
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chk_arena_queue_position CHECK (position >= 1),
      CONSTRAINT uq_arena_queue_position UNIQUE (arena_id, position)
          DEFERRABLE INITIALLY DEFERRED
  );
  -- Down: DROP TABLE stage.arena_queue;
  ```

  Инвариант «стоящий пул не в очереди» (FR-2) держит сервис + транзакция
  `SeatPool` (удаляет запись очереди в той же транзакции); CHECK между
  таблицами не делаем.
- `domain/`:
  - `Pool` — `StageTitle`, `QueueArenaID`, `QueuePosition`
    (`QueueArenaName` резолвится в `enrichPools`, как `ArenaName`).
  - `ArenaPools` — `Queued []Pool`.
  - Чистые функции: `domain/queue.go` — `EnqueueOrder(cur []string, id) []string`,
    `RemoveFromOrder`, `ValidateReorder(cur, next []string) error` (тот же
    набор, без повторов). Ошибки: `ErrPoolQueued` (откат раскладки, FR-12;
    несёт id арены для сообщения), `ErrQueueEmpty`, `ErrQueueMismatch`
    (reorder с устаревшим набором), повторно используются
    `ErrAlreadySeated`/`ErrNotReady`/`ErrArenaNotAvailable`.
  - `QueueChangeoverPause = 5 * time.Minute` в `pace.go` рядом с
    `InterBoutPause` (FR-21).
  - `ForecastQueue(pools [][]BoutRef, pace, start time.Time) map[string]BoutForecast`
    — расставляет бои очереди подряд от `start`, добавляя паузу смены перед
    каждым пулом; результат всегда `Provisional` (FR-22).
  - Порт `Repository`: `ArenaQueue(ctx, arenaID) ([]Pool, error)`,
    `QueuesForArenas(ctx, arenaIDs) (map[string][]string, error)` (один
    запрос на снапшот, NFR-2), `QueueEntry(ctx, poolID) (arenaID string, pos int, found bool, err)`,
    `EnqueuePool(ctx, poolID, arenaID)` (транзакция: удалить из старой
    очереди + уплотнить её + вставить в конец новой), `DequeuePool(ctx, poolID)`
    (удалить + уплотнить), `ReorderArenaQueue(ctx, arenaID, poolIDs)`,
    `ExistsQueuedInStage(ctx, stageID) (arenaID string, found bool, err)`.
    `SeatPool` расширяется: в той же транзакции удаляет пул из очереди и
    уплотняет её (FR-10).
- `repo/queries/stage.sql`: `ListArenaQueue`, `ListQueuesByArenas`
  (`arena_id = ANY($1)`), `GetQueueEntry`, `DeleteQueueEntry`,
  `CompactArenaQueue` (`UPDATE … SET position = rn FROM (row_number() …)`),
  `MaxQueuePosition`, `InsertQueueEntry`, `SetQueuePosition`,
  `FindQueuedInStage`. `ListReadyUnseatedPools` не меняется — фильтр
  «не в очереди этой арены» делает сервис. `make sqlc`.
- `service/`:
  - `queue.go` — `EnqueuePool`, `DequeuePool`, `ReorderArenaQueue`,
    `SeatNextPool` (берёт голову очереди и вызывает общий путь постановки
    `SeatPoolOnArena` → проверки, `notifyPoolSeated`, `signalArenaBoard`;
    при недоступности головы — ошибка, очередь цела, FR-11). Каждое
    изменение — `notifyNominationChanged` (живой канал, NFR-1).
  - `GetPoolsForArena` — + `Queued`, фильтр `Available`.
  - `SetLayoutStatus` ready→draft — после проверки `ExistsSeatedInStage`
    проверка `ExistsQueuedInStage` → `ErrPoolQueued` (FR-12).
  - `enrichPools` — `StageTitle` из уже загружаемого `stageByID`;
    `QueueArenaName` через `ArenaProvider` (как `ArenaName`).
  - `forecast.go` — `buildForecasts` получает очереди неархивных арен
    (`QueuesForArenas` по активным аренам) и для каждой арены строит
    `ForecastQueue` от `finishAt` стоящего контейнера (или `now`, если арена
    свободна / контейнер доигран), темп — `cf.pace` стоящего контейнера или
    `ComputePace(nil, tournamentPace, arenaDefault)` для свободной арены
    (FR-21/FR-22). Прогнозы очереди кладутся в тот же `byBout`-индекс — так
    лента боёв, страница номинации и кабинет (0043 FR-20..FR-23) получают
    время без правок своих сборщиков.
  - `console.go` — `ConsoleArena.Queue/QueueLength`; `buildConsoleNomination`
    учитывает финиш очереди в `ExpectedFinishAt`, `BoutRemainingUnseated` —
    только пулы вне арены и вне очередей (FR-23); снапшот `Queue` —
    нераспределённые (FR-24); алерт `ARENA_IDLE` — `pool_id/pool_name` головы
    очереди, если она есть (FR-25).
  - `tournament_live.go` — `LiveArena.NextPool*` (FR-19), публичная очередь
    только у неархивных арен (FR-13).
  - Кабинет бойца — поля очереди (FR-20) там, где сейчас собирается
    `arena_name` следующего боя.
- `api/handler.go` — 4 хендлера, маппинг ошибок: `ErrPoolQueued`,
  `ErrQueueMismatch` → `FailedPrecondition`; `ErrQueueEmpty` →
  `FailedPrecondition`; остальное — как у `SeatPoolOnArena`. Сообщение
  `ErrPoolQueued` называет арену (FR-12).
- Межмодульные зависимости: только существующий `ArenaProvider`
  (имя/архивность/активные арены). Новых портов нет.
- Новые инфраструктурные точки не нужны (модуль `stage` уже везде
  перечислен); миграция попадает в образ существующей строкой COPY.

## Web (FSD + BFF)

- BFF (`runtime = "nodejs"`), по образцу `app/api/pools/[poolId]/seat`:
  - `POST app/api/pools/[poolId]/enqueue/route.ts` `{arenaId}`;
  - `POST app/api/pools/[poolId]/dequeue/route.ts`;
  - `PUT app/api/arenas/[arenaId]/queue/route.ts` `{poolIds}`;
  - `POST app/api/arenas/[arenaId]/seat-next/route.ts`.
  Ответ — JSON `GetPoolsForArenaResponse` (тот же сериализатор, что у
  `GET` пулов арены).
- `entities/pool/lib/types.ts` — `stageTitle`, `queueArenaId`,
  `queueArenaName`, `queuePosition`; хелпер `poolTitle(pool)` →
  «Пул 1 · Групповой этап» для единообразия (FR-14).
- `features/pool-seating/`:
  - `api/` — `requests.ts` (+4 fetchers), `use-enqueue-pool.ts`,
    `use-dequeue-pool.ts`, `use-reorder-arena-queue.ts`,
    `use-seat-next-pool.ts`; каждая мутация пишет ответ в кэш
    `usePoolsForArena` (`setQueryData`), как сейчас seat/unseat.
  - `ui/pool-seating.tsx` — бейдж этапа у стоящего пула и в списке
    доступных; список доступных показывается и у занятой арены (только
    «В очередь», FR-7); пометка «в очереди: Арена N» у пулов чужих очередей.
  - `ui/arena-queue.tsx` (новый) — очередь по порядку: №, пул, этап,
    номинация, число боёв, `ForecastTime` первого боя, «вверх/вниз»,
    «убрать»; у свободной арены — блок «Следующий: … [Поставить следующий]»
    (FR-9, FR-16).
- `widgets/arena-console/management-view.tsx` — у занятой арены под
  стоящим пулом рендерить `ArenaQueue` и доступные пулы в режиме «только в
  очередь»; у свободной — `PoolSeating` (уже включает очередь).
- `features/tournament-console/ui/` — карточка арены: длина очереди и
  следующий пул; раздел «Не распределены» (переименование FR-24).
- Публичное: `widgets/nomination-public/pool-card.tsx` («Арена 2 · в
  очереди, №2», FR-18), `widgets/home/arena-card.tsx` («Далее: …», FR-19),
  `widgets/dashboard/next-bout-card.tsx` (FR-20).
- State: всё server-state через TanStack Query; локального UI-состояния
  кроме фильтров (уже `useState`) нет.

## События

- Издаёт: нет новых доменных событий. Изменения очереди публикуются в
  существующую in-process шину живого канала (ADR 0012) через
  `notifyNominationChanged` → `PublishTournamentChanged`.
- Потребляет: нет.

## Тестирование

- Юнит `domain/queue_test.go` — порядок/перенос/уплотнение/валидация
  reorder; `domain/pace_test.go` — `ForecastQueue` (AC-10/AC-11:
  пауза смены, provisional).
- Юнит `service/queue_test.go` (fake-репо) — AC-1..AC-8, AC-14; гонка
  reorder с устаревшим набором → `ErrQueueMismatch`.
- `service/forecast_test.go`, `service/console_test.go`,
  `service/tournament_live_test.go` — прогноз очереди, номинация, «Не
  распределены», алерт простоя, `NextPool` (AC-10..AC-12), архивная арена
  без прогноза (AC-14).
- `service/service_test.go` — `enrichPools` заполняет `StageTitle` (AC-9);
  `SeatPoolOnArena` убирает из очереди (AC-7).
- E2E `api/handler_test.go` — 4 RPC через httptest + Connect, коды ошибок.
- Интеграционный `integration/*_integration_test.go` — миграция 00007,
  транзакционный перенос между очередями и reorder с DEFERRABLE UNIQUE на
  реальном PG; `SeatPool` удаляет запись очереди.
- Web (Vitest): `requests.test.ts` (+4 fetchers), BFF `route.test.ts` +
  `*.e2e.test.ts` (реальный `toJson` для `queued`/`queue_*`), UI:
  `pool-seating.test.tsx` (этап в списке, режим «только в очередь», пометка
  чужой очереди), `arena-queue.test.tsx` (порядок, кнопки, «Поставить
  следующий»), пульт и публичные карточки.

## Риски и открытые вопросы

- `ReorderArenaQueue` с DEFERRABLE UNIQUE — проверить, что sqlc/pgx не
  мешают отложенной проверке в одной транзакции (покрыто интеграционным
  тестом).
- Прогноз очереди использует `finishAt` стоящего контейнера; если тот
  `finishAtOK == false` (доигран), отсчёт — `now` (как у свободной арены).
- ADR 0024 должен явно отменить фразу 0043 «Вне скоупа: очередь пулов —
  не заводим» и обновить горизонт ADR 0020.
