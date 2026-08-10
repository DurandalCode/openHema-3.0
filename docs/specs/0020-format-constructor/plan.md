# Plan: Конструктор схемы номинации + пресеты форматов

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-08-06
- Спека: `./spec.md`
- Решение: `docs/adr/0014-nomination-format-stages.md` (инкремент 0020)

## Обзор решения

Всё живёт в модуле `stage` (ADR 0014, §8): схема, её исполнение и теперь её
шаблоны — один модуль, одна транзакция на замену схемы. `bout` затрагивается
только уже существующими портами (`AnyStartedInPools`/`ClearForPools` — те же
вызовы, что в `DeleteStage`); `nomination`, `fighter`, `arena` не меняются
вовсе.

Инкремент состоит из трёх независимых по файлам кусков:

1. **Редактирование этапа** (FR-2..FR-7) — новый RPC `UpdateStage`, снятие
   гейта неудаляемости авто-этапа, детект циклов и **каскадный пересчёт
   позиций** как чистая функция над графом этапов.
2. **Диагностика схемы** (FR-8, FR-9) — чистая функция
   `DiagnoseSchema(stages) []SchemaIssue` по образцу `ComputeStandings`
   (0016)/`ResolveBracket` (0018)/`SelectByRule` (0019); отдаётся в
   `ListStagesResponse` и рисуется в существующем виджете схемы. Сервер —
   единственный источник истины диагностики, клиент её не пересчитывает.
3. **Пресеты и копирование** (FR-11..FR-16) — новая таблица
   `stage.format_presets` (документ-значение в jsonb), три RPC библиотеки +
   один RPC применения (`ApplyFormat`), где источник — `oneof {preset_id,
   source_nomination_id}`: копирование из номинации и применение пресета — один
   и тот же путь, отличается только сбором спецификации на входе.

Ключевое архитектурное решение — **`FormatSpec` как общий промежуточный тип**:
`схема номинации → FormatSpec → пресет` и `пресет | схема-донор → FormatSpec →
схема номинации`. Ссылки на источники внутри `FormatSpec` — **индексы**, а не
UUID: спецификация обязана быть переносимой между номинациями и переживать
турнир (FR-11, FR-16).

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

Файл: `proto/hema/v1/stage.proto` (сервис `StageAdminService`).

**Новые сообщения:**

```proto
// SchemaIssue — одна проблема схемы (спека 0020, FR-8). Текст формирует
// сервер (то же правило, что для BracketSlot.source_label 0018 и
// StageBuildEntry.origin_label 0019) — клиент строку из кодов не собирает.
message SchemaIssue {
  SchemaIssueSeverity severity = 1;
  SchemaIssueCode code = 2;
  // stage_ids — этапы, к которым проблема привязана: один (нет числа групп)
  // либо два (пересечение веток).
  repeated string stage_ids = 3;
  string message = 4;
}

enum SchemaIssueSeverity {
  SCHEMA_ISSUE_SEVERITY_UNSPECIFIED = 0;
  SCHEMA_ISSUE_SEVERITY_ERROR   = 1;   // формирование заведомо не пройдёт
  SCHEMA_ISSUE_SEVERITY_WARNING = 2;   // пройдёт, но результат может удивить
  SCHEMA_ISSUE_SEVERITY_INFO    = 3;   // так и задумано, но видеть это надо (FR-8)
}

enum SchemaIssueCode {
  SCHEMA_ISSUE_CODE_UNSPECIFIED        = 0;
  // ошибки
  SCHEMA_ISSUE_CODE_NO_GROUP_COUNT     = 1;  // правило без числа групп (FR-7)
  SCHEMA_ISSUE_CODE_BAD_SOURCE         = 2;  // источник не groups / позже по схеме
  SCHEMA_ISSUE_CODE_SOURCE_CYCLE       = 3;  // цикл источников (FR-4)
  SCHEMA_ISSUE_CODE_SELECTOR_OVERLAP   = 4;  // окна веток пересекаются (0019 FR-11)
  SCHEMA_ISSUE_CODE_CAPACITY_EXCEEDED  = 5;  // отбор заведомо > размера сетки (0019 FR-19)
  // предупреждения
  SCHEMA_ISSUE_CODE_CAPACITY_UNDERFILL = 6;  // отбор заведомо < размера сетки — байи
  SCHEMA_ISSUE_CODE_COVERAGE_GAP       = 7;  // разрыв между окнами веток
  SCHEMA_ISSUE_CODE_OVERLAP_UNKNOWN    = 8;  // окна разных видов — проверится при формировании
  // информация
  SCHEMA_ISSUE_CODE_TAIL_UNCOVERED     = 9;  // хвост состава источника никуда не идёт
}
```

