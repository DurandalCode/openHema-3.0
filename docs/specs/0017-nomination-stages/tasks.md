# Tasks: Этапы номинации как сущность (nomination stages)

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-02
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

Два правила, специфичных для этой фичи:

1. **Существующие тесты правим только в части сигнатур** (FR-10). Если
   пришлось поменять *ожидание* существующего теста — это сигнал сломанного
   поведения, а не повод подправить тест. Останавливаемся и разбираемся.
2. **Локальную БД пересоздаём** после T1 и после T8:
   `docker compose down -v` → `make migrate` → `make demo-bouts`. Схема
   переименована и миграции схлопнуты — goose на старой базе не пройдёт.

## Треки и параллельность

| Волна | Трек | Задачи  | Файлы (не пересекаются внутри волны)                | Зависит от             |
| ----- | ---- | ------- | ---------------------------------------------------- | ---------------------- |
| 0     | —    | T1      | весь модуль + proto + инфра + web-клиенты            | —                      |
| 0     | —    | T2      | `proto/hema/v1/stage.proto`                          | T1                     |
| 1     | A    | T3–T9   | `server/modules/stage/**`                            | волна 0                |
| 1     | B    | T10–T11 | `server/modules/bout/**`                             | волна 0                |
| 1     | C    | T12–T14 | `web/src/**`                                         | волна 0                |
| 2     | join | T15–T18 | `internal/platform/*`, `modules/stage/integration/*` | треки A, B, C смержены |

Волна 0 идёт целиком последовательно и в одиночку: T1 трогает вообще всё и
параллелиться не может. Трек A — самый крупный и неделимый:
`domain`/`service`/`repo`/`api` меняются одной сменой адресации
(`nominationID` → `stageID`), развести по файлам нельзя. Трек B работает со
своим модулем и встречается с A только в адаптере (волна 2). Трек C зависит
только от сгенерированных типов.

## Волна 0 — переименование и контракты

- [x] T1. **Переименование `pool → stage`** (механическое, без единого
      изменения поведения — критерий приёмки: `make test-all` зелёный):
      - `server/modules/pool/` → `server/modules/stage/`, `package pool` →
        `package stage`, импорты (включая `internal/platform/*`);
      - PG-схема прямо в файлах миграций (`pool.` → `stage.`), **без**
        отдельной `ALTER SCHEMA`-миграции;
      - `proto/hema/v1/pool.proto` → `stage.proto`, `PoolAdminService` →
        `StageAdminService`, `PoolPublicService` → `StagePublicService`
        (имена RPC и сообщений не трогаем); `make generate`;
      - инфра по чеклисту `server/AGENTS.md`: `server/sqlc.yaml`,
        `server/internal/testdb/testdb.go`, `Makefile`
        (`STAGE_MIGRATIONS_DIR`, `goose_db_version_stage`),
        `server/Dockerfile`;
      - `internal/demoseed/demoseed.go` — префикс схемы в `TRUNCATE`
        (`pool.*` → `stage.*`) и имя пакета сервиса; имена таблиц пока
        прежние, до T8 (полностью демо чинит T17);
      - web: `stageAdminClient`/`stagePublicClient` в `lib/grpc/client.ts` и
        во всех вызывающих роутах, импорты `@/gen/hema/v1/stage_pb`.
        **REST-пути и имена файлов роутов не меняем** (NFR-2);
      - пересоздать БД, прогнать `make demo-bouts`.
