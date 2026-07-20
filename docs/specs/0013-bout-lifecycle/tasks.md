# Tasks: Жизненный цикл боя и текущий бой на арене

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-07-20
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Волна 0 (контракты) — общая. Волна 1 распадается на три дизъюнктных по файлам
трека: **A** (модуль `bout`, event-sourcing), **B** (модуль `pool`,
оркестрация — на fake-кондукторе), **C** (web — на моках grpc). Волна 2 —
join: wiring в `internal/platform` (адаптер conductor) + сквозные проверки.

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0     | —    | T1     | `proto/hema/v1/pool.proto` (+ generate) | —          |
| 1     | A    | T2–T6  | `server/modules/bout/**`              | волна 0    |
| 1     | B    | T7–T11 | `server/modules/pool/**`              | волна 0    |
| 1     | C    | T12–T14| `web/**`                              | волна 0    |
| 2     | join | T15–T19| `internal/platform/**`, integration, статус/индекс | A, B, C смержены |

## Контракты

- [x] T1. `proto/hema/v1/pool.proto` — добавить `enum BoutState`, сообщения
      `BoardBout`/`BoutBoard`, RPC `GetBoutBoard/SetCurrentBout/StartCurrentBout/
      ScoreCurrentBout/FinishCurrentBout/ReopenCurrentBout/ResetCurrentBout` +
      их Request/Response (своя пара на каждый RPC, buf lint
      `RPC_REQUEST_RESPONSE_UNIQUE`); уточнить док `UnseatPool` (снятие в любой
      фазе). `bout.proto`/`arena.proto` — без изменений.
      `make generate`. _(контракты — не TDD-шаг, идут первыми.)_

## Server — Трек A: модуль `bout` (event-sourced)

- [x] T2. **domain — состояние/счёт/исход** — `bout/domain/domain.go`: тип
      `BoutState`, поля `State/ScoreA/ScoreB/Version` в `Bout`, `Outcome()`.
      Тест `domain_test.go`: `Outcome` A/B/draw (AC-2/3).
- [x] T3. **domain — события и команды (red→green)** — `bout/domain/`: `EventType`,
      `Event/Payload`, `Rebuild`/`apply`, команды `Scheduled/Start/Score/Finish/
      Reopen/Reset` + доменные ошибки (`ErrInvalidTransition/ErrInvalidInput/
      ErrConcurrency/ErrNotFound`). Тест: свёртка каждого события; допустимые/
      недопустимые переходы; `Score` отвергает отрицательные (AC-4).
- [x] T4. **testutil** — `bout/testutil/fake_repo.go`: in-memory event store +
      проекция (`var _ domain.Repository`); эмуляция `uq(bout_id,version)`
      (конфликт → `ErrConcurrency`) для теста повтора.
- [x] T5. **service (red→green)** — `bout/service/service_test.go` + `service.go`:
      `Start/Score/Finish/Reopen/Reset` (Load→Rebuild→decide→Append), прозрачный
      повтор при `ErrConcurrency` (один retry → успех; повторный → ошибка);
      `Generate/Clear` (проекция + `scheduled`-события); чтения
      `BoutsByPool/PoolProgress/AnyStartedInNomination`.
- [x] T6. **repo + migrations** — `bout/migrations/00002_bout_lifecycle.sql`
      (колонки state/score/version на `bouts`; таблица `bout_events` с
      `UNIQUE(bout_id,version)` + FK cascade); `bout/repo/queries/bout.sql`
      (`AppendEvent/UpsertProjection/LoadEvents/BoutsByPool/PoolProgress/
      AnyStartedInNomination`, переписать `ReplaceForNomination` — bouts+events
      в одной tx); `make sqlc`; `repo/repo.go`. `api/` — маппинг проекции→`Bout`
      **опускает** state/score (public/admin list без результатов).

## Server — Трек B: модуль `pool` (оркестрация ведения, на fake-кондукторе)

- [ ] T7. **domain — статус/указатель/порт** — `pool/domain/domain.go`:
      `Pool.CurrentBoutID`; расширить `ComputePoolStatus(layout, arenaID,
      started, finished, total)`; расширить порт `BoutGenerator`→`BoutConductor`
      (лайфсайкл-команды + `BoutsByPool/PoolProgress/AnyStartedInNomination`);
      ошибки `ErrPoolNotSeated/ErrNoCurrentBout/ErrHasResults`. Тест
      `domain_test.go`: таблица `ComputePoolStatus` (not_ready/ready/preparing/
      active/finished, вкл. снятый пул с результатами — AC-9/10/11).