Два решения внутри диагностики:

- **`CAPACITY_EXCEEDED` — ошибка, а не предупреждение**: `BuildStage` отвечает
  на это `ErrCapacityExceeded` (0019, FR-19), то есть формирование реально не
  пройдёт. Недобор (`UNDERFILL`) — законен (байи, 0018 FR-9), поэтому
  предупреждение.
- **`TAIL_UNCOVERED` — отдельный класс `INFO`**: непокрытый хвост есть почти в
  любой схеме с плейоффом (кого-то всегда отсеивают), и будь он
  предупреждением, предупреждения перестали бы читать. Показать его ADR 0014
  (§5) требует прямо — но как факт отбора, а не как проблему.
- Кода «групповой этап с одной группой» намеренно **нет** (FR-8a): это «финал
  трёх», законный формат — сеткой его не выразить (минимальный размер — 4).

```proto

// FormatStageSpec — один этап схемы вне привязки к номинации (FR-11).
// Ссылки на источник — ИНДЕКСЫ в repeated stages, а не UUID: спецификация
// переносима между номинациями и переживает турнир (FR-16).
message FormatStageSpec {
  string title = 1;
  StageType type = 2;
  BracketConfig bracket = 3;
  GroupsConfig groups = 4;
  StageSourceKind source_kind = 5;
  // source_index — индекс этапа-источника в этом же repeated (>= 0), если
  // source_kind = STAGE; иначе -1.
  int32 source_index = 6;
  StageSelectorKind selector = 7;
  int32 place_from = 8;
  int32 place_to = 9;
  StageLayoutMethod method = 10;
}

// FormatPreset — именованная схема в библиотеке (FR-11, FR-12).
message FormatPreset {
  string id = 1;
  string name = 2;
  repeated FormatStageSpec stages = 3;
  google.protobuf.Timestamp created_at = 4;
  google.protobuf.Timestamp updated_at = 5;
}
```

**Изменённые сообщения:**

- `ListStagesResponse` += `repeated SchemaIssue issues = 2;` (FR-8) — диагностика
  приезжает вместе со схемой, отдельного RPC не заводим: экран схемы и так
  читает `ListStages`, а диагностика — чистая функция от того же набора этапов.
  В `StagePublicService` не уходит (FR-19).

**Новые RPC (`StageAdminService`, все admin-only):**

| RPC | Запрос → ответ | Требование |
| --- | -------------- | ---------- |
| `UpdateStage` | `{stage_id, title, BracketConfig bracket, GroupsConfig groups}` → `{Stage stage}` | FR-2 |
| `ListFormatPresets` | `{}` → `{repeated FormatPreset presets}` | FR-12 |
| `SaveFormatPreset` | `{name, nomination_id}` → `{FormatPreset preset}` | FR-12 |
| `RenameFormatPreset` | `{preset_id, name}` → `{FormatPreset preset}` | FR-12 |
| `DeleteFormatPreset` | `{preset_id}` → `{}` | FR-12 |
| `ApplyFormat` | `{nomination_id, oneof source {string preset_id, string source_nomination_id}}` → `{repeated Stage stages}` | FR-13, FR-15 |

Почему так:

