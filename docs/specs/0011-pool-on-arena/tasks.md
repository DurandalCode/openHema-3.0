# Tasks: Постановка пула на арену (pool on arena)

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-07-18
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

После контрактов два дизъюнктных по файлам куска: сервер (в основном модуль
`pool`, плюс крохотная правка `bout/api`) и веб (на моках BFF). `pool`
тестируется на fake-портах (`ArenaProvider`, существующий `BoutGenerator`),
поэтому не ждёт реального `arena`. Реальная склейка (адаптер платформы,
интеграционные тесты, гейт архивации через несколько сервисов) — join-волна.

| Волна | Трек | Задачи   | Файлы (не пересекаются внутри волны)                  | Зависит от |
| ----- | ---- | -------- | ----------------------------------------------------- | ---------- |
| 0     | —    | T1       | `proto/hema/v1/{pool,bout}.proto` + `make generate`   | —          |
| 1     | A    | T2–T7    | `server/modules/pool/**`, `server/modules/bout/api/**`| волна 0    |
| 1     | B    | T11–T14  | `web/**` (на моках BFF)                                | волна 0    |
| 2     | join | T8–T10   | `server/internal/platform/**`, интеграционные тесты   | A смержен   |
| 2     | join | T15      | `web` BFF-гейт архивации (pool+arena)                  | A, B смержены |
| 3     | —    | T16–T19  | проверка/сборка/индекс                                 | всё смержено |

## Контракты

- [ ] T1. `proto/hema/v1/pool.proto` + `bout.proto`:
      - pool: урезать `PoolLayoutStatus` до `DRAFT/READY` (`reserved 3,4`); новый
        enum `PoolStatus`; `Pool.{status,arena_id,arena_name}`; новые RPC
        `SeatPoolOnArena`, `UnseatPool`, `GetPoolsForArena`; новый
        `PoolPublicService.ListPublicPools`. `SetLayoutStatus` **оставить**.
      - bout: новый `BoutPublicService.ListPublicBoutsByNomination` (тот же read).
      - `make generate` (Go + TS). _(контракты — не TDD-шаг, идут первыми.)_

## Server — трек A (`pool` + крохотная правка `bout/api`)

- [ ] T2. **migrations** — `pool/migrations/00003_pool_arena.sql`:
      `pools.arena_id UUID NULL`; partial unique `uq_pools_arena WHERE arena_id
      IS NOT NULL`; урезать `chk_layouts_status` до `('draft','ready')`
      (down — вернуть 4 значения).
- [ ] T3. **domain** — `pool/domain/domain.go`: убрать `LayoutActive/
      LayoutFinished`; тип `PoolStatus` + хелпер из `(layoutStatus, arenaID)`;
      поля `Pool.{Status,ArenaID,ArenaName}`; ошибки (`ErrNotReady/ErrArenaBusy/
      ErrAlreadySeated/ErrPoolSeated/ErrArenaNotAvailable`); порт `Repository`
      (seat/unseat/PoolsForArena/ReadyUnseatedPools/AnySeatedInNomination +
      `arena_id` в выборках); новый порт `ArenaProvider`.
- [ ] T4. **testutil** — `pool/testutil/`: обновить `fake_repo.go` (arena_id,
      seat/unseat, выборки), новый `fake_arena_provider.go`
      (`var _ domain.ArenaProvider = …`).
- [ ] T5. **service (red→green)** — `pool/service/service.go`:
      - `SetStatus`: гейт `ready → draft` при пуле на арене (`ErrPoolSeated`,
        AC-3); `draft → ready` — как 0009/0010.
      - `SeatPoolOnArena` (AC-4..AC-9) / `UnseatPool` (AC-8) через fake
        `ArenaProvider`; `GetPoolsForArena`; `ListPublicPools` (пусто при draft,
        AC-14); заполнение `PoolStatus`. Тесты — на fake-репо.
- [ ] T6. **repo + api (red→green)** — `pool/repo/queries/pool.sql` (+`make sqlc`)
      под новые методы; `pool/api/handler.go`: новые RPC + `PoolPublicService`;
      маппинг ошибок в `connect.Code`. Тест api (httptest+Connect, fake-репо).
- [ ] T7. **bout/api** — смонтировать `BoutPublicService` рядом с admin; тест:
      public доступен без admin, admin — под RequireAdmin. _(bout домен/сервис/
      репо не трогаем.)_

## Join — трек platform (волна 2)

- [ ] T8. **platform адаптер** — `internal/platform/pool_arena_provider.go`
      (`ArenaByID/ArenasByIDs` поверх arena service); `platform.go`
      (`poolDeps.Arenas`).
- [ ] T9. **wiring-компиляция** — `go build ./...`; `make test` (server).
- [ ] T10. **интеграционный** — partial unique `uq_pools_arena`: две посадки на
      одну арену — вторая падает (NFR-4).

## Web — трек B (волна 1, на моках)

- [ ] T11. **entities** — `entities/pool/lib/types.ts` (`PoolStatus`, `status/
      arenaId/arenaName`); `entities/pool/model/get-public-pools.ts` (SSR-фетчер).
- [ ] T12. **BFF (red→green)** — роуты `pools/[poolId]/seat`, `…/unseat`,
      `arenas/[id]/pools`, `nominations/[id]/public-pools` (+`*.test.ts`, мок
      grpc, маппинг `connect.Code`→HTTP).
- [ ] T13. **features** — `features/pool-seating` (api-хуки + ui секции арены);
      бейдж «готовится к запуску» на пуле в `features/nomination-pools`.
- [ ] T14. **routes/widgets** — `app/(admin)/admin/arenas/[id]/page.tsx` (секция
      постановки вместо плейсхолдера); новый публичный
      `app/nominations/[id]/page.tsx` (пулы+состав+бои+площадка/«готовится к
      запуску»), ссылка с главной/списка номинаций.

## Join — трек web (волна 2)

- [ ] T15. **BFF-гейт FR-10** — `app/api/admin/arenas/[id]/archive/route.ts`:
      перед архивацией проверить занятость арены (`GetPoolsForArena`), при
      занятости — `409`. Тест BFF (AC-10).

## Проверка (волна 3)

- [ ] T16. `make test-all` зелёный.
- [ ] T17. `pnpm exec tsc --noEmit` (менялись protobuf-моки/типы).
- [ ] T18. `go build ./...` + `pnpm build`; миграции проверены в полном
      докеризованном стеке (`docker compose up --build`) (Definition of Done).
- [ ] T19. Обновить статусы `spec.md`/`plan.md`/`tasks.md`; строка в
      `docs/specs/README.md`; пометить 0009/0010 «изменён 0011».

_Порядок сохранён: контракты → server снизу вверх → web → проверка. Треки A/B
одной волны дизъюнктны по файлам; join-волны трогают общие точки (платформа,
BFF-композиция)._
