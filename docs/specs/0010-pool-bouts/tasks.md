# Tasks: Бои внутри пула (формирование пар)

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-07-15
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах. Порядок:
контракты → новый модуль `bout` снизу вверх → изменения модуля `pool` →
синхронизация инфраструктуры → интеграционные тесты → web → проверка.

## Треки и параллельность

Задачи разбиты на **треки** — группы без общих файлов. Треки одной волны
выполняются параллельно (отдельные агенты, изолированные `git worktree` —
см. `.claude/skills/tdd-cycle/SKILL.md`, раздел «Параллельные треки»); внутри
трека — строго по порядку. Следующая волна стартует только после того, как
все треки текущей волны смержены в рабочую ветку.

| Волна | Трек     | Задачи        | Файлы (не пересекаются внутри волны)                                                                                     | Зависит от                    |
| ----- | -------- | ------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 0     | —        | T1            | `proto/hema/v1/bout.proto`                                                                                                  | —                               |
| 1     | A (bout) | T2–T9, T14–T17 | `modules/bout/**`, `server/sqlc.yaml` (секция `bout`), `server/internal/testdb/testdb.go`, `Makefile` (`BOUT_*`), `server/Dockerfile` (COPY bout) | волна 0                        |
| 1     | B (pool) | T10–T12       | `modules/pool/domain/domain.go`, `modules/pool/testutil/fake_bout_generator.go`, `modules/pool/service/*`, `modules/pool/module.go` | волна 0 (использует fake, не ждёт трек A) |
| 1     | C (web)  | T20–T23       | `web/src/app/api/nominations/[id]/bouts/**`, `web/src/entities/bout/**`, `web/src/features/nomination-pools/**`            | волна 0 (нужны TS-типы из `make generate`) |
| 2     | join     | T13           | `internal/platform/bout_generator.go`, `internal/platform/platform.go`                                                     | треки A **и** B смержены       |
| 3     | join     | T18           | `modules/bout/integration/*`                                                                                                | трек A смержен                 |
| 3     | join     | T19           | `modules/pool/integration/*`                                                                                                | T13 смержен                    |
| 4     | join     | T24–T29       | —                                                                                                                            | всё выше смержено              |

Сгенерированный код (`gen/`, `*/repo/sqlc/`) не в git (ADR 0004) и не
переносится между worktree — каждый трек сам гоняет `make generate`/
`make sqlc` у себя после того, как нужные ему контракты уже в базе волны.
После мержа треков волны координатор перегенерирует ещё раз в основной
рабочей копии перед join-задачами.

## Контракты

- [x] T1. `proto/hema/v1/bout.proto` — `BoutAdminService`
      (`ListBoutsByNomination`), сообщения `Bout`/`FighterRef`/
      `ListBoutsByNominationRequest`/`ListBoutsByNominationResponse` (см. plan
      «Контракты»). `make generate` (Go+TS).
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_
      **Отклонение от плана**: `FighterRef` переименован в `BoutFighterRef` —
      в пакете `hema.v1` уже есть `pool.FighterRef` (одноимённое сообщение
      из `pool.proto`), protobuf требует уникальности имён сообщений в
      пределах пакета. Далее по тексту plan/tasks «FighterRef» для bout
      читать как `BoutFighterRef`.

## Server — новый модуль bout (снизу вверх) [Волна 1 · Трек A]

- [x] T2. **domain — алгоритм (red→green)** —
      `modules/bout/domain/distribute_test.go`: `GenerateRoundRobin` —
      таблица кейсов **программно по диапазону N** (не только руками
      подобранные примеры — см. plan «Риски»), для N = 0..10:
      - все пары присутствуют ровно по одному разу (`C(n,2)` бой), нет пары
        бойца с самим собой;
      - внутри одного `RoundNumber` боец встречается не более раза (AC-9);
      - детерминированность: повторный вызов с тем же входом → идентичный
        результат (порядок и состав, FR-7);
      точечно: N=3 и N=4 — посчитать число «плохих» стыков (соседние по
      `SequenceNumber` бои с общим бойцом) и сравнить с доказанным минимумом
      (для обоих — все стыки между турами плохие, см. spec AC-10); N=6 — ноль
      плохих стыков (AC-11).
      Затем `modules/bout/domain/distribute.go`: круговой метод + эвристика
      минимизации стыков (см. plan «Server» → domain).
