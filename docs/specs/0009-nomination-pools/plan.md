# Plan: Пулы номинации (распределение бойцов)

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-07-13
- Спека: `./spec.md`

## Обзор решения

Новый серверный модуль `pool` (bounded context, своя PG-схема `pool`) —
mutable-aggregate, **не** event-sourced (решение спеки №17). Раскладка
номинации = строка `pool_layout` (lazy-init, решение №9) + набор пулов +
членства бойцов. Автораспределение — чистый детерминированный алгоритм в
`domain` (юнит-тестируемый без БД, NFR-3). Undo последнего mutating-действия
(авто/удаление пула) — снапшот в JSONB на `pool_layout` (решение №16).

Состав кандидатов (FR-12) и жизненный цикл при выходе бойца (FR-15) решаются
**lazy-реконсиляцией `pool → fighter`** (согласовано со стейкхолдером
2026-07-13): pool берёт актуальный активный ростер номинации из модуля
`fighter` через порт, **фильтрует показ** (выведенные/снятые не видны —
read-only проекция, всегда) и **удаляет осиротевшие членства (prune) — только в
`draft`**. В `ready` раскладка **фиксирована**: `GetLayout` ничего не пишет
(никакого write в GET-пути), возвращает снапшот с той же read-only фильтрацией.
Направление зависимости — только `pool → fighter` (без цикла, без EDD).
Осознанный компромисс: пара «вывод+возврат» в `draft` без единого обращения к
экрану пула не успевает удалить членство — редкий бенайн-кейс, само-лечится при
следующем взаимодействии; последствие ограничено будущими боями. Публичного
API нет (FR-13).

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

- Файл: `proto/hema/v1/pool.proto` (новый)
- Сервис: `PoolAdminService` — все RPC под `RequireAdmin` (как `ArenaAdminService`).
  Публичного сервиса нет (FR-13, FR-19).
- RPC (каждая мутация возвращает **весь обновлённый `PoolLayout`** — один
  запрос на перерисовку экрана, NFR-1):
  - `GetLayout(GetLayoutRequest) → GetLayoutResponse` — чтение раскладки
    (lazy-init + реконсиляция).
  - `CreatePool(CreatePoolRequest) → CreatePoolResponse` — создать пул
    (имя `Пул N`, FR-3).
  - `DeletePool(DeletePoolRequest) → DeletePoolResponse` — удалить пул
    (бойцы → нераспределённые; undoable, FR-4/7a).
  - `ResetLayout(ResetLayoutRequest) → ResetLayoutResponse` — сбросить всю
    раскладку (FR-4a).
  - `AssignFighter(AssignFighterRequest) → AssignFighterResponse` — положить
    бойца в пул (из нераспределённых **или** из другого пула = move; FR-5).
  - `UnassignFighter(UnassignFighterRequest) → UnassignFighterResponse` —
    вернуть бойца в нераспределённые (FR-5).
  - `AutoDistribute(AutoDistributeRequest) → AutoDistributeResponse` —
    автораспределение (FR-6/7).
  - `Undo(UndoRequest) → UndoResponse` — откат последнего mutating-действия
    (FR-7a).
  - `SetLayoutStatus(SetLayoutStatusRequest) → SetLayoutStatusResponse` —
    смена статуса `draft ↔ ready` (FR-9).
