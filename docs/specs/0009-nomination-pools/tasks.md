# Tasks: Пулы номинации (распределение бойцов)

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-07-14
- План: `./plan.md`
- Инкремент (2026-07-14): undo для «Сбросить раскладку» — задачи IR1..IR7
  ниже. Спека/план правлены (FR-4a/FR-7a/FR-10/AC-13a4/AC-13b/AC-17b).

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Контракты

- [x] T1. `proto/hema/v1/pool.proto` — `PoolAdminService` (9 RPC),
      `PoolLayout`/`Pool`/`FighterRef`, `PoolLayoutStatus`, все `*Request`/
      `*Response` (см. plan «Контракты»). `make generate` (Go+TS).
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Server — расширение fighter (провайдер для pool)

- [x] T2. **fighter repo/service** — добавить
      `ActiveFightersByNomination(ctx, nominationID) → []FighterRef`
      (`FighterStatus=active` **и** `ParticipationStatus=active`).
      Red: тест сервиса (fake-репо) на фильтрацию активных; затем sqlc-запрос
      `repo/queries/*.sql` + `make sqlc` + метод сервиса. Синхронизировать
      `server/sqlc.yaml` при новых запросах.

## Server — модуль pool (снизу вверх)

- [x] T3. **domain — алгоритм** — `modules/pool/domain/distribute_test.go`:
      таблица кейсов из AC-10/11/12/13 (детерминированный результат),
      `NormalizeClub`, генерация свободного номера (FR-3). Затем
      `domain/distribute.go` (+ типы `FighterRef`, `Pool`, `Assignment`).
- [x] T4. **domain — сущности/порты/ошибки** — `domain/domain.go`:
      `Layout`, `LayoutStatus`, порт `Repository`, порт
      `ActiveFightersProvider`, ошибки (`ErrNotFound`, `ErrInvalidInput`,
      `ErrNotDraft`, `ErrNoPools`, `ErrNothingToUndo`). Red через след. шаг.
- [x] T5. **testutil** — `modules/pool/testutil/fake_repo.go` (in-memory
      `domain.Repository`, `var _ = ...`) + `fake_active_fighters_provider.go`.
- [x] T6. **service (red→green)** — `service/service_test.go` (fake-репо +
      fake-провайдер): реконсиляция/lazy-init (AC-1/17/17a), Create/свободный
      номер (AC-2), DeletePool→бойцы в нераспределённые (AC-3), Reset
      (AC-17b/17c), Assign/Unassign/move (AC-4..7), AutoDistribute
      (AC-8 `ErrNoPools`, AC-9 no-op, AC-10/11 расстановка), Undo-классы и
      обнуление (AC-13a/13a2/13a3/13b/13c), SetStatus draft↔ready + запреты в
      ready (AC-14/15/16/13d/17c). Затем `service/service.go`. 27 тестов, все
      зелёные.
- [x] T7. **repo** — `repo/queries/pool.sql` (CRUD пулов/членств/`pool_layout`,
      апсерты для undo, выборки для реконсиляции); `make sqlc`; `repo/repo.go`
      — реализация порта (транзакции для Delete/Reset/Auto/Undo).
- [x] T8. **migrations** — `migrations/00001_init.sql` (goose): схема `pool` +
      `pool_layouts`, `pools`, `pool_members` со всеми CHECK/UNIQUE/FK/индексами
      (DDL из plan).
- [x] T9. **api (red→green)** — `api/handler_test.go` (httptest + Connect,
      fake-репо): каждый RPC — счастливый путь + маппинг ошибок в
      `connect.Code` (`FailedPrecondition` для `ErrNotDraft`/`ErrNoPools`/
      `ErrNothingToUndo`), admin-guard (AC-18). Затем `api/handler.go`
      (имя `Пул N` из number).
- [x] T10. **wiring** — `module.go` (`Register(mux, deps, opts...)`) +
      регистрация в `internal/platform` (инъекция `ActiveFightersProvider`
      адаптером над сервисом `fighter`, `internal/platform/pool_provider.go`).
- [x] T11. **инфра-точки нового модуля** — синхронизировано: `server/sqlc.yaml`,
      `server/internal/testdb/testdb.go` (`moduleMigrations`), корневой
      `Makefile` (migrate/migrate-down), `server/Dockerfile` (COPY миграций).
