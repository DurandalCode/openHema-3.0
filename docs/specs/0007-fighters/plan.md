# Plan: Бойцы турнира (fighters)

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-07-13
- Спека: `./spec.md`

## Обзор решения

Новый server-модуль `fighter` — **обычный CRUD-агрегат** (не event-sourced, в
отличие от `application`): агрегат-корень «боец» с дочерними «участиями»
(participation) в номинациях, своя PG-схема `fighter`. Боец создаётся двумя
путями: (1) **кроссдоменно** при регистрации заявки — `application.Register`
после успешной записи события `FighterRegistered` синхронно вызывает **порт**
`FighterRegistrationSink` (адаптер в `internal/platform`, как
`NominationInfoProvider`), не трогая чужую схему; (2) **вручную** admin через
`FighterAdminService`. Публичное чтение состава номинации — отдельный
`FighterPublicService`. Дедуп «один человек = один боец на турнир» —
partial-unique на `(tournament_id, origin_user_id)`.

Событийной шины пока нет (EDD-ADR не принят) → кроссдоменный вызов **синхронный,
in-process** через Go-порт; фактическое событие `FighterRegistered` остаётся в
журнале заявки (0005). Идемпотентность обеспечивает дедуп-констрейнт.

Отдельно — **малая поправка к 0006**: клуб становится публичным (добавляется в
`NominationParticipant` стартового листа заявок и в публичный ростер бойцов).

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

### Новый файл `proto/hema/v1/fighter.proto`

- **`FighterAdminService`** (все RPC — `RRoleAdmin`, adminOpts):
  - `CreateFighter(CreateFighterRequest) → CreateFighterResponse` — ручное
    заведение: `name`, `club`, `nomination_ids[]`.
  - `EditFighter(EditFighterRequest) → EditFighterResponse` — правка `name`,
    `club`.
  - `WithdrawFighter(WithdrawFighterRequest) → WithdrawFighterResponse` —
    вывод с турнира: `fighter_id`, `reason` (enum).
  - `ReturnFighter(ReturnFighterRequest) → ReturnFighterResponse` — вернуть
    выведенного.
  - `AddToNomination(AddToNominationRequest) → ...` — добавить участие.
  - `RemoveFromNomination(RemoveFromNominationRequest) → ...` — снять участие
    (обратимо).
  - `MoveFighter(MoveFighterRequest) → ...` — перевод: `fighter_id`,
    `from_nomination_id`, `to_nomination_id` (снять с одной + добавить в другую).
  - `ListRoster(ListRosterRequest) → ListRosterResponse` — ростер турнира
    (`tournament_id` опционален → активный турнир): бойцы + участия + статусы.
  - `GetFighter(GetFighterRequest) → GetFighterResponse`.
- **`FighterPublicService`** (публичный, только base auth-интерсептор, RPC в
  `publicProcedures`):
  - `ListNominationRoster(ListNominationRosterRequest) → ListNominationRosterResponse`
    — состав номинации: по каждому бойцу `name`, `club`, `status` (в составе /
    выбыл).
- **Сообщения**: `Fighter { id, tournament_id, name, club, FighterStatus status,
  WithdrawalReason withdrawal_reason, repeated Participation participations }`;
  `Participation { nomination_id, ParticipationStatus status }`;
  `RosterEntry { name, club, bool in_roster }` (публичный, без id/user).
- **Enum** (в `fighter.proto`, не в common — доменные типы модуля):
  - `FighterStatus { UNSPECIFIED, ACTIVE, WITHDRAWN }`
  - `WithdrawalReason { UNSPECIFIED, INJURY, BAN, OTHER }`
  - `ParticipationStatus { UNSPECIFIED, ACTIVE, REMOVED }`

> Кроссдоменная регистрация (`application → fighter`) — **не** RPC: это
> внутренний Go-порт между модулями монолита (in-process), в proto не выносится.

### Поправка к 0006 — `proto/hema/v1/application.proto`

- В `NominationParticipant` добавить `string club = 3;` (клуб публичен, FR-14).
  Заполняется из `application_current.club`.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

- Модуль: `modules/fighter/` — **новый bounded context**.
- PG-схема: `fighter` (миграция создаёт схему + таблицы).

### Слои

