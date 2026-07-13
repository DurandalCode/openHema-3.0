# Plan: Площадки — ристалища/арены (arenas)

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-07-13
- Спека: `./spec.md`

## Обзор решения

Новый server-модуль `arena` — **простой CRUD-агрегат с архивацией** (проще, чем
`fighter`: без event-sourcing, без кроссдоменных портов, без публичного
сервиса). Ближайший образец — модуль `nomination`: агрегат-корень «площадка» в
своей PG-схеме `arena`, принадлежит турниру (валидация `tournament_id` через
`ActiveTournamentProvider`, как в nomination), поддерживает порядок (`position`)
и `Reorder` тем же паттерном. «Удаление» реализовано **не** физическим DELETE, а
переключением `status` active↔archived (обратимо, FR-5).

Домен **админский** — единственный сервис `ArenaAdminService` под
`RequireAdmin`, публичного чтения нет (spec решение 6). Межмодульных зависимостей
наружу нет; на площадку пока никто не ссылается — бои будущей фичи будут ссылаться
на `arena_id` (без кросс-схемного FK, ADR 0002).

Web: админский список площадок (features/arena-management) + **страница
управления конкретной площадкой по стабильному URL** `/admin/arenas/[id]` —
в этом инкременте каркас (реквизиты + место под будущее управление боями, FR-9).
Идентичность = `id` (uuid), поэтому URL не рвётся при переименовании/архивации
(FR-8) без дополнительной работы.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

### Новый файл `proto/hema/v1/arena.proto`

Пакет `hema.v1`, `go_package` как у остальных. Только админский сервис
(публичного нет):

- **`ArenaAdminService`** (все RPC — под `RequireAdmin`, adminOpts):
  - `ListArenas(ListArenasRequest) → ListArenasResponse` — площадки турнира по
    порядку (активные и архивные, различимы по `status`).
  - `GetArena(GetArenaRequest) → GetArenaResponse` — одна площадка по `id`
    (для страницы управления).
  - `CreateArena(CreateArenaRequest) → CreateArenaResponse` — `tournament_id`,
    `name`, `description`.
  - `UpdateArena(UpdateArenaRequest) → UpdateArenaResponse` — правка `name`,
    `description` (полная замена редактируемых полей; `tournament_id` неизменяем).
  - `ArchiveArena(ArchiveArenaRequest) → ArchiveArenaResponse` — «убрать» в архив
    (`id`).
  - `RestoreArena(RestoreArenaRequest) → RestoreArenaResponse` — вернуть из
    архива (`id`).
  - `ReorderArenas(ReorderArenasRequest) → ReorderArenasResponse` — задать
    порядок целиком (`tournament_id`, `repeated string ordered_ids` — ровно
    текущий набор id площадок турнира), по образцу `ReorderNominations`.
- **Сообщения**:
  - `Arena { string id = 1; string tournament_id = 2; string name = 3;
    string description = 4; int32 position = 5; ArenaStatus status = 6;
    google.protobuf.Timestamp created_at = 7; google.protobuf.Timestamp
    updated_at = 8; }`
  - `Create/Update/Get/Archive/Restore` — Request/Response с соответствующими
    полями; `List`/`Reorder` — как у nomination (Response несёт
    `repeated Arena`).
- **Enum** (в `arena.proto`, доменный тип модуля — не в common):
  - `ArenaStatus { ARENA_STATUS_UNSPECIFIED = 0; ARENA_STATUS_ACTIVE = 1;
    ARENA_STATUS_ARCHIVED = 2; }`

> Публичного `ArenaService` нет — RPC в `publicProcedures` интерсептора Auth не
> добавляются. Появится вместе с боями/расписанием (spec «Вне скоупа»).

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

- Модуль: `modules/arena/` — **новый bounded context**.
- PG-схема: `arena` (миграция создаёт схему + таблицу).

### Слои

- `domain/domain.go`:
  - Сущность: `Arena { ID, TournamentID, Name, Description string; Position
    int32; Status Status; CreatedAt, UpdatedAt time.Time }`.
  - Тип: `Status` со значениями `StatusActive`, `StatusArchived`
    (строковые константы `"active"`/`"archived"`).
  - `CreateInput { Name, Description }`, `UpdateInput { ID, Name, Description }`.
  - Валидация домена: `name` непусто (`length(btrim) > 0`) — чистая функция
    `ValidateName` / проверка в service.
  - Доменные ошибки: `ErrNotFound` (площадка или турнир не найдены),
    `ErrInvalidInput` (пустое имя, пустой `tournament_id`, некорректный набор
    `ordered_ids` в Reorder).
  - Порты:
    - `Repository` — `ListByTournament(ctx, tournamentID) ([]Arena, error)`,
      `GetByID(ctx, id) (Arena, error)`,
      `Create(ctx, tournamentID string, in CreateInput) (Arena, error)`
      (position = max+1), `Update(ctx, in UpdateInput) (Arena, error)`,
      `SetStatus(ctx, id string, status Status) (Arena, error)`,
      `Reorder(ctx, tournamentID string, orderedIDs []string) ([]Arena, error)`.
    - `ActiveTournamentProvider` — `ActiveTournamentID(ctx) (string, error)`
      (тот же порт-паттерн, что в nomination; резолв активного турнира через
      API tournament, без доступа к чужой схеме).