- **`UpdateStage` принимает конфиг целиком**, а не «изменённые поля»: полей
  три, `Stage` и так возвращается целиком, а частичный апдейт потребовал бы
  масок и не дал бы ничего. Сервер сам сравнивает присланный конфиг с
  текущим — если конфиг не изменился, гейт «состав пуст» не применяется, и
  переименование остаётся доступным всегда (FR-2). Тип этапа в запросе
  отсутствует вовсе — сменить его нечем, поэтому и доменной ошибки «тип
  неизменяем» не заводим: невыразимое в контракте не нуждается в отказе
  (FR-2, AC-3). Ответ — `{Stage stage}`, как у `SetStageRule`: `UpdateStage`
  позиций не меняет, соседние этапы не затрагиваются.
- **`SetStageRule` контракт не меняет**, хотя теперь пересчитывает позиции
  каскадно (FR-3): ответ по-прежнему `{Stage stage}`, а web после мутации и так
  инвалидирует ключ списка этапов — расширять ответ ради этого не нужно.
- **`ApplyFormat` с `oneof`**, а не два RPC: применение пресета и копирование
  из номинации отличаются только тем, откуда собирается `FormatSpec` (FR-15).
  Ответ — новая схема целиком, чтобы клиент перерисовал экран без второго
  раунда (как `BuildStage` в 0019).
- **`SaveFormatPreset` берёт номинацию, а не тело схемы**: пресет — отпечаток
  существующей схемы (FR-11), собирать его на клиенте значит дублировать
  маппинг и открыть дорогу «пресетам из воздуха».
- **Пресеты — в `StageAdminService`**, не в отдельном сервисе: библиотека
  форматов — это ровно сериализованная схема этапов, и жить она обязана там же
  (ADR 0014, §8/§9).

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

- Модуль: `modules/stage/` — расширение (новых модулей нет).
- PG-схема: `stage` (существующая), миграция `00004_format_presets.sql`.
- Межмодульные зависимости: **без изменений**. `ApplyFormat` пользуется уже
  существующими `BoutConductor.AnyStartedInPools`/`ClearForPools` — теми же,
  что `DeleteStage` (0018).

### `domain/schema.go` (новый файл — чистое ядро)

```go
// FormatStageSpec — этап схемы вне привязки к номинации (FR-11).
// SourceIndex — индекс источника в том же слайсе; -1, если источника-этапа
// нет. Именно индекс делает спецификацию переносимой (FR-16).
type FormatStageSpec struct {
    Title       string
    Type        StageType
    Bracket     BracketConfig
    Groups      GroupsConfig
    SourceKind  SourceKind
    SourceIndex int
    Selector    SelectorKind
    PlaceFrom   int
    PlaceTo     int
    Method      LayoutMethod
}

// FormatSpec — схема целиком: упорядоченный список этапов. Порядок = порядок
// создания при применении; позиции считает ResolveStagePositions.
type FormatSpec struct{ Stages []FormatStageSpec }

type FormatPreset struct {
    ID        string
    Name      string
    Spec      FormatSpec
    CreatedAt time.Time
    UpdatedAt time.Time
}

type SchemaIssueSeverity string // "error" | "warning" | "info"
type SchemaIssueCode string     // см. enum в proto

type SchemaIssue struct {
    Severity SchemaIssueSeverity
    Code     SchemaIssueCode
    StageIDs []string
    Message  string
}
```

Чистые функции (каждая — отдельный набор табличных тестов):

1. `SpecFromStages(stages []Stage) FormatSpec` — схема номинации →
   спецификация (FR-11/FR-15): этапы в порядке `(position, title)`, UUID
   источников заменяются индексами. Этап, чей источник не входит в набор
   (невозможно в валидной схеме, но защищаемся), теряет правило.
2. `ResolveStagePositions(stages []Stage) (map[string]int, error)` — каскадный
   пересчёт позиций (FR-3): этап без правила сохраняет свою позицию (0018
   FR-2 — иначе регресс AC-18 спеки 0019), с источником-ростером → `0`, с
   источником-этапом → `position(source) + 1`, обход топологический;
   `ErrSourceCycle` при цикле.
