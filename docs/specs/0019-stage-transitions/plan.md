# Plan: Переходы между этапами (stage transitions)

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: draft
- Дата: 2026-08-06
- Спека: `./spec.md`
- Решение: `docs/adr/0014-nomination-format-stages.md` (инкремент 0019)

## Обзор решения

Всё живёт в модуле `stage` — схема и её исполнение принадлежат одному модулю
(ADR 0014, §8), поэтому переход «прочитать итоги источника → отобрать →
разложить → записать состав» остаётся локальной транзакцией, а не
распределённой. Ни `bout`, ни `nomination`, ни `fighter`, ни `arena` не
меняются вовсе: итоги источника собираются существующим портом
`BoutConductor.BoutsByPool` + чистой `ComputeStandings` (0016), ростер — уже
подключённым `ActiveFightersProvider`.

Правило отбора — **скалярные колонки** этапа (`stage.stages`), как
`bracket_size`/`third_place` у сетки (0018): их можно проверить `CHECK`-ом, а
переезд на jsonb оправдан, когда конфигов станет много (план 0020).

Ядро — **чистые функции** в `domain/seeding.go`, по образцу `ComputeStandings`
(0016) и `ResolveBracket` (0018): сводный порядок этапа, применение селектора,
детект дележа на границе отбора, план раскладки (змейка / посев 1×N). Сервис
только собирает вход (итоги пулов источника, активный ростер, соседние ветки),
гоняет чистую функцию и либо отдаёт превью (`PreviewStageBuild`), либо
применяет план одной транзакцией репозитория (`BuildStage`). Расформирование
нового кода не требует: это существующий сброс состава этапа (`ResetLayout`),
а «Отменить» после формирования — новый вид undo-снапшота `build`, чьё
применение сводится к тому же сбросу.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

Файл: `proto/hema/v1/stage.proto` (сервис `StageAdminService`,
`StagePublicService` — только через `Stage`, см. ниже).

**Новые enum:**

```proto
enum StageSourceKind {          // FR-2
  STAGE_SOURCE_KIND_UNSPECIFIED = 0;   // правила нет
  STAGE_SOURCE_KIND_ROSTER      = 1;   // активный ростер номинации
  STAGE_SOURCE_KIND_STAGE       = 2;   // другой этап той же номинации
}

enum StageSelectorKind {        // FR-3
  STAGE_SELECTOR_KIND_UNSPECIFIED    = 0;
  STAGE_SELECTOR_KIND_ALL            = 1;  // все участники источника
  STAGE_SELECTOR_KIND_GROUP_PLACES   = 2;  // места X–Y каждой группы
  STAGE_SELECTOR_KIND_OVERALL_PLACES = 3;  // места X–Y сводного порядка
}

enum StageLayoutMethod {        // FR-4
  STAGE_LAYOUT_METHOD_UNSPECIFIED = 0;
  STAGE_LAYOUT_METHOD_SNAKE       = 1;  // змейка по группам (0009)
  STAGE_LAYOUT_METHOD_SEEDED      = 2;  // посев 1×N в слоты сетки
}
```

**Новые сообщения:**

- `SeedingRule` — `StageSourceKind source_kind = 1; string source_stage_id = 2;
  StageSelectorKind selector = 3; int32 place_from = 4; int32 place_to = 5;
  StageLayoutMethod method = 6;`
  `place_to = 0` — открытая верхняя граница («3 и ниже»). Для
  `selector = ALL` границы игнорируются.
- `GroupsConfig` — `int32 group_count = 1;` (FR-8). Заполнен только у
  `type = GROUPS`, созданного явно; у авто-этапа (0017, FR-4) — 0 (FR-9).
- `StageBuildEntry` — `FighterRef fighter = 1; string origin_label = 2;
  int32 source_place = 3; int32 overall_place = 4; int32 target_pool_number = 5;
  int32 target_slot = 6;` — строка превью (FR-15/FR-27). `origin_label`
  формирует сервер («Группа 2, место 1») — клиент строку из чисел не собирает
  (то же правило, что для `BracketSlot.source_label`, 0018 FR-13).
