# Plan: Этапы номинации как сущность (nomination stages)

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-08-02
- Спека: `./spec.md`
- Решение: `docs/adr/0014-nomination-format-stages.md`

## Обзор решения

Сущность «этап» вводится **внутрь** существующего модуля (ADR 0014, §8:
схема и исполнение живут в одном модуле). Поскольку продакшена нет (NFR-1),
модель приводится к целевому виду **задним числом**: миграции модуля не
дополняются переносом данных, а переписываются так, как если бы этапы
существовали с самого начала. Это убирает из инкремента весь класс работы и
рисков, связанный с миграцией живых данных.

Три следствия, определяющие форму плана:

1. **Переименование `pool → stage` идёт первым, а не последним.** Раз
   миграции всё равно переписываются, нет смысла сначала городить таблицу
   этапов в схеме `pool`, а потом переименовывать схему отдельной миграцией.
   Первым шагом модуль механически переименовывается целиком (Go-пакеты,
   PG-схема прямо в файлах миграций, proto-сервисы, инфра, web-клиенты) —
   без единого изменения поведения.
2. **Миграции модуля схлопываются в один `00001_init.sql`** финальной формы:
   `stage.stages`, `stage.pools` со `stage_id`, `stage.pool_members` с
   этапным инвариантом. Файлы `00002`–`00004` удаляются, их содержимое
   (undo-`reset`, `arena_id` + partial unique, `current_bout_id`) вносится в
   init вместе с объясняющими комментариями. Инкрементальная история схемы
   без продакшена ценности не несёт, а читаемость единственного init для
   следующих агентов — несёт.
3. **Локальную БД нужно пересоздать** (`docker compose down -v`, затем
   `make migrate` и `make demo-bouts`). Это единственное «неудобство»,
   которым платим за пункты 1–2.

**API остаётся номинационным.** RPC продолжают принимать `nomination_id`;
сервис резолвит единственный этап номинации сам. Обоснование изменилось
вместе с NFR-2: это уже не совместимость (ломать нечего), а удержание границ
инкремента — пока этап один, неизменность интерфейса даёт дешёвый критерий
приёмки «всё работает как раньше». Переезд API и навигации на этап
произойдёт в 0018, когда появится второй этап.

Модуль `bout` меняется **только на уровне порта и сервиса**: команды
«сформировать/удалить бои» и гейт «есть ли результаты» перестают быть
номинационными и адресуются списком пулов (этап = набор пулов). Хранилище и
журнал событий боя не трогаются: колонка `bout.bouts.nomination_id`
остаётся, event-sourced контракт не меняется (ADR 0014, §4).

## Контракты (proto)

- Файл: `proto/hema/v1/pool.proto` → **`proto/hema/v1/stage.proto`**;
  `PoolAdminService` → `StageAdminService`, `PoolPublicService` →
  `StagePublicService`. Имена RPC и сообщений **не трогаем** (`GetLayout`,
  `Pool`, `PoolStanding` — это по-прежнему пулы, они никуда не делись).
- Новых RPC нет. Сигнатуры существующих не меняются: запросы остаются
  номинационными (`nomination_id`).

Новый enum:

```proto
// StageType — тип этапа номинации (ADR 0014, §1/§3). В спеке 0017
// существует ровно одно значение; BRACKET придёт со спекой 0018.
enum StageType {
  STAGE_TYPE_UNSPECIFIED = 0;
  STAGE_TYPE_GROUPS = 1;
}
```

Новое сообщение:

```proto
// Stage — этап номинации (спека 0017, FR-1). Статуса здесь нет намеренно:
// статус фиксации состава уже едет в PoolLayout.status — дублировать его
// в двух местах ради одного инкремента незачем.
message Stage {
  string id = 1;
  string nomination_id = 2;
  // position — порядковый номер; несколько этапов могут делить одну
  // позицию (параллельные ветки схемы, ADR 0014 §1), поэтому уникальности
  // по (nomination_id, position) нет ни в контракте, ни в БД.
  int32 position = 3;
  string title = 4;
  StageType type = 5;
}
```

