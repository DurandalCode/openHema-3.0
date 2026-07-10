# Plan: Флоу подачи заявки бойца (event-sourced)

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-07-10
- Спека: `./spec.md`

## Предусловие: ADR по Event-Driven Design

Это **первый событийный bounded context** в проекте (спека, «Принятые решения»
п.1). Раздел «События» в шаблоне перестаёт быть плейсхолдером. Реализации должен
предшествовать **ADR 0011 «Event-Driven Design / event sourcing»**, фиксирующий
конвенции, на которые опирается весь план ниже:

- **Единица консистентности** — агрегат «заявка»; один поток событий на одну
  заявку (`aggregate_id`).
- **Event store** — append-only таблица событий; событие неизменяемо (FR-10).
- **Оптимистичная конкуренция** — версия внутри потока (`UNIQUE(aggregate_id,
  version)`); конфликт версий → повтор/отказ команды (NFR-3).
- **Реконструкция** — состояние агрегата = свёртка (fold) событий потока
  (FR-9/AC-11).
- **Инлайн-проекция (read-model)** в той же транзакции, что и запись события —
  для (а) обеспечения инвариантов, невыразимых на «сыром» журнале (запрет
  активного дубля, FR-12), и (б) дешёвого чтения списков/статусов (NFR-1).
  Снапшоты как оптимизация — вне скоупа (спека).
- **Наименование событий** — прошедшее время, домен-факт (`ApplicationSubmitted`
  и т.д.).
- **Кроссдоменные события** — терминальный факт `FighterRegistered` пока только
  фиксируется; публикация в домен бойцов — будущая фича (ADR оговорит механизм —
  in-process шина/outbox — как будущее).

Без принятого ADR 0011 к коду не переходим (TDD-цикл начинается после него).

## Обзор решения

Новый server-модуль `application` (bounded context со своей PG-схемой, ADR 0002)
— **event-sourced**. Заявка не хранится строкой: источник истины — журнал
событий `application.events`; агрегат `Application` реконструируется свёрткой
своего потока. Команды (`Submit`/`DeclarePayment`/`ConfirmPayment`/`Register`/
`Withdraw`) идут по циклу **load stream → decide (state machine) → append event(s)**
с оптимистичной конкуренцией по версии потока. Параллельно ведётся **инлайн-
проекция** `application.application_current` (текущее состояние на агрегат),
обновляемая в одной транзакции с записью события — она несёт инвариант «нет
активного дубля» (partial unique) и обслуживает дешёвые чтения (списки по
номинации, «мои заявки», счётчик зарегистрированных).

Заявитель — аутентифицированный `user` (заявка привязана к `user_id`);
секретарские RPC требуют `admin` (`RequireAdmin`, как у `NominationAdminService`).
Номинацию (существование, `tournament_id`, `fighter_capacity`) модуль резолвит не
из чужой схемы, а через порт `NominationProvider` поверх API модуля `nomination`
(межмодульная зависимость только через API — ADR 0002). Терминальная регистрация
фиксирует факт `FighterRegistered`; создание сущности бойца — будущая фича.

Списки и счётчики — из той же проекции: «заявлено» (неотозванные) и
«подтверждено» (оплата подтверждена и выше) на номинацию, сводный список заявок
турнира с фильтрами по статусу/номинации. **Имена** заявителей в заявке не
дублируются — резолвятся из домена `auth` через порт `UserProvider` (батч по
`user_id`, ADR 0002). Публичный стартовый лист номинации (имена + счётчик) —
отдельный **публичный** RPC (без auth).

Web: боец — экран подачи заявки + «мои заявки» со статусами и действиями
(оплатить/отозвать); админка — раздел заявок номинации с действиями секретаря
(подтвердить оплату / зарегистрировать), просмотром истории и **сводным экраном
всех заявок турнира** с фильтрами; публичная страница номинации — стартовый лист
(имена заявленных/подтверждённых + счётчик «заявлено · подтверждено / лимит»).

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

- Файл: `proto/hema/v1/application.proto` (новый)
- Импорты: `google/protobuf/timestamp.proto`.
- Enum:
  - `ApplicationState`: `APPLICATION_STATE_UNSPECIFIED=0`, `SUBMITTED=1`,
    `AWAITING_PAYMENT_CONFIRMATION=2`, `PAID=3`, `REGISTERED=4`, `WITHDRAWN=5`.
  - `ApplicationEventType`: `..._UNSPECIFIED=0`, `SUBMITTED=1`,
    `PAYMENT_DECLARED=2`, `PAYMENT_CONFIRMED=3`, `FIGHTER_REGISTERED=4`,
    `WITHDRAWN=5`. (Отражают доменные события спеки.)
