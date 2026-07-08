# Plan: Профиль турнира (single-tournament)

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-07-07
- Спека: `./spec.md`

## Обзор решения

Новый server-модуль `tournament` (bounded context со своей PG-схемой, ADR 0002).
Синхронный CRUD через Connect-RPC. Модуль хранит турнир как полноценную сущность
с `id` и флагом `is_active`; в MVP ровно одна активная запись (сидится
миграцией). Публичное чтение активного турнира — без auth; редактирование —
только `ROLE_ADMIN` (интерсептор `RequireAdmin`). Контакты — дочерняя таблица
(упорядоченный список). Web: главная страница SSR-читает активный турнир через
gRPC напрямую; админка получает форму редактирования (BFF → gRPC).

Расширяемость под мультитурнирность заложена в модели (`id` + `is_active`):
переход = снятие ограничения единственности активного и добавление
списка/выбора, без переписывания сущности.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

- Файл: `proto/hema/v1/tournament.proto` (новый)
- Общие типы: при необходимости — в `common.proto` (напр. `ContactType` enum).
- Сервис: `TournamentService`
  - `GetActiveTournament(GetActiveTournamentRequest) → GetActiveTournamentResponse`
    — публичный (без auth), возвращает активный турнир для главной.
  - `UpdateActiveTournament(UpdateActiveTournamentRequest) → UpdateActiveTournamentResponse`
    — только admin; обновляет поля активного турнира целиком (включая список
    контактов).
- Сообщения:
  - `Tournament` — `id`, `title`, `description`, `event_at`
    (`google.protobuf.Timestamp`, опционально), `emblem_url`, `is_active`,
    `contacts` (repeated `Contact`), `created_at`, `updated_at`.
  - `Contact` — `type` (`ContactType`), `value` (string), `position` (int32).
  - `ContactType` (enum): `CONTACT_TYPE_UNSPECIFIED`, `TELEGRAM`, `VK`,
    `FACEBOOK`, `WEBSITE`, `EMAIL`, `OTHER`.
  - `UpdateActiveTournamentRequest` — редактируемые поля + `repeated Contact`
    (значение поля = полная замена набора контактов).
- Регистрация плагинов buf уже настроена (Go + TS). После правки — `make generate`.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

- Модуль: `modules/tournament/` — **новый bounded context**
- PG-схема: `tournament` (миграция создаёт схему + таблицы + сид активного)
- Слои:
  - `domain/domain.go` — сущности `Tournament`, `Contact`; порт `Repository`
    (`GetActive(ctx)`, `UpdateActive(ctx, input)`); доменные ошибки
    (`ErrNotFound`, `ErrInvalidInput`, при необходимости `ErrValidation`).
  - `service/service.go` — юзкейсы `GetActive`, `UpdateActive`; валидация
    (непустой title; корректность контактов — тип из допустимого набора,
    непустое значение; нормализация порядка контактов).
  - `repo/queries/tournament.sql` — sqlc: `GetActiveTournament :one`,
    `UpdateActiveTournament :one`, `ListContacts :many`,
    `ReplaceContacts` (delete+insert в транзакции — реализация в `repo.go`).
    `repo/repo.go` — реализация порта (сборка агрегата турнир+контакты).
  - `api/handler.go` — Connect `TournamentServiceHandler`; маппинг
    proto↔domain (`toProtoTournament`, `fromProtoContacts`), ошибки→
    `connect.Code` (`ErrNotFound`→`CodeNotFound`, `ErrInvalidInput`/
    `ErrValidation`→`CodeInvalidArgument`).
  - `migrations/00001_init.sql` — goose: `CREATE SCHEMA tournament`; таблицы
    `tournament.tournaments` (id UUID PK, title, description, event_at
    TIMESTAMPTZ NULL, emblem_url TEXT, is_active BOOL, created_at, updated_at)
    и `tournament.contacts` (id, tournament_id FK, type TEXT, value TEXT,
    position INT); partial unique index на `is_active` (единственный активный);
    сид одной пустой активной строки.
  - `testutil/fake_repo.go` — in-memory `domain.Repository`
    (`var _ domain.Repository = (*FakeRepo)(nil)`).