Изменённые сообщения (только новые поля):

- `PoolLayout` (ответ `GetLayout`) — `Stage stage = N;` (FR-11).
- `ListPublicPoolsResponse` — `repeated Stage stages = N;`.
- `NominationLive` (снапшот `GetNominationLive`/`WatchNominationLive`,
  спека 0014) — `repeated Stage stages = N;`.

Поля в публичных ответах — `repeated` сразу, хотя элемент всегда один: это
не ложь про модель (FR-2 допускает несколько этапов) и избавляет 0018 от
ломающей смены кардинальности.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

### Модуль `stage` (бывш. `pool`)

- PG-схема: `stage`.
- Межмодульные зависимости: направления не меняются (`stage → fighter`,
  `stage → bout`, `stage → arena`, `stage → nomination`). Новых портов нет,
  меняются три метода уже существующего порта `BoutConductor`.

#### `domain/domain.go`

- Новые типы:
  ```go
  type StageType string
  const StageTypeGroups StageType = "groups"

  // Stage — этап номинации (спека 0017, FR-1). Status/undo переезжают
  // сюда с раскладки номинации (FR-6).
  type Stage struct {
      ID           string
      NominationID string
      Position     int
      Title        string
      Type         StageType
      Status       LayoutStatus
  }
  ```
- `DefaultStageTitle = "Групповой этап"` — константа авто-создаваемого
  этапа (FR-4).
- `Layout` — новое поле `Stage Stage`; существующие
  `NominationID`/`Status`/`Unassigned`/`Pools`/`CanUndo` сохраняются
  (`Status` продолжает отдавать статус этапа — это он и есть).
- `Pool` — новое поле `StageID string` рядом с существующим `NominationID`.
- `Repository` — методы раскладки переводятся с `nominationID` на
  `stageID`: `CreatePool`, `DeletePool`, `ResetLayout`, `AssignFighter`,
  `UnassignFighter`, `ApplyAutoDistribute`, `UndoAuto`, `UndoDeletePool`,
  `UndoReset`, `SetStatus`; `AnySeatedInNomination` → `AnySeatedInStage`.
- `Repository` — новые методы:
  - `EnsureStage(ctx, nominationID string) (Stage, error)` — get-or-create
    единственного этапа (`position = 0`, `type = groups`,
    `title = DefaultStageTitle`), реализует FR-4. **Только для мутирующих
    путей.**
  - `StageByNomination(ctx, nominationID string) (Stage, bool, error)` —
    чтение без создания. `found = false` вызывающий трактует как
    виртуальный этап (`Position 0`, `Title = DefaultStageTitle`,
    `Type = groups`, `Status = draft`, пустой `ID`) — ровно как сегодня
    отсутствие строки раскладки трактуется как пустой draft (0009,
    решение №9). Так чтения остаются чтениями.
  - `StagesByNomination(ctx, nominationID string) ([]Stage, error)` — для
    публичных ответов (`repeated stages`).
  - `PoolsByStage` / `MembersByStage` — этапные чтения.
- `Repository` — **остаются номинационными** (осознанно, FR-9):
  `PruneMembers` (реконсиляция по активному ростеру — чистит по всем
  этапам), `PoolsByNomination` / `MembersByNomination` (публичный экран и
  живой снапшот показывают номинацию целиком).
- `BoutConductor` — три метода меняют адресацию:
  ```go
  // было: GenerateForNomination(ctx, nominationID, pools)
  GenerateForStage(ctx context.Context, nominationID string, pools []BoutPoolInput) error
  // было: ClearForNomination(ctx, nominationID)
  ClearForPools(ctx context.Context, poolIDs []string) error
  // было: AnyStartedInNomination(ctx, nominationID)
  AnyStartedInPools(ctx context.Context, poolIDs []string) (bool, error)
  ```
  `GenerateForStage` сохраняет `nominationID`: он нужен не для адресации, а
  для штампа в payload события `Scheduled` (бой по-прежнему принадлежит
  номинации).