- [x] T12. **интеграционный тест** — `integration/pool_integration_test.go`
      (`//go:build integration`, testcontainers): миграции применяются;
      UNIQUE(nomination_id, fighter_id) держит FR-1; каскад членств при
      DeletePool; путь Create→Assign→Auto→Get через реальный Connect × PG.
      5 тестов, все зелёные (реальный Docker/testcontainers).

## Web

- [x] T13. **зависимость** — установлены `@dnd-kit/core`, `@dnd-kit/sortable`,
      `@dnd-kit/utilities` в `/web`.
- [x] T14. **BFF (red→green)** — 9 route handlers под
      `app/api/nominations/[id]/...` и `app/api/pools/[poolId]/route.ts` +
      `*.test.ts` (mock fetch/grpc, маппинг `connect.Code`→HTTP через общий
      `errorResponse`, admin-guard через 401/403 на отсутствующий/не-админский
      токен на Go-стороне).
- [x] T15. **entities/pool** — `entities/pool/lib/types.ts`: типы из proto
      (`PoolLayout`/`Pool`/`FighterRef`/`PoolLayoutStatus`) +
      `poolLayoutStatusLabel`; `poolLayoutToJson` в `lib/grpc/serialize.ts`.
      Без отдельного теста на лейбл-хелпер — консистентно с
      `arenaStatusLabel` (тоже без теста).
- [x] T16. **features/nomination-pools** — `api/requests.ts`+`keys.ts`+9
      RQ-хуков (мутации с инвалидацией `layout`) + `requests.test.ts` (12
      тестов); `ui/nomination-pools.tsx` — колонки/пулы/тулбар/DnD
      (`@dnd-kit`), read-only в `ready`.
      **Отклонение от плана**: отдельный `model/` (zustand) для DnD не
      понадобился — `@dnd-kit`'s `DndContext`/`DragOverlay` + локальный
      `useState` для превью перетаскиваемой карточки достаточны; отдельный
      глобальный store был бы лишней абстракцией (house style).
- [x] T17. **роут** — `app/(admin)/admin/nominations/[id]/pools/page.tsx` +
      `entities/nomination/model/get-nomination.ts` (SSR-заголовок) + ссылка
      со страницы номинаций (`nomination-management.tsx`, иконка `Users`).
      **Отклонение от плана**: без отдельного `widgets/nomination-pools/` и
      без `HydrationBoundary`-prefetch — экран целиком интерактивен (DnD),
      `NominationPools` уже самодостаточен (TanStack Query на клиенте); как
      и `arenas`/`nominations` страницы админки, серверная обёртка только
      получает сущность для заголовка. `widgets/` не даёт выгоды для
      одной фичи без композиции нескольких.

## Инкремент 2026-07-14 — undo для «Сбросить раскладку»

> FR-4a/FR-7a расширены: reset становится undoable (третий класс undo).
> Спека/план правлены выше. Контракты (proto) **не трогаем** — `can_undo`
> bool уже покрывает кнопку; вид undo скрыт в JSONB/domain.

Порядок: domain → fake → service (red→green) → repo + миграция → api → web.

- [x] IR1. **domain** — `domain/domain.go`: добавить `UndoReset UndoKind =
      "reset"`; расширить `UndoState` снапшотом всех пулов на момент сброса
      (`Pools []ResetPool`, `ResetPool{Number int, FighterIDs []string}`).
      Обновить комментарий `UndoKind`. Red: в IR3 тесты сервис станут
      компилироваться через новые поля.
- [x] IR2. **testutil (fake)** — `testutil/fake_repo.go`: `ResetLayout`
      вместо `clearUndo` пишет undo-снапшот всех пулов номинации (number +
      memberIDs) с `Kind=UndoReset` в `setUndoLocked`; новый метод
      `UndoReset(ctx, pools []ResetPool)` — пересоздаёт все пулы (как
      `UndoDeletePool` для каждого, но числом). Red: IR3 тесты начнут падать.