- `StageBuildTie` — `string source_pool_id = 1; string group_label = 2;
  int32 place = 3; repeated FighterRef contenders = 4; int32 slots_left = 5;`
  — неразрешённый дележ на границе отбора (FR-22). `source_pool_id` пуст,
  если дележ в сводном порядке (селектор `OVERALL_PLACES`).
- `TieResolution` — `string source_pool_id = 1; int32 place = 2;
  repeated string fighter_ids = 3;` — ответ организатора: порядок в
  `fighter_ids` = порядок прохода (первые `slots_left` проходят).
  **Не персистится** (FR-24): приходит в запросе, живёт ровно один вызов —
  повторное формирование задаёт вопрос заново.
- `StageBuildPreview` — `repeated StageBuildEntry entries = 1;
  repeated FighterRef unselected = 2; int32 capacity = 3;
  repeated StageBuildTie ties = 4; repeated FighterRef overlaps = 5;
  int32 source_unfinished_bouts = 6;` — превью целиком (FR-15). `overlaps`
  непуст ⇒ формирование будет отклонено (FR-11); `ties` непуст ⇒ требуется
  ответ организатора (FR-22); `source_unfinished_bouts > 0` ⇒ предупреждение
  (FR-14).

**Изменённые сообщения:**

- `Stage` += `GroupsConfig groups = 8; SeedingRule rule = 9;` — оба
  message-поля, presence отличает «правила нет» от «правило пустое».
  Уходит и в `StagePublicService` (`NominationLiveSnapshot.stages`) — схема
  ветвления публична (FR-26).
- `CreateStageRequest` += `GroupsConfig groups = 5; SeedingRule rule = 6;`;
  снимается ограничение «только `BRACKET`» (FR-7).

**Новые RPC (`StageAdminService`, все admin-only):**

| RPC | Запрос → ответ | Требование |
| --- | -------------- | ---------- |
| `SetStageRule` | `{stage_id, SeedingRule rule}` → `{Stage stage, repeated Stage stages}` | FR-6 |
| `PreviewStageBuild` | `{stage_id, repeated TieResolution ties}` → `{StageBuildPreview preview}` | FR-15 |
| `BuildStage` | `{stage_id, repeated TieResolution ties}` → `oneof result { PoolLayout layout, Bracket bracket }` | FR-16 |

`PreviewStageBuild` — мутаций нет, но запрос несёт `ties` (после ответа
организатора превью пересобирается уже без вопроса), поэтому RPC остаётся
unary-командой, а на web — POST (см. BFF).

`BuildStage` возвращает `oneof`, чтобы клиент отрисовал результат без второго
раунда: групповой этап → `PoolLayout` (как `GetLayout`), сетка → `Bracket`
(как `GetBracket`).

Расформирование и отмена **новых RPC не требуют**: `ResetLayout(stage_id)`
(FR-17) и `Undo(stage_id)` (FR-21) уже есть.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

- Модуль: `modules/stage/` — расширение (новых модулей нет).
- PG-схема: `stage` (существующая), миграция `00003_seeding.sql`.
- Межмодульные зависимости: без изменений (`stage → bout/nomination/arena/
  fighter`, все через уже существующие порты).

### `domain/seeding.go` (новый файл — чистое ядро)

Типы правила:

```go
type SourceKind string   // "" | "roster" | "stage"
type SelectorKind string // "" | "all" | "group_places" | "overall_places"
type LayoutMethod string // "" | "snake" | "seeded"

type SeedingRule struct {
    SourceKind    SourceKind
    SourceStageID string
    Selector      SelectorKind
    PlaceFrom     int
    PlaceTo       int // 0 — открытая граница
    Method        LayoutMethod
}

func (r SeedingRule) IsZero() bool           // «правила нет» (FR-1)
func (r SeedingRule) Validate(target Stage) error // ErrInvalidRule (FR-2..FR-4)

type GroupsConfig struct{ GroupCount int }
```

Вход отбора и результат:

```go
// SourceGroup — одна группа этапа-источника: её метка («Группа 2») и уже
// посчитанная таблица (0016). Собирается сервисом, чистой функции не
// требуется знать ни про репозиторий, ни про порт боёв.
type SourceGroup struct {
    PoolID    string
    Label     string
    Standings []Standing
}

// SelectedFighter — отобранный боец с происхождением (FR-27).
type SelectedFighter struct {
    Fighter      FighterRef
    SourcePoolID string
    OriginLabel  string // «Группа 2, место 1» — SourceLabelOf
    GroupPlace   int
    OverallPlace int
}

// TieAsk — неразрешённый дележ на границе отбора (FR-22).
type TieAsk struct {
    SourcePoolID string // пуст для сводного порядка
    GroupLabel   string
    Place        int
    Contenders   []FighterRef
    SlotsLeft    int
}

// TieResolution — ответ организатора (FR-22): fighter_ids по приоритету.
type TieResolution struct {
    SourcePoolID string
    Place        int
    FighterIDs   []string
}

// SeedPlan — план посадки одного бойца в слот сетки (результат
// PlanBracketSeeds, вход ApplyStageBuild).
type SeedPlan struct {
    Slot      int
    FighterID string
}

// BuildGroup — план одной группы целевого этапа (результат
// PlanGroupAssignments): номер группы и её состав. Пулы на момент
// планирования ещё не созданы, поэтому план адресуется НОМЕРОМ, а не
// pool_id — id проставляет транзакция ApplyStageBuild после вставки пулов.
type BuildGroup struct {
    Number     int
    FighterIDs []string
}

// StageBuildPreview — превью формирования целиком (FR-15), то, что api
// мапит в одноимённое proto-сообщение.
type StageBuildPreview struct {
    Entries               []SelectedFighter
    Unselected            []FighterRef
    Capacity              int
    Ties                  []TieAsk
    Overlaps              []FighterRef
    SourceUnfinishedBouts int
}
```

Чистые функции (каждая — отдельный набор табличных тестов):

1. `ComputeOverallOrder(groups []SourceGroup) []SelectedFighter` — **сводный
   порядок этапа** (FR-5): сортировка по `(GroupPlace, -Wins, -PointsScored,
   +PointsConceded)`; равные по всем четырём делят `OverallPlace`
   (конкурентное ранжирование 1,2,2,4 — как `ComputeStandings`). Нормировки
   на размер группы нет (NFR-2).
2. `SelectByRule(rule SeedingRule, groups []SourceGroup, active []FighterRef,
   res []TieResolution) (selected []SelectedFighter, ties []TieAsk, err error)`
   — применение селектора (FR-3): `ALL` берёт всех (для источника-ростера —
   единственный допустимый вариант), `GROUP_PLACES` — окно мест внутри каждой
   группы, `OVERALL_PLACES` — окно мест сводного порядка. `active` играет две
   роли: источник для `roster` и фильтр активности для `stage` — ранжирование
   идёт по таблицам как есть, неактивные выбрасываются после ранжирования, и
   окно добирается следующими (FR-20). Дележ **на границе окна** (место
   входит частично) даёт `TieAsk`; переданное `TieResolution` закрывает его.
   Дележ внутри окна и вне окна вопросов не порождает.
3. `PlanBracketSeeds(selected []SelectedFighter, cfg BracketConfig)
   ([]SeedPlan, error)` — раскладка в сетку (FR-4): посевной номер = позиция в
   `selected` (уже упорядочены), слот = `BracketSeedOrder(cfg.Size)[i]`;
   `len(selected) > cfg.Size` → `ErrCapacityExceeded` (FR-19), недобор —
   законен (FR-19, 0018 FR-9).
4. `BracketSeedOrder(size int) []int` — классический порядок посева
   («1×N»): рекурсивно `order(2) = [1,2]`, `order(2n)` = чередование
   `order(n)` и его зеркала. Проверяется свойством: посевные 1 и 2
   встречаются только в финале, 1 и 4 — не раньше полуфинала.
5. `PlanGroupAssignments(selected []SelectedFighter, groupCount int)
   []BuildGroup` — раскладка в группы (FR-4): переиспользует существующий
   `AutoDistribute(existing, unassigned)` (0009) поверх `groupCount`
   синтетических пустых групп; порядок `selected` (сводный) задаёт змейку по
   силе, минимум одноклубников обеспечивает сама `AutoDistribute`.
   `AutoDistribute` адресует пулы по `Pool.ID`, а на момент планирования
   пулов ещё нет — синтетическим группам подставляется номер (1..N), и
   результат отдаётся номерами (`BuildGroup.Number`); реальные id проставляет
   `ApplyStageBuild` после вставки пулов в той же транзакции.