3. `DetectSourceCycle(stages []Stage, stageID, newSourceID string) bool` —
   гейт FR-4: пройти по цепочке источников от нового источника и упереться
   ли в `stageID`.
4. `DiagnoseSchema(stages []Stage) []SchemaIssue` — FR-8, три класса
   (`error`/`warning`/`info`). Считает **только по схеме**, без обращения к
   боям и ростеру (NFR-2):
   - оценка отбора: `group_places [X..Y]` с закрытой границей от источника с
     `group_count = G` → `G*(Y-X+1)`; `overall_places [X..Y]` → `Y-X+1`;
     открытая граница, `all`, источник-ростер → **оценка невозможна**
     (`estimate = -1`, никаких предупреждений о вместимости);
   - покрытие источника: окна **всех** веток от одного источника (двух, трёх и
     больше — FR-8a) сортируются; строго пересеклись → `SELECTOR_OVERLAP`
     (error); разрыв между окнами → `COVERAGE_GAP` (warning); ни одно окно не
     открыто вверх → `TAIL_UNCOVERED` (info); окна разных видов →
     `OVERLAP_UNKNOWN` (warning);
   - остальные коды — прямые проверки полей.
   Порядок выдачи детерминирован (`severity`, затем позиция этапа, затем код) —
   тесты сравнивают срез целиком.
5. `ValidateFormatSpec(spec FormatSpec) error` — спецификация исполнима
   структурно: непустая, индексы источников в границах и строго меньше
   собственного (⇒ ациклично по построению), правило валидно
   (`SeedingRule.Validate`), групповой этап с правилом имеет `group_count > 0`.
   Вызывается и при сохранении пресета, и при применении.

### `domain/domain.go` (правки)

- Порт `Repository` += :
  - `UpdateStage(ctx, stageID, title string, bracket BracketConfig, groups GroupsConfig) error` (FR-2);
  - `SetStagePositions(ctx, positions map[string]int) error` — каскад FR-3 одной
    транзакцией;
  - `MembersCountByNomination(ctx, nominationID string) (int, error)` — гейт
    «схема не тронута» (FR-13);
  - `ReplaceSchema(ctx, nominationID string, specs []FormatStageSpec, positions []int) ([]Stage, error)`
    — **одна транзакция** (NFR-1): удалить все этапы номинации (каскад пулов и
    членств), вставить новые в порядке спецификации, разрезолвить
    `SourceIndex → source_stage_id` вторым проходом внутри той же транзакции,
    создать по два контейнера первого круга каждой сетке (как `CreateStage`,
    0018 FR-6a);
  - `ListFormatPresets/GetFormatPreset/InsertFormatPreset/RenameFormatPreset/
    DeleteFormatPreset` — библиотека (FR-12).
- Новые доменные ошибки: `ErrStageLocked` (конфиг правится только при пустом
  составе, FR-2), `ErrSourceCycle` (FR-4), `ErrSchemaNotEmpty` (FR-14),
  `ErrPresetNameTaken` (FR-12, AC-17), `ErrInvalidSpec`
  (`ValidateFormatSpec`).
- `ErrStageNotDeletable` остаётся, но **перестаёт означать «авто-этап»** —
  только «есть начатые бои» (FR-5).

### `service/schema.go` (новый файл)

- `UpdateStage(ctx, stageID, title, bracket, groups)` (FR-2):
  1. этап (`ErrNotFound`), `title` непустой после `TrimSpace`;
  2. конфиг соответствует типу (те же проверки, что в `CreateStage`, но
     `group_count = 0` для групп **допустим** — «не задано», FR-7);
  3. конфиг изменился ⇒ гейты: статус `draft` и `stageComposeEmpty`
     (существующий хелпер `service/seeding.go`) иначе `ErrStageLocked`;
  4. у группового этапа `group_count` обнуляется, а правило есть →
     `ErrInvalidRule` (инвариант 0019 FR-9a сохраняется) — проверка **до**
     записи, а не после;
  5. `repo.UpdateStage`;
  6. `PublishNominationChanged` (0014) — конфиг сетки виден публично.