- Сервисы:
  - `ApplicationService` — заявитель, **требует auth** (не в `publicProcedures`):
    - `SubmitApplication(SubmitApplicationRequest) → SubmitApplicationResponse`
      — подать заявку в номинацию (caller = заявитель из access-токена).
    - `DeclarePayment(DeclarePaymentRequest) → DeclarePaymentResponse` — отметить
      оплату своей заявки.
    - `WithdrawApplication(WithdrawApplicationRequest) → WithdrawApplicationResponse`
      — отозвать свою заявку.
    - `ListMyApplications(ListMyApplicationsRequest) → ListMyApplicationsResponse`
      — заявки текущего пользователя (по `user_id` из токена) со статусами.
    - `GetApplication(GetApplicationRequest) → GetApplicationResponse` — одна
      заявка + история; доступна владельцу или admin.
  - `ApplicationAdminService` — только admin/секретарь (`RequireAdmin`):
    - `ConfirmPayment(ConfirmPaymentRequest) → ConfirmPaymentResponse`
    - `RegisterFighter(RegisterFighterRequest) → RegisterFighterResponse`
      — регистрирует; ответ несёт мягкое предупреждение о переполнении.
    - `ListNominationApplications(ListNominationApplicationsRequest) →
      ListNominationApplicationsResponse` — заявки номинации с состоянием
      (для приёма участников).
    - `ListApplications(ListApplicationsRequest) → ListApplicationsResponse`
      — **сводный экран** заявок турнира с лёгкой фильтрацией по статусу и
      номинации (FR-14).
  - `ApplicationPublicService` — **публичное** чтение стартового листа (без auth,
    добавить RPC в `publicProcedures` интерсептора Auth):
    - `ListNominationParticipants(ListNominationParticipantsRequest) →
      ListNominationParticipantsResponse` — имена заявленных/подтверждённых +
      счётчики номинации (FR-15/FR-16).
- Сообщения:
  - `Application` — `id`, `nomination_id`, `tournament_id`,
    `applicant_user_id`, `string applicant_display_name`, `ApplicationState state`,
    `created_at`, `updated_at` (`Timestamp`). Поля состояния **выведены** из
    событий (проекция); `applicant_display_name` — обогащение в api-слое через
    `UserProvider` (в журнале/проекции не хранится).
  - `NominationParticipant` — публичный элемент стартового листа: `string
    display_name`, `ApplicationState state`. **Без** `user_id` (публичная выдача
    не раскрывает идентификаторы).
  - `ApplicationEvent` — `ApplicationEventType type`, `string actor_id`,
    `google.protobuf.Timestamp occurred_at`, `int32 sequence` (номер в потоке).
    Для истории (AC-10). Полезной нагрузки в MVP нет (оплата — статусный переход).
  - `SubmitApplicationRequest` — `string nomination_id`. (Заявитель берётся из
    токена — в теле не передаётся, права FR-11.)
    `SubmitApplicationResponse` — `Application application`.
  - `DeclarePaymentRequest` / `WithdrawApplicationRequest` — `string application_id`;
    ответы — `Application application`.
  - `ConfirmPaymentRequest` — `string application_id`;
    `ConfirmPaymentResponse` — `Application application`.
  - `RegisterFighterRequest` — `string application_id`;
    `RegisterFighterResponse` — `Application application` + `bool capacity_exceeded`
    (мягкое предупреждение, FR-13/AC-14).
  - `GetApplicationRequest` — `string application_id`;
    `GetApplicationResponse` — `Application application` +
    `repeated ApplicationEvent history`.
  - `ListMyApplicationsRequest` — пустой (пользователь из токена);
    `ListMyApplicationsResponse` — `repeated Application applications`.
  - `ListNominationApplicationsRequest` — `string nomination_id`;
    `ListNominationApplicationsResponse` — `repeated Application applications`.
  - `ListApplicationsRequest` — `string tournament_id` (обязателен),
    `optional ApplicationState status` (фильтр по состоянию),
    `optional string nomination_id` (фильтр по номинации). Фильтры комбинируются;
    отсутствие = без фильтра. `ListApplicationsResponse` —
    `repeated Application applications` (с `applicant_display_name`).
  - `ListNominationParticipantsRequest` — `string nomination_id`;
    `ListNominationParticipantsResponse` — `repeated NominationParticipant
    participants`, `int32 applied_count`, `int32 confirmed_count`,
    `optional int32 fighter_capacity` (лимит из номинации; отсутствие = не задан).
- Общие типы (`common.proto`): не требуются.
- После правки — `make generate`.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит), `server/AGENTS.md`, будущий ADR 0011.