- Сообщения:
  - `PoolLayout { string nomination_id; PoolLayoutStatus status;
    repeated FighterRef unassigned; repeated Pool pools; bool can_undo; }`
    — `can_undo` для enable/disable кнопки «Отменить» на UI.
  - `Pool { string id; string nomination_id; int32 number; string name;
    repeated FighterRef members; }` — `number` = свободный номер (FR-3),
    `name` = презентационное `Пул N` (генерит сервер, не хранится отдельно).
  - `FighterRef { string fighter_id; string name; string club; }` — проекция
    для отображения (id для DnD, name/club — снапшот из `fighter`, join на
    чтении).
  - `*Request`/`*Response`:
    - `GetLayoutRequest { string nomination_id; }` / `...Response { PoolLayout layout; }`
    - `CreatePoolRequest { string nomination_id; }` / `...Response { PoolLayout layout; }`
    - `DeletePoolRequest { string pool_id; }` / `...Response { PoolLayout layout; }`
    - `ResetLayoutRequest { string nomination_id; }` / `...Response { PoolLayout layout; }`
    - `AssignFighterRequest { string nomination_id; string fighter_id; string pool_id; }`
      / `...Response { PoolLayout layout; }`
    - `UnassignFighterRequest { string nomination_id; string fighter_id; }`
      / `...Response { PoolLayout layout; }`
    - `AutoDistributeRequest { string nomination_id; }` / `...Response { PoolLayout layout; }`
    - `UndoRequest { string nomination_id; }` / `...Response { PoolLayout layout; }`
    - `SetLayoutStatusRequest { string nomination_id; PoolLayoutStatus status; }`
      / `...Response { PoolLayout layout; }`
- Enum (в `pool.proto`, рядом с сервисом — как `ArenaStatus`):
  - `PoolLayoutStatus { POOL_LAYOUT_STATUS_UNSPECIFIED = 0; DRAFT = 1;
    READY = 2; ACTIVE = 3; FINISHED = 4; }` — все 4 значения в контракте для
    целостности; переходы реализуем только `DRAFT ↔ READY` (решение №8).

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

- Модуль: `modules/pool/` — **новый bounded context**.
- PG-схема: `pool` (своя; миграция создаёт схему).
- Слои:
  - `domain/` — сущности `Pool`, `PoolMember`, `Layout`, `LayoutStatus`,
    `FighterRef`; порт `Repository`; порт `ActiveFightersProvider`
    (межмодульный, `pool → fighter`); доменные ошибки (`ErrNotFound`,
    `ErrInvalidInput`, `ErrNotDraft`, `ErrNoPools`, `ErrNothingToUndo`);
    **чистая функция автораспределения** `AutoDistribute(existing []Pool,
    unassigned []FighterRef) → assignments` (детерминированный жадный
    round-robin, каскад тай-брейков FR-7) и хелпер нормализации клуба
    (`NormalizeClub` = `lower(trim)`, пустой → без «одноклубников»).
  - `service/` — юзкейсы: `GetLayout`, `CreatePool`, `DeletePool`,
    `ResetLayout`, `Assign`, `Unassign`, `AutoDistribute`, `Undo`,
    `SetStatus`. Здесь же: **реконсиляция** (позвать `ActiveFightersProvider`,
    отфильтровать показ всегда; **prune осиротевших членств — только в
    `draft`**, в `ready` чтение без записи), проверка статуса
    (мутации только в `draft`, FR-10/11), генерация свободного номера (FR-3),
    запись/сброс undo-снапшота (FR-7a), сборка `Layout` (unassigned = active
    минус pooled).
  - `repo/` — sqlc-запросы (`repo/queries/pool.sql`) + реализация порта:
    CRUD пулов, членств, `pool_layout`; апсерты для идемпотентного undo;
    транзакции для `DeletePool`/`ResetLayout`/`AutoDistribute`/`Undo`.
  - `api/` — Connect-хендлер `PoolAdminService`, маппинг proto↔domain,
    ошибки→`connect.Code` (`ErrInvalidInput`→`InvalidArgument`,
    `ErrNotFound`→`NotFound`, `ErrNotDraft`/`ErrNoPools`/`ErrNothingToUndo`→
    `FailedPrecondition`). Имя `Пул N` формируется здесь/в service из `number`.
  - `migrations/` — goose, см. DDL ниже.
- Регистрация: `Register(mux, deps, opts...)` + wiring в `internal/platform`
  (инъекция `ActiveFightersProvider`).
