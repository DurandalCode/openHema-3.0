# Tasks: Площадки — ристалища/арены (arenas)

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-07-13
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз: контракты → server снизу вверх (domain → service
→ repo → api → wiring) → web → проверка. Внутри задачи: сначала падающий тест
(red), затем минимальный код (green), затем рефактор при зелёных тестах.

## Контракты

- [x] T1. `proto/hema/v1/arena.proto` — `ArenaAdminService`
      (List/Get/Create/Update/Archive/Restore/Reorder), сообщения `Arena` +
      Request/Response, enum `ArenaStatus {UNSPECIFIED, ACTIVE, ARCHIVED}`.
      Затем `make generate` (Go + TS). `go tool buf lint` зелёный.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Server (модуль `arena`, снизу вверх)

- [x] T2. **domain** — `modules/arena/domain/domain.go`: сущность `Arena`, тип
      `Status` (active/archived), `CreateInput`/`UpdateInput`, порты
      `Repository` и `ActiveTournamentProvider`, доменные ошибки
      (`ErrNotFound`, `ErrInvalidInput`), валидация имени. Тест:
      `domain/domain_test.go` на валидацию имени (пустое/пробельное → ошибка) и
      значения статусов.
- [x] T3. **testutil** — `modules/arena/testutil/fake_repo.go` (in-memory
      `domain.Repository`, `var _ domain.Repository = (*FakeRepo)(nil)`) и
      `testutil/fake_active_tournament_provider.go` (по образцу nomination).
- [x] T4. **service (red→green)** — `service/service_test.go` (fake-репо + fake
      ActiveTournamentProvider): create/update (валидация активного турнира и
      непустого имени), archive/restore (идемпотентность), reorder (ordered_ids
      = текущий набор, иначе `ErrInvalidInput`), get/list, not-found → затем
      `service/service.go`.
- [x] T5. **repo** — `repo/queries/arena.sql`
      (`List`, `Get`, `MaxPosition`, `Create`, `Update`, `SetStatus`,
      `SetPosition` для reorder); `make sqlc`; `repo/repo.go` — реализация
      `Repository` (Create = MaxPosition+1; Reorder атомарно в транзакции по
      образцу nomination).
- [x] T6. **migrations** — `migrations/00001_init.sql` (goose): схема `arena` +
      таблица `arena.arenas` (name/description/position/status, CHECK-и, индекс
      `(tournament_id, position)`; **без** unique на имя).
- [x] T7. **api (red→green)** — `api/handler_test.go` (httptest + Connect,
      fake-репо): happy-path каждого RPC + маппинг доменных ошибок в
      `connect.Code` (`NotFound`/`InvalidArgument`) + require-admin (без admin →
      отказ) → затем `api/handler.go` (маппинг proto↔domain).
- [x] T8. **wiring** — `modules/arena/module.go` (`Register(mux, deps, baseOpts,
      adminOpts)`, `Deps{Pool, Tournaments}`) + регистрация в
      `internal/platform/platform.go` (переиспользовать `activeTournaments`).
- [x] T9. **инфра-точки модуля** (чек-лист `server/AGENTS.md`): `server/sqlc.yaml`
      (секция `sql:` arena), `server/internal/testdb/testdb.go`
      (`moduleMigrations += arena`), корневой `Makefile` (`migrate`/`migrate-down`
      с arena), `server/Dockerfile` (COPY миграций arena).
- [x] T10. **integration** — `modules/arena/integration/arena_integration_test.go`
      (`//go:build integration`, testcontainers): миграции применяются; полный
      путь create → list → update → archive → restore → reorder через реальный PG
      и Connect. `make test-integration` зелёный.

## Web

- [x] T11. **BFF (red→green)** — роуты
      `app/api/admin/arenas/route.ts` (list/create),
      `app/api/admin/arenas/[id]/route.ts` (get/update),
      `.../[id]/archive`, `.../[id]/restore`, `.../reorder` + тесты
      (`*.e2e.test.ts`, mock grpc-транспорт, реальный `toJson`,
      `connect.Code`→HTTP).
- [x] T12. **entities/arena** — типы `Arena`/`ArenaStatus`, маппинг статуса →
      лейбл, сериализация proto→JSON; тест сериализации (Vitest).
- [x] T13. **features/arena-management** — `api/` (`requests.ts` + `keys.ts` +
      RQ-хуки: use-arenas / use-create-arena / use-update-arena /
      use-archive-arena / use-restore-arena / use-reorder-arenas) + тесты
      fetchers (Vitest, mock `fetch`); `ui/arena-management.tsx` (список, форма
      заведения, действия по строке, reorder).
- [x] T14. **роуты admin-зоны** — `app/(admin)/admin/arenas/page.tsx` (список) +
      `app/(admin)/admin/arenas/[id]/page.tsx` (**каркас страницы управления
      площадкой**: SSR `GetArena`, реквизиты + плейсхолдер под бои) + пункт
      «Площадки» в `admin-nav.tsx`.

## Проверка

- [x] T15. `make test-all` зелёный (server + web). Для интеграции —
      `make test-integration`.
- [x] T16. `pnpm exec tsc --noEmit` (protobuf-моки) + `go build ./...` +
      `pnpm build`.
- [x] T17. **Полный докер-стек**: `docker compose build migrate` (строка
      `COPY /src/modules/arena/migrations` присутствует), `docker compose run
      --rm migrate` (goose up), `docker compose exec postgres psql -U hema -d
      hema -c '\dn'` содержит схему `arena`; таблица `arena.arenas` со всеми
      CHECK-ами и индексом `idx_arenas_tournament`.
- [x] T18. Обновить статусы `spec.md`/`plan.md`/`tasks.md` → done и строку 0008 в
      `docs/specs/README.md`.