- `domain/domain.go`:
  - Сущности: `Fighter { ID, TournamentID, Name, Club, OriginUserID *string,
    Status, WithdrawalReason, Participations []Participation }`,
    `Participation { NominationID, Status }`.
  - Типы: `Status {Active, Withdrawn}`, `Reason {None, Injury, Ban, Other}`,
    `PartStatus {Active, Removed}`.
  - Методы агрегата (чистая логика, без БД): `Withdraw(reason)`, `Return()`,
    `AddParticipation(nomID)` (идемпотентно: снятое → active),
    `RemoveParticipation(nomID)`, `Move(from,to)`, `Edit(name, club)`.
    Валидации: имя непусто; вернуть можно только выведенного; и т.п.
  - Доменные ошибки: `ErrNotFound`, `ErrEmptyName`, `ErrNotWithdrawn`,
    `ErrParticipationNotFound`, `ErrNominationNotFound` (от провайдера).
  - Порты: `Repository` (загрузка/сохранение агрегата + чтение ростеров);
    `NominationProvider` (межмодульный резолв номинации → tournament_id,
    существование).
- `service/service.go` — юзкейсы:
  - `RegisterFromApplication(ctx, in RegistrationInput)` — **дедуп**: ищем бойца
    по `(tournament_id, origin_user_id)`; есть → `AddParticipation`; нет →
    создаём бойца (снапшот `name`, `club`) + участие. Обрабатывает
    конкуренцию по dedup-констрейнту (retry/загрузка).
  - `CreateManual(name, club, nominationIDs)` — валидирует номинации через
    `NominationProvider` (существование + tournament_id единый), создаёт бойца
    (origin_user_id = nil) + участия. Без проверок дублей/лимитов (FR-6).
  - `WithdrawFighter/ReturnFighter/AddToNomination/RemoveFromNomination/Move/
    EditFighter/GetFighter`.
  - `ListRoster(tournamentID)` — ростер турнира; `ListNominationRoster(nomID)` —
    публичный состав.
- `repo/queries/fighter.sql` (`-- name: X :one/:many`) + `make sqlc`;
  `repo/repo.go` — реализация `Repository` (сохранение агрегата: upsert бойца +
  участий в транзакции; загрузка бойца с участиями; ростер-выборки join).
- `api/handler.go` (`FighterAdminService`) + `api/public_handler.go`
  (`FighterPublicService`): маппинг proto↔domain, доменные ошибки →
  `connect.Code` (`NotFound`, `InvalidArgument`, `FailedPrecondition`).
- `testutil/fake_repo.go` — in-memory `domain.Repository`
  (`var _ domain.Repository = (*FakeRepo)(nil)`), для service/api-тестов.
- `migrations/00001_init.sql` — см. ниже.

### Миграции (DDL целиком)

Схема `fighter`. Две таблицы (агрегат-корень + дочерняя):

```sql
CREATE SCHEMA IF NOT EXISTS fighter;

-- fighters — агрегат-корень «боец-персона турнира» (spec: боец отвязан от user).
CREATE TABLE fighter.fighters (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id      UUID NOT NULL,                 -- принадлежность турниру (без кросс-схемного FK, ADR 0002)
    name               TEXT NOT NULL,                 -- снапшот (override/auth); непусто
    club               TEXT NOT NULL DEFAULT '',      -- снапшот из заявки, может быть пустым
    origin_user_id     UUID,                          -- ключ происхождения/дедупа; NULL для ручных
    status             TEXT NOT NULL DEFAULT 'active',
    withdrawal_reason  TEXT NOT NULL DEFAULT '',      -- заполнен при status='withdrawn'
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_fighters_name        CHECK (length(btrim(name)) > 0),
    CONSTRAINT chk_fighters_status      CHECK (status IN ('active','withdrawn')),
    CONSTRAINT chk_fighters_reason      CHECK (withdrawal_reason IN ('','injury','ban','other')),
    CONSTRAINT chk_fighters_reason_when CHECK (
        (status = 'withdrawn') OR (withdrawal_reason = '')
    )
);

-- Дедуп: один боец на человека в пределах турнира (только для пришедших из
-- заявки; ручные — NULL, под констрейнт не попадают). Держит NFR-4 под гонками.
CREATE UNIQUE INDEX uq_fighters_origin_per_tournament
    ON fighter.fighters (tournament_id, origin_user_id)
    WHERE origin_user_id IS NOT NULL;

-- Ростер турнира.
CREATE INDEX idx_fighters_tournament ON fighter.fighters (tournament_id);

-- participations — участие бойца в номинации (дочерняя сущность агрегата).
CREATE TABLE fighter.participations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fighter_id    UUID NOT NULL REFERENCES fighter.fighters(id) ON DELETE CASCADE,
    nomination_id UUID NOT NULL,                     -- номинация (кросс-схемно, без FK)
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_part_status CHECK (status IN ('active','removed')),
    -- Одно участие на пару (боец, номинация); снятие обратимо переключением
    -- status, а не удалением строки (spec FR-8).
    CONSTRAINT uq_part_fighter_nomination UNIQUE (fighter_id, nomination_id)
);

-- Состав номинации (публичный ростер) и join по бойцу.
CREATE INDEX idx_part_nomination ON fighter.participations (nomination_id, status);
CREATE INDEX idx_part_fighter    ON fighter.participations (fighter_id);
```