- Модуль: `modules/application/` — **новый event-sourced bounded context**
- PG-схема: `application` (миграция создаёт схему + таблицы)
- Слои:
  - `domain/domain.go`:
    - Тип `State` (строка-enum): `StateSubmitted`,
      `StateAwaitingPaymentConfirmation`, `StatePaid`, `StateRegistered`,
      `StateWithdrawn`. Хелперы `IsTerminal()`, `IsActive()` (нетерминальное).
    - Тип `EventType` (строка-enum): `EventSubmitted`, `EventPaymentDeclared`,
      `EventPaymentConfirmed`, `EventFighterRegistered`, `EventWithdrawn`.
    - `Event` — `Type EventType`, `ActorID string`, `OccurredAt time.Time`,
      `Sequence int` (1-based в потоке). Для `Submitted` — сопутствующие данные
      потока (`NominationID`, `TournamentID`, `ApplicantUserID`) кладутся в
      `Payload` (см. ниже) — они задают идентичность потока.
    - `Payload` — типизированная структура полезной нагрузки (в MVP значима
      только для `Submitted`: `NominationID`, `TournamentID`, `ApplicantUserID`).
      Сериализуется в jsonb.
    - Агрегат `Application` — `ID`, `NominationID`, `TournamentID`,
      `ApplicantUserID`, `State`, `Version int`, `CreatedAt`, `UpdatedAt`.
      Метод `Rebuild(events []Event) (Application, error)` — свёртка потока
      (fold): применяет события по порядку, вычисляет текущее состояние
      (FR-9/AC-11). Внутренний `apply(Event)` — переход состояния.
    - **Команды-решения** (чистая доменная логика, без БД): по текущему агрегату
      и caller-у возвращают новое событие либо доменную ошибку недопустимого
      перехода/прав:
      - `Submit(...)` — конструктор нового потока (агрегата ещё нет) → `Submitted`.
      - `(a Application) DeclarePayment(actorID) (Event, error)` — только из
        `Submitted`, только владелец.
      - `(a Application) ConfirmPayment(actorID) (Event, error)` — только из
        `AwaitingPaymentConfirmation`.
      - `(a Application) Register(actorID) (Event, error)` — только из `Paid`.
      - `(a Application) Withdraw(actorID) (Event, error)` — из любого активного,
        только владелец.
    - Порт `Repository` (event store + read-model):
      - `Load(ctx, appID string) ([]Event, error)` — поток событий заявки
        (`ErrNotFound` если потока нет).
      - `Append(ctx, appID string, expectedVersion int, ev Event, view ApplicationView) error`
        — атомарно: вставить событие с `version = expectedVersion+1` и обновить
        проекцию; конфликт версии → `ErrConcurrency`; нарушение активного дубля →
        `ErrDuplicateActive`.
      - `ActiveExists(ctx, userID, nominationID string) (bool, error)` —
        предпроверка дубля (FR-12) до формирования события (быстрый отказ; жёсткую
        гарантию держит partial unique в `Append`).
      - `ListByApplicant(ctx, userID string) ([]ApplicationView, error)`.
      - `ListByNomination(ctx, nominationID string) ([]ApplicationView, error)`
        — все заявки номинации (для admin-разреза по номинации).
      - `ListByTournament(ctx, tournamentID string, status *State, nominationID *string)
        ([]ApplicationView, error)` — сводный экран с опциональными фильтрами
        (FR-14). `nil`-фильтр = без ограничения.
      - `ParticipantsByNomination(ctx, nominationID string) ([]ApplicationView, error)`
        — **неотозванные** заявки номинации для стартового листа (FR-15).
      - `CountRegistered(ctx, nominationID string) (int, error)` — для мягкого
        предупреждения (FR-13).
      - `CountsByNomination(ctx, nominationID string) (applied, confirmed int, error)`
        — «заявлено» (неотозванные) и «подтверждено» (оплачена+зарегистр.) для
        счётчика (FR-16).
    - `ApplicationView` — плоское текущее состояние (для проекции/чтения):
      `ID`, `NominationID`, `TournamentID`, `ApplicantUserID`, `State`,
      `Version`, `CreatedAt`, `UpdatedAt`.
    - Порт `NominationProvider` (межмодульный): `Nomination(ctx, nominationID)
      (NominationInfo, error)` → `{TournamentID string, FighterCapacity *int}`;
      `ErrNominationNotFound` если нет. Реализуется поверх `nomination`-сервиса.
    - Порт `UserProvider` (межмодульный, домен `auth`): `DisplayNames(ctx, ids
      []string) (map[string]string, error)` — батч-резолв отображаемых имён
      заявителей (FR-15). Реализуется поверх `auth`-сервиса. Имя недоступного/
      удалённого пользователя — пустое/плейсхолдер (graceful, не ошибка).
    - Доменные ошибки: `ErrNotFound` (заявка/поток), `ErrForbidden` (не владелец),
      `ErrInvalidTransition` (недопустимый переход из текущего состояния),
      `ErrDuplicateActive` (активный дубль), `ErrNominationNotFound`,
      `ErrConcurrency` (конфликт версии).
  - `service/service.go` — юзкейсы, оркестрирующие load → decide → append:
    - `Submit(ctx, callerID, nominationID)` — резолв номинации через
      `NominationProvider` (→ `tournament_id`); предпроверка `ActiveExists`
      (быстрый `ErrDuplicateActive`); `domain.Submit` → `Append` нового потока
      (`expectedVersion=0`). Partial unique в `Append` — финальный арбитр гонки
      (NFR-3): нарушение → `ErrDuplicateActive`.
    - `DeclarePayment`/`Withdraw` — `Load` → `Rebuild` → проверка владельца
      (caller == `ApplicantUserID`, иначе `ErrForbidden`) → доменная команда →
      `Append(expectedVersion=agg.Version)`.
    - `ConfirmPayment`/`Register` — `Load` → `Rebuild` → доменная команда →
      `Append`. `Register` дополнительно: `CountRegistered` vs `FighterCapacity`
      → `capacityExceeded bool` в результат (не блокирует).
    - `GetApplication` — `Load` → `Rebuild` + маппинг событий в историю; проверка
      доступа (владелец или admin — флаг из api-слоя).
    - `ListMy(ctx, callerID)` / `ListByNomination(ctx, nominationID)` — из
      проекции.
    - `ListApplications(ctx, tournamentID, status, nominationID)` — сводный экран:
      `ListByTournament` с фильтрами (FR-14).
    - `NominationParticipants(ctx, nominationID)` — стартовый лист:
      `ParticipantsByNomination` + `CountsByNomination` + `Nomination(...)` для
      лимита; имена — через `UserProvider.DisplayNames` (FR-15/FR-16).
    - **Обогащение именами.** Юзкейсы, отдающие заявки/участников наружу с именем
      (`ListApplications`, `ListByNomination`, `NominationParticipants`,
      `GetApplication`), собирают уникальные `applicant_user_id` и один раз
      батч-резолвят имена через `UserProvider` (без N+1). Проекция/журнал имя не
      хранят — источник имени всегда `auth`.
    - `ErrConcurrency` при `Append`: в MVP — прозрачный один повтор (reload →
      redecide → reappend) или отдать `Aborted` наружу. Решение оговорить в
      ADR 0011; по умолчанию — один повтор, затем `Aborted`.
  - `repo/queries/application.sql` — sqlc:
    - `AppendEvent :exec` — INSERT в `events` (`aggregate_id`, `version`,
      `event_type`, `payload`, `actor_id`, `occurred_at`).
    - `UpsertCurrent :exec` — INSERT ... ON CONFLICT (`application_id`) DO UPDATE
      проекции (`state`, `version`, `updated_at`).
    - `LoadStream :many` — события заявки по `aggregate_id ORDER BY version`.
    - `GetCurrent :one` — проекция по `application_id`.
    - `ExistsActive :one` — есть ли активная запись по (`applicant_user_id`,
      `nomination_id`).
    - `ListByApplicant :many`, `ListByNomination :many`.
    - `ListByTournament :many` — сводный экран с опциональными фильтрами (sqlc
      nullable-параметры: `WHERE tournament_id=@tournament_id AND
      (@status::text IS NULL OR state=@status) AND
      (@nomination_id::uuid IS NULL OR nomination_id=@nomination_id)`).
    - `ParticipantsByNomination :many` — `WHERE nomination_id=$1 AND state <>
      'withdrawn'` (стартовый лист).
    - `CountRegistered :one` — `count(*) WHERE nomination_id=$1 AND state='registered'`.
    - `CountsByNomination :one` — одним запросом: `applied` =
      `count(*) FILTER (WHERE state <> 'withdrawn')`, `confirmed` =
      `count(*) FILTER (WHERE state IN ('paid','registered'))`, `WHERE
      nomination_id=$1` (FR-16).
    - `repo/repo.go` — реализация порта. `Append` — **в транзакции**:
      `AppendEvent` + `UpsertCurrent`. Маппинг ошибок:
      `UNIQUE(aggregate_id, version)` (pg `23505`) → `ErrConcurrency`;
      partial unique активного дубля (`23505`) → `ErrDuplicateActive`
      (различать по имени констрейнта); `pgx.ErrNoRows` → `ErrNotFound`.
  - `api/handler.go` — Connect `ApplicationServiceHandler` (auth) и
    `ApplicationAdminServiceHandler` (admin). Caller — из context-key
    `CallerID`/`CallerRole` (`pkg/connectutil`, как в auth/nomination). Маппинг
    proto↔domain (`toProtoApplication`, `toProtoState`, `toProtoEvent`), ошибки →
    `connect.Code`: `ErrNotFound`→`CodeNotFound`, `ErrForbidden`→
    `CodePermissionDenied`, `ErrInvalidTransition`→`CodeFailedPrecondition`,
    `ErrDuplicateActive`→`CodeAlreadyExists`, `ErrNominationNotFound`→
    `CodeNotFound`/`CodeInvalidArgument`, `ErrConcurrency`→`CodeAborted`.
  - `migrations/00001_init.sql` — goose, **DDL целиком** (раздел «Схема БД»).
  - `testutil/fake_repo.go` — in-memory `domain.Repository` (map потоков +
    проекция; воспроизводит оптимистичную конкуренцию и активный дубль;
    реализует фильтры/счётчики/участников); `var _ domain.Repository =
    (*FakeRepo)(nil)`; fake `NominationProvider` и fake `UserProvider`
    (детерминированные имена по id).