- [x] T3. **domain — сущности/порты/ошибки** — `modules/bout/domain/domain.go`:
      `FighterRef`, `Bout`, `PoolInput`, порт `Repository`
      (`ReplaceForNomination`, `ListByNomination`), `ErrInvalidInput`. Red
      через T5 (service не собирается без порта).
- [x] T4. **testutil** — `modules/bout/testutil/fake_repo.go`: in-memory
      `domain.Repository` (`var _ domain.Repository = (*FakeRepo)(nil)`),
      с методом инспекции сохранённого состояния для тестов service.
- [x] T5. **service (red→green)** — `modules/bout/service/service_test.go`
      (fake-репо): `GenerateForNomination` с несколькими `PoolInput`
      собирает бои всех пулов и передаёт их одним вызовом
      `ReplaceForNomination`; `ClearForNomination` вызывает
      `ReplaceForNomination(ctx, nominationID, nil)`; `ListByNomination` —
      passthrough; пустой `nominationID` → `ErrInvalidInput`. Затем
      `modules/bout/service/service.go`.
- [x] T6. **repo** — `modules/bout/repo/queries/bout.sql`
      (`-- name: DeleteBoutsByNomination :exec`,
      `-- name: InsertBout :one`, `-- name: ListBoutsByNomination :many`
      с `ORDER BY pool_id, sequence_number`); `make sqlc`;
      `modules/bout/repo/repo.go` — `ReplaceForNomination` одной
      транзакцией (delete-по-nomination_id + bulk-insert; `bouts == nil` →
      только delete), `ListByNomination`.
- [x] T7. **migrations** — `modules/bout/migrations/00001_init.sql` (goose
      Up/Down): схема `bout` + таблица `bouts` со всеми колонками/CHECK/
      UNIQUE/индексами (DDL из plan «Server» → migrations).
- [x] T8. **api (red→green)** — `modules/bout/api/handler_test.go`
      (httptest + Connect, fake-репо): `ListBoutsByNomination` — счастливый
      путь (несколько пулов, сортировка по `pool_id, sequence_number`) +
      admin-guard. Затем `modules/bout/api/handler.go` — маппинг proto↔domain,
      `ErrInvalidInput` → `InvalidArgument`.
- [x] T9. **wiring** — `modules/bout/module.go`: `Deps{ Pool *pgxpool.Pool }`,
      `Register(mux, deps, baseOpts, adminOpts)` — монтирует
      `BoutAdminService` под `RequireAdmin` (без межмодульных портов, bout ни
      от кого не зависит).

## Server — изменения модуля pool [Волна 1 · Трек B]

- [x] T10. **domain — порт** — `modules/pool/domain/domain.go`: добавить
      `BoutPoolInput{ PoolID string; Fighters []FighterRef }` и порт
      `BoutGenerator{ GenerateForNomination(ctx, nominationID string, pools
      []BoutPoolInput) error; ClearForNomination(ctx, nominationID string)
      error }`. Red через T12 (service/testutil не собираются без порта).
- [x] T11. **testutil — fake** — `modules/pool/testutil/fake_bout_generator.go`:
      `FakeBoutGenerator` (spy: фиксирует вызовы `GenerateForNomination`/
      `ClearForNomination` с аргументами; настраиваемая ошибка на каждый
      метод) — `var _ domain.BoutGenerator = (*FakeBoutGenerator)(nil)`.