#### `service/service.go`

Публичные сигнатуры **не меняются** — снаружи сервис остаётся
номинационным. Внутри:

- Два приватных резолвера этапа, строго по характеру операции:
  - `stageForWrite(ctx, nominationID)` = `repo.EnsureStage` — в начале
    мутирующих операций (`CreatePool`, `ResetLayout`, `AssignFighter`,
    `UnassignFighter`, `AutoDistribute`, `Undo`, `SetStatus`);
  - `stageForRead(ctx, nominationID)` = `repo.StageByNomination` с
    подстановкой виртуального этапа при `found = false` — в `loadLayout`,
    `requireDraft` и публичных чтениях.

  Разделение неслучайно: `GetLayout` обязан остаться read-only, иначе
  открытие экрана раскладки станет записью в БД.
- `DeletePool` / `SeatPoolOnArena` / `UnseatPool` и весь блок ведения боёв
  адресуются по `poolID` — этап резолвится от пула (`pool.StageID`).
- `SetStatus`: гейты переходят на этап — `AnySeatedInStage(stage.ID)` вместо
  `AnySeatedInNomination`, `AnyStartedInPools(poolIDs этапа)` вместо
  `AnyStartedInNomination` (FR-8); `draft → ready` вызывает
  `GenerateForStage`, `ready → draft` — `ClearForPools(poolIDs этапа)`.
- `loadLayoutAndSync`: синхронизация приёма заявок (0012) остаётся
  номинационной — «есть ли распределённые бойцы» считается по
  `MembersByNomination`, т.е. по всем этапам (FR-9).
- `ListPublicPools` / `NominationLive`: дополнительно зовут
  `StagesByNomination`; состав пулов по-прежнему собирается по номинации.
- `applyArenaAndStatus` / `enrichPools` / `GetPoolsForArena` / `boardForPool`
  / `ComputePoolStatus` / `ComputeStandings` — без изменений логики.

#### `repo/queries/stage.sql` + `repo/repo.go`

- Новые запросы: `GetStageByNomination`, `InsertStage` (пара под
  `EnsureStage`), `ListStagesByNomination`, `GetStageByID`,
  `ListPoolsByStage`, `ListMembersByStage`, `ExistsSeatedInStage`,
  `SetStageStatus`, `EnsureStageAndClearUndo`, `SetStageUndo`.
- Переписываются на `stage_id`: `InsertPool`, `DeleteAllPoolsByStage`
  (бывш. `...ByNomination`), `InsertMember`, `DeleteMemberByFighter`,
  `DeleteMembersByFighterIDs`.
- Остаются номинационными: `ListPoolsByNomination`,
  `ListMembersByNomination`, `PruneMembers`.
- Удаляются: `GetPoolLayout`, `SetLayoutStatus`, `EnsureLayoutAndClearUndo`,
  `SetLayoutUndo`.
- `make sqlc` после правки.

#### `migrations/00001_init.sql` — единственная миграция модуля

Файлы `00002_undo_reset.sql`, `00003_pool_arena.sql`,
`00004_pool_current_bout.sql` **удаляются**; их содержимое внесено в init
ниже. Пересоздание локальной БД обязательно.