6. `Overlap(a, b []SelectedFighter) []FighterRef` — пересечение выборок
   соседних веток (FR-11).

### `domain/domain.go` (правки)

- `Stage` += `Rule SeedingRule; Groups GroupsConfig`.
- `UndoKind` += `UndoBuild UndoKind = "build"` (FR-21): снапшот пуст —
  состояние до формирования гарантированно пустое (FR-18), поэтому откат
  сводится к очистке состава.
- Новые доменные ошибки (маппинг в `connect.Code` — ниже):
  `ErrNoSeedingRule`, `ErrInvalidRule`, `ErrSourceNotAllowed`,
  `ErrSelectorOverlap`, `ErrCapacityExceeded`, `ErrTieUnresolved`,
  `ErrStageNotEmpty`, `ErrRuleLocked`, `ErrStageIsSource` (FR-7a).
- Порт `Repository` += :
  - `SetSeedingRule(ctx, stageID string, rule SeedingRule) error` — пишет
    правило, очищает undo;
  - `ApplyStageBuild(ctx, stageID string, groups []BuildGroup, seeds []SeedPlan)
    error` — **одна транзакция** (FR-16): создать группы (для `groups`-этапа),
    вставить членства (со слотами для сетки), записать `undo_kind='build'`;
  - `StagesBySource(ctx, sourceStageID string) ([]Stage, error)` — соседние
    ветки от того же источника (FR-11) и гейт удаления источника (FR-7a);
  - `CreateStage(...)` — сигнатура расширяется `rule`/`groups`
    (`type` теперь может быть `groups`).
- Порт `BoutConductor` — **без изменений**: итоги источника собираются уже
  существующими `BoutsByPool`/`PoolProgress`.

### `service/seeding.go` (новый файл)

- `SetStageRule(ctx, stageID, rule)` — валидация правила (`rule.Validate`),
  проверка источника (существует, та же номинация, `type = groups`, раньше по
  порядку → `ErrSourceNotAllowed`), гейт «состав пуст» (`ErrRuleLocked`, FR-6),
  гейт «групповой целевой этап без `group_count`» (`ErrInvalidRule`, FR-9a —
  сюда же попадает авто-этап), пересчёт `position` этапа от источника (FR-10).
- `PreviewStageBuild(ctx, stageID, res)` → `domain.StageBuildPreview`:
  1. `stage` + правило (`ErrNoSeedingRule`, если правила нет);
  2. источник: для `stage` — `PoolsByStage` + `MembersByStage` +
     `BoutsByPool` → `ComputeStandings` на каждую группу → `[]SourceGroup`;
     для `roster` — `ActiveFightersByNomination`;
  3. активный ростер (`ActiveFightersByNomination`) — он же источник для
     `roster` и фильтр активности для `stage` (FR-20);
  4. `SelectByRule` → `selected` / `ties`. Внутри порядок шагов существен
     (FR-20): ранжирование считается **по таблицам как есть** —
     `ComputeStandings` включает выведенных бойцов, если у них есть
     проведённые бои (0016), и пересчитывать таблицу без них нельзя, — и
     только затем неактивные выбрасываются из окна отбора, а окно добирается
     следующими по порядку;
  5. соседние ветки (`StagesBySource`) → их `SelectByRule` → `Overlap`
     (FR-11);
  6. план раскладки (`PlanBracketSeeds` / `PlanGroupAssignments`) → целевые
     слоты/номера групп в `entries`;
  7. `source_unfinished_bouts` — сумма `total − finished` по пулам источника
     (FR-14).
- `BuildStage(ctx, stageID, res)` — тот же конвейер + гейты и применение:
  состав пуст (`ErrStageNotEmpty`, FR-18), нет `ties` (`ErrTieUnresolved`),
  нет `overlaps` (`ErrSelectorOverlap`), вместимость (`ErrCapacityExceeded`),
  затем `ApplyStageBuild` в одной транзакции, `SyncRegistrationState`
  (FR-29) и `PublishNominationChanged` (живой канал, 0014). Возврат —
  `loadLayout` либо `buildBracket` по типу этапа.