- Межмодульные зависимости: **`pool → fighter`** через порт
  `ActiveFightersProvider` (реализация-адаптер в `platform`, делегирует в
  сервис `fighter`). Обратной зависимости нет.

### Расширение модуля `fighter` (для провайдера)

`fighter.RosterByNomination` возвращает `RosterEntry` **без id** — недостаточно
для DnD/членств. Добавляем в `fighter`:
- domain: `FighterRef { ID, Name, Club }` (или переиспользовать существующую
  проекцию) и метод сервиса `ActiveFightersByNomination(ctx, nominationID)
  ([]FighterRef, error)` — только `FighterStatus=active` **и**
  `ParticipationStatus=active` для номинации.
- repo: sqlc-запрос `ActiveFightersByNomination` (join `fighters` ×
  `participations` с фильтром по статусам и `nomination_id`).
Модуль `fighter` при этом **не** зависит от `pool` (направление сохранено).

### Миграции (DDL целиком)

`modules/pool/migrations/00001_init.sql` (goose Up/Down):

```sql
CREATE SCHEMA IF NOT EXISTS pool;

-- pool_layouts — одна строка на номинацию: статус раскладки + undo-снапшот.
-- Lazy-init (решение №9): отсутствие строки = draft с пустым undo. Строка
-- материализуется при первой мутации.
CREATE TABLE pool.pool_layouts (
    nomination_id UUID PRIMARY KEY,                 -- без кросс-схемного FK (ADR 0002)
    status        TEXT NOT NULL DEFAULT 'draft',
    -- undo последнего mutating-действия (решение №16): вид + JSONB-снапшот.
    -- undo_kind='' → undo недоступен. 'auto' → {"fighter_ids":[...]} (кого
    -- расставило авто → вернуть в нераспределённые). 'delete_pool' →
    -- {"number":N,"fighter_ids":[...]} (восстановить пул + членства).
    undo_kind     TEXT NOT NULL DEFAULT '',
    undo_data     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_layouts_status CHECK (status IN ('draft','ready','active','finished')),
    CONSTRAINT chk_layouts_undo   CHECK (undo_kind IN ('','auto','delete_pool'))
);

-- pools — пул (именованная корзина) внутри номинации. number уникален в
-- пределах номинации (FR-3: свободный номер; удалённые переиспользуются).
CREATE TABLE pool.pools (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomination_id UUID NOT NULL,
    number        INTEGER NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_pools_number  CHECK (number >= 1),
    CONSTRAINT uq_pools_nom_number UNIQUE (nomination_id, number)
);
CREATE INDEX idx_pools_nomination ON pool.pools (nomination_id, number);

-- pool_members — членство бойца в пуле. Инвариант FR-1/FR-16: один боец —
-- не более одного пула в номинации → UNIQUE(nomination_id, fighter_id).
-- Отсутствие членства = «нераспределённый». Удаление пула каскадит членства
-- (бойцы автоматически становятся нераспределёнными, FR-4).
CREATE TABLE pool.pool_members (
    pool_id       UUID NOT NULL REFERENCES pool.pools(id) ON DELETE CASCADE,
    nomination_id UUID NOT NULL,                    -- денормализация под инвариант/выборки
    fighter_id    UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pool_id, fighter_id),
    CONSTRAINT uq_members_nom_fighter UNIQUE (nomination_id, fighter_id)
);
CREATE INDEX idx_members_nomination ON pool.pool_members (nomination_id);
```

Down: `DROP TABLE pool_members, pools, pool_layouts; DROP SCHEMA pool`.

**Синхронизация инфраструктуры нового модуля** (`server/AGENTS.md` →
«Добавление модуля»): `server/sqlc.yaml`, `server/internal/testdb/testdb.go`
(`moduleMigrations`), корневой `Makefile` (migrate/migrate-down),
`server/Dockerfile` (COPY миграций) — и проверка в полном докер-стеке.

### Алгоритм автораспределения (domain, чистая функция)

