# Plan: Номинации турнира

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-07-08
- Спека: `./spec.md`

## Обзор решения

Новый server-модуль `nomination` (bounded context со своей PG-схемой, ADR 0002).
Синхронный CRUD через Connect-RPC. Номинация хранит `tournament_id` и порядок;
все операции идут по **активному турниру**. Идентификатор активного турнира
модуль получает не напрямую из чужой схемы, а через порт
`ActiveTournamentProvider`, реализуемый поверх API модуля `tournament`
(межмодульная зависимость только через API — ADR 0002). Публичное чтение
(`NominationService`) — без auth; управление (`NominationAdminService`) — только
`ROLE_ADMIN` (интерсептор `RequireAdmin`, как в `TournamentAdminService`).
Прочие данные — jsonb-поле `metadata` (произвольный объект). Web: публичная
страница турнира SSR-читает список номинаций через gRPC; админка — раздел
управления номинациями (BFF → gRPC).

Расширяемость под мультитурнирность заложена в модели (`tournament_id` на
номинации): переход = резолв не «активного», а выбранного турнира, без
переписывания сущности.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

- Файл: `proto/hema/v1/nomination.proto` (новый)
- Импорты: `google/protobuf/timestamp.proto`. (`struct.proto` не нужен —
  metadata типизирован, не `Struct`.)
- Сервисы:
  - `NominationService` — публичное чтение (без auth, добавить RPC в
    `publicProcedures` интерсептора Auth):
    - `ListNominations(ListNominationsRequest) → ListNominationsResponse` —
      номинации активного турнира по порядку.
    - `GetNomination(GetNominationRequest) → GetNominationResponse` — одна
      номинация по `id`.
  - `NominationAdminService` — только admin (`RequireAdmin`):
    - `CreateNomination(CreateNominationRequest) → CreateNominationResponse`
    - `UpdateNomination(UpdateNominationRequest) → UpdateNominationResponse`
    - `DeleteNomination(DeleteNominationRequest) → DeleteNominationResponse`
    - `ReorderNominations(ReorderNominationsRequest) → ReorderNominationsResponse`
      — принимает упорядоченный список `id`, задаёт `position` по индексу.
- Сообщения:
  - `Nomination` — `id`, `tournament_id`, `title`, `description`,
    `fighter_capacity` (`optional int32`, presence = «задано»), `metadata`
    (`NominationMetadata`), `position` (int32), `created_at`, `updated_at`
    (`google.protobuf.Timestamp`).
  - `NominationMetadata` — **типизированная закрытая схема прочих данных**. Все
    поля опциональны. MVP: `optional string rules_url = 1;` (ссылка на правила).
    Новые поля добавляются нумерацией proto-полей без миграции БД (хранение —
    jsonb). Закрытость: неизвестных полей в контракте нет по определению
    (типизированный message), при маппинге в/из jsonb пишутся/читаются только
    объявленные ключи.
  - `CreateNominationRequest` — `string tournament_id` (**обязательное**),
    `title`, `description`, `optional int32 fighter_capacity`,
    `NominationMetadata metadata`. Сервер валидирует `tournament_id`
    (существует / в MVP — активный) перед созданием.
  - `UpdateNominationRequest` — `id` + редактируемые поля (полная замена
    значений; `metadata` заменяется целиком). `tournament_id` неизменяем
    (перепривязка номинации к другому турниру — вне скоупа).
  - `DeleteNominationRequest` — `id`; `DeleteNominationResponse` — пустой.
  - `ReorderNominationsRequest` — `string tournament_id` (**обязательное**,
    скоуп переупорядочивания) + `repeated string ordered_ids`;
    `ReorderNominationsResponse` — обновлённый список `repeated Nomination`.
  - `ListNominationsRequest` — `string tournament_id` (**обязательное**);
    `ListNominationsResponse` — `repeated Nomination`.
  - `GetNominationRequest` — `string id`; `GetNominationResponse` — `Nomination`.
- Общие типы (`common.proto`): не требуются.
- После правки — `make generate`.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

