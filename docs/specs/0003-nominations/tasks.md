# Tasks: Номинации турнира

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-07-09
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Контракты

- [x] T1. `proto/hema/v1/nomination.proto` — `NominationService` (List/Get,
      публичные) и `NominationAdminService` (Create/Update/Delete/Reorder);
      сообщения `Nomination` (+ `optional int32 fighter_capacity`,
      `NominationMetadata metadata` — типизированная закрытая схема, MVP-поле
      `optional string rules_url`); запросы/ответы с **обязательным**
      `tournament_id` в `Create`/`List`/`Reorder`; импорт `timestamp.proto`.
      `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Server

- [x] T2. **domain** — `modules/nomination/domain/domain.go`: сущность
      `Nomination`, `CreateInput`/`UpdateInput`, порт `Repository`, порт
      `ActiveTournamentProvider`, доменные ошибки (`ErrNotFound`,
      `ErrInvalidInput`, `ErrConflict`).
- [x] T3. **testutil** — `modules/nomination/testutil/`: in-memory
      `domain.Repository` (`var _ domain.Repository = (*FakeRepo)(nil)`) и fake
      `ActiveTournamentProvider`.
- [x] T4. **service (red→green)** — `service/service_test.go` (fake-репо +
      fake-provider): `Create`/`List`/`Get`/`Update`/`Delete`/`Reorder`
      счастливый путь; валидация (пустой title, отрицательная вместимость →
      `ErrInvalidInput`); обязательный `tournament_id` — пустой/неактивный →
      `ErrInvalidInput`/`ErrNotFound`; дубликат названия → `ErrConflict`;
      отсутствие номинации → `ErrNotFound` → затем `service/service.go`.
- [x] T5. **repo** — `repo/queries/nomination.sql`
      (`ListNominationsByTournament :many`, `GetNomination :one`,
      `CreateNomination :one`, `UpdateNomination :one`, `DeleteNomination :execrows`,
      `MaxPosition :one`, `SetNominationPosition :execrows`); `make sqlc`;
      `repo/repo.go` — реализация порта, транзакционный `Create`/`Reorder`,
      маппинг `23505`→`ErrConflict`, `pgx.ErrNoRows`→`ErrNotFound`.
- [x] T6. **migrations** — `migrations/00001_init.sql` (goose): схема
      `nomination`; таблица `nominations` (колонки/типы/CHECK как в плане),
      unique index `(tournament_id, lower(title))`, index
      `(tournament_id, position)`.
- [x] T7. **api (red→green)** — `api/handler_test.go` (httptest + Connect,
      fake-репо + fake-provider): публичные List (по `tournament_id`)/Get без
      auth; admin Create (обязательный `tournament_id`)/Update/Delete/Reorder —
      счастливый путь + маппинг доменных ошибок в
      `connect.Code` (`CodeInvalidArgument`/`CodeNotFound`/`CodeAlreadyExists`);
      round-trip `metadata` (`NominationMetadata`↔jsonb, `rules_url`) и presence
      `fighter_capacity` → затем `api/handler.go` (публичный + admin хендлеры,
      маппинг proto↔domain).
- [x] T8. **wiring** — `module.go` (`Register(mux, deps, baseOpts, adminOpts)`) +
      адаптер `tournament.ActiveTournamentIDProvider` поверх `tournament`-сервиса
      (новый файл `modules/tournament/active_tournament_provider.go`) и
      регистрация в `internal/platform`; `NominationService` RPC добавлены в
      `publicProcedures` интерсептора Auth.
- [x] T9. **integration (БД)** — `integration/nomination_integration_test.go`:
      миграция + sqlc на реальной БД (testcontainers): уникальность названия в
      турнире, транзакционный `Reorder`, create/update/delete round-trip,
      резолв активного турнира, no-token/non-active edge cases. 9/9 passing.

## Web

- [x] T10. **BFF (red→green)** — `app/api/nominations/route.ts` (GET/POST),
      `app/api/nominations/[id]/route.ts` (GET/PUT/DELETE),
      `app/api/nominations/reorder/route.ts` (POST) + `*.test.ts` (mock
      fetch/grpc, маппинг `connect.Code`→HTTP: 400/404/409/401/403).
- [x] T11. **entities/features** — `entities/nomination/` (типы, server-only
      `get-nominations.ts` для SSR); `features/nomination-management/` —
      `api/requests.ts` + `keys.ts` + RQ-хуки (`use-nominations`,
      `use-create-nomination`, `use-update-nomination`, `use-delete-nomination`,
      `use-reorder-nominations`); тесты fetchers (Vitest, mock fetch); `ui/` —
      `nomination-management.tsx` (форма создания + список с inline-редактором,
      удалением, порядком вверх/вниз).
- [x] T12. **widget/route** — `widgets/nominations-list/nominations-list.tsx` на
      публичной странице (`app/page.tsx`, SSR, скрытие пустых полей и всей
      секции при пустом списке) + раздел админки
      `app/(admin)/admin/nominations/page.tsx` + ссылка «Номинации» на
      `/admin`.

## Проверка

- [x] T13. `make test-all` зелёный (server: `go test ./...`; web: 17 файлов /
      139 тестов).
- [x] T14. `pnpm exec tsc --noEmit` чистый.
- [x] T15. `go build ./...` + `pnpm build` — оба успешны; сквозная проверка
      через `make dev` (реальный Postgres + Go-сервер + Next.js): admin
      login → создание/чтение/reorder/delete номинаций через живые BFF-роуты,
      рендер на публичной странице (SSR) и в админке, 401 без токена,
      presence `fighterCapacity` (`null` vs `16`) — весь стек подтверждён
      вживую, не только тестами. Дополнительно найден и исправлен пробел:
      `server/Dockerfile` не копировал `modules/nomination/migrations` в
      прод-образ (см. `server/AGENTS.md` → «Добавление модуля» — этот путь не
      покрывается ни testcontainers, ни `make dev`); исправлено и проверено
      через `docker compose up --build` + `\dn` в контейнере postgres.
- [x] T16. Статусы спеки/плана/tasks и индекс `docs/specs/README.md` обновлены.