- Регистрация: `module.go` — `Register(mux, deps, baseOpts, adminOpts)`:
  `ApplicationService` — под `baseOpts` (auth, **не** public);
  `ApplicationAdminService` — под `baseOpts + adminOpts`; `ApplicationPublicService`
  — под `baseOpts` (публичное чтение). `Deps` — `Pool` + `NominationProvider` +
  `UserProvider`.
- Межмодульные зависимости:
  - `application` → `nomination` **через порт** `NominationProvider` (адаптер
    поверх `nomination`-сервиса в `internal/platform`:
    `GetNomination(...).TournamentID/FighterCapacity`).
  - `application` → `auth` **через порт** `UserProvider` (адаптер поверх
    `auth`-сервиса: батч-резолв `display_name` по `user_id`). В `auth` нужен
    in-process способ отдать имена по списку id (Go-порт/метод сервиса; отдельный
    Connect-RPC не обязателен в монолите — при выносе `application` в сервис
    промотировать в RPC, см. «Риски»).
  - Прямых обращений к чужим схемам (`nomination`/`auth`) нет.
  - `application` → `tournament`: не нужен (tournament_id берётся из номинации).
- Публичные процедуры: `ApplicationPublicService.ListNominationParticipants` —
  добавить в `publicProcedures` интерсептора Auth (стартовый лист без токена,
  как `NominationService`). `ApplicationService`/`ApplicationAdminService` —
  под auth/admin, не публичные.