- Модуль: `modules/nomination/` — **новый bounded context**
- PG-схема: `nomination` (миграция создаёт схему + таблицу)
- Слои:
  - `domain/domain.go`:
    - Сущность `Nomination` — `ID`, `TournamentID`, `Title`, `Description`,
      `FighterCapacity int32` + `HasFighterCapacity bool` (presence),
      `Metadata Metadata` (типизированная структура), `Position int32`,
      `CreatedAt`, `UpdatedAt`.
    - Тип `Metadata` — типизированная закрытая схема прочих данных. MVP:
      `RulesURL string` (пусто = не задано). Сериализуется в jsonb только
      объявленными ключами (`{"rules_url": "..."}`); пустая → `{}`.
    - `CreateInput` — `Title`, `Description`, `FighterCapacity`/`Has…`,
      `Metadata`. `UpdateInput` — `ID` + те же поля.
    - Порт `Repository`: `ListByTournament(ctx, tournamentID) ([]Nomination, error)`,
      `GetByID(ctx, id) (Nomination, error)`,
      `Create(ctx, tournamentID string, in CreateInput) (Nomination, error)`,
      `Update(ctx, in UpdateInput) (Nomination, error)`,
      `Delete(ctx, id string) error`,
      `Reorder(ctx, tournamentID string, orderedIDs []string) ([]Nomination, error)`.
    - Порт `ActiveTournamentProvider`: `ActiveTournamentID(ctx) (string, error)`
      — межмодульная зависимость (реализуется поверх `tournament`-сервиса).
      Используется для **валидации** переданного клиентом `tournament_id`
      (в MVP: `in.TournamentID` должен совпасть с активным, иначе `ErrNotFound`).
    - Доменные ошибки: `ErrNotFound` (номинация/активный турнир не найден),
      `ErrInvalidInput` (пустое название, отрицательная вместимость, невалидный
      metadata-объект), `ErrConflict` (дубликат названия в турнире).
  - `service/service.go` — юзкейсы `List`, `Get`, `Create`, `Update`, `Delete`,
    `Reorder`. Валидация: непустой `Title`; `FighterCapacity >= 0` если задан;
    `Metadata` — по типизированной схеме (в MVP `RulesURL` опционален; при
    надобности — базовая проверка непустоты/URL); `TournamentID` непустой и
    валиден — через `ActiveTournamentProvider` в `Create`/`List`/`Reorder`
    (в MVP: совпадает с активным, иначе `ErrNotFound`); маппинг конфликта
    уникальности из repo в `ErrConflict`.
  - `repo/queries/nomination.sql` — sqlc:
    `ListNominationsByTournament :many`, `GetNomination :one`,
    `CreateNomination :one` (position = следующий за максимумом в турнире),
    `UpdateNomination :one`, `DeleteNomination :exec`,
    `MaxPosition :one`. `Reorder` — транзакция в `repo.go` (пакетный UPDATE
    position по `ordered_ids`, затем перечитать список). `repo/repo.go` —
    реализация порта; маппинг ошибки уникального индекса (pg код `23505`) в
    `domain.ErrConflict`, `pgx.ErrNoRows` в `domain.ErrNotFound`.
  - `api/handler.go` — Connect `NominationServiceHandler` (публичный) и
    `NominationAdminServiceHandler` (admin); маппинг proto↔domain
    (`toProtoNomination`, `metadata`: `NominationMetadata` ↔ `domain.Metadata`
    по полям; `fighter_capacity`: `optional int32` ↔ `Has…`), ошибки→`connect.Code`
    (`ErrNotFound`→`CodeNotFound`, `ErrInvalidInput`→`CodeInvalidArgument`,
    `ErrConflict`→`CodeAlreadyExists`).
  - `migrations/00001_init.sql` — goose, **DDL целиком** (см. таблицу схемы
    ниже, раздел «Схема БД»).
  - `testutil/fake_repo.go` — in-memory `domain.Repository`
    (`var _ domain.Repository = (*FakeRepo)(nil)`); плюс fake
    `ActiveTournamentProvider` для тестов service/api.
- Регистрация: `module.go` — `Register(mux, deps, baseOpts, adminOpts)` по
  образцу `tournament`: `NominationService` — под `baseOpts`;
  `NominationAdminService` — под `baseOpts + adminOpts`. `Deps` — `Pool` +
  `ActiveTournamentProvider`.
