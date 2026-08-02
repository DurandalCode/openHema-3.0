# Tasks: Статистика и итоговая таблица пула (pool standings)

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-08-02
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Дизъюнктных по файлам кусков нет: server-цепочка (domain → service → api) и
web-цепочка (serialize → entities/pool → features/widgets) идут
последовательно каждая внутри себя, а между собой пересекаются только через
контракт (proto), который выполняется первым. Единый последовательный
чеклист, без отдельных треков.

## Контракты

- [x] T1. `proto/hema/v1/pool.proto` — добавить сообщение `PoolStanding` и
      поле `repeated PoolStanding standings = 10;` в `Pool` (план,
      «Контракты»); `make generate`.

## Server

- [x] T2. **domain: ComputeStandings (red→green)** —
      `modules/pool/domain/standings_test.go`: кейсы из плана «Тестирование»
      (пусто без завершённых боёв; победа/поражение; ничья не даёт win/loss;
      тай-брейк победы→очки→пропущенные на раунд-робине из 4 бойцов; полное
      равенство трёх критериев → общее место 1,2,2,4; незавершённые бои не
      учитываются) → затем `modules/pool/domain/standings.go`
      (`type Standing`, `func ComputeStandings`).
- [x] T3. **domain: Pool.Standings** — `modules/pool/domain/domain.go`:
      добавить поле `Standings []Standing` в `type Pool struct`.
- [x] T4. **service (red→green)** — расширить
      `modules/pool/service/service_test.go`: `GetLayout` и `NominationLive`
      с fake `BoutConductor`, содержащим завершённые/незавершённые бои,
      возвращают заполненный/пустой `Pool.Standings` (AC-2/AC-6); правка
      счёта уже завершённого боя между двумя чтениями меняет таблицу без
      отдельного действия (AC-5) → затем правки
      `modules/pool/service/service.go` (`applyArenaAndStatus`,
      `NominationLive`, план «Server → service»).
- [x] T5. **api (red→green)** — расширить
      `modules/pool/api/handler_test.go`: `GetLayout`/`ListPublicPools`/
      `GetNominationLive` отдают `standings` в proto-ответе после завершения
      боя через fake-порты; `GetPoolsForArena`/`GetBoutBoard` — регрессионно
      `standings` пуст → затем `toProtoStandings` и правка `toProtoPool` в
      `modules/pool/api/handler.go`.

## Web

- [x] T6. **serialize (red→green)** — расширить
      `web/src/lib/grpc/serialize.ts` тест(ы) (`*.e2e.test.ts`, по образцу
      существующих для `poolToJson`): `standings` пробрасывается из
      proto-ответа в JSON → затем правка `poolRawToDto` (добавить поле
      `standings`).
- [x] T7. **entities/pool** — `web/src/entities/pool/lib/types.ts`: тип
      `PoolStanding` + поле `standings: PoolStanding[]` в `Pool`
      (`types.test.ts` — при необходимости, только если добавляются
      хелперы/лейблы).
- [x] T8. **entities/pool/ui (red→green)** —
      `web/src/entities/pool/ui/pool-standings-table.test.tsx`: рендерит
      переданные строки без пересортировки, возвращает `null` при пустом
      массиве (FR-7) → затем
      `web/src/entities/pool/ui/pool-standings-table.tsx`.
- [x] T9. **features/nomination-pools** —
      `web/src/features/nomination-pools/ui/nomination-pools.tsx`:
      подключить `PoolStandingsTable` под каждой карточкой пула.
- [x] T10. **widgets/nomination-pools-public** —
      `web/src/widgets/nomination-pools-public/nomination-pools-public.tsx`:
      подключить тот же `PoolStandingsTable` для `livePool.pool.standings`.

## Проверка

- [x] T11. `make test-all` зелёный.
- [x] T12. `pnpm exec tsc --noEmit` (менялись protobuf-моки/сериализация).
- [x] T13. `go build ./...` + `pnpm build`.
- [x] T14. Обновить статус спеки/плана/tasks (`ready`/`done`) и индекс
      `docs/specs/README.md`.