- Зачем `fighters` — агрегат-корень: одна строка = один человек на турнир.
- Зачем `participations` — дочерняя таблица (1 боец → N номинаций); статус на
  строке даёт обратимое «снятие с номинации» без потери истории.
- «В составе» = `fighters.status='active' AND participations.status='active'`.

### Регистрация и wiring

- `modules/fighter/module.go` — `Register(mux, deps, baseOpts, adminOpts)`:
  монтирует `FighterAdminService` (baseOpts+adminOpts) и `FighterPublicService`
  (baseOpts). `Deps{ Pool, Nominations domain.NominationProvider }`.
- Экспорт для кроссдоменного sink: `fighter.NewRegistrationSink(pool, nomProv)`
  — реализует `application/domain.FighterRegistrationSink` (новый порт).
- `internal/platform/platform.go`:
  - `fighterNomProv := NewFighterNominationProvider(pool, activeTournaments)`
    (адаптер `nomination.Service → fighter/domain.NominationProvider`, по образцу
    `NominationInfoProvider`).
  - `fighter.Register(mux, fighter.Deps{Pool: pool, Nominations: fighterNomProv}, baseOpts, adminOpts)`.
  - В `applicationDeps` добавить поле `Fighters: fighter.NewRegistrationSink(...)`.
- `internal/platform/fighter_provider.go` — новый адаптер номинаций для fighter
  (резолв существования + tournament_id).

### Правка модуля `application` (кроссдоменный эффект + поправка 0006)

- `application/domain/domain.go` — новый порт:
  ```go
  type FighterRegistrationSink interface {
      OnRegistered(ctx context.Context, in RegisteredFighter) error
  }
  type RegisteredFighter struct {
      TournamentID, NominationID, OriginUserID, Name, Club string
  }
  ```
- `application/service/service.go` `Register(...)` — после успешного
  `repo.Append(...)` (service.go:178) и до `enrich`: собрать имя
  (`ApplicantNameOverride` или `Users.DisplayNames`), клуб (`current.Club`) и
  вызвать `s.fighters.OnRegistered(...)`. Ошибку sink — логировать/возвращать
  (см. Риски); дедуп в fighter делает вызов идемпотентным.
- `application.Deps` += `Fighters domain.FighterRegistrationSink`; проброс в
  `service.New(...)`.
- **Поправка 0006**: `NominationParticipant.club` — публичный хендлер
  `ListNominationParticipants` отдаёт `club` из проекции (`application_current`
  уже содержит `club`).

### Межмодульные зависимости

- `fighter → nomination` (через порт `NominationProvider`, адаптер в platform) —
  валидация номинации при ручном создании/добавлении участия.
- `application → fighter` (через порт `FighterRegistrationSink`, in-process) —
  создание бойца при регистрации.
- Прямого доступа к чужим схемам нет (ADR 0002).

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

- **BFF (Route Handlers, Node runtime)** — REST→gRPC (Connect):
  - `app/api/admin/fighters/route.ts` (list roster, create),
    `app/api/admin/fighters/[id]/route.ts` (get, edit),
    `.../[id]/withdraw`, `.../[id]/return`, `.../[id]/nominations` (add/remove/
    move) — маппинг `connect.Code`→HTTP.
  - `app/api/nominations/[id]/roster/route.ts` — публичный состав номинации.
- **entities/fighter** — типы `Fighter`, `Participation`, статусы, маппинг
  enum→лейбл (в составе / выбыл / причина).