Детерминированный жадный round-robin (FR-7), над копией существующих пулов с
их текущими размерами и клуб-счётчиками:
1. Отсортировать нераспределённых: клуб `asc` (нормализованный, пустой —
   последним), tie-break по `fighter_id`.
2. Для каждого бойца выбрать пул по **полному каскаду тай-брейков**
   (следующий — только при равенстве): (1) наименьший текущий размер;
   (2) добавление не увеличивает пик клуба (мин. макс. одноклубников в пуле);
   (3) минимальная суммарная добавка «лишних» пар одноклубников;
   (4) наименьший `number` пула (финальный тотальный порядок).
3. Вернуть список назначений `{fighter_id, pool_id}`.
Уже расставленные не трогаются (алгоритм получает только нераспределённых).

### Семантика undo (service, идемпотентно)

- Каждое mutating-действие **сбрасывает** `undo_kind=''`, **кроме**:
  `AutoDistribute` → пишет `undo_kind='auto'`, `undo_data.fighter_ids` = кого
  расставило (diff нераспределённых до/после); `DeletePool` → `undo_kind=
  'delete_pool'`, снапшот `{number, fighter_ids}`.
- `Undo`:
  - `auto` → удалить членства этих `fighter_ids` (вернуть в нераспределённые);
  - `delete_pool` → апсертом пересоздать пул с тем же `number` + членства
    (номер свободен, т.к. любая мутация обнулила бы undo — AC-13a2).
  - **Идемпотентно** (апсерты / delete-by-list), запись undo **не обнуляет**
    (повторный undo = тот же результат, FR-7a «undo самого undo не
    предусмотрено»). Следующая любая мутация обнуляет.
  - Пусто (`undo_kind=''`) → `ErrNothingToUndo` (`FailedPrecondition`).
  - Только в `draft`.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

- **Новая зависимость**: DnD-библиотека `@dnd-kit/core` (+ `@dnd-kit/sortable`
  при необходимости) — в проекте DnD ещё нет. Ставится в `/web`.
- BFF (Route Handlers, Node runtime, REST→gRPC), под существующим неймспейсом
  `app/api/nominations/[id]/...`:
  - `GET  app/api/nominations/[id]/pool-layout/route.ts` → `GetLayout`
  - `POST app/api/nominations/[id]/pools/route.ts` → `CreatePool`
  - `DELETE app/api/pools/[poolId]/route.ts` → `DeletePool`
  - `POST app/api/nominations/[id]/pool-layout/reset/route.ts` → `ResetLayout`
  - `POST app/api/nominations/[id]/pool-assign/route.ts` → `AssignFighter`
  - `POST app/api/nominations/[id]/pool-unassign/route.ts` → `UnassignFighter`
  - `POST app/api/nominations/[id]/pool-distribute/route.ts` → `AutoDistribute`
  - `POST app/api/nominations/[id]/pool-undo/route.ts` → `Undo`
  - `POST app/api/nominations/[id]/pool-status/route.ts` → `SetLayoutStatus`
  - Все проксируют gRPC, маппят `connect.Code`→HTTP (реюз `lib/grpc`), требуют
    admin-сессию.
- Слои:
  - `entities/pool/` — типы (`PoolLayout`, `Pool`, `FighterRef`, статус) из
    proto; helpers (напр. `poolName(number)`), маппинг proto→view.
  - `features/nomination-pools/` — `api/` (`requests.ts` fetchers, `keys.ts`,
    RQ-хуки `useLayout`/`useCreatePool`/…/`useAutoDistribute`/`useUndo`/
    `useSetStatus` через `useMutation` + инвалидация `keys.layout(nominationId)`);
    `model/` (Zustand для UI-состояния DnD/optimistic при необходимости);
    `ui/` — колонка нераспределённых, карточки пулов, DnD-обёртки, тулбар
    (кнопки «Добавить группу», «Распределить по группам», «Отменить»,
    «Сбросить раскладку», переключатель `draft/ready`). В `ready` — read-only.
  - `widgets/nomination-pools/` — композиция экрана.