- `SetStageRule` (существующий, `service/seeding.go`) += `DetectSourceCycle`
  (FR-4) и **каскадный** пересчёт: вместо одиночного `position` считается
  `ResolveStagePositions` по всем этапам номинации и пишется
  `SetStagePositions` (FR-3). Это же снимает риск, отмеченный в плане 0019
  («позиция как производная от одного источника»).
- `DeleteStage` (существующий, `service/bracket.go`): убрать ветку
  `stage.Groups.GroupCount == 0 → ErrStageNotDeletable` (FR-5). Гейты
  «этап-источник» и «есть начатые бои» остаются. Авто-этап после удаления
  восстановит `EnsureStage` при следующем мутирующем обращении (FR-6) —
  специального кода не требуется.
- `ListStages` (существующий) += `DiagnoseSchema` в ответ (FR-8).
- `SaveFormatPreset(ctx, name, nominationID)`: `StagesByNomination` →
  `SpecFromStages` → `ValidateFormatSpec` → `InsertFormatPreset`
  (`ErrPresetNameTaken` из unique-индекса). Номинация, у которой этап ещё
  виртуальный (0017, FR-4 — строки в БД нет), даёт пустую спецификацию и
  `ErrInvalidSpec`: сохранять как пресет нечего. `ApplyFormat` на такую
  номинацию, наоборот, работает штатно — удалять просто нечего.
- `RenameFormatPreset` / `DeleteFormatPreset` / `ListFormatPresets` — тонкие
  проксирования с `TrimSpace` и `ErrNotFound`.
- `ApplyFormat(ctx, nominationID, presetID, sourceNominationID)` (FR-13/FR-15):
  1. ровно один источник задан (`ErrInvalidInput`); `sourceNominationID !=
     nominationID`;
  2. спецификация: из пресета (`GetFormatPreset`) либо из донора
     (`StagesByNomination` + `SpecFromStages`); `ValidateFormatSpec`;
  3. **гейт «схема не тронута»** (FR-14): `MembersCountByNomination == 0`;
     для каждого этапа `AnySeatedInStage == false`; `AnyStartedInPools` по всем
     пулам номинации `== false` — иначе `ErrSchemaNotEmpty`. Три проверки, а не
     одна: пустой состав — необходимое условие, но пул без бойцов теоретически
     мог быть поставлен на арену, и молча снести его нельзя;
  4. `bouts.ClearForPools` по всем пулам номинации (симметрично `DeleteStage`);
  5. позиции спецификации — **симуляция последовательного создания**, а не
     нумерация по индексу (FR-8a): спецификация проходится по порядку, этап с
     источником-этапом получает `position(источника) + 1`, с
     источником-ростером — `0`, **без правила — `max(уже назначенных) + 1`**
     (та же семантика `MaxStagePosition + 1`, что у `CreateStage`, 0018 FR-2).
     Иначе завершающий ручной этап («финал трёх» из победителей сеток, AC-22)
     встал бы параллельно сеткам, а не за ними. Затем — `ResolveStagePositions`
     поверх результата как проверка непротиворечивости;
  6. `repo.ReplaceSchema` — одна транзакция (NFR-1);
  7. `SyncRegistrationState` (0012) и `PublishNominationChanged` (0014).

### `repo/` (sqlc)

Новые запросы в `repo/queries/stage.sql`: `UpdateStage`, `SetStagePosition`
(в цикле внутри транзакции), `CountMembersByNomination`, `DeleteStagesByNomination`,
`InsertStageReturning`, `SetStageSource`, `ListFormatPresets`,
`GetFormatPreset`, `InsertFormatPreset`, `RenameFormatPreset`,
`DeleteFormatPreset`. Затем `make sqlc`.

