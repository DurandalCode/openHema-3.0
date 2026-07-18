# Plan: Постановка пула на арену (pool on arena)

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: draft
- Дата: 2026-07-18
- Спека: `./spec.md`

## Обзор решения

Синхронное решение (без ЕДД). Основные изменения — в модуле `pool` и вебе;
`bout` почти не трогаем, `arena` на сервере не трогаем вовсе.

1. **`pool`** — центральный модуль. Статус раскладки **урезается** до
   `draft/ready` (убираем `active/finished`). У пула появляется привязка к арене
   (`pool.pools.arena_id`); **статус пула** (`не готов/готов/готовится к запуску`)
   **вычисляется** из статуса раскладки + факта постановки (хранить отдельную
   колонку статуса пула сейчас не нужно — `готовится к запуску ⟺ arena_id
   задан`; `идёт/завершён` добавит будущий ЕДД-инкремент отдельной колонкой).
   Постановка/снятие (`готов ↔ готовится к запуску`) — новые юзкейсы `pool`.
   `pool` получает новую зависимость **`pool → arena`** (валидация активной арены
   + резолв имени), по образцу `pool → fighter`/`pool → bout`. Инвариант «одна
   арена ↔ один пул» — **partial unique index** на `arena_id` (NFR-4).
2. **`bout`** — **логика без изменений** (триггер боёв остаётся пер-
   номинационным: `SetLayoutStatus` `draft → ready`, 0010). Добавляется только
   **публичное чтение** боёв (для нового экрана номинации).
3. **`arena`** — **не меняется на сервере** (остаётся независимым, 0008 FR-1).
   Гейт «нельзя архивировать занятую арену» (FR-10) — в **BFF** (композиция
   веб-слоя вправе звать несколько сервисов), а не в arena-модуле, чтобы не
   создавать цикл `arena → pool` при уже вводимом `pool → arena` (ADR 0002).
4. **web** — новый **публичный экран номинации**; секция постановки/снятия на
   **странице арены** (0008); мелкие правки экрана управления составом (0009,
   read-only бейдж «готовится к запуску»).

Направления зависимостей (ацикличны): `pool → fighter`, `pool → bout`,
**`pool → arena`** (новое). `arena` и `bout` ни от кого не зависят. Кросс-модульная
композиция для веба (страница арены, гейт архивации) — на уровне BFF.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

### `proto/hema/v1/pool.proto`

- **`PoolLayoutStatus`** — **урезать** до `UNSPECIFIED=0, DRAFT=1, READY=2`;
  значения `ACTIVE=3`/`FINISHED=4` удалить, номера **зарезервировать**
  (`reserved 3, 4;` + `reserved "…";`) во избежание переиспользования.
- **Новый enum `PoolStatus`** (статус отдельного пула для отображения):
  `POOL_STATUS_UNSPECIFIED=0, NOT_READY=1, READY=2, PREPARING=3, ACTIVE=4,
  FINISHED=5`. Реализуются `NOT_READY/READY/PREPARING`; `ACTIVE/FINISHED` — задел.
- **`Pool`**: добавить `PoolStatus status`; `string arena_id` (пусто, если не на
  арене); `string arena_name` (резолв из arena; пусто, если не на арене).
- **`PoolAdminService`** (существующий `SetLayoutStatus` **остаётся** — фиксация
  раскладки по номинации, 0009):
  - `SeatPoolOnArena(SeatPoolOnArenaRequest{pool_id, arena_id}) → PoolLayout` —
    постановка (`готов → готовится к запуску`).
  - `UnseatPool(UnseatPoolRequest{pool_id}) → PoolLayout` — снятие.
  - `GetPoolsForArena(GetPoolsForArenaRequest{arena_id}) →
    GetPoolsForArenaResponse{Pool seated, repeated Pool available}` — для
    страницы арены: пул на арене (если есть) + готовые пулы к постановке (статус
    «готов», `arena_id` пуст, активный турнир).
- **Новый сервис `PoolPublicService`** (без RequireAdmin):
  - `ListPublicPools(ListPublicPoolsRequest{nomination_id}) →
    ListPublicPoolsResponse{repeated Pool pools}` — только при `ready`-раскладке;
    `members`, `status`, `arena_id/arena_name` (FR-11). При `draft` — пустой
    список (FR-11/AC-14).

### `proto/hema/v1/bout.proto`

- **Новый сервис `BoutPublicService`** (без RequireAdmin):
  - `ListPublicBoutsByNomination(ListBoutsByNominationRequest) →
    ListBoutsByNominationResponse` — публичное чтение боёв номинации (FR-11).
    Переиспользует существующий read-хендлер `bout` (тот же метод, что у
    `BoutAdminService.ListBoutsByNomination`), смонтированный без admin-опций.

### `proto/hema/v1/arena.proto`

- **Без изменений** (arena независим).

## Server (модули и слои)

### Модуль `pool` (расширение)