```sql
CREATE SCHEMA IF NOT EXISTS stage;

-- stages — этап номинации (спека 0017): владелец статуса фиксации состава
-- и undo-снапшота (то, чем была pool_layouts), плюс идентичность и место
-- в схеме номинации. Уникальности по (nomination_id, position) нет
-- намеренно: параллельные ветки схемы делят позицию (ADR 0014, §1).
-- «Ровно один этап на номинацию» (FR-4) — инвариант сервиса (EnsureStage),
-- а не БД: ограничение в БД пришлось бы снимать уже в 0018.
CREATE TABLE stage.stages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomination_id UUID NOT NULL,               -- без кросс-схемного FK (ADR 0002)
    position      INTEGER NOT NULL DEFAULT 0,
    title         TEXT NOT NULL,
    type          TEXT NOT NULL DEFAULT 'groups',
    status        TEXT NOT NULL DEFAULT 'draft',
    -- undo последнего mutating-действия (спека 0009, решение №16): вид +
    -- JSONB-снапшот. '' — undo недоступен; 'auto' — {"fighter_ids":[...]};
    -- 'delete_pool' — {"number":N,"fighter_ids":[...]}; 'reset' —
    -- {"pools":[{"number":N,"fighter_ids":[...]},...]}.
    undo_kind     TEXT NOT NULL DEFAULT '',
    undo_data     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_stages_position CHECK (position >= 0),
    CONSTRAINT chk_stages_type     CHECK (type IN ('groups')),
    CONSTRAINT chk_stages_status   CHECK (status IN ('draft','ready')),
    CONSTRAINT chk_stages_undo     CHECK (undo_kind IN ('','auto','delete_pool','reset'))
);
CREATE INDEX idx_stages_nomination ON stage.stages (nomination_id, position);

-- pools — группа (пул) внутри этапа. number уникален в пределах этапа
-- (спека 0009, FR-3: свободный номер; удалённые переиспользуются) — с
-- 0017 нумерация ведётся по этапу, а не по номинации. nomination_id —
-- осознанная денормализация: по нему идут номинационные чтения публичного
-- экрана, живого снапшота (0011/0014) и реконсиляция ростера
-- (PruneMembers, FR-9) — иначе каждое из них стало бы join через stages.
CREATE TABLE stage.pools (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id      UUID NOT NULL REFERENCES stage.stages(id) ON DELETE CASCADE,
    nomination_id UUID NOT NULL,
    number        INTEGER NOT NULL,
    -- arena_id (спека 0011): NULL — пул не на арене; задан — «готовится к
    -- запуску». Без кросс-схемного FK на arena (ADR 0002). Статус пула не
    -- хранится — вычисляется из (статус этапа, arena_id, прогресс боёв),
    -- см. ComputePoolStatus.
    arena_id        UUID NULL,
    -- current_bout_id (спека 0013): указатель текущего боя пула, без
    -- кросс-схемного FK на bout.bouts. NULL — эффективный текущий бой
    -- резолвится сервисом как первый непроведённый по порядку.
    current_bout_id UUID NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_pools_number      CHECK (number >= 1),
    CONSTRAINT uq_pools_stage_number UNIQUE (stage_id, number)
);
CREATE INDEX idx_pools_stage      ON stage.pools (stage_id, number);
CREATE INDEX idx_pools_nomination ON stage.pools (nomination_id);
-- Инвариант «одна арена ↔ один пул» (спека 0011, FR-6/NFR-4): защищён на
-- уровне данных, а не только приложения — конкурентная постановка на одну
-- арену не должна посадить два пула разом. Partial-индекс не ограничивает
-- число пулов с arena_id IS NULL.
CREATE UNIQUE INDEX uq_pools_arena ON stage.pools (arena_id) WHERE arena_id IS NOT NULL;

-- pool_members — членство бойца в пуле. Инвариант (спека 0017, FR-7):
-- один боец — не более одного пула В ПРЕДЕЛАХ ЭТАПА (было: номинации).
-- Участие того же бойца в группах разных этапов — нормальное состояние,
-- это и есть переход из групп в следующий этап. Отсутствие членства =
-- «нераспределённый». Удаление пула каскадит членства.
CREATE TABLE stage.pool_members (
    pool_id       UUID NOT NULL REFERENCES stage.pools(id) ON DELETE CASCADE,
    stage_id      UUID NOT NULL,
    nomination_id UUID NOT NULL,               -- денормализация, см. pools
    fighter_id    UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pool_id, fighter_id),
    CONSTRAINT uq_members_stage_fighter UNIQUE (stage_id, fighter_id)
);
CREATE INDEX idx_members_stage      ON stage.pool_members (stage_id);
CREATE INDEX idx_members_nomination ON stage.pool_members (nomination_id);
```

