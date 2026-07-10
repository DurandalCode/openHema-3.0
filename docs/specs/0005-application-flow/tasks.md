# Tasks: Флоу подачи заявки бойца (event-sourced)

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-07-10
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Предусловие (не TDD)

- [x] T0. **ADR 0011 «Event-Driven Design / event sourcing»** —
      `docs/adr/0011-event-driven-design.md`: единица консистентности (агрегат),
      append-only event store, оптимистичная конкуренция по версии потока,
      инлайн-проекция (read-model) в одной транзакции с событием, наименование
      событий, политика повтора при конфликте версии, будущая кроссдоменная
      публикация (домен бойцов). Принят 2026-07-10.

## Контракты

- [x] T1. `proto/hema/v1/application.proto` — `ApplicationService`
      (SubmitApplication/DeclarePayment/WithdrawApplication/ListMyApplications/
      GetApplication — auth, **не** публичные); `ApplicationAdminService`
      (ConfirmPayment/RegisterFighter/ListNominationApplications/**ListApplications**
      — admin); **`ApplicationPublicService`** (ListNominationParticipants —
      публичный); enum `ApplicationState`, `ApplicationEventType`; сообщения
      `Application` (+ `applicant_display_name`), `ApplicationEvent`,
      `NominationParticipant`, запросы/ответы (в т.ч.
      `RegisterFighterResponse.capacity_exceeded`, `GetApplicationResponse.history`,
      `ListApplicationsRequest` с опц. `status`/`nomination_id`,
      `ListNominationParticipantsResponse` с `applied_count`/`confirmed_count`/
      `fighter_capacity`); импорт `timestamp.proto`. `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Server

- [x] T2. **domain — агрегат и state machine (red→green)** —
      `modules/application/domain/domain_test.go`: свёртка `Rebuild` (поток
      событий → состояние + версия); таблица переходов — допустимые
      (Submit→DeclarePayment→ConfirmPayment→Register; Withdraw из любого
      активного, включая Paid) и недопустимые (`ErrInvalidTransition`); действия
      над терминальной заявкой отклоняются; проверка владельца в командах
      заявителя (`ErrForbidden`) → затем `domain/domain.go`: типы `State`/
      `EventType`/`Event`/`Payload`, агрегат `Application` + `Rebuild`/`apply`,
      команды-решения, `ApplicationView`, порты `Repository` (вкл.
      `ListByTournament`/`ParticipantsByNomination`/`CountsByNomination`),
      `NominationProvider` и **`UserProvider`** (`DisplayNames`), доменные ошибки
      (`ErrNotFound`, `ErrForbidden`, `ErrInvalidTransition`, `ErrDuplicateActive`,
      `ErrNominationNotFound`, `ErrConcurrency`).
- [x] T3. **testutil** — `modules/application/testutil/`: in-memory
      `domain.Repository` (потоки + проекция; воспроизводит оптимистичную
      конкуренцию по версии, активный дубль через partial-unique-семантику,
      фильтры/счётчики/участников; `var _ domain.Repository = (*FakeRepo)(nil)`),
      fake `NominationProvider` и fake `UserProvider` (детерминир. имена по id).
- [x] T4. **service (red→green)** — `service/service_test.go` (fake-репо +
      fake-provider): `Submit` (счастливый путь, резолв номинации →
      `tournament_id`; `ErrDuplicateActive` при активном дубле; повтор после
      отзыва — ок; несуществующая номинация → `ErrNominationNotFound`);
      `DeclarePayment`/`Withdraw` — владелец ок, чужой → `ErrForbidden`, отзыв из
      «Оплачена» ок; `ConfirmPayment`/`Register` из корректного/некорректного
      состояния; `capacityExceeded` мягкое предупреждение; поведение при
      `ErrConcurrency` (один повтор → затем наружу); `GetApplication` с историей;
      `ListMy`/`ListByNomination`; **`ListApplications`** с фильтрами по
      статусу/номинации (AC-15); **`NominationParticipants`** (счётчики
      applied/confirmed, отозванные исключены — AC-16/AC-17); обогащение именами
      через `UserProvider` без N+1 и graceful при недоступном имени → затем
      `service/service.go`.
- [x] T5. **repo** — `repo/queries/application.sql`
      (`AppendEvent :exec`, `UpsertCurrent :exec`, `LoadStream :many`,
      `GetCurrent :one`, `ExistsActive :one`, `ListByApplicant :many`,
      `ListByNomination :many`, **`ListByTournament :many`** (nullable-фильтры),
      **`ParticipantsByNomination :many`** (без `withdrawn`), `CountRegistered :one`,
      **`CountsByNomination :one`** (applied/confirmed через `FILTER`)); `make sqlc`;
      `repo/repo.go` — реализация порта; `Append` **в транзакции** (событие +
      upsert проекции); маппинг `UNIQUE(aggregate_id,version)`→`ErrConcurrency`,
      partial unique дубля→`ErrDuplicateActive` (различать по имени констрейнта),
      `pgx.ErrNoRows`→`ErrNotFound`.
- [x] T6. **migrations** — `migrations/00001_init.sql` (goose): схема
      `application`; таблица `events` (append-only; `UNIQUE(aggregate_id,version)`,
      CHECK version/payload); таблица `application_current` (проекция; PK
      `application_id`, CHECK state, **partial unique**
      `(applicant_user_id, nomination_id) WHERE state IN активные`, индексы
      по номинации, заявителю и **турниру** `(tournament_id, state)`). DDL — по
      разделу «Схема БД» плана.
- [x] T7. **api (red→green)** — `api/handler_test.go` (httptest + Connect,
      fake-репо + fake-provider): весь путь submit→declare→confirm→register по
      RPC; заявитель из токена (caller); права секретаря (`user` →
      `CodePermissionDenied`); маппинг доменных ошибок в `connect.Code`
      (`CodeNotFound`/`CodePermissionDenied`/`CodeFailedPrecondition`/
      `CodeAlreadyExists`/`CodeAborted`); `GetApplication` с историей;
      `capacity_exceeded` в ответе `RegisterFighter`; **`ListApplications`**
      (admin) с фильтрами; **публичный `ListNominationParticipants`** без токена
      (имена + `applied_count`/`confirmed_count`/`fighter_capacity`, AC-16/AC-18);
      `applicant_display_name` в admin-выдачах → затем `api/handler.go` (auth +
      admin + public хендлеры, маппинг proto↔domain, caller из context-key,
      обогащение именами через `UserProvider`).
- [x] T8. **wiring** — `module.go` (`Register(mux, deps, baseOpts, adminOpts)`;
      `ApplicationService` под auth, `ApplicationAdminService` под admin,
      `ApplicationPublicService` под base) + адаптеры `NominationProvider` поверх
      `nomination`-сервиса и **`UserProvider` поверх `auth`-сервиса** (батч
      `display_name` по id; при необходимости — новый Go-порт в `auth`) и
      регистрация в `internal/platform`. `ApplicationPublicService.
      ListNominationParticipants` **добавить** в `publicProcedures`;
      `ApplicationService`/`AdminService` — нет.
- [x] T9. **infra sync** — синхронизировать точки нового модуля (чеклист
      `server/AGENTS.md`): `server/sqlc.yaml`, `server/internal/testdb/testdb.go`
      (`moduleMigrations`), корневой `Makefile` (`migrate`/`migrate-down`),
      `server/Dockerfile` (`COPY ... modules/application/migrations`).
- [x] T10. **integration (БД)** — `integration/application_integration_test.go`
      (testcontainers): миграция применяется; append-only журнал;
      `UNIQUE(aggregate_id,version)` ловит конфликт версии (NFR-3); partial
      unique активного дубля (вторая активная → ошибка; после `withdrawn` —
      успех); транзакционность `Append` (событие+проекция атомарно);
      `CountRegistered` и `CountsByNomination` (applied/confirmed, отозванные
      исключены); `ListByTournament` с фильтрами (nullable sqlc-параметры);
      `ParticipantsByNomination` (без отозванных); чтения списков; проекция
      согласуется со свёрткой журнала.

## Web

- [x] T11. **BFF (red→green)** — роуты `app/api/applications/route.ts` (GET «мои»,
      POST submit), `[id]/route.ts` (GET+история),
      `[id]/declare-payment`, `[id]/withdraw`, `[id]/confirm-payment` (admin),
      `[id]/register` (admin), `app/api/nominations/[id]/applications` (admin,
      GET), **`app/api/applications/overview`** (admin, GET; фильтры
      `status`/`nominationId`), **`app/api/nominations/[id]/participants`**
      (**публичный**, GET) + `*.test.ts` (mock fetch/grpc, маппинг
      `connect.Code`→HTTP: 404/409/403/401, `capacityExceeded` в ответе register,
      счётчики в participants).
- [x] T12. **entities/features** — `entities/application/` (типы из proto,
      `lib/state.ts` — доступные действия по состоянию, хелперы лейблов статусов);
      `entities/application/model/get-nomination-participants.ts` — SSR-геттер
      стартового листа; `features/my-applications/`, `features/application-review/`
      — `api/requests.ts` + `keys.ts` + RQ-хуки (вкл. `listApplications` сводного
      экрана), тесты fetchers (Vitest, mock fetch); `ui/` — подача, «мои заявки»
      с действиями по состоянию, обзор заявок номинации с действиями секретаря
      и мягким предупреждением о переполнении, **сводный экран** с фильтрами по
      статусу/номинации.
      _Отклонение от плана: отдельную фичу `features/application-submit/` не
      заводили — кнопка подачи заявки (`SubmitApplicationButton`) переехала в
      `features/my-applications/ui/`, т.к. обе фичи делят один RQ-ключ «мои
      заявки», а `features` не импортируют друг друга (FSD-границы,
      `web/AGENTS.md`); заводить общий ключ в отдельном месте ради разделения
      фич сочли лишней абстракцией._
- [x] T13. **widget/route** — кнопка «Подать заявку» в списке номинаций (для
      аутентифицированного `user`); **стартовый лист + счётчик** на публичной
      странице номинации (SSR); раздел кабинета «Мои заявки»; раздел админки
      **`app/(admin)/admin/applications/page.tsx`** (сводный экран с фильтрами,
      FR-14); ссылка «Заявки» на строке номинации в `NominationManagement`.
      _Отклонение от плана: отдельную вложенную страницу
      `admin/nominations/[id]/applications` не заводили — «заявки одной
      номинации» реализованы как тот же сводный экран с предзаполненным
      фильтром `?nominationId=...` (одна read-модель, один UI, без дублирования
      практически идентичного экрана)._

## Проверка

- [x] T14. `go test ./...` (server, 219 пройдено вкл. application/*) и
      `pnpm test` (web, 219 тестов/31 файл) зелёные; `make test-integration`
      (testcontainers, реальный PG) зелёный — 5/5 в
      `application/integration`, включая реальный конфликт версии потока
      (`TestIntegration_ConcurrentDeclarePayment_NoDoubleApply`, две
      параллельные горутины на одну заявку → ровно одно `PaymentDeclared` в
      журнале) и реальный partial unique активного дубля.
- [x] T15. `pnpm exec tsc --noEmit` чистый — проверялось многократно по ходу
      реализации (после serialize.ts, BFF-роутов, entities/features, виджетов).
- [x] T16. `go build ./...` и `pnpm build` — оба успешны (build подтвердил все
      новые роуты, в т.ч. `/admin/applications`). Сквозная проверка живьём:
      **(а)** `docker compose up --build` на существующем Postgres-томе (уже
      содержавшем данные auth/tournament/nomination) — `migrate`-сервис применил
      **только** новую миграцию `application` (`00001_init.sql`), остальные
      модули корректно распознаны как up-to-date; `\dn` подтвердил схему
      `application` с таблицами `events`/`application_current`; сервер стартовал
      без ошибок, зарегистрировал новый модуль. **(б)** Полный флоу через реальный
      HTTP (curl) на живом сервере: login admin → создание номинации → регистрация
      бойца → submit → declarePayment → admin confirmPayment → admin
      registerFighter (state дошёл до REGISTERED, `applicantDisplayName`
      корректно обогащён из `auth` через живой `UserProvider`); публичный
      `ListNominationParticipants` без токена вернул имя + `appliedCount:1,
      confirmedCount:1, fighterCapacity:1`; `GetApplication` вернул все 4 события
      истории с верными `actorId` (заявитель для Submitted/PaymentDeclared,
      admin для PaymentConfirmed/FighterRegistered); admin `ListApplications` с
      фильтром по номинации вернул ожидаемую одну заявку; обычный `user`,
      вызвавший `ConfirmPayment`, получил `permission_denied`. **(в)** Веб-слой
      живьём: BFF `GET /api/nominations/{id}/participants` вернул тот же JSON
      без токена; главная страница (SSR) отрендерила название номинации, счётчик
      «Заявлено 1 · подтверждено 1 / 1» и имя бойца с иконкой-галочкой
      подтверждения. После проверки лишние контейнеры (`server`/`web`/`migrate`)
      остановлены, `postgres` оставлен как был до проверки (он был поднят и до
      начала работы).
- [x] T17. Обновить статусы спеки/плана/tasks и индекс `docs/specs/README.md`
      (этот шаг).