- Инфраструктурные точки нового модуля (чеклист `server/AGENTS.md`):
  `server/sqlc.yaml`, `server/internal/testdb/testdb.go` (`moduleMigrations`),
  корневой `Makefile` (`migrate`/`migrate-down`), `server/Dockerfile`
  (`COPY ... modules/application/migrations`). Проверить в полном докер-стеке.

## Схема БД

> Схема `application` (миграция создаёт её). Две таблицы: **журнал событий**
> (источник истины) и **инлайн-проекция** текущего состояния (инвариант дубля +
> дешёвое чтение). `CREATE SCHEMA IF NOT EXISTS application;`

### Таблица `application.events` — журнал (источник истины, append-only)

| Колонка        | Тип           | Null | Default             | Назначение |
| -------------- | ------------- | ---- | ------------------- | ---------- |
| `id`           | `UUID`        | NO   | `gen_random_uuid()` | PK записи события |
| `aggregate_id` | `UUID`        | NO   | —                   | Идентификатор потока = id заявки |
| `version`      | `INTEGER`     | NO   | —                   | Порядковый номер события в потоке (1-based); оптимистичная конкуренция |
| `event_type`   | `TEXT`        | NO   | —                   | Тип доменного события (`submitted`/`payment_declared`/…) |
| `payload`      | `JSONB`       | NO   | `'{}'::jsonb`       | Полезная нагрузка (значима для `submitted`: nomination_id/tournament_id/applicant_user_id) |
| `actor_id`     | `UUID`        | NO   | —                   | Инициатор события (заявитель или admin) |
| `occurred_at`  | `TIMESTAMPTZ` | NO   | `now()`             | Момент события |

**Констрейнты:**

- `CONSTRAINT chk_events_version CHECK (version >= 1)`.
- `CONSTRAINT chk_events_payload_object CHECK (jsonb_typeof(payload) = 'object')`.
- `CONSTRAINT uq_events_stream_version UNIQUE (aggregate_id, version)` —
  оптимистичная конкуренция: две команды с одной ожидаемой версией не вставятся
  обе (NFR-3). Нарушение → `ErrConcurrency`.

**Индексы:**

- `UNIQUE (aggregate_id, version)` (см. выше) обслуживает и загрузку потока
  (`WHERE aggregate_id=$1 ORDER BY version`).

Журнал **никогда** не UPDATE/DELETE (FR-10) — только INSERT.

### Таблица `application.application_current` — инлайн-проекция (read-model)

> Выводимое из журнала текущее состояние. Хранится ради (а) инварианта «нет
> активного дубля» и (б) дешёвых чтений (NFR-1). Обновляется в **той же
> транзакции**, что и вставка события. Может быть перестроена из журнала.