`ReplaceSchema` и `SetStagePositions` — ручные транзакции в `repo/repo.go`
поверх сгенерированных запросов (как существующие `ApplyStageBuild`/
`ResetLayout`).

### `migrations/00004_format_presets.sql` (goose)

```sql
-- +goose Up
-- Пресет формата (спека 0020, FR-11): библиотека вне турнира и вне
-- номинации — отдельная таблица без FK на что-либо.
CREATE TABLE stage.format_presets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    stages     JSONB       NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_presets_name   CHECK (length(btrim(name)) > 0),
    CONSTRAINT chk_presets_stages CHECK (jsonb_typeof(stages) = 'array'
                                         AND jsonb_array_length(stages) > 0)
);

-- Имя пресета уникально без учёта регистра и краевых пробелов (FR-12, AC-17).
CREATE UNIQUE INDEX uq_presets_name ON stage.format_presets (lower(btrim(name)));

-- +goose Down
DROP TABLE IF EXISTS stage.format_presets;
```

Почему так:

- **jsonb-документ, а не таблица `preset_stages` с детьми.** Пресет — это
  **значение целиком** (FR-16, копия по значению): он никогда не читается по
  отдельному полю, не джойнится и не мутируется частями — только пишется и
  читается разом. Дочерняя таблица дала бы `CHECK`-и, но потребовала бы
  дублировать все констрейнты `stage.stages` и внутренние ссылки «этап
  пресета → этап пресета», не давая взамен ни одного запроса, который стал бы
  проще. Контракт схемы документа типизирован в `FormatSpec` и проверяется
  `ValidateFormatSpec` на входе и на выходе — тот же приём, что у
  `NominationMetadata` (0003) и undo-снапшотов (0009).
- **Конфиг самого этапа на jsonb НЕ переезжает.** Комментарии миграций 00002 и
  00003 держали этот переезд «до плана 0020» — решение: не переезжаем. Полей у
  этапа не прибавилось (0020 не вводит ни одного нового параметра, только
  делает существующие редактируемыми), а `CHECK`-и на скалярных колонках —
  единственное, что сегодня ловит частичное правило и чужой конфиг у типа.
  Переезд имел бы смысл при появлении третьего типа этапа со своим набором
  параметров (швейцарка) — тогда и со своей спекой.
- **Нет FK на турнир/номинацию** — прямое следствие FR-12 («библиотека
  переживает турнир»); заодно ни одной кросс-схемной ссылки (ADR 0002).
- **`updated_at`** нужен переименованию (FR-12); триггеров не заводим —
  проставляется запросом, как в остальных таблицах модуля.

### `api/handler.go`

Шесть новых хендлеров + `issues` в `ListStages`. Маппинг доменных ошибок:

| Ошибка | `connect.Code` |
| ------ | -------------- |
| `ErrInvalidSpec`, `ErrInvalidRule`, `ErrInvalidInput` | `InvalidArgument` |
| `ErrStageLocked`, `ErrSchemaNotEmpty`, `ErrSourceCycle`, `ErrStageIsSource` | `FailedPrecondition` |
| `ErrPresetNameTaken` | `AlreadyExists` |
| `ErrNotFound` | `NotFound` |

`ErrSourceCycle` — именно `FailedPrecondition`, а не `InvalidArgument`: сам по
себе источник валиден, невозможной делает его текущая схема.

### `testutil/fake_repo.go`

Реализация новых методов порта (`UpdateStage`, `SetStagePositions`,
`MembersCountByNomination`, `ReplaceSchema`, пять preset-методов) + in-memory
библиотека пресетов с проверкой уникальности имени.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