`Down` — `DROP TABLE` в обратном порядке + `DROP SCHEMA`, как в нынешнем
`00001`. `FK pools → stages ON DELETE CASCADE` внутрисхемный: ADR 0002
запрещает только кросс-схемные.

#### `api/handler.go`

- `toProtoStage(domain.Stage) *hemav1.Stage` + маппинг `StageType`.
- `toProtoLayout` — заполнить `Stage`.
- Ответы `ListPublicPools` и сборка `NominationLive` — заполнить `stages`.
- Больше ничего: запросы по-прежнему приходят с `nomination_id`.

#### `testutil/fake_repo.go`

In-memory реализация обновлённого порта: хранит этапы, реализует
`EnsureStage`/`StageByNomination`, этапный инвариант членства. Обязателен
`var _ domain.Repository = (*FakeRepo)(nil)`.

### Модуль `bout` — правка порта и репозитория

- `service/service.go`: `GenerateForNomination` → `GenerateForStage` (тело
  без изменений), `ClearForNomination` → `ClearForPools(poolIDs)`,
  `AnyStartedInNomination` → `AnyStartedInPools(poolIDs)`.
- `repo/queries/bout.sql`: `DeleteBoutsByNomination` → `DeleteBoutsByPools`
  (`WHERE pool_id = ANY(sqlc.arg(pool_ids)::uuid[])`),
  `AnyStartedInNomination` → `AnyStartedInPools` (то же условие +
  `state <> 'not_started'`). `make sqlc`.
- `migrations/` — **изменений нет**. Колонка `bouts.nomination_id`
  сохраняется, журнал событий и payload не трогаются (ADR 0014, §4).
- Пустой список `poolIDs` — валидный вход, «ничего не делать»: обе операции
  должны быть no-op, а не ошибкой или запросом без `WHERE`.

### Переименование и инфра (первым шагом, до доменной работы)

- `server/modules/pool/` → `server/modules/stage/`, `package pool` →
  `package stage`, обновление импортов (включая `internal/platform/*`).
- PG-схема переименовывается **прямо в файлах миграций** (`pool.` →
  `stage.`), отдельной `ALTER SCHEMA`-миграции нет — БД пересоздаётся.
- `proto/hema/v1/pool.proto` → `stage.proto` + переименование двух
  сервисов; `make generate`.
- Инфра из чеклиста `server/AGENTS.md`: `server/sqlc.yaml` (имя пакета и
  пути), `server/internal/testdb/testdb.go` (`{"pool", moduleDir("pool")}`),
  корневой `Makefile` (`POOL_MIGRATIONS_DIR` → `STAGE_MIGRATIONS_DIR`, имя
  таблицы версий goose → `goose_db_version_stage`), `server/Dockerfile`
  (путь COPY миграций).
- `internal/platform/pool_bout_conductor.go` и соседние адаптеры — имена
  файлов/типов под новое имя модуля.
- `internal/demoseed` — см. отдельный раздел «Демо-сид» ниже: он трогается
  и переименованием, и новой схемой, поэтому вынесен из общего списка.
- Web: `poolAdminClient`/`poolPublicClient` → `stageAdminClient`/
  `stagePublicClient` в `lib/grpc/client.ts` и во всех вызывающих роутах;
  импорты `@/gen/hema/v1/pool_pb` → `stage_pb`. **Имена REST-путей и файлов
  роутов не меняем** (NFR-2).

### Демо-сид (`internal/demoseed`, `cmd/demo*`)

Демо — не побочная деталь рефактора, а рабочий инструмент: это единственный
способ получить турнирный день целиком (заявки → бойцы → пулы → бои на
аренах) и глазами проверить, что ничего не разъехалось (FR-10, AC-1/AC-7).
Сейчас все три сценария (`make demo`, `make demo-registered`,
`make demo-bouts`) рабочие — проверено прогоном до начала работ. Задача
инкремента — чтобы они остались рабочими; **состав демо-данных не
меняется**.