| Колонка             | Тип           | Null | Default | Назначение |
| ------------------- | ------------- | ---- | ------- | ---------- |
| `application_id`    | `UUID`        | NO   | —       | PK = `aggregate_id` заявки |
| `nomination_id`     | `UUID`        | NO   | —       | Номинация заявки |
| `tournament_id`     | `UUID`        | NO   | —       | Турнир (из номинации на момент подачи) |
| `applicant_user_id` | `UUID`        | NO   | —       | Заявитель (для «моих заявок» и прав) |
| `state`             | `TEXT`        | NO   | —       | Текущее состояние (свёртка потока) |
| `version`           | `INTEGER`     | NO   | —       | Версия = число событий в потоке |
| `created_at`        | `TIMESTAMPTZ` | NO   | `now()` | Момент подачи (первое событие) |
| `updated_at`        | `TIMESTAMPTZ` | NO   | `now()` | Момент последнего события |

**Констрейнты:**

- `PRIMARY KEY (application_id)`.
- `CONSTRAINT chk_current_state CHECK (state IN ('submitted',
  'awaiting_payment_confirmation','paid','registered','withdrawn'))`.

**Индексы:**

- `CREATE UNIQUE INDEX uq_current_active_per_user_nomination
  ON application.application_current (applicant_user_id, nomination_id)
  WHERE state IN ('submitted','awaiting_payment_confirmation','paid');`
  — **partial unique**: не более одной активной заявки на пару
  (пользователь, номинация) (FR-12/AC-12). Терминальные (`withdrawn`/
  `registered`) под индекс не попадают → повторная заявка после отзыва возможна
  (AC-13). Нарушение → `ErrDuplicateActive`.
- `CREATE INDEX idx_current_nomination ON application.application_current
  (nomination_id, state);` — список/участники номинации, `CountRegistered`,
  `CountsByNomination`.
- `CREATE INDEX idx_current_applicant ON application.application_current
  (applicant_user_id);` — «мои заявки».
- `CREATE INDEX idx_current_tournament ON application.application_current
  (tournament_id, state);` — сводный экран с фильтром по статусу (FR-14).

**Без FK** на `nomination`/`auth` — кросс-схемные границы модулей (ADR 0002);
целостность держит сервис (`NominationProvider`, caller из токена).

**Сид:** не нужен. **Down:** `DROP TABLE application_current`, `DROP TABLE events`,
`DROP SCHEMA IF EXISTS application`.

## Web (FSD + BFF)

> См. ADR 0005 (UI), ADR 0006 (state), `web/AGENTS.md`.

- BFF (Route Handlers, Node runtime) — все требуют auth (прокидывают Bearer):
  - `app/api/applications/route.ts` — `GET` («мои заявки», `ListMyApplications`),
    `POST` (подать, `SubmitApplication`; `nominationId` в теле).
  - `app/api/applications/[id]/route.ts` — `GET` (одна + история, `GetApplication`).
  - `app/api/applications/[id]/declare-payment/route.ts` — `POST` (`DeclarePayment`).
  - `app/api/applications/[id]/withdraw/route.ts` — `POST` (`WithdrawApplication`).
  - `app/api/applications/[id]/confirm-payment/route.ts` — `POST` (admin,
    `ConfirmPayment`).
  - `app/api/applications/[id]/register/route.ts` — `POST` (admin,
    `RegisterFighter`; ответ несёт `capacityExceeded`).
  - `app/api/nominations/[id]/applications/route.ts` — `GET` (admin,
    `ListNominationApplications`).
  - `app/api/applications/overview/route.ts` — `GET` (admin, `ListApplications`;
    `tournamentId` + опц. `status`/`nominationId` в query) — сводный экран.
  - `app/api/nominations/[id]/participants/route.ts` — `GET` (**публичный**,
    `ListNominationParticipants`; имена + счётчики, без auth) — стартовый лист.
  - Маппинг `connect.Code`→HTTP: `CodeNotFound`→404, `CodeFailedPrecondition`→409
    (или 422), `CodeAlreadyExists`→409, `CodePermissionDenied`→403,
    `CodeAborted`→409, auth→401.