- PG-схема `pool` (существует). Миграция `00003_pool_arena.sql`:
  - `ALTER TABLE pool.pools ADD COLUMN arena_id UUID NULL` (без кросс-схемного
    FK, ADR 0002).
  - `CREATE UNIQUE INDEX uq_pools_arena ON pool.pools (arena_id) WHERE arena_id
    IS NOT NULL` — **инвариант «одна арена ↔ один пул»** (FR-6, NFR-4).
  - `ALTER TABLE pool.pool_layouts DROP CONSTRAINT chk_layouts_status,
    ADD CONSTRAINT chk_layouts_status CHECK (status IN ('draft','ready'))` —
    урезание статуса раскладки (down-миграция возвращает 4 значения). _Отдельной
    колонки статуса пула не добавляем: `готовится к запуску ⟺ arena_id
    задан`, `не готов/готов` — из статуса раскладки._
- `domain/`:
  - `LayoutStatus`: убрать `LayoutActive/LayoutFinished` (оставить
    `LayoutDraft/LayoutReady`).
  - Новый тип `PoolStatus` (not_ready/ready/preparing/active/finished) +
    хелпер вычисления статуса пула из `(layoutStatus, arenaID)`.
  - `Pool`: добавить `ArenaID string`, `ArenaName string`, `Status PoolStatus`
    (заполняется service при сборке).
  - Доменные ошибки: `ErrNotReady` (постановка не-готового пула), `ErrArenaBusy`
    (арена занята), `ErrAlreadySeated` (пул уже на арене), `ErrPoolSeated`
    (расфиксация раскладки при пуле на арене), `ErrArenaNotAvailable` (арена
    архивна/не найдена).
  - Порт `Repository`: `SeatPool(ctx, poolID, arenaID)` (атомарно; полагается на
    unique-index при гонке), `UnseatPool(ctx, poolID)`, `PoolsForArena(ctx,
    arenaID)` (пул на арене) + `ReadyUnseatedPools(ctx, tournamentID)` (готовые к
    постановке), `AnySeatedInNomination(ctx, nominationID) bool` (гейт FR-3),
    `GetPool` — уже есть (+`ArenaID`). `GetLayout`/`ListReadyPlusPools` отдают
    `arena_id` пулов.
  - **Новый порт `ArenaProvider`** (`pool → arena`): `ArenaByID(ctx, id)
    (ArenaRef{ID, Name, Active}, error)`; `ArenasByIDs(ctx, ids)
    (map[id]ArenaRef, error)` — батч-резолв имён. Реализация — адаптер в
    `internal/platform`.
- `service/`:
  - `SetStatus` (существующий, 0009): при `ready → draft` — **проверить
    `AnySeatedInNomination`** (`ErrPoolSeated`) до `ClearForNomination`/смены
    статуса (FR-3). `draft → ready` — как в 0009/0010 (генерация боёв).
  - `SeatPoolOnArena(poolID, arenaID)`: загрузить пул; статус пула «готов»
    (раскладка `ready` и `arena_id` пуст) иначе `ErrNotReady`/`ErrAlreadySeated`;
    `arena.ArenaByID` → активна (`ErrArenaNotAvailable`); `repo.SeatPool`
    (unique-index → `ErrArenaBusy` при гонке).
  - `UnseatPool(poolID)`: пул на арене иначе no-op/ошибка; `repo.UnseatPool`.
  - `GetPoolsForArena(arenaID)`: `repo.PoolsForArena` + `ReadyUnseatedPools` +
    обогащение имён бойцов (как `loadLayout`) + `arena_name`.
  - `ListPublicPools(nominationID)`: как `loadLayout`, но только при `ready`
    (иначе пусто); обогащение членов (fighter) + резолв `arena_name`
    (`ArenaProvider.ArenasByIDs`) + вычисление `PoolStatus`.
  - `loadLayout`: заполнять `Pool.{ArenaID,ArenaName,Status}`; реконсиляция
    членов — как 0009 (в draft).
- `api/`: маппинг новых RPC + `PoolPublicService`; ошибки → `connect.Code`
  (`ErrNotReady/ErrArenaBusy/ErrAlreadySeated/ErrPoolSeated` →
  `FailedPrecondition`; `ErrArenaNotAvailable` → `FailedPrecondition`;
  `ErrNotFound` → `NotFound`; `ErrInvalidInput` → `InvalidArgument`).
  `PoolPublicService` — под `baseOpts` (без adminOpts).
- `repo/`: новые `queries/pool.sql` (seat/unseat/pools-for-arena/ready-unseated/
  any-seated + `arena_id` в выборках), `make sqlc`.
- Регистрация: `module.go` монтирует admin + public сервисы; `Deps` получает
  `Arenas domain.ArenaProvider`.

### Модуль `bout`

- **Логика/схема без изменений.** `api/handler.go`: смонтировать
  `BoutPublicService` (тот же read-хендлер) без admin-опций. Тест: public
  доступен без admin.