- **BFF** (Route Handlers, Node runtime):
  - `app/api/stages/[stageId]/route.ts` — `PATCH` → `UpdateStage`
    (`DELETE` уже есть);
  - `app/api/formats/route.ts` — `GET` → `ListFormatPresets`, `POST` (тело:
    `{name, nominationId}`) → `SaveFormatPreset`;
  - `app/api/formats/[presetId]/route.ts` — `PATCH` → `RenameFormatPreset`,
    `DELETE` → `DeleteFormatPreset`;
  - `app/api/nominations/[id]/format/route.ts` — `POST` (тело:
    `{presetId}` **либо** `{sourceNominationId}`) → `ApplyFormat`;
  - `app/api/nominations/[id]/stages/route.ts` — существующий `GET` начинает
    отдавать `issues`.
- **entities**:
  - `entities/stage/` — типы `SchemaIssue`/`FormatStageSpec`/`FormatPreset`,
    сериализация из proto (`lib/grpc/serialize.ts`), хелпер краткой подписи
    схемы пресета («Группы (2) → 2 сетки по 8») для карточки библиотеки.
- **features**:
  - `features/stage-management/` — новый диалог `edit-stage-dialog.tsx`
    (название + конфиг, поля конфига заблокированы с подсказкой, когда состав
    не пуст) и хук `use-update-stage.ts`;
  - `features/format-presets/` (новая) — `api/{keys,requests,use-presets,
    use-save-preset,use-rename-preset,use-delete-preset,use-apply-format}.ts`,
    `ui/preset-library.tsx` (список + переименование + удаление),
    `ui/save-preset-dialog.tsx`, `ui/apply-format-dialog.tsx` (выбор: пресет из
    библиотеки **или** номинация-донор; предупреждение, что схема будет
    заменена целиком).
- **widgets**:
  - `widgets/nomination-schema/` (существующий, 0019) += отрисовка
    `issues` — три визуально различимых класса (ошибка/предупреждение/
    информация, FR-8) у соответствующих этапов и общий блок над схемой. Виджет остаётся read-only: тексты приходят с сервера
    (FR-8), действия — через `renderActions`, как сейчас.
- **Страницы**:
  - `app/(admin)/admin/formats/page.tsx` — библиотека пресетов; пункт
    «Форматы» в `admin-nav.tsx` (после «Номинации»);
  - `app/(admin)/admin/nominations/[id]/stages/page.tsx` — диагностика,
    «Изменить этап», «Применить формат», «Сохранить как пресет».
- **Server components vs client**: библиотека пресетов — серверная страница с
  клиентским списком поверх TanStack Query; экран схемы — как сейчас
  (клиентский виджет поверх RQ, инвалидация ключей этапов/раскладки/сетки
  после `ApplyFormat` и `UpdateStage`).
- **State**: server-state → TanStack Query; черновики форм диалогов — локальный
  `useState` (в Zustand не выносим — живут ровно столько, сколько открыт
  диалог).

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей).

- Издаёт: нет. `PublishNominationChanged` (ADR 0012) — сигнал живого канала, не
  доменное событие; вызывается после `UpdateStage` и `ApplyFormat`, как после
  любой мутации, меняющей публичный снапшот.
- Потребляет: нет.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит (`domain/`, чистые функции)** — основная масса:
  - `ResolveStagePositions`: цепочка, две ветки от одного источника (равные
    позиции), этап без правила (позиция сохраняется — регресс-тест на AC-18
    спеки 0019), смена источника в середине цепочки, цикл → `ErrSourceCycle`;
  - `DetectSourceCycle`: прямой self-reference, цепочка длиной 3, отсутствие
    цикла;
  - `SpecFromStages`: UUID → индексы, порядок, две ветки, этап без правила,
    осиротевшая ссылка;
  - `ValidateFormatSpec`: индекс вне границ, ссылка вперёд, групповой этап с
    правилом без числа групп, пустая спецификация;
  - `DiagnoseSchema`: по одному тесту на код (9 штук) с проверкой **класса**
    (`CAPACITY_EXCEEDED` — error, `UNDERFILL`/`GAP`/`OVERLAP_UNKNOWN` —
    warning, `TAIL_UNCOVERED` — info) + «валидная схема даёт пустой срез» +
    детерминированный порядок + «оценка невозможна» при открытой границе
    (NFR-2, AC-11) + **три ветки от одного источника — ни ошибок, ни
    предупреждений** (FR-8a, AC-20) + **групповой этап на одну группу проблемой
    не считается** (AC-21) + **финал от того же источника, что и сетка, даёт
    `SELECTOR_OVERLAP`** (AC-21a).