- Слои:
  - `entities/application/` — `lib/types.ts` (типы из proto: `Application`,
    `ApplicationState`, `ApplicationEvent`), хелперы отображения состояния
    (лейблы/цвета статусов), `lib/state.ts` (какие действия доступны в каком
    состоянии — зеркало state machine для UI-гейтинга кнопок).
  - `features/application-submit/` — `api/requests.ts` (`submit`), `api/keys.ts`,
    RQ-хук `use-submit-application`; `ui/` — кнопка/форма подачи в номинацию.
  - `features/my-applications/` — `api/requests.ts` (list/get/declarePayment/
    withdraw), `api/keys.ts`, RQ-хуки; `ui/` — список «моих заявок» со статусом,
    кнопки «оплатил»/«отозвать» (гейтинг по состоянию), история.
  - `features/application-review/` (admin) — `api/requests.ts`
    (listByNomination/listApplications/confirmPayment/register), `api/keys.ts`,
    RQ-хуки; `ui/` — заявки номинации с действиями секретаря; показ мягкого
    предупреждения о переполнении (`capacityExceeded`) при регистрации;
    **сводный экран** всех заявок турнира с лёгкими фильтрами по статусу и
    номинации (селекты/чипы; фильтрация серверная через query-параметры).
  - `entities/nomination/` (0003) — расширить публичный виджет номинации:
    стартовый лист (имена заявленных/подтверждённых) + счётчик «заявлено N ·
    подтверждено M / лимит L» (скрыть «/ L» при незаданном лимите). Данные — из
    публичного `ListNominationParticipants` (SSR).
  - `widgets/` — при необходимости композиция раздела заявок номинации в админке
    и стартового листа на публичной странице.
- Server components vs client:
  - Публичный список/страница номинаций (0003) дополняется кнопкой «Подать
    заявку» (client-feature `application-submit`, для аутентифицированного `user`)
    и **стартовым листом + счётчиком** (SSR через публичный
    `ListNominationParticipants`).
  - «Мои заявки» — раздел кабинета (client-UI из `features/my-applications`).
  - Админка — раздел `app/(admin)/admin/nominations/[id]/applications/page.tsx`
    (заявки номинации) и **сводный** `app/(admin)/admin/applications/page.tsx`
    (server-обёртка) + client-UI `features/application-review` с фильтрами.
- State: server-state → TanStack Query (ключи «мои заявки», «заявки номинации»,
  «одна заявка+история»); мутации `useMutation` → `onSuccess` инвалидируют
  соответствующие ключи (после действия статус/списки перечитываются). Форма
  подачи — локальный `useState`.

## События

> Это **первая событийная фича**. Раздел наполняется реально (см. «Предусловие:
> ADR 0011»). До принятия ADR 0011 код не пишем.

- **Издаёт (внутри модуля, в event store):** `ApplicationSubmitted`,
  `PaymentDeclared`, `PaymentConfirmed`, `FighterRegistered`,
  `ApplicationWithdrawn` — доменные события заявки. Это внутренний журнал
  агрегата, не межмодульная шина.
- **Кроссдоменное (будущее):** терминальный `FighterRegistered` в будущем
  инициирует создание бойца в домене бойцов (через API того домена или
  событийную шину/outbox — механизм оговорит ADR 0011 и фича домена бойцов).
  Сейчас — только факт в журнале, без публикации наружу.
- **Потребляет:** ничего (пока).

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- Юнит домена (`domain/*_test.go`): свёртка `Rebuild` (порядок событий →
  корректное состояние, версия), таблица переходов state machine — все
  допустимые (AC-1..AC-5) и все недопустимые переходы (`ErrInvalidTransition`,
  AC-6/AC-7), `IsTerminal`/`IsActive`.
- Юнит сервиса (`service/*_test.go`, fake-репо + fake `NominationProvider` +
  fake `UserProvider`): `Submit` (счастливый путь; резолв номинации;
  `ErrDuplicateActive` при активном дубле — AC-12; повтор после отзыва — AC-13;
  несуществующая номинация → `ErrNominationNotFound`); проверка владельца в
  `DeclarePayment`/`Withdraw` (чужой → `ErrForbidden`, AC-8);
  `ConfirmPayment`/`Register` из корректного и некорректного состояния; мягкое
  предупреждение `capacityExceeded` (AC-14); отзыв из «Оплачена» (AC-5);
  действие над терминальной (AC-7); поведение при `ErrConcurrency`
  (повтор/`Aborted`); **счётчики** `applied`/`confirmed` и отсутствие отозванных
  в списках/счётчиках (AC-16/AC-17); сводный `ListApplications` с фильтрами по
  статусу/номинации (AC-15); обогащение именами через `UserProvider` без N+1;
  graceful при недоступном имени.
- E2E ручек (`api/` через httptest + Connect, fake-репо): весь путь
  submit→declare→confirm→register по RPC; права секретаря (обычный `user` →
  `CodePermissionDenied`, AC-9); маппинг доменных ошибок в `connect.Code`;
  `GetApplication` с историей (AC-10); `capacity_exceeded` в ответе
  `RegisterFighter`; `ListApplications` (admin) с фильтрами; **публичный**
  `ListNominationParticipants` без токена (имена + `applied_count`/
  `confirmed_count` + `fighter_capacity`, AC-16/AC-18); `applicant_display_name`
  в admin-выдачах.