### Модуль `arena`

- **Без изменений на сервере.** Гейт FR-10 — в BFF.

### `internal/platform`

- Новый адаптер `pool_arena_provider.go`: `PoolArenaProvider` реализует
  `pool/domain.ArenaProvider` поверх `arena` service (`ArenaByID/ArenasByIDs`),
  по образцу `PoolActiveFightersProvider`.
- `platform.go`: `poolDeps.Arenas = NewPoolArenaProvider(pool, activeTournaments)`.

## Web (FSD + BFF)

- **BFF (Route Handlers):**
  - `app/api/pools/[poolId]/seat/route.ts` (POST arena_id) и `…/unseat/route.ts`
    — постановка/снятие.
  - `app/api/arenas/[id]/pools/route.ts` — `GetPoolsForArena` (страница арены).
  - `app/api/admin/arenas/[id]/archive/route.ts` — **дополнить гейтом FR-10**:
    перед `ArchiveArena` дернуть `GetPoolsForArena`; если занята — `409`.
  - `app/api/nominations/[id]/public-pools/route.ts` — `ListPublicPools`
    (+ бои через существующий/публичный `bouts`-роут) для публичного экрана.
- **entities:**
  - `entities/pool/lib/types.ts` — `PoolStatus`, поля `status/arenaId/arenaName`.
  - `entities/pool/model/get-public-pools.ts` — SSR-фетчер публичных пулов.
  - `entities/bout` — уже есть `groupBoutsByPool` (переиспользуем).
- **features:**
  - `features/nomination-pools` (0009) — мелкая правка: read-only бейдж
    «готовится к запуску» на пуле, если он на арене (статус раскладки/DnD — без
    изменений).
  - `features/pool-seating` (новая) — `api/` (seat/unseat/getPoolsForArena хуки),
    `ui/` — секция на странице арены: текущий пул + его бои, либо выбор из
    доступных готовых пулов.
- **widgets / routes:**
  - `app/(admin)/admin/arenas/[id]/page.tsx` — заменить плейсхолдер «Управление
    боями» на секцию постановки (widget над `features/pool-seating`).
  - **Новый публичный роут** `app/nominations/[id]/page.tsx` (SSR,
    `force-dynamic`) — пулы (`ready`) с составом, боями (`groupBoutsByPool`) и
    для «готовится к запуску» — площадка + ярлык. Ссылка — с главной/списка
    номинаций (0007).
- **State:** admin-мутации — TanStack Query; публичный экран — SSR-фетч (как
  главная 0007); UI-state экрана пулов — прежний.

## События

> Placeholder. ЕДД ещё не введён (ADR со следующим инкрементом — «текущий бой на
> арене»). Здесь связь `pool ↔ arena` — синхронный порт (ADR 0002).

- Издаёт: нет. Потребляет: нет.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит (`pool/service` на fake-репо):** постановка (готов-only AC-5, арена
  активна AC-9, свободна AC-6, пул не на другой арене AC-7) через fake
  `ArenaProvider`; снятие (AC-8); запрет `ready → draft` при пуле на арене
  (AC-3); публичный список пусто при `draft` (AC-14). Вычисление `PoolStatus` из
  `(layout, arena_id)`.
- **E2E ручек (`pool/api`, `bout/api` httptest+Connect, fake-репо):** новые RPC +
  маппинг ошибок; публичные сервисы доступны без admin, admin-RPC — под
  RequireAdmin (AC-15).
- **Интеграционные (testcontainers):** partial unique `uq_pools_arena` — две
  постановки на одну арену: вторая падает (NFR-4).
- **Web (Vitest):** BFF seat/unseat/public-pools (мок grpc, `connect.Code`→HTTP,
  гейт архивации 409 — AC-10); фетчер публичных пулов; группировка боёв по пулу.

## Риски и открытые вопросы

- **Гейт FR-10 в BFF, не в arena-модуле** — сознательно, чтобы не создать цикл
  `arena ↔ pool`. Не «жёсткий» БД-инвариант: архивация занятой арены напрямую
  через gRPC (в обход BFF) не заблокирована. Приемлемо (единственный клиент —
  наш BFF); ужесточение — отдельным ADR (событие/реконсиляция).
- **Статус пула вычисляемый, не хранимый.** `готовится к запуску ⟺ arena_id`.
  Плюс: нет рассинхронизации со статусом раскладки. Для будущих `идёт/завершён`
  (ЕДД) — добавить колонку execution-статуса без ломки данных (NFR-1).
- **Резолв имени арены — live, не снапшот** (переименование сразу видно). Если
  понадобится снапшот (как имена бойцов в боях 0010) — добавить колонку.
- **`GetPoolsForArena` кросс-номинационен** — «готовые к постановке» пулы всех
  номинаций активного турнира; проверить, что выборка по `ready`-раскладке +
  `arena_id IS NULL` эффективна (индекс по `arena_id`/`nomination_id`).