- **features/fighter-management** (admin): `api/` (requests + keys + RQ-хуки:
  useRoster, useCreateFighter, useWithdraw, useReturn, useAddToNomination,
  useRemoveFromNomination, useMoveFighter, useEditFighter), `ui/` (таблица
  ростера, форма заведения, действия по строке). Мутации инвалидируют ключ
  ростера.
- **widgets/nomination-roster** (публичный) — состав номинации (имя, клуб,
  статус) на странице номинации; **отдельно** от воронки заявок (0005) — фазовость
  показа решается здесь (UX, spec п.5).
- **Поправка 0006 (web)**: в существующем публичном списке участников номинации
  вывести `club` рядом с именем.
- Admin-страница ростера: пункт под-навигации админки (0004) «Бойцы».
- Server components для публичного чтения (SSR, NFR-1); admin-экран — client
  (мутации, TanStack Query). State: server-state → TanStack Query; UI-state →
  Zustand при необходимости.

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей).

- Издаёт: `application` уже пишет факт `FighterRegistered` в свой журнал (0005).
- Потребляет: `fighter` — **пока не через шину**, а синхронным in-process
  вызовом порта `FighterRegistrationSink` при регистрации. Когда примут EDD-ADR
  (шина/outbox), этот вызов переедет на подписку на событие `FighterRegistered`
  без изменения доменной модели fighter (NFR-2).

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит (domain)**: `fighter/domain` — переходы статуса (withdraw/return,
  add/remove/move участий, идемпотентность повторного add, запрет return не
  выведенного, непустое имя).
- **Юнит (service, fake-репо + fake nomProv)**: дедуп в `RegisterFromApplication`
  (второй раз → +участие, не дубль; однофамильцы с разным origin → два бойца),
  `CreateManual` (валидация номинаций, мульти-номинация), withdraw/return,
  remove/move, edit.
- **E2E ручек (`api/*_test.go`, httptest+Connect, fake-репо)**: `FighterAdmin`
  (happy + маппинг ошибок в `connect.Code`, require-admin) и `FighterPublic`
  (состав номинации, «выбыл» виден).
- **Интеграционные с БД (build-tag `integration`, testcontainers)**:
  `modules/fighter/integration/*_integration_test.go` — миграции применяются,
  дедуп-констрейнт держит гонку, хотя бы один публичный RPC через реальный PG.
  **Обязательно для модуля с PG-схемой** (`server/AGENTS.md`).
- **`application`**: расширить `Register`-тест — фейковый `FighterRegistrationSink`
  вызывается с корректными полями; тест `ListNominationParticipants` — `club`
  отдаётся.
- **Web (Vitest)**: BFF-роуты (mock grpc, `connect.Code`→HTTP), fetchers ростера
  и мутаций.

### Инфраструктурные точки нового модуля (чек-лист `server/AGENTS.md`)

- `server/sqlc.yaml` — секция `sql:` для `modules/fighter`.
- `server/internal/testdb/testdb.go` — `moduleMigrations += fighter`.
- Корневой `Makefile` — `migrate`/`migrate-down` включают `fighter`.
- `server/Dockerfile` — `COPY --from=build /src/modules/fighter/migrations ...`.
- Проверить схему в полном докер-стеке: `docker compose up --build` →
  `psql -c '\dn'` содержит `fighter`.

## Риски и открытые вопросы

- **Кроссдоменная согласованность.** `application.Append` (схема application) и
  создание бойца (схема fighter) — **разные транзакции**: если sink упадёт после
  коммита события, заявка «зарегистрирована», а бойца нет. Митигация MVP: вызов
  синхронный, создание бойца **идемпотентно** по dedup-констрейнту (повтор
  безопасен), ошибка sink возвращается наверх/логируется; admin может завести
  бойца вручную. Транзакционный outbox — с EDD-ADR (будущее).
- **Поправка к «done»-спеке 0006** (club публичен) — затрагивает `application`
  proto/хендлер и web-список. Согласовано со стейкхолдером (spec п.8); отметить в
  0006.
- **Дедуп под гонкой** двух одновременных регистраций одного `origin_user_id`:
  ловится partial-unique; service обрабатывает конфликт (загрузить бойца и
  добавить участие).
- **Move как две операции** (remove+add) — выполнять в одной транзакции репо,
  чтобы не оставить бойца ни в одной номинации при сбое.
</content>