- `service/service.go` — юзкейсы:
  - `List(tournamentID)` — валидирует `tournament_id == active`, отдаёт список.
  - `Get(id)`.
  - `Create(tournamentID, in)` — валидация активного турнира + непустого имени →
    `repo.Create`.
  - `Update(in)` — валидация имени → `repo.Update`.
  - `Archive(id)` → `repo.SetStatus(id, StatusArchived)`;
    `Restore(id)` → `repo.SetStatus(id, StatusActive)`. **Идемпотентны**
    (повторная архивация/возврат безопасны — просто выставляют статус; отдельной
    ошибки перехода не вводим, домен простой).
  - `Reorder(tournamentID, orderedIDs)` — валидация активного турнира + что
    `orderedIDs` = текущий набор id → `repo.Reorder`.
- `repo/queries/arena.sql` (`-- name: X :one/:many/:execrows`) + `make sqlc`;
  `repo/repo.go` — реализация `Repository` (Create с `MaxPosition`+1; Reorder
  атомарно в транзакции по образцу nomination).
- `api/handler.go` (`ArenaAdminService`): маппинг proto↔domain, доменные ошибки
  → `connect.Code` (`ErrNotFound`→`NotFound`, `ErrInvalidInput`→`InvalidArgument`).
- `testutil/fake_repo.go` — in-memory `domain.Repository`
  (`var _ domain.Repository = (*FakeRepo)(nil)`); `testutil/fake_active_tournament_provider.go`
  (по образцу nomination) для service/api-тестов.
- `migrations/00001_init.sql` — см. ниже.

### Миграции (DDL целиком)

Схема `arena`. Одна таблица (агрегат-корень; дочерних сущностей нет):

```sql
-- +goose Up
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS arena;

-- arenas — агрегат-корень «площадка/ристалище турнира».
CREATE TABLE arena.arenas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Принадлежность турниру: передаётся клиентом, валидируется сервисом
    -- (в MVP — активный турнир). Без кросс-схемного FK на tournament (ADR 0002).
    tournament_id UUID NOT NULL,
    name          TEXT NOT NULL,                 -- имя/номер ристалища; непусто
    description   TEXT NOT NULL DEFAULT '',       -- описание/локация; может быть пустым
    -- Порядок в списке площадок турнира (0-индекс).
    position      INTEGER NOT NULL,
    -- Статус: 'active' по умолчанию | 'archived' (обратимое «удаление», FR-5).
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_arenas_name     CHECK (length(btrim(name)) > 0),
    CONSTRAINT chk_arenas_position CHECK (position >= 0),
    CONSTRAINT chk_arenas_status   CHECK (status IN ('active','archived'))
);

-- Выборка и сортировка списка площадок по турниру.
CREATE INDEX idx_arenas_tournament ON arena.arenas (tournament_id, position);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS arena.arenas;
DROP SCHEMA IF EXISTS arena;
-- +goose StatementEnd
```

- Зачем `arenas` — агрегат-корень: одна строка = одна площадка турнира.
  Дочерних таблиц нет (бои — будущая фича, отдельная схема, сошлётся на `id`).
- **Уникальности имени нет** намеренно (spec решение 7) — в отличие от
  nomination; одинаковые имена — забота admin.
- Архивация = `status='archived'`, строка остаётся (spec: не теряем будущую
  историю боёв).

### Регистрация и wiring

- `modules/arena/module.go` — `Register(mux, deps, baseOpts, adminOpts)`:
  монтирует `ArenaAdminService` под `baseOpts+adminOpts` (require-admin).
  `Deps{ Pool *pgxpool.Pool; Tournaments domain.ActiveTournamentProvider }`.
- `internal/platform/platform.go`:
  - переиспользуем уже созданный `activeTournaments :=
    tournament.NewActiveTournamentIDProvider(pool)` (он же у nomination/fighter).
  - `arena.Register(mux, arena.Deps{Pool: pool, Tournaments: activeTournaments},
    baseOpts, adminOpts)`.
  - Новых адаптеров-провайдеров не требуется (наружу модуль ни от кого не
    зависит; `ActiveTournamentProvider` уже есть).

### Межмодульные зависимости

- `arena → tournament` — только резолв активного турнира через
  `ActiveTournamentProvider` (уже существующий порт tournament).
- Наружу (кто-то → arena) — **нет** в этом инкременте.
- Прямого доступа к чужим схемам нет (ADR 0002).

### Инфраструктурные точки нового модуля (чек-лист `server/AGENTS.md`)

- `server/sqlc.yaml` — секция `sql:` для `modules/arena`.
- `server/internal/testdb/testdb.go` — `moduleMigrations += arena`.
- Корневой `Makefile` — цели `migrate`/`migrate-down` включают `arena`.
- `server/Dockerfile` — `COPY --from=build /src/modules/arena/migrations
  /app/modules/arena/migrations`.