- Интеграционные с БД (`integration/`, testcontainers): миграция применяется;
  append-only журнал; `UNIQUE(aggregate_id, version)` реально ловит конфликт
  версии (две команды на одну версию — одна падает, NFR-3); partial unique
  активного дубля (вставка второй активной → ошибка; после `withdrawn` — успех);
  транзакционность `Append` (событие + проекция атомарно); `CountRegistered` и
  `CountsByNomination` (applied/confirmed, отозванные исключены); `ListByTournament`
  с фильтрами (nullable-параметры sqlc); `ParticipantsByNomination` (без
  отозванных); чтения `ListByNomination`/`ListByApplicant`; проекция согласуется
  со свёрткой журнала.
- Web (Vitest): маппинг `connect.Code`→HTTP во всех BFF-роутах (вкл. публичный
  `participants` и admin `overview`); fetchers (`requests.ts`) с mock `fetch`;
  сериализация proto↔JSON (`ApplicationState`, `ApplicationEvent`,
  `capacityExceeded`, `applied_count`/`confirmed_count`); гейтинг действий по
  состоянию (`entities/application/lib/state`); рендер «моих заявок», заявок
  номинации, сводного экрана с фильтрами, стартового листа и счётчика (в т.ч.
  скрытие «/ лимит» при незаданном `fighter_capacity`).

## Риски и открытые вопросы

- **ADR 0011 — предусловие.** Конвенции event sourcing (форма store, инлайн-
  проекция, оптимистичная конкуренция, наименование событий, будущая
  кроссдоменная публикация) фиксируются ADR 0011 **до** кода. План опирается на
  них; без ADR к TDD не переходим.
- **Оптимистичная конкуренция и повтор (NFR-3).** Гонка команд по одной заявке
  → `UNIQUE(aggregate_id, version)` → `ErrConcurrency`. Политика: один прозрачный
  повтор (reload→redecide→reappend), затем наружу `CodeAborted`. Зафиксировать в
  ADR 0011.
- **Инвариант дубля на event-sourced модели.** «Нет активного дубля» невыразим на
  «сыром» журнале — держим partial unique на проекции, обновляемой в одной
  транзакции с событием. Предпроверка `ActiveExists` — только для дружелюбного
  быстрого отказа; арбитр гонки — индекс. Риск: две вставки нового потока
  одновременно; partial unique гарантирует единственную активную.
- **Различение двух `23505` в `Append`.** `UNIQUE(aggregate_id,version)` →
  `ErrConcurrency`, а partial unique дубля → `ErrDuplicateActive`. Различать по
  имени констрейнта в ошибке pg, не по факту `23505`.
- **Согласованность проекции с журналом.** Проекция — производное; критично, что
  событие и upsert проекции пишутся атомарно (одна транзакция). Integration-тест
  на согласованность + возможность перестроить проекцию из журнала (future).
- **Мягкое предупреждение о ёмкости — гонка допустима.** `CountRegistered` не под
  блокировкой; при параллельной регистрации счётчик может слегка «плыть». Для
  мягкого предупреждения (не лимита) это приемлемо (спека, вне скоупа — жёсткий
  лимит).
- **Кроссдоменная регистрация — только факт.** Домена бойцов нет; `FighterRegistered`
  ничего не создаёт наружу. Когда домен появится — не ломать журнал (NFR-2):
  добавить публикацию/подписку, а не менять прошлые события.
- **Заявитель из токена, не из тела.** `SubmitApplication` берёт `user_id` из
  access-токена (context-key `CallerID`); в теле только `nomination_id`.
  Гарантирует FR-11 (нельзя подать «за другого»).
- **Резолв имён из `auth` (межмодульный, FR-15).** Имя не дублируется в заявке —
  берётся из `auth` через `UserProvider` (батч по id, без N+1). В `auth` нет
  готового Connect-RPC «пользователи по id»: в монолите достаточно in-process
  Go-порта поверх auth-сервиса; при выносе `application` в отдельный сервис —
  промотировать в Connect-RPC (ADR 0002). Недоступный/удалённый пользователь —
  graceful (пустое имя/плейсхолдер), не ошибка запроса.
- **Публичная выдача имён (FR-16, приватность).** Стартовый лист публичен
  (решение 12): `ListNominationParticipants` без auth отдаёт `display_name` +
  состояние, но **не** `user_id`/email (сообщение `NominationParticipant`).
  Осознанный компромисс приватности; если позже потребуется скрывать имена до
  подтверждения — отдельный инкремент (модель допускает: фильтр по состоянию).
- **Фильтры сводного экрана на sqlc.** `ListByTournament` — опциональные
  фильтры через nullable-параметры (`@status::text IS NULL OR …`), чтобы остаться
  на одном статическом запросе sqlc без динамической сборки SQL.
- **Согласованность счётчиков.** `applied`/`confirmed` и списки участников —
  из проекции (обновляется в одной транзакции с событием); отозванные исключены
  по состоянию. Пригодно для публичного SSR (дешёвое чтение, NFR-1).