Что требует правки:

- `Wipe` — список таблиц в `TRUNCATE`: `pool.pool_members, pool.pools,
  pool.pool_layouts` → `stage.pool_members, stage.pools, stage.stages`.
  Все три обязаны остаться **в одной команде** `TRUNCATE`: с появлением
  `FK pools → stages` усечение `stages` в отдельном стейтменте потребует
  `CASCADE` либо упадёт на ссылке. Комментарий над вызовом (объясняющий,
  почему пулы/бои чистятся явно — они ссылаются на `nomination_id`/
  `arena_id` без кросс-схемного FK) обновить под новые имена.
- `NewServices` — импорт и имя пакета сервиса модуля (`poolservice` →
  `stageservice`).
- `SeedPoolsAndBouts` — **логика не меняется**: сид ходит через сервис
  (`CreatePool`/`AssignFighter`/`SetStatus`/`SeatPoolOnArena`/ведение боёв),
  а публичные сигнатуры сервиса остаются номинационными. Это прямой дивиденд
  решения «API остаётся номинационным»: сид, самый длинный сквозной сценарий
  в репозитории, переживает рефактор моделью данных без единой правки логики.
  Если по ходу выяснится, что сид всё-таки требует правок логики — это
  сигнал, что стейджевая адресация протекла наружу дальше, чем задумано.

Критерий приёмки задачи: на пересозданной БД последовательно проходят все
три сценария, а ссылки, которые `demo-bouts` печатает в конце (живой
публичный экран номинации и экран ведения боя), открываются и показывают
данные.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

- **Новых BFF-роутов нет, адреса не меняются** (NFR-2). Существующие
  `app/api/nominations/[id]/pool-layout`, `.../public-pools`,
  `.../live-snapshot`, `.../live` (SSE) отдают новые поля через уже
  существующие сериализаторы.
- `lib/grpc/serialize.ts`: новая `stageToJson` + `stagesToJson`; вызовы в
  `poolLayoutToJson` (поле `stage`) и `nominationLiveToJson` (поле
  `stages`); в роуте `public-pools` — проброс `stages` рядом с `pools`.
- `entities/stage/lib/types.ts` (новая сущность):
  `export type StageType = "groups"` и
  `export type Stage = { id: string; nominationId: string; position: number; title: string; type: StageType }`.
  Отдельная сущность, а не поле в `entities/pool`, — этап переживёт
  0018/0019 как самостоятельное понятие.
- `entities/pool/lib/types.ts`: `PoolLayout` получает `stage: Stage`,
  `NominationLive`-тип — `stages: Stage[]`.
- `features/nomination-pools/ui/nomination-pools.tsx` и
  `widgets/nomination-pools-public/nomination-pools-public.tsx`: заголовок
  этапа над составом групп (FR-11).
- Server components vs client: изменения — внутри уже клиентских
  компонентов, чистое отображение пропсов.
- State: новых источников server-state нет — `stage`/`stages` приезжают
  внутри существующих `useLayout` и SSE-снапшота `useNominationLive`.

## События

> Placeholder. Отдельного EDD-ADR эта фича не требует.

- Издаёт: нет новых. Существующий сигнал живой шины
  (`PublishNominationChanged`, ADR 0012) остаётся номинационным — публичный
  экран показывает номинацию целиком.
- Потребляет: нет.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит, `modules/stage/service/service_test.go`** (fake-репо, расширение
  существующих):
  - первая мутирующая операция создаёт этап `position = 0`/`groups`/
    «Групповой этап» (AC-2, FR-4); повторные вызовы этап не дублируют;
  - `GetLayout` на номинации без этапа возвращает виртуальный этап и **не**
    создаёт строку (проверяется по fake-репо: число этапов осталось нулём);
  - один боец в группах двух разных этапов одной номинации — допустимо
    (AC-4, FR-7);
  - расфиксация второго этапа не блокируется пулом первого на арене и его
    проведёнными боями (AC-5, FR-8);
  - `draft → ready` зовёт `GenerateForStage` только с пулами своего этапа;
    `ready → draft` — `ClearForPools` только со своими (регресс «не снести
    чужие бои»);
  - синхронизация приёма заявок считает распределённых по всем этапам
    номинации (AC-6, FR-9).