- Проверить схему в полном докер-стеке: `docker compose up --build` →
  `psql -c '\dn'` содержит `arena`.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

- **BFF (Route Handlers, Node runtime)** — REST→gRPC (Connect), админские
  (под `/api/admin/arenas`, как fighters):
  - `app/api/admin/arenas/route.ts` — GET (list), POST (create).
  - `app/api/admin/arenas/[id]/route.ts` — GET (get), PATCH/PUT (update).
  - `app/api/admin/arenas/[id]/archive/route.ts` — POST.
  - `app/api/admin/arenas/[id]/restore/route.ts` — POST.
  - `app/api/admin/arenas/reorder/route.ts` — POST.
  - Маппинг `connect.Code`→HTTP (существующий хелпер в `lib/grpc`).
- **entities/arena** — типы `Arena`, `ArenaStatus`, маппинг статуса → лейбл
  («активна» / «в архиве»); сериализация proto→JSON.
- **features/arena-management** (admin): `api/` (`requests.ts`, `keys.ts`,
  RQ-хуки: `use-arenas`, `use-create-arena`, `use-update-arena`,
  `use-archive-arena`, `use-restore-arena`, `use-reorder-arenas`), `ui/`
  (`arena-management.tsx` — таблица/список площадок, форма заведения, действия по
  строке: правка, архив/возврат, ссылка «Открыть» на страницу управления;
  reorder — по образцу nomination-management). Мутации инвалидируют ключ списка.
- **Роуты (App Router, admin-зона)**:
  - `app/(admin)/admin/arenas/page.tsx` — список площадок (клиентская фича с
    TanStack Query, как nominations).
  - `app/(admin)/admin/arenas/[id]/page.tsx` — **страница управления площадкой
    (каркас, FR-9)**: server component, SSR `GetArena` по `id`; показывает
    реквизиты (имя, описание, статус) + плейсхолдер-секцию «Управление боями
    появится позже». Это стабильный админский URL.
- **Навигация**: в `app/(admin)/admin/admin-nav.tsx` добавить пункт
  `{ title: "Площадки", href: "/admin/arenas" }`.
- Server component для страницы площадки (SSR gRPC напрямую); список — client
  (мутации, TanStack Query). State: server-state → TanStack Query; UI-state
  (форма/reorder) → useState/Zustand при необходимости.

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей).

- Издаёт: нет.
- Потребляет: нет.

Домен полностью синхронный CRUD; событий не порождает и не слушает. Когда
появятся бои, они будут ссылаться на площадку по `arena_id` — без изменения этой
модели.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит (domain)**: валидация имени (пустое/пробельное отклоняется);
  переключение статуса active↔archived; при необходимости — хелперы Reorder-набора.
- **Юнит (service, fake-репо + fake ActiveTournamentProvider)**: create/update
  (валидация активного турнира и непустого имени), archive/restore
  (идемпотентность), reorder (ordered_ids должен = текущему набору, иначе
  `ErrInvalidInput`), get/list, not-found.
- **E2E ручек (`api/handler_test.go`, httptest + Connect, fake-репо)**:
  `ArenaAdminService` happy-path каждого RPC + маппинг ошибок в `connect.Code`
  + require-admin (без admin → отказ).
- **Интеграционные с БД (build-tag `integration`, testcontainers)**:
  `modules/arena/integration/arena_integration_test.go` — миграции применяются;
  create → list (position растёт) → update → archive → restore → reorder через
  реальный PG и полный Connect-путь. **Обязательно для модуля с PG-схемой**
  (`server/AGENTS.md`).
- **Web (Vitest)**: BFF-роуты arenas (mock grpc-транспорт, `connect.Code`→HTTP,
  `.e2e.test.ts` с реальным `toJson` по proto-ответу — ADR 0010); fetchers
  списка и мутаций (mock `fetch`). Проверить `pnpm exec tsc --noEmit` для
  protobuf-моков.

## Риски и открытые вопросы

- **Reorder и архивные площадки.** `ordered_ids` требует полный текущий набор id
  турнира (как nomination). Если UI прячет архивные из основного списка, набор
  для reorder всё равно должен включать их — на MVP показываем активные и
  архивные в одном списке (архивные приглушены), reorder учитывает все. Если
  захотим reorder только по активным — доработка правила отдельно.
- **Идемпотентность archive/restore.** Выбрано «выставить статус без ошибки
  перехода» (проще, безопасно к повторам). Если понадобится строгий контроль
  (напр. запрет restore не-архивной) — добавить доменную ошибку позже.
- **`tournament_id` в MVP = активный турнир.** Мультитурнирность вне скоупа;
  валидация через `ActiveTournamentProvider`, как в nomination.
- **Стабильный URL = `id` (uuid).** Rename/archive не меняют `id` → FR-8
  выполняется без спец-логики. Человекочитаемый slug осознанно не вводим (иначе
  slug либо застывает, либо URL «врёт» после переименования).
- **Будущая привязка боёв.** Архивация (не удаление) заранее сохраняет строку,
  на которую сошлётся бой; менять модель под бои не придётся (NFR-1).