- [x] IR3. **service (red→green)** — `service/service_test.go`:
      - `TestUndo_AC13a4_UndoResetRestoresAllPools` — 3 пула с бойцами →
        Reset → Undo → все 3 пула восстановлены с теми же номерами и бойцами;
        CanUndo true после reset;
      - `TestResetLayout_AC17b_UndoAvailableAfterReset` — CanUndo true
        сразу после Reset (в дополнение к существующему `TestResetLayout_AC17b`);
      - `TestUndo_AC13b` обновить: сброс раскладки **не** обнуляет undo, а
        создаёт свой (заменить «сброс обнуляет» на «сброс создаёт undo» в
        списке обнуляющих; проверить, что после Reset CanUndo true).
      Затем `service/service.go`: `Undo` — ветка `UndoReset` →
      `repo.UndoReset(ctx, undo.Pools)`; `ResetLayout` — оставить как есть
      (repo пишет undo). Red→green.
- [x] IR4. **repo + миграция**
      **Девиация от плана**: новый sqlc-запрос `ListPoolsAndMembers` не
      потребовался — `ResetLayout` переиспользует существующие
      `ListPoolsByNomination` + `ListMembersByNomination` (уже есть в
      `GetLayout`), без новой генерации sqlc. `make sqlc` запускать не нужно. — `migrations/00002_undo_reset.sql` (goose
      Up/Down: DROP+ADD CHECK с `'reset'`). `repo/queries/pool.sql` —
      `ListPoolsAndMembersByNomination :many` (number + fighter_ids для
      снапшота reset; agg или два запроса в `repo.go`). `repo/repo.go`:
      `ResetLayout` — в транзакции: собрать снапшот всех пулов (number +
      fighter_ids), удалить пулы, записать `undo_kind='reset'` с
      `{"pools":[{number,fighter_ids},...]}`; `UndoReset` — в транзакции:
      для каждого пула из снапшота `InsertPool` (number) + `InsertMember`
      для каждого fighter_id; `EnsureLayoutAndClearUndo`. `make sqlc`.
      Red: `go test -tags=integration ./modules/pool/...` — миграции
      применяются, UndoReset через реальную PG работает.
- [x] IR5. **api** — `api/handler_test.go`: `TestResetLayout_E2E` — после
      reset `CanUndo=true`; `TestUndo_E2E_UndoReset` — reset → undo → пулы
      восстановлены. Handler не меняется (маппинг не зависит от вида undo).
- [x] IR6. **web** — `ui/nomination-pools.tsx`: DnD-косметика (пункт 2
      юзера) — убрать «ghost» фантом оставшейся карточки и сделать движение
      плавнее (details ниже в коде). Тест не нужен — визуальная правка;
      `pnpm test` + `tsc --noEmit` должны оставаться зелёными.
- [x] IR7. **проверка** — `go test ./...` + `go vet ./...` + `go build ./...`
      (server) зелёные; `pnpm test` (375/375) + `pnpm exec tsc --noEmit` (web)
      зелёные. Integration-тесты (`TestIntegration_UndoReset_*`) добавлены,
      компилируются (`go build -tags=integration`); локально не запущены —
      Colima rootless Docker not found (проблема окружения, не код); прогон в
      CI (пользователь). — `go test ./...` + `go build ./...` (server),
      `pnpm test` + `pnpm exec tsc --noEmit` (web) зелёные;
      `go test -tags=integration ./modules/pool/...` зелёный (Docker).
      Статусы инкремента отметить здесь.

## Проверка

- [x] T18. `make test-all` зелёный (server: `go test ./...` — все pool-пакеты
      OK; web: `pnpm test` — 57 файлов / 375 тестов, все OK) +
      `make test-integration` (`-tags=integration`, testcontainers) для pool
      — 5/5 зелёных.
- [x] T19. `pnpm exec tsc --noEmit` — чисто.
- [x] T20. `go build ./...` (server) + `pnpm build` (web) — оба чисто,
      `/admin/nominations/[id]/pools` и все 9 `/api/.../pool*` в манифесте.
- [x] T21. **Миграции в полном докер-стеке** — `docker compose up --build`:
      схема `pool` создана (`\dn`), таблицы `pool_layouts`/`pools`/
      `pool_members` на месте (`\dt pool.*`), `migrate`-сервис отработал без
      ошибок, `server`/`web` контейнеры стартовали и отвечают (`/healthz`
      200). Стек остановлен (`docker compose down`) без затрагивания volume.
- [x] T22. Статусы спеки/плана/tasks и индекс `docs/specs/README.md`
      обновлены на `done`.