- Регистрация: `module.go` — `Register(mux, deps, opts...)`; публичный
  `GetActiveTournament` монтируется без RequireAdmin, `UpdateActiveTournament` —
  под интерсептором RequireAdmin (как в auth admin-handler). Wiring — в
  `internal/platform`.
- Межмодульные зависимости: нет (только собственная схема).

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

- BFF (Route Handlers, Node runtime):
  - `app/api/tournament/route.ts` — `GET` (публичный, активный турнир) и `PUT`
    (admin, обновление) → gRPC. Маппинг `connect.Code`→HTTP.
- Слои:
  - `entities/tournament/` — `lib/types.ts` (типы из proto), `model/` server-only
    геттер активного турнира (`get-active-tournament.ts`, cookie не нужен для
    чтения) для SSR главной.
  - `features/tournament-settings/` — `api/requests.ts` (fetch активного,
    update), `api/keys.ts`, RQ-хуки (`use-tournament`, `use-update-tournament`),
    `ui/` форма редактирования (поля + редактор списка контактов).
  - `widgets/tournament-hero/` — секция главной: название/описание/дата/эмблема/
    контакты; пустые поля скрываются (FR-6/AC-4).
- Server components vs client:
  - Главная (`app/page.tsx`) — server component: SSR активного турнира через
    `entities/tournament/model`, замена текущей заглушки «Турниры скоро
    появятся» на `TournamentHero`.
  - Админка — новый раздел `app/(admin)/admin/tournament/page.tsx` (server
    component-обёртка) + client-форма из `features/tournament-settings/ui`.
- State: server-state (форма) → TanStack Query; список контактов в форме —
  локальный `useState`/`useFieldArray`-подобный; отправка — `useMutation` →
  `onSuccess` инвалидирует ключ турнира.

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей).

- Издаёт: нет
- Потребляет: нет

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- Юнит (`service/` с fake-репо): `GetActive` (счастливый путь), `UpdateActive`
  (обновление полей + замена контактов), валидация (пустой title → ошибка,
  недопустимый тип/пустое значение контакта → ошибка), нормализация порядка.
- E2E ручек (`api/` через httptest + Connect, fake-репо): `GetActiveTournament`
  без auth возвращает активный; `UpdateActiveTournament` — счастливый путь +
  маппинг доменных ошибок в `connect.Code`; проверка, что публичный RPC не
  падает без токена, а update требует admin (через интерсептор — на уровне
  wiring/platform-теста при необходимости).
- Интеграционные с БД (по необходимости): миграция + sqlc — partial unique index
  на активном, `ReplaceContacts` в транзакции.
- Web (Vitest): маппинг `connect.Code`→HTTP в BFF; fetchers
  (`requests.ts`) с mock `fetch`; сериализация proto→JSON; рендер
  `TournamentHero` со скрытием пустых полей (по мере готовности UI).

## Риски и открытые вопросы

- **Единственность активного турнира** — обеспечиваем partial unique index
  (`WHERE is_active`). Убедиться, что `UpdateActive` не создаёт вторую активную
  запись (в MVP всегда UPDATE существующей).
- **Замена контактов** — атомарность delete+insert требует транзакции в `repo`
  (sqlc-запросы + ручная обёртка `pgx.Tx`). Проверить в интеграционном тесте.
- **Валидация URL/контактов** — на MVP минимальная (непустое значение, тип из
  enum). Строгую валидацию форматов (URL/email) можно ужесточить позже.
- **`common.proto` vs `tournament.proto`** — `ContactType` держим в
  `tournament.proto` (доменно-специфичный), не засоряя `common.proto`.