- [ ] T8. **testutil** — обновить `pool/testutil/fake_bout_generator.go` →
      `fake_bout_conductor.go`: spy лайфсайкл-вызовов + настраиваемые состояния
      боёв пула/прогресс (`var _ domain.BoutConductor`).
- [ ] T9. **service — ведение (red→green)** — `pool/service/service_test.go` +
      `service.go`: `GetBoutBoard` (сборка доски, резолв текущего);
      `StartCurrentBout/ScoreCurrentBout/FinishCurrentBout(+авто-продвижение)/
      ReopenCurrentBout/ResetCurrentBout` c гейтом `arena_id` (AC-13) и
      `ErrNoCurrentBout`; `SetCurrentBout` (циркуляция, AC-6). Тесты AC-5/6/13.
- [ ] T10. **service — статус и гейт расфиксации** — расширить `SetStatus`
      (`ready→draft` + `AnyStartedInNomination` → `ErrHasResults`, AC-12);
      `loadLayout/ListPublicPools/GetPoolsForArena` — статус через `PoolProgress`
      (AC-9/10). Тесты на статусы и гейт.
- [ ] T11. **api + repo + migrations** — `pool/api/handler_test.go` + `handler.go`:
      новые RPC + маппинг ошибок (`FailedPrecondition/Aborted/InvalidArgument`),
      admin-only (AC-14), прокид `actorID`; `pool/migrations/00004_pool_current_
      bout.sql` (`current_bout_id`); `pool/repo/queries/pool.sql`
      (`SetCurrentBout`, `current_bout_id` в выборках); `make sqlc`; `repo.go`.

## Web — Трек C

- [x] T12. **entities** — `entities/pool/lib/types.ts`: `BoutState`, `BoardBout`,
      `BoutBoard`, `outcomeOf`, метки `PoolStatus` (идёт/завершён). Тест
      `outcomeOf` (A/B/draw).
- [x] T13. **BFF (red→green)** — `app/api/arenas/[id]/board/route.ts`,
      `app/api/pools/[poolId]/current-bout/route.ts`,
      `app/api/pools/[poolId]/bout/route.ts` (action-диспатч) + `*.test.ts`
      (мок grpc, `connect.Code`→HTTP: FailedPrecondition/Aborted→409,
      InvalidArgument→400).
- [x] T14. **feature `bout-board`** — `features/bout-board/{api,model,ui}`:
      RQ-хуки мутаций/доски; чистая функция шагов `±1/±2/±3/±5` с клампом к 0
      (тест — AC-2a); `BoutBoard` ui (счёт, кнопки шагов + ручной ввод, кнопки
      ЖЦ по состоянию, исход, список боёв с циркуляцией). Тест хуков/функции.

## Волна 2 — join (после мержа A+B+C)

- [ ] T15. **wiring** — `internal/platform/pool_bout_conductor.go`
      (`PoolBoutConductor` над `bout` service, реализует `pool/domain.
      BoutConductor`); `platform.go`: `poolDeps.Bouts = NewPoolBoutConductor(...)`.
- [x] T16. **arena page** — `app/(admin)/admin/arenas/[id]/page.tsx` +
      `features/pool-seating`: заменить плейсхолдер «ход боя» на `BoutBoard`,
      когда арена занята.
- [ ] T17. **integration (testcontainers)** — `bout`: конфликт версии реально
      ловится (AC-15), append+projection атомарны, regen каскадит events;
      `pool` (по возможности): доска/статус на реальном пути pool×bout.
- [ ] T18. **проверка** — `make test-all` зелёный; `pnpm exec tsc --noEmit`
      (менялись protobuf-моки); `go build ./...` + `pnpm build`.
- [ ] T19. **статус/индекс** — обновить статусы `spec.md`/`plan.md`/`tasks.md`
      (draft→done по мере); строка 0013 в `docs/specs/README.md`; пометить 0010/
      0011 «изменён 0013».

_Задачи-шаблон адаптированы под фичу: контракты → server (bout+pool снизу
вверх) → web → join (wiring, integration, verification)._
