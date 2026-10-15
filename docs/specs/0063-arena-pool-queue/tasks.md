# Tasks: Очередь пулов на ристалище (arena pool queue)

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: in progress
- Дата: 2026-10-15
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

После контрактов server (модуль `stage`) и web не пересекаются по файлам:
web работает на мок-транспорте/моках fetch и не ждёт сервер.

| Волна | Трек | Задачи   | Файлы (не пересекаются внутри волны)                    | Зависит от           |
| ----- | ---- | -------- | ------------------------------------------------------- | -------------------- |
| 0     | —    | T1, T2   | `proto/hema/v1/stage.proto`, `docs/adr/0024-*.md`       | —                    |
| 1     | A    | T3–T12   | `server/modules/stage/**`                               | волна 0              |
| 1     | B    | T13–T19  | `web/src/**`                                            | волна 0              |
| 2     | join | T20–T23  | docs, проверка в полном стеке                           | треки A и B смержены |

## Контракты и решения

- [ ] T1. `proto/hema/v1/stage.proto` — `Pool.stage_title/queue_*`,
      `GetPoolsForArenaResponse.queued`, RPC `EnqueuePool`/`DequeuePool`/
      `ReorderArenaQueue`/`SeatNextPool` + сообщения, `ConsoleArena.queue*`,
      `ConsoleQueueItem.expected_start_at/queue_position`,
      `LiveArena.next_pool_*`, `LiveFeedBout.queue_*`; комментарии
      `SeatPoolOnArena`/`SetLayoutStatus`/`GetPoolsForArena`. `go tool buf lint`,
      `make generate`.
- [ ] T2. `docs/adr/0024-arena-pool-queue.md` — очередь пулов на арену:
      ручной переход, горизонт оценки = стоящий пул + очередь, пауза смены
      5 мин; ссылки на 0043 «Вне скоупа» и ADR 0020 (п. горизонта) как
      переигранные.

## Server (трек A, `modules/stage`)

- [x] T3. **domain/queue** — `domain/queue_test.go` → `domain/queue.go`:
      `EnqueueOrder` (в конец, перенос), `RemoveFromOrder` (уплотнение),
      `ValidateReorder` (тот же набор, без повторов → `ErrQueueMismatch`);
      ошибки `ErrPoolQueued`, `ErrQueueEmpty`, `ErrQueueMismatch`.
- [x] T4. **domain/pace** — `pace_test.go` → `ForecastQueue`,
      `QueueChangeoverPause` (AC-10, AC-11: 11:05/11:25, 10:05; всегда
      provisional).
- [x] T5. **domain/порт + fake** — `Pool.StageTitle/QueueArenaID/QueuePosition`,
      `ArenaPools.Queued`; методы `Repository` по плану; fake-репо в
      `testutil/` (включая удаление из очереди в `SeatPool`).
- [x] T6. **service/queue** — `service/queue_test.go` (fake) → `service/queue.go`:
      `EnqueuePool` (AC-1, AC-2, AC-3), `DequeuePool`/`ReorderArenaQueue`
      (AC-4, mismatch), `SeatNextPool` (AC-5, AC-6, FR-11 недоступная
      голова), уведомление живого канала на каждое изменение.
- [x] T7. **service/seat + layout** — тесты → `SeatPoolOnArena` убирает из
      очереди (AC-7); `SetLayoutStatus` ready→draft → `ErrPoolQueued` с
      ареной (AC-8); `GetPoolsForArena` — `Queued` и фильтр `Available`
      (AC-1, AC-14 пометка чужой/архивной очереди).
- [x] T8. **service/enrichPools** — тест → `StageTitle`, `QueueArenaName`
      (AC-9).
- [x] T9. **service/forecast + console + live** — тесты → прогноз очереди
      неархивных арен в `buildForecasts`; `ConsoleArena.Queue`,
      `ConsoleNomination` (FR-23), снапшот «Не распределены» (FR-24), алерт
      простоя с головой очереди (FR-25), `LiveArena.NextPool*`,
      `LiveFeedBout.Queue*`; архивная арена без прогноза (AC-10..AC-14).
- [x] T10. **migrations + repo** — `migrations/00007_arena_queue.sql`;
      запросы в `repo/queries/stage.sql`; `make sqlc`; реализация порта в
      `repo/repo.go` (транзакции enqueue/dequeue/reorder; `SeatPool`
      удаляет запись очереди и уплотняет).
- [x] T11. **api** — `api/handler_test.go` (httptest + Connect, fake) → 4
      хендлера + маппинг полей `Pool`/`ConsoleArena`/`LiveArena`, ошибки →
      `FailedPrecondition`/`InvalidArgument`/`NotFound`.
- [x] T12. **integration** — `integration/*_integration_test.go`: миграция
      00007, перенос между очередями, reorder с DEFERRABLE UNIQUE,
      `SeatPool` чистит очередь, откат раскладки отклонён.

## Web (трек B)

- [x] T13. **entities/pool** — `types.ts`: новые поля + `poolTitle()`; тест
      хелпера.
- [x] T14. **BFF** — `route.test.ts` → `pools/[poolId]/enqueue`,
      `pools/[poolId]/dequeue`, `arenas/[arenaId]/queue` (PUT),
      `arenas/[arenaId]/seat-next`; `*.e2e.test.ts` с реальным `toJson`
      (`queued`, `queue_position`, `stage_title`).
- [x] T15. **features/pool-seating/api** — `requests.test.ts` → 4 fetchers;
      хуки мутаций с `setQueryData` в кэш `usePoolsForArena`.
- [x] T16. **features/pool-seating/ui** — `pool-seating.test.tsx` → этап в
      списке и у стоящего пула (AC-9), «В очередь» у занятой арены (FR-7),
      пометка «в очереди: Арена N»; `arena-queue.test.tsx` →
      `ui/arena-queue.tsx` (порядок, вверх/вниз, убрать, «Поставить
      следующий», прогноз).
- [x] T17. **widgets/arena-console** — `management-view.test.tsx` → очередь и
      «только в очередь» под стоящим пулом.
- [x] T18. **features/tournament-console** — тесты → длина очереди и
      следующий пул в карточке арены, раздел «Не распределены».
- [x] T19. **публичное** — тесты → `nomination-public/pool-card.tsx`
      (FR-18), `home/arena-card.tsx` (FR-19), `dashboard/next-bout-card.tsx`
      (FR-20).

## Проверка (join)

- [ ] T20. `make test-all` + `make test-integration` зелёные.
- [ ] T21. `pnpm exec tsc --noEmit`, `go build ./...`, `pnpm build`,
      `pnpm lint`.
- [ ] T22. Полный стек `docker compose up --build`: миграция 00007
      применилась; ручная проверка AC-5/AC-6 на странице арены.
- [ ] T23. Статусы spec/plan/tasks → done, строка в `docs/specs/README.md`.