- `Undo` (существующий) += ветка `UndoBuild` → очистка состава этапа без
  записи нового undo.
- `CreateStage` (существующий, `service/bracket.go`) — принимает `type`,
  `GroupsConfig`, `SeedingRule`. `position` (FR-10):
  - правило с источником-этапом → `position(источника) + 1` (две ветки от
    одного источника получают одну позицию — это и есть параллельность);
  - правило с источником-ростером → `0`;
  - **правила нет → `MaxStagePosition + 1`, как сегодня** (0018, FR-2). Это
    не деталь: если этап без правила встанет на позицию 0, он окажется
    параллельной веткой группового этапа — регресс сценария 0018 (FR-28,
    AC-18).
- `DeleteStage` (существующий) += гейт `StagesBySource` (`ErrStageIsSource`,
  FR-7a) и разрешение удалять явно созданный `groups`-этап (авто-этап —
  по-прежнему нет).

### `repo/` (sqlc)

Новые запросы в `repo/queries/stage.sql`:
`SetStageRule`, `ListStagesBySource`, `InsertPoolsBatch`/`InsertMembersBatch`
(для транзакции `ApplyStageBuild`); существующие `InsertStage`/`CreateStage`,
`GetStageByID`, `ListStagesByNomination` расширяются новыми колонками. Затем
`make sqlc`.

### `migrations/00003_seeding.sql` (goose)

```sql
-- +goose Up
ALTER TABLE stage.stages
    ADD COLUMN source_kind     TEXT    NOT NULL DEFAULT '',
    ADD COLUMN source_stage_id UUID    NULL REFERENCES stage.stages(id) ON DELETE RESTRICT,
    ADD COLUMN selector_kind   TEXT    NOT NULL DEFAULT '',
    ADD COLUMN place_from      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN place_to        INTEGER NOT NULL DEFAULT 0,   -- 0 = открытая граница
    ADD COLUMN layout_method   TEXT    NOT NULL DEFAULT '',
    ADD COLUMN group_count     INTEGER NOT NULL DEFAULT 0;   -- FR-8, только у groups

ALTER TABLE stage.stages
    ADD CONSTRAINT chk_stages_source   CHECK (source_kind   IN ('','roster','stage')),
    ADD CONSTRAINT chk_stages_selector CHECK (selector_kind IN ('','all','group_places','overall_places')),
    ADD CONSTRAINT chk_stages_method   CHECK (layout_method IN ('','snake','seeded')),
    -- правило либо есть целиком, либо его нет вовсе (FR-1)
    ADD CONSTRAINT chk_stages_rule CHECK (
        (source_kind = '' AND selector_kind = '' AND layout_method = ''
         AND source_stage_id IS NULL AND place_from = 0 AND place_to = 0)
     OR (source_kind <> '' AND selector_kind <> '' AND layout_method <> '')),
    -- источник-этап ⟺ ссылка на этап (FR-2)
    ADD CONSTRAINT chk_stages_source_stage CHECK ((source_kind = 'stage') = (source_stage_id IS NOT NULL)),
    ADD CONSTRAINT chk_stages_places CHECK (place_from >= 0 AND place_to >= 0
                                            AND (place_to = 0 OR place_to >= place_from)),
    -- число групп — только у группового этапа (FR-8/FR-9)
    ADD CONSTRAINT chk_stages_group_count CHECK (group_count >= 0 AND (type = 'groups' OR group_count = 0));

ALTER TABLE stage.stages DROP CONSTRAINT chk_stages_undo;
ALTER TABLE stage.stages ADD  CONSTRAINT chk_stages_undo
    CHECK (undo_kind IN ('','auto','delete_pool','reset','build'));   -- FR-21

CREATE INDEX idx_stages_source ON stage.stages (source_stage_id) WHERE source_stage_id IS NOT NULL;
```

Почему так:

- **Колонки, а не jsonb** — те же соображения, что и для `bracket_size`
  (0018): семь скалярных полей проверяются `CHECK`-ами; переезд на jsonb —
  вместе с конструктором (0020), когда конфигов станет много.
- **Самоссылающийся FK** `source_stage_id` — внутри одной схемы, кросс-схемных
  ссылок не появляется (ADR 0002). `ON DELETE RESTRICT` — страховка данных под
  доменный гейт FR-7a: молча обнулять правило ветки при удалении источника
  нельзя.
- **`place_to = 0` как открытая граница** — вместо nullable-колонки: значение
  «место 0» не существует, а `NOT NULL DEFAULT 0` упрощает и sqlc-типы, и
  `CHECK`.
- **Уникальности «один источник — один селектор» нет**: пересечение
  селекторов — доменная проверка (FR-11), выразить её констрейнтом
  невозможно.
- Down-миграция снимает констрейнты, индекс и колонки в обратном порядке и
  возвращает старый `chk_stages_undo`.

### `api/handler.go`

Три новых хендлера + расширение `CreateStage`. Маппинг доменных ошибок:

| Ошибка | `connect.Code` |
| ------ | -------------- |
| `ErrInvalidRule`, `ErrSourceNotAllowed` | `InvalidArgument` |
| `ErrNoSeedingRule`, `ErrStageNotEmpty`, `ErrRuleLocked`, `ErrSelectorOverlap`, `ErrCapacityExceeded`, `ErrTieUnresolved`, `ErrStageIsSource` | `FailedPrecondition` |
| `ErrNotFound` | `NotFound` |

`ErrTieUnresolved` в `BuildStage` — именно `FailedPrecondition`: сам список
дележей клиент получает из `PreviewStageBuild`, а не из тела ошибки.

### `testutil/fake_repo.go`

Реализация новых методов порта (`SetSeedingRule`, `ApplyStageBuild`,
`StagesBySource`) + правило/конфиг в фейковых этапах.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

- **BFF** (Route Handlers, Node runtime):
  - `app/api/stages/[stageId]/rule/route.ts` — `PUT` → `SetStageRule`;
  - `app/api/stages/[stageId]/build/preview/route.ts` — `POST` (тело: `ties`)
    → `PreviewStageBuild`;
  - `app/api/stages/[stageId]/build/route.ts` — `POST` (тело: `ties`) →
    `BuildStage`;
  - `app/api/nominations/[id]/stages/route.ts` — расширяется тело `POST`
    (тип этапа, `groups.group_count`, `rule`).
- **entities**:
  - `entities/stage/` — типы `SeedingRule`/`GroupsConfig`/`StageBuildPreview`,
    сериализация из proto (`lib/grpc/serialize.ts`), хелперы подписи правила
    («Места 1–2 каждой группы · Групповой этап»).
- **features**:
  - `features/stage-management/` — диалог создания этапа расширяется: тип
    (группы/сетка), число групп, правило (источник из списка этапов
    номинации + «ростер», селектор, границы мест); новый хук
    `use-set-stage-rule.ts` (FR-6).
  - `features/stage-build/` (новая) — `api/{keys,requests,use-build-preview,
    use-build-stage}.ts`, `ui/build-stage-dialog.tsx` (превью-таблица
    «боец → откуда → куда», предупреждения FR-11/FR-14, блок разрешения
    дележа FR-22), `lib/tie-resolution.ts` (сбор ответов организатора).
- **widgets**:
  - `widgets/nomination-schema/` (новый) — схема номинации уровнями и ветками
    (FR-25); переиспользуется публичным экраном (FR-26) в read-only режиме.
- **Страницы**: `app/(admin)/admin/nominations/[id]/stages/page.tsx` —
  схема вместо плоского списка этапов + кнопка «Сформировать»;
  `app/nominations/[id]/page.tsx` — схема в публичном виде.
- **Server components vs client**: схема на публичной странице —
  server-компонент поверх существующего снапшота (`GetNominationLive`), в
  админке — клиентский виджет поверх TanStack Query (инвалидация ключей
  этапов/раскладки/сетки после `BuildStage`).