- Роут-страница: `app/(admin)/admin/nominations/[id]/pools/page.tsx`
  (server component: prefetch layout + `HydrationBoundary`, клиентский widget
  для DnD). Ссылка со страницы номинаций админки.
- Server components vs client: страница — server (prefetch); DnD-виджет и
  тулбар — `"use client"`.
- State: server-state → TanStack Query (инвалидация layout после каждой
  мутации); UI-state (drag overlay, pending) → Zustand/useState.

## События

> Placeholder. Event-Driven Design для `pool` **сознательно не вводится**
> (решение спеки №17: mutable aggregate + diff, не журнал событий). Undo — через
> JSONB-снапшот, не через события.

- Издаёт: нет.
- Потребляет: нет (межмодульная связь `pool → fighter` — **синхронный
  in-process вызов через порт**, не событие).
- FR-15 (реакция на выход бойца) реализован **pull-моделью** (lazy-реконсиляция
  на чтении/мутации), а не подпиской на события `fighter`. Если позже
  потребуется строгая eager-гарантия — отдельный EDD-ADR + миграция (риск ниже).

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- Юнит (`domain`): чистый алгоритм `AutoDistribute` — таблица кейсов из
  AC-10/11/12/13 (детерминированный результат покроссплено), `NormalizeClub`,
  генерация свободного номера, семантика undo-diff.
- Юнит (`service` с fake-репо + fake `ActiveFightersProvider`): счастливые пути
  всех юзкейсов; реконсиляция (осиротевшие членства удаляются, AC-17/17a);
  запреты в `ready` (FR-11, AC-15/17c/13d); `ErrNoPools` (AC-8), no-op без
  нераспределённых (AC-9); свободный номер после удаления (AC-2); undo-классы и
  обнуление (AC-13a/13a2/13a3/13b/13c).
- E2E ручек (`api/` через httptest + Connect, fake-репо): каждый RPC —
  счастливый путь + маппинг доменных ошибок в `connect.Code`; admin-guard
  (AC-18).
- Интеграционные с БД (build-tag `integration`, testcontainers): миграции
  применяются; UNIQUE(nomination_id, fighter_id) держит инвариант FR-1;
  каскад членств при удалении пула; полный путь Create→Assign→Auto→Get через
  реальный Connect × PG.
- Web (Vitest): маппинг ошибок BFF-ручек (`connect.Code`→HTTP),
  сериализация proto→JSON (`.e2e.test.ts` по реальному proto), RQ-фетчеры
  (mock `fetch`), zustand-стор DnD. `pnpm exec tsc --noEmit` после protobuf-моков.

## Риски и открытые вопросы

- **Prune только в `draft`** (решение стейкхолдера). `ready` — фиксированный
  снапшот: `GetLayout` в `ready` **не пишет** (нет write в GET-пути), лишь
  read-only фильтрация показа. Осиротевшие членства удаляются исключительно в
  `draft` (одна выборка активных + один `DELETE ... WHERE fighter_id <> ALL`).
  edge «вывод+возврат в draft без чтения» — бенайн, само-лечится.
- **Алгоритм — намеренно простой** (решение стейкхолдера: участников редко
  > ~30). Жадный детерминированный round-robin, глобальный оптимум не требуется
  (эвристика, spec FR-7). ACs сверены с реализацией — при изменении порядка
  тай-брейков ACs пересчитать.
- **Идемпотентность undo `delete_pool`.** Восстановление номера опирается на
  инвариант «любая мутация обнуляет undo» → номер свободен. Проверить в тесте
  AC-13a2/13a3.
- **`@dnd-kit`** — новая web-зависимость; SSR-совместимость покрывается тестом
  (DnD — только в client-компоненте).
- **fighter-расширение** (`ActiveFightersByNomination`) — новый запрос в чужом
  модуле; синхронизировать sqlc `fighter`.
</content>
</invoke>