- [x] T12. **service (red→green)** — расширить
      `modules/pool/service/service_test.go`:
      - `SetStatus(draft→ready)` вызывает `BoutGenerator.
        GenerateForNomination` с составом каждого пула (только активные
        бойцы, как в `Layout.Pools[i].Members`);
      - `SetStatus(ready→draft)` вызывает `ClearForNomination`;
      - `SetStatus` с уже текущим статусом (draft→draft, ready→ready) не
        дёргает `BoutGenerator` вовсе;
      - ошибка `GenerateForNomination`/`ClearForNomination` пробрасывается
        из `SetStatus`, и `repo.SetStatus` при этом **не вызывается** (нужен
        флаг/спай на fake-репо, что метод не был вызван) — порядок «эффект в
        bout → потом статус» из plan «Обзор решения».
      Затем `modules/pool/service/service.go`: `New(repo, fighters, bouts)`
      получает `bouts domain.BoutGenerator`; `SetStatus` переписывается по
      схеме из plan; `toBoutPools` — маппинг `[]domain.Pool →
      []domain.BoutPoolInput`. Обновить все существующие вызовы `New(...)` в
      тестах на новую сигнатуру. **Также** `modules/pool/module.go`:
      `Deps` получает поле `Bouts domain.BoutGenerator`, `Register`
      передаёт его в `service.New(r, deps.Fighters, deps.Bouts)` — тип
      `domain.BoutGenerator` свой (пакет `pool/domain`), для этой правки
      модуль `bout` не нужен, поэтому она в треке B, а не в T13.
      **Отклонение от плана**: пришлось также поправить один вызов
      `service.New(...)` в `modules/pool/api/handler_test.go` (не входил в
      исходный список файлов трека B) — иначе не собирался бы уже
      существующий e2e-тест API пула из-за новой сигнатуры конструктора.
      Безопасно: другие треки этот файл не трогали.

## Server — platform wiring [Волна 2 · join, нужны треки A и B]

- [x] T13. **wiring** — `internal/platform/bout_generator.go`:
      `PoolBoutGenerator` — адаптер к `pool/domain.BoutGenerator`, строит
      собственный `boutservice.Service` поверх `boutrepo.New(pool)` (по
      образцу `PoolActiveFightersProvider`). `internal/platform/platform.go`:
      зарегистрировать `boutmodule.Register(mux, boutmodule.Deps{Pool: pool},
      baseOpts, adminOpts)`, добавить `Bouts: NewPoolBoutGenerator(pool)` в
      `poolmodule.Deps` (поле уже добавлено треком B, T12).

## Синхронизация инфраструктуры нового модуля [Волна 1 · Трек A]

> См. `server/AGENTS.md` → «Добавление модуля».

- [x] T14. `server/sqlc.yaml` — секция `bout` (schema
      `modules/bout/migrations`, queries `modules/bout/repo/queries`, out
      `modules/bout/repo/sqlc`).
- [x] T15. `server/internal/testdb/testdb.go` — добавить `{"bout",
      moduleDir("bout")}` в `moduleMigrations`.
- [x] T16. Корневой `Makefile` — `BOUT_MIGRATIONS_DIR`, добавить в цели
      `migrate`/`migrate-down` (по образцу `POOL_MIGRATIONS_DIR`).
- [x] T17. `server/Dockerfile` — `COPY --from=build
      /src/modules/bout/migrations /app/modules/bout/migrations`.

## Интеграционные тесты [Волна 3 · join]

- [x] T18. **bout** (нужен трек A) — `modules/bout/integration/bout_integration_test.go`
      (`//go:build integration`, testcontainers): миграции применяются;
      `ReplaceForNomination` транзакционно (delete+insert, повторный вызов
      заменяет прежние бои); `UNIQUE(pool_id, sequence_number)` держит
      инвариант; `ListBoutsByNomination` через реальный Connect × PG.