- **State**: server-state → TanStack Query; черновик правила и ответы про
  дележ — локальный `useState` в диалогах (в Zustand не выносим: живёт ровно
  столько, сколько открыт диалог).

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей).

- Издаёт: нет. `PublishNominationChanged` (ADR 0012) — сигнал живого канала,
  не доменное событие; вызывается после `BuildStage`, как после любой
  мутации состава.
- Потребляет: нет.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит (`domain/`, чистые функции)** — основная масса:
  - `ComputeOverallOrder`: порядок сквозь группы, дележ (одинаковый
    `OverallPlace`), группы разного размера (фиксируем поведение NFR-2),
    пустые группы;
  - `SelectByRule`: `ALL`, `GROUP_PLACES` с открытой и закрытой границей,
    `OVERALL_PLACES`, дележ строго на границе окна (даёт `TieAsk`), дележ
    внутри и вне окна (вопросов нет), применение `TieResolution`;
  - `BracketSeedOrder`: 4/8/16/32 — свойство «1 и 2 встречаются только в
    финале», «1 и 4 — не раньше полуфинала», перестановка полная;
  - `PlanBracketSeeds`: полный набор, недобор, переполнение
    (`ErrCapacityExceeded`);
  - `PlanGroupAssignments`: змейка по силе поверх `AutoDistribute`,
    одноклубники;
  - `Overlap`, `SeedingRule.Validate`.
- **Юнит (`service/` с fake-репо и fake-conductor)**: превью (entries/
  unselected/ties/overlaps/unfinished), формирование группового этапа и сетки,
  гейты (`ErrStageNotEmpty`, `ErrTieUnresolved`, `ErrSelectorOverlap`,
  `ErrRuleLocked`, `ErrSourceNotAllowed`, `ErrStageIsSource`), фильтр по
  ростеру (FR-20), undo после формирования (FR-21), позиция ветки от
  источника (FR-10).
- **E2E ручек (`api/` через httptest + Connect, fake-репо)**: три новых RPC —
  счастливый путь и маппинг каждой доменной ошибки в `connect.Code`;
  `CreateStage` с `type = GROUPS`.
- **Интеграционные (`integration/`, testcontainers)**: миграция `00003`
  применяется и откатывается; `CHECK`-и правила (частичное правило
  отклоняется); `ON DELETE RESTRICT` на источнике; полный путь «групповой
  этап с боями → BuildStage сетки → посев в БД» через реальный Connect.
- **Web (Vitest)**: BFF-роуты (маппинг `connect.Code` → HTTP, тело `ties`),
  fetchers, диалог превью (рендер строк, предупреждений, блока дележа,
  блокировка кнопки при `overlaps`), схема-виджет на фикстурах.
- **Ручная проверка**: демо-сид (`make demo-*`) с двумя ветками — двойной
  плейофф и двойная сетка групп — до боёв и публичного экрана.

## Риски и открытые вопросы

- **Сводный порядок при группах разного размера** (NFR-2): поведение
  зафиксировано тестом как известное искажение. Риск — организатор сочтёт его
  ошибкой; смягчается тем, что превью показывает исходные показатели.
- **Стоимость превью**: чтобы посчитать пересечение веток (FR-11), сервис
  прогоняет отбор для каждой соседней ветки — то есть читает итоги источника
  повторно. При 4 группах и 2 ветках это единицы запросов; если веток станет
  много, итоги источника стоит считать один раз и передавать в отбор всех
  веток (готово к этому: `SelectByRule` уже принимает `[]SourceGroup`).
- **UI дележа** (FR-22) — самая скользкая часть интерфейса: вопрос возникает
  редко и в момент спешки. Диалог должен показывать показатели претендентов
  (победы/набранные/пропущенные), иначе выбор делается вслепую.
- **`position` как производная от источника** (FR-10): пока связь одна,
  вычисление тривиально; при слиянии веток (вне скоупа) позиция перестанет
  быть функцией одного источника — это уже задача конструктора (0020).
- **Граница с 0020**: соблазн доделать «раз уж всё равно трогаем» —
  редактирование конфига этапа, переупорядочивание, копирование схемы. Всё
  это остаётся за 0020; здесь редактируется только правило и только до
  формирования (FR-6).