- **Юнит, `modules/bout/service/service_test.go`**: `ClearForPools` удаляет
  бои только перечисленных пулов и не трогает бои соседнего пула той же
  номинации; `AnyStartedInPools` не видит начатых боёв вне списка; пустой
  список — no-op для обеих операций.
- **E2E ручек, `modules/stage/api/handler_test.go`**: `GetLayout` отдаёт
  заполненный `stage` (id/title/position/type); `ListPublicPools` и
  `GetNominationLive` отдают `stages` ровно с одним элементом (AC-3);
  остальные RPC — регресс на неизменность ответов.
- **Интеграционные с БД, `modules/stage/integration/`** (testcontainers):
  `uq_members_stage_fighter` разрешает того же бойца во втором этапе и
  запрещает второй пул внутри одного этапа (FR-7); `uq_pools_stage_number`
  разрешает одинаковые номера пулов в разных этапах; каскад
  `DELETE stage → pools → members` отрабатывает.
- **Web (Vitest)**: `serialize` — проброс `stage`/`stages`;
  `nomination-pools.test.tsx` и `nomination-pools-public.test.tsx` —
  заголовок этапа отрисован (AC-3).
- **Ручная проверка**: пересоздать БД (`docker compose down -v`),
  `make migrate`, `make demo-bouts` — сид проходит, публичный экран
  номинации, экран ведения боёв и табло работают как раньше (AC-1, AC-7).

## Риски и открытые вопросы

- **Пересоздание БД обязательно.** Схема переименована, миграции схлопнуты,
  файлы `00002`–`00004` удалены — goose на существующей базе с записанными
  версиями это не переварит. Порядок: `docker compose down -v` →
  `make migrate` → `make demo-bouts`. Отметить в описании PR: любой, кто
  подтянет ветку с накопленной локальной базой, должен сделать то же.
- **Объём правок в тестах модуля.** `service_test.go` и `handler_test.go` —
  крупнейшие тестовые файлы проекта; переименование пакета плюс смена
  сигнатур порта затронут их целиком. Риск не в логике, а в объёме:
  править нужно сигнатуры, не ожидания. Любое изменившееся *ожидание* —
  сигнал сломанного поведения (FR-10) и повод остановиться.
- **API остаётся номинационным (осознанный долг).** В 0018 второй этап
  сделает `nomination_id` в запросах раскладки недостаточным, и RPC
  придётся переводить на `stage_id` — вторая волна правок web-роутов.
  Плата принята: делать это сейчас — значит проектировать многоэтапную
  навигацию до того, как существует второй тип этапа, и потерять дешёвый
  критерий приёмки «UX не изменился».
- **Виртуальный этап у номинации без строки в `stages`.** Разделение
  `stageForRead`/`stageForWrite` сохраняет lazy-инициализацию, но заводит
  состояние «этап есть в ответе, а строки в БД нет» — с пустым `ID`.
  В этом инкременте клиент `stage.id` не использует (показывает только
  `title`, FR-11), но в 0018, где этап станет единицей адресации, пустой
  `id` — готовая ловушка. Материализация этапа при создании номинации её
  снимает, но требует зависимости `nomination → stage`, то есть цикла
  (ADR 0014, §8). Развязка — в 0018, когда появится действие, создающее
  этап явно.
- **`ON DELETE CASCADE` от этапа к пулам** — новое поведение: удаление
  этапа снесёт его пулы и членства. Здесь этап никто не удаляет (FR-12), но
  при появлении удаления (0020) гейт «нельзя удалить этап с проведёнными
  боями» обязан появиться на уровне сервиса — БД его не даст.