- [x] T19. **pool × bout — сквозной путь** (нужен T13) — расширить
      `modules/pool/integration/pool_integration_test.go` (или новый файл):
      реальные `pool` + `bout` схемы, реальный `PoolActiveFightersProvider`/
      `PoolBoutGenerator`: создать пулы с бойцами → `SetLayoutStatus(ready)`
      → бои появились в `bout`-схеме с ожидаемым числом пар; `SetLayoutStatus
      (draft)` → бои удалены; повторный `ready` — новый набор по
      изменившемуся составу (AC-6). Это единственный тест, реально
      проверяющий связку `pool → bout` через `internal/platform`-адаптер, а
      не через fake — стоит риска из plan «Риски» (неатомарность между
      схемами).

## Web [Волна 1 · Трек C]

- [x] T20. **BFF (red→green)** — `app/api/nominations/[id]/bouts/route.ts`
      (GET, Node runtime) + `route.test.ts`/`.e2e.test.ts`: happy path,
      маппинг `connect.Code`→HTTP, admin-guard (реюз `lib/grpc`).
- [x] T21. **entities/bout** — `entities/bout/lib/types.ts` (`Bout`,
      `FighterRef` из proto) + `groupBoutsByPool` (чистая функция) +
      `groupBoutsByPool.test.ts`.
- [x] T22. **features/nomination-pools — api** — `api/keys.ts` (`bouts
      (nominationId)`), `api/requests.ts` (`fetchBouts`), `api/use-bouts.ts`
      (RQ-хук, `enabled: layout?.status === "POOL_LAYOUT_STATUS_READY"`) +
      тесты (мок `fetch`).
- [x] T23. **features/nomination-pools — ui** — `ui/nomination-pools.tsx`:
      в карточке пула при `readOnly` (ready) под списком бойцов — список
      боёв этого пула (`groupBoutsByPool`, сортировка по
      `sequence_number`): «Тур {round_number}: {fighter_a.name} —
      {fighter_b.name}».
      **Отклонение от плана**: T20 потребовал расширить общую инфраструктуру
      `web/src/lib/grpc/client.ts` (+`boutAdminClient`) и `serialize.ts`
      (+`boutToJson`/`boutsToJson`) — не входили в исходный список файлов
      трека C, но это тот же паттерн, что у `pool`/`arena` (общий слой BFF),
      и ни один другой трек эти файлы не трогал.

## Проверка [Волна 4 · join]

- [x] T24. `make test-all` зелёный (server + web). 401/401 web-тестов,
      все server-пакеты (включая новый `bout`) зелёные.
- [x] T25. `make test-integration` зелёный (T18/T19, требует Docker). Весь
      репозиторий, не только spec 0010 — ни одна ранее существующая
      интеграция не сломана.
- [x] T26. `pnpm exec tsc --noEmit` — чисто.
- [x] T27. `go build ./...` + `pnpm build` — оба зелёные;
      `/api/nominations/[id]/bouts` присутствует в манифесте роутов.
- [x] T28. Докеризованная проверка миграций нового модуля.
      **Отклонение от плана**: вместо полного `docker compose up --build`
      (поднял бы `server`/`web` контейнеры на портах 8080/3000, уже занятых
      локальным `make dev` этой машины) — `docker compose build migrate` +
      `docker compose run --rm migrate` против уже поднятого `postgres`
      (тот же сервис из `docker-compose.yml`, что использует `make dev`).
      Это ровно то, что нужно проверить (миграции модуля в докер-образе), не
      трогая работающие процессы. `goose: ... OK 00001_init.sql` для `bout`
      (остальные модули — «no migrations to run», уже были на актуальной
      версии). `\dn` подтвердил схему `bout`; `\d bout.bouts` — все колонки/
      CHECK/UNIQUE/индексы совпадают с DDL из plan.md.
- [x] T29. Статусы обновлены (см. ниже).