- [ ] T2. `proto/hema/v1/stage.proto` — `enum StageType`, `message Stage`,
      поля `stage` в `PoolLayout` и `stages` в `ListPublicPoolsResponse` /
      `NominationLive`; `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Трек A — модуль `stage`

- [ ] T3. **domain** — `domain/domain.go`: `StageType`, `Stage`,
      `DefaultStageTitle`, поле `Stage` в `Layout`, `StageID` в `Pool`;
      порт `Repository` на `stageID` + `EnsureStage`/`StageByNomination`/
      `StagesByNomination`/`PoolsByStage`/`MembersByStage`/
      `AnySeatedInStage`; порт `BoutConductor` — три метода новой адресации.
      Red — через несобирающиеся `service`/`testutil` на следующих шагах.
- [ ] T4. **testutil (fakes)** — `testutil/fake_repo.go`: хранилище этапов,
      `EnsureStage` (get-or-create) и `StageByNomination` (без создания),
      этапный инвариант членства; `fake_bout_conductor.go` — новые
      сигнатуры с записью полученных `poolIDs` (нужно для проверок «звали
      только со своими пулами»). `var _ domain.Repository = (*FakeRepo)(nil)`.
- [ ] T5. **service (red→green): авто-этап и чтение без записи** —
      `service/service_test.go`: первая мутирующая операция создаёт этап
      `position=0`/`groups`/«Групповой этап» (AC-2, FR-4); повторные вызовы
      не дублируют; `GetLayout` на номинации без этапа отдаёт виртуальный
      этап и не создаёт строку → затем `stageForRead`/`stageForWrite` в
      `service.go`.
- [ ] T6. **service (red→green): этапные гейты** — тесты: расфиксация
      второго этапа не блокируется пулом первого на арене и его боями
      (AC-5, FR-8); `draft→ready` зовёт `GenerateForStage` только с пулами
      своего этапа, `ready→draft` — `ClearForPools` только со своими →
      затем правка `SetStatus`/`requireDraft`.
- [ ] T7. **service (red→green): номинационное остаётся номинационным** —
      тесты: один боец в группах двух этапов допустим (AC-4, FR-7);
      синхронизация приёма заявок считает распределённых по всем этапам
      (AC-6, FR-9); `PruneMembers` чистит по всем этапам → затем правки
      `loadLayoutAndSync`/`ListPublicPools`/`NominationLive`.
- [ ] T8. **repo + migrations** — `migrations/00001_init.sql` переписывается
      в финальную форму по плану (`stages`, `pools.stage_id`,
      `pool_members` с `uq_members_stage_fighter`, `arena_id` +
      `uq_pools_arena`, `current_bout_id`), файлы `00002`–`00004`
      **удаляются**; `repo/queries/stage.sql` — stage-запросы вместо
      layout-запросов; `make sqlc`; `repo/repo.go`. Пересоздать БД.
- [ ] T9. **api (red→green)** — `api/handler_test.go`: `GetLayout` отдаёт
      `stage`, `ListPublicPools`/`GetNominationLive` — `stages` с одним
      элементом (AC-3); остальные RPC отвечают как раньше → затем
      `toProtoStage` и заполнение полей в `api/handler.go`.

## Трек B — модуль `bout`

- [ ] T10. **service (red→green)** — `modules/bout/service/service_test.go`:
      `ClearForPools` удаляет бои только перечисленных пулов и не трогает
      бои соседнего пула той же номинации; `AnyStartedInPools` не видит
      начатых боёв вне списка; пустой список — no-op в обоих случаях →
      затем правка трёх методов в `service.go`.
- [ ] T11. **repo** — `repo/queries/bout.sql`: `DeleteBoutsByPools` и
      `AnyStartedInPools` через `pool_id = ANY(...)`; `make sqlc`;
      `repo/repo.go`. Миграции модуля `bout` **не трогаем**.

## Трек C — web

- [ ] T12. **serialize (red→green)** — тест в `lib/grpc/`: `stage`
      пробрасывается в `poolLayoutToJson`, `stages` — в
      `nominationLiveToJson` → затем `stageToJson`/`stagesToJson` и вызовы.
- [ ] T13. **entities** — `entities/stage/lib/types.ts` (`Stage`,
      `StageType`); поля `stage`/`stages` в типах `entities/pool`.
- [ ] T14. **ui (red→green)** — `nomination-pools.test.tsx` и
      `nomination-pools-public.test.tsx`: заголовок этапа отрисован (AC-3)
      → затем заголовок в обоих компонентах. Роуты и адреса не трогаем.

## Волна 2 — join

- [ ] T15. **адаптер** — `internal/platform/*_bout_conductor.go` под три
      переименованных метода порта (встреча треков A и B).
- [ ] T16. **интеграционные с БД** — `modules/stage/integration/`:
      `uq_members_stage_fighter` разрешает того же бойца во втором этапе и
      запрещает второй пул внутри одного этапа (FR-7);
      `uq_pools_stage_number` разрешает одинаковые номера пулов в разных
      этапах; каскад `DELETE stage → pools → members` отрабатывает.
- [ ] T17. **демо-сид** — `internal/demoseed`: `TRUNCATE` на
      `stage.pool_members, stage.pools, stage.stages` (все три обязательно в
      одной команде — новый `FK pools → stages`), комментарий над вызовом
      под новые имена. Логика `SeedPoolsAndBouts` меняться **не должна** —
      если потребовалась, значит стейджевая адресация протекла наружу
      дальше, чем задумано, и это повод остановиться. Приёмка: на
      пересозданной БД последовательно проходят `make demo`,
      `make demo-registered`, `make demo-bouts`, а печатаемые сидом ссылки
      (живой публичный экран номинации и экран ведения боя) открываются и
      показывают данные.
- [ ] T18. **регресс** — пересоздать БД, `make demo-bouts`, пройти вручную:
      раскладка, постановка на арену, ведение боёв, табло с таймером,
      публичный экран, итоговая таблица (AC-1, AC-7); адреса экранов не
      изменились (AC-8).

## Проверка

- [ ] T19. `make test-all` зелёный.
- [ ] T20. `pnpm exec tsc --noEmit`.
- [ ] T21. `go build ./...` + `pnpm build`.
- [ ] T22. Миграции в полном докеризованном стеке: `docker compose up
      --build` (по чеклисту `server/AGENTS.md` — testcontainers/`make dev`
      недостаточно: менялись имя схемы, состав миграций и пути).
- [ ] T23. Обновить статус спеки/плана/tasks и строку в
      `docs/specs/README.md`; в описании PR — предупреждение про
      `docker compose down -v`.