- Межмодульные зависимости: `nomination` → `tournament` **через порт**
  `ActiveTournamentProvider`. Реализация в `internal/platform`: адаптер поверх
  `tournament`-сервиса (`GetActive(...).ID`), внедряется в `nomination.Deps`.
  Прямых обращений к схеме `tournament` нет.
- Публичные процедуры: добавить `NominationService` RPC в `publicProcedures`
  интерсептора Auth (как у `TournamentService`).

## Схема БД

> Схема `nomination` (миграция создаёт её). Одна таблица-aggregate root на
> номинацию; прочие данные — в jsonb-колонке `metadata` (отдельной таблицы не
> требуется). `CREATE SCHEMA IF NOT EXISTS nomination;`

### Таблица `nomination.nominations`

| Колонка            | Тип           | Null | Default              | Назначение |
| ------------------ | ------------- | ---- | -------------------- | ---------- |
| `id`               | `UUID`        | NO   | `gen_random_uuid()`  | PK номинации |
| `tournament_id`    | `UUID`        | NO   | —                    | Ссылка на турнир. **Обязателен**: передаётся клиентом явно и валидируется сервисом (в MVP — активный турнир). **Без FK** на `tournament.tournaments` — кросс-схемные границы модулей (ADR 0002); целостность держит сервис |
| `title`            | `TEXT`        | NO   | —                    | Название номинации (обязательное, непустое) |
| `description`      | `TEXT`        | NO   | `''`                 | Описание |
| `fighter_capacity` | `INTEGER`     | YES  | `NULL`               | Плановая вместимость; `NULL` = не задано |
| `metadata`         | `JSONB`       | NO   | `'{}'::jsonb`        | Прочие данные (типизированная закрытая схема; MVP-ключ `rules_url`) |
| `position`         | `INTEGER`     | NO   | —                    | Порядок в списке турнира (0-индекс) |
| `created_at`       | `TIMESTAMPTZ` | NO   | `now()`              | Момент создания |
| `updated_at`       | `TIMESTAMPTZ` | NO   | `now()`              | Момент последнего изменения |

**Констрейнты:**

- `CONSTRAINT chk_nominations_capacity CHECK (fighter_capacity IS NULL OR fighter_capacity >= 0)`
  — вместимость неотрицательна (FR-10/AC-9).
- `CONSTRAINT chk_nominations_position CHECK (position >= 0)`.
- `CONSTRAINT chk_nominations_metadata_object CHECK (jsonb_typeof(metadata) = 'object')`
  — metadata всегда JSON-объект (не массив/скаляр).

**Индексы:**

- `CREATE UNIQUE INDEX nominations_title_per_tournament ON nomination.nominations (tournament_id, lower(title));`
  — уникальность названия в пределах турнира без учёта регистра (FR-9/AC-8);
  источник `ErrConflict` (pg `23505`).
- `CREATE INDEX idx_nominations_tournament ON nomination.nominations (tournament_id, position);`
  — выборка и сортировка списка по турниру.

**Сид:** не нужен (номинации заводит admin). **Down:** `DROP TABLE` +
`DROP SCHEMA IF EXISTS nomination`.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

- BFF (Route Handlers, Node runtime):
  - `app/api/nominations/route.ts` — `GET` (публичный список; `tournamentId`
    в query) и `POST` (admin, создание; `tournamentId` в теле).
  - `app/api/nominations/[id]/route.ts` — `GET` (одна), `PUT` (admin, изменение),
    `DELETE` (admin, удаление).
  - `app/api/nominations/reorder/route.ts` — `POST` (admin, порядок;
    `tournamentId` + `orderedIds` в теле).
  - Маппинг `connect.Code`→HTTP (`CodeNotFound`→404, `CodeInvalidArgument`→400,
    `CodeAlreadyExists`→409, auth→401/403).
- Слои:
  - `entities/nomination/` — `lib/types.ts` (типы из proto; `metadata` —
    типизированный объект `{ rulesUrl?: string }`), server-only геттер списка
    номинаций активного турнира для SSR публичной страницы.
  - `features/nomination-management/` — `api/requests.ts` (list/get/create/
    update/delete/reorder), `api/keys.ts`, RQ-хуки (`use-nominations`,
    `use-create-nomination`, `use-update-nomination`, `use-delete-nomination`,
    `use-reorder-nominations`), `ui/` — список + форма (поля title/description/
    fighter_capacity + типизированное поле `rules_url`) + управление порядком.
  - `widgets/nominations-list/` — публичная секция страницы турнира: карточки
    номинаций; пустые поля скрываются (FR-12/AC-10).