- **Юнит (`service/` с fake-репо)**: `UpdateStage` (переименование при
  непустом составе — можно; смена конфига при непустом — `ErrStageLocked`;
  `group_count → 0` при наличии правила — `ErrInvalidRule`); `DeleteStage`
  авто-этапа (FR-5) и его гейты; `SetStageRule` с каскадом позиций;
  `SaveFormatPreset`/`ApplyFormat` (все три гейта FR-13, восстановление
  ссылок, `SyncRegistrationState`), копирование из номинации-донора.
- **E2E ручек (`api/` через httptest + Connect, fake-репо)**: шесть новых RPC —
  счастливый путь и маппинг каждой доменной ошибки в `connect.Code`; `issues`
  в `ListStages`.
- **Интеграционные (`integration/`, testcontainers)**: миграция `00004`
  применяется и откатывается; уникальность имени пресета без учёта регистра;
  `ReplaceSchema` — атомарность (сбой на середине не оставляет полусхемы),
  каскадное удаление пулов и членств, восстановление `source_stage_id`;
  полный путь «схема из трёх этапов → пресет → применение к другой номинации →
  формирование этапа по 0019».
- **Web (Vitest)**: BFF-роуты (маппинг `connect.Code` → HTTP, тело `oneof`
  источника), fetchers, диалог редактирования (блокировка полей конфига),
  диалог применения формата (предупреждение о замене), библиотека пресетов,
  отрисовка `issues` в виджете схемы на фикстурах.
- **Ручная проверка**: демо-сид — собрать схему «группы (2) → двойной
  плейофф», сохранить пресетом, применить к соседней номинации, довести до
  боёв; проверить, что публичный экран не изменился.

## Риски и открытые вопросы

- **Каскадный пересчёт позиций** (FR-3) — самое инвазивное место: позиция
  этапа без правила сохраняется, а с правилом вычисляется, и смешение двух
  режимов легко ломает сценарий 0018 (этап без правила встаёт последним).
  Митигация — регресс-тест `ResolveStagePositions` прямо на AC-18 спеки 0019 и
  прогон сценария 0018 целиком.
- **Гейт «схема не тронута»** (FR-13) считает членства по всей номинации: если
  организатор набрал состав только в первом этапе, применить пресет он не
  сможет, пока не расформирует его. Это осознанно (FR-14), но в UI обязано
  быть объяснено до нажатия, а не после.
- **jsonb без `CHECK`-ов** (миграция 00004): единственная защита от мусора в
  `stages` — `ValidateFormatSpec` на входе и на выходе. Если документ окажется
  нечитаемым (ручная правка в БД), `ListFormatPresets` должен деградировать
  предсказуемо — пресет с ошибкой разбора отдаётся с пустым списком этапов и
  пометкой, а не роняет весь список.
- **Диагностика и гейты могут разойтись**: `DiagnoseSchema` (FR-8) и проверки
  `SetStageRule`/`BuildStage` (0019) — разный код с пересекающимся смыслом.
  Митигация — коды `BAD_SOURCE`/`NO_GROUP_COUNT`/`SELECTOR_OVERLAP` проверяются
  теми же доменными предикатами, что и гейты; тест «схема с ошибкой ⇒
  формирование отклонено» держит их вместе (FR-9).
- **Библиотека пресетов глобальна, а админов несколько**: удаление чужого
  пресета никак не ограничено (RBAC знает только роль `admin`, 0007). Для
  пет-проекта приемлемо; авторство и права придут со своей спекой, если
  понадобятся.