- Server components vs client:
  - Публичная страница турнира — server component: SSR списка номинаций через
    `entities/nomination/model`, рендер `NominationsList`.
  - Админка — новый раздел `app/(admin)/admin/nominations/page.tsx` (server
    component-обёртка) + client-UI из `features/nomination-management/ui`.
- State: server-state → TanStack Query (ключ списка номинаций); форма — локальный
  `useState`; мутации `useMutation` → `onSuccess` инвалидирует ключ списка;
  порядок — оптимистичное обновление или инвалидация после `reorder`.

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей).

- Издаёт: нет
- Потребляет: нет

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- Юнит (`service/` с fake-репо + fake `ActiveTournamentProvider`): `Create`
  (счастливый путь), валидация (пустой title → `ErrInvalidInput`, отрицательная
  вместимость → `ErrInvalidInput`, пустой/неактивный `tournament_id` →
  `ErrInvalidInput`/`ErrNotFound`), маппинг metadata по типизированной схеме;
  маппинг дубликата названия из repo → `ErrConflict`; `Update`/`Delete`/`Get`
  (в т.ч. `ErrNotFound`); `List` (порядок по position); `Reorder` (перестановка).
- E2E ручек (`api/` через httptest + Connect): публичные `ListNominations`
  (по `tournament_id`) / `GetNomination` без auth; admin-RPC — счастливый путь
  (в т.ч. обязательный `tournament_id` в `Create`) и маппинг доменных
  ошибок в `connect.Code` (`CodeInvalidArgument`, `CodeNotFound`,
  `CodeAlreadyExists`); `fighter_capacity` presence и `metadata`
  (`NominationMetadata`↔jsonb, поле `rules_url`) round-trip.
- Интеграционные с БД (`integration/`): миграция + sqlc — уникальный индекс
  `(tournament_id, lower(title))`, `Reorder` в транзакции, CHECK на metadata
  как object и capacity `>= 0`, выборка по порядку.
- Web (Vitest): маппинг `connect.Code`→HTTP в BFF-роутах; fetchers
  (`requests.ts`) с mock `fetch`; сериализация proto↔JSON (metadata,
  fighter_capacity presence); рендер `NominationsList` со скрытием пустых полей.

## Риски и открытые вопросы

- **Валидация `tournament_id` (межмодульная зависимость).** Клиент передаёт
  `tournament_id` явно; сервис проверяет его через `ActiveTournamentProvider`
  (в MVP — совпадение с активным турниром), не обращаясь напрямую к схеме
  `tournament`. Реализуем адаптером поверх `tournament`-сервиса в
  `internal/platform`. Несуществующий/неактивный турнир → `ErrNotFound`.
- **Отсутствие FK на `tournament_id`.** Поле `NOT NULL` и валидируется в
  сервисе, но ссылочной целостности на уровне БД нет (кросс-схема). Приемлемо
  для MVP (один сид-турнир); при мультитурнирности — пересмотреть (события об
  удалении турнира / каскад на уровне приложения).
- **`metadata` (типизированная схема ↔ jsonb).** Маппинг proto
  `NominationMetadata` ↔ `domain.Metadata` ↔ jsonb: пишем/читаем только
  объявленные ключи (MVP — `rules_url`), пустое значение нормализуем в `{}`,
  CHECK `jsonb_typeof = 'object'`. Новое поле схемы = правка proto/domain без
  миграции БД. Проверить round-trip в api- и integration-тестах.
- **`Reorder` частичным списком.** Оговорить контракт: `ordered_ids` должен
  содержать ровно текущий набор номинаций турнира; иначе `ErrInvalidInput`.
- **presence `fighter_capacity`.** proto3 `optional` даёт presence; следить, что
  «0» и «не задано» различаются на всех слоях (proto → domain `Has…` → NULL в БД
  → JSON в BFF).
