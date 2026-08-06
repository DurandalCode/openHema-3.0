# Plan: Плейофф-сетка с ручным посевом (playoff bracket)

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-08-03
- Спека: `./spec.md`
- Решение: `docs/adr/0014-nomination-format-stages.md` (§1, §1a, §3, §4, §8)

## Обзор решения

Фича целиком укладывается в модуль `stage` (ADR 0014, §8: схема и исполнение
живут в одном модуле) плюс два изменения в модуле `bout` на уровне порта.
Четыре решения определяют форму плана:

1. **Половина круга — это контейнер боёв, то есть строка `stage.pools`.**
   Отдельной таблицы для кругов нет: контейнер уже умеет всё, что нужно
   (арена, текущий бой, прогресс, табло, SSE — 0011/0013/0015).
   Дискриминатор не нужен — тип контейнера выводится из типа его этапа:
   контейнеры `groups`-этапа это группы, контейнеры `bracket`-этапа это
   половины кругов. Деление именно на половины (а не круг целиком и не
   произвольные куски) — структурное: до финала половины сетки не
   пересекаются, поэтому их можно вести на двух площадках одновременно
   (FR-12a), и никакая пара при этом не оказывается «разорванной» между
   контейнерами.

   `pools.number` — сквозной индекс контейнера внутри этапа, задаваемый
   чистой функцией от конфига: круг 1 верх = 1, круг 1 низ = 2, круг 2
   верх = 3, …, финал — последний из боевых кругов, бой за 3-е место (если
   включён) — следующий за ним. Круг на одну пару (финал, бронза) даёт один
   контейнер, не два.

2. **Дерево слотов не хранится — оно вычисляется.** Персистентен только
   посев первого круга; всё остальное (кто в каком слоте второго круга, где
   бай, какая пара уже разрешена) выводится чистой функцией
   `ResolveBracket(конфиг, посев, завершённые бои)`. Единственный источник
   истины продвижения — журнал боёв (ADR 0011), а не вторая копия дерева,
   которую пришлось бы синхронно править при каждом пересмотре результата
   (FR-16). По образцу `ComputeStandings`/`ComputePoolStatus` (0016/0011).

3. **Посев переиспользует членство.** Слот первого круга = строка
   `stage.pool_members` с номером слота: боец «состоит» в контейнере той
   половины первого круга, куда попал его слот, — как боец состоит в
   группе. Даром достаются этапный инвариант «не
   более одного места на этап» (0017, FR-7), реконсиляция ростера
   (`PruneMembers`, FR-22), синхронизация приёма заявок (0012/FR-21) и
   список нераспределённых — ни одну из этих механик не приходится писать
   второй раз.

4. **Материализация боёв — синхронное доменное действие этапа** (ADR 0014,
   §4): после фиксации посева и после каждого изменения состояния боя сервис
   пересчитывает сетку и приводит бои в соответствие — создаёт недостающие,
   удаляет неначатые лишние. Событийной шины не требуется.

Попутно закрываются два долга 0017: адресация состава переезжает с номинации
на этап (`nomination_id` → `stage_id` в запросах раскладки), а генерация боёв
в модуле `bout` перестаёт быть номинационной — сегодня
`ReplaceForNomination` удаляет **все** бои номинации, и с появлением второго
этапа фиксация сетки стёрла бы бои групп.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

Файл: `proto/hema/v1/stage.proto`.

`buf breaking` в CI advisory (`continue-on-error: true`), продакшена нет
(NFR-1) — переименование полей запросов делаем прямо, без версионных
плясок.

### Enum и конфиг

```proto
enum StageType {
  STAGE_TYPE_UNSPECIFIED = 0;
  STAGE_TYPE_GROUPS = 1;
  STAGE_TYPE_BRACKET = 2;      // спека 0018
}

// BracketConfig — параметры этапа-сетки (ADR 0014, §1a). size — число слотов
// первого круга (4/8/16/32); third_place — нужен ли бой за 3-е место (FR-1).
// Задаётся при создании этапа и не редактируется (FR-4).
message BracketConfig {
  int32 size = 1;
  bool third_place = 2;
}
```

### Изменённые сообщения

```proto
message Stage {
  string id = 1;
  string nomination_id = 2;
  int32 position = 3;
  string title = 4;
  StageType type = 5;
  // status — статус фиксации состава ЭТОГО этапа (0017 держал его только в
  // PoolLayout: пока этап был один, дублировать было незачем; со списком
  // этапов он нужен в каждой строке списка, FR-18).
  PoolLayoutStatus status = 6;
  // bracket — заполнен только у type = BRACKET.
  BracketConfig bracket = 7;
}

message Pool {
  // ... поля 1..10 без изменений
  // stage_id — этап-владелец контейнера (FR-18): экраны группируют
  // контейнеры по этапам, а публичный снапшот отдаёт и группы, и круги.
  string stage_id = 11;
}
```

### Новые сообщения сетки

```proto
// BracketSlotState — состояние слота: занят бойцом, пуст (бай/недобор,
// FR-9) либо ждёт победителя ещё не сыгранной пары (FR-13).
enum BracketSlotState {
  BRACKET_SLOT_STATE_UNSPECIFIED = 0;
  BRACKET_SLOT_STATE_FILLED = 1;
  BRACKET_SLOT_STATE_EMPTY = 2;
  BRACKET_SLOT_STATE_PENDING = 3;
}

// BracketSlot — один слот круга. slot — сквозной номер слота внутри круга
// (1-based); тем же именем он адресуется в SeedBracketSlot/ClearBracketSlot
// (не `position`: у Stage.position уже другой смысл — место этапа в схеме).
// source_label заполнен только у PENDING: «Победитель пары 3, 1/4 финала»
// (FR-13) — сервер формирует его сам, клиент не собирает строку из чисел.
message BracketSlot {
  int32 slot = 1;
  BracketSlotState state = 2;
  FighterRef fighter = 3;
  string source_label = 4;
}

// BracketPair — пара круга: слоты 2i-1 и 2i (FR-6). bout заполнен, только
// когда пара материализована (обе стороны известны, FR-13). resolved —
// пара разрешена: бой завершён, либо разрешение не требовало боя (бай,
// пустая пара) — из этого складывается «круг завершён» (FR-17).
message BracketPair {
  int32 index = 1;
  BracketSlot slot_a = 2;
  BracketSlot slot_b = 3;
  BoardBout bout = 4;
  bool resolved = 5;
}

// BracketHalf — половина круга: контейнер боёв (FR-12/FR-12a). half: 1 —
// верхняя, 2 — нижняя; у неделимого круга (финал, бой за 3-е место) ровно
// один элемент с half = 1 и пустым title. container — тот же Pool, что и у
// группы (members/standings пусты); с ним работают все RPC арены и табло, а
// его container.name — подпись контейнера («1/4 финала, верхняя половина»,
// FR-19a), которую видит секретарь на экране площадки.
message BracketHalf {
  int32 half = 1;
  string title = 2;          // «Верхняя половина» / «Нижняя половина» / «»
  Pool container = 3;
  repeated BracketPair pairs = 4;
  string current_bout_id = 5;
}

// BracketRound — круг сетки. number: 1 — первый круг, R — финал,
// R+1 — бой за 3-е место. halves — одна или две половины (FR-6a).
message BracketRound {
  int32 number = 1;
  string title = 2;          // «1/4 финала», «Полуфинал», «Финал», «Бой за 3-е место»
  bool third_place = 3;
  repeated BracketHalf halves = 4;
}

// Bracket — сетка целиком: этап + круги. unassigned заполняется только на
// админском пути (кого ещё можно посеять, FR-7); в публичном снапшоте
// пуст. champion/third_place_winner — отображение, выведенное из
// завершённых боёв (FR-20), не доменный факт: протокол и призёры — 0021.
message Bracket {
  Stage stage = 1;
  repeated BracketRound rounds = 2;
  repeated FighterRef unassigned = 3;
  bool can_undo = 4;
  FighterRef champion = 5;
  FighterRef third_place_winner = 6;
}
```

### RPC

`StageAdminService` — новые:

| RPC | Запрос → ответ | Смысл |
| --- | -------------- | ----- |
| `ListStages` | `nomination_id` → `repeated Stage` | Список этапов номинации (FR-18). Материализует групповой этап, если строки ещё нет (снимает долг 0017 «виртуальный этап с пустым id»). |
| `CreateStage` | `nomination_id`, `type`, `title`, `BracketConfig` → `Stage created`, `repeated Stage stages` | Добавить этап (FR-2): созданный этап + обновлённый список (клиенту не нужен второй round-trip). В этом инкременте принимается только `BRACKET`; `GROUPS` → `InvalidArgument`. |
| `DeleteStage` | `stage_id` → `repeated Stage` | Удалить этап-сетку (FR-3). |
| `GetBracket` | `stage_id` → `Bracket` | Админский вид сетки (FR-7/FR-19). Чтение — без материализации боёв. |
| `SeedBracketSlot` | `stage_id`, `slot`, `fighter_id` → `Bracket` | Посадить бойца в слот (FR-7/FR-8). |
| `ClearBracketSlot` | `stage_id`, `slot` → `Bracket` | Освободить слот (FR-8). |

`StageAdminService` — изменённые (адресация `nomination_id` → `stage_id`,
FR-18): `GetLayout`, `CreatePool`, `ResetLayout`, `AssignFighter`,
`UnassignFighter`, `AutoDistribute`, `Undo`, `SetLayoutStatus`.
`ResetLayout`/`Undo`/`SetLayoutStatus` работают с обоими типами этапов;
`CreatePool`/`AutoDistribute` на `bracket`-этапе отклоняются
(`FailedPrecondition`). RPC вокруг контейнера (`SeatPoolOnArena`,
`UnseatPool`, `GetPoolsForArena`, `GetBoutBoard`, `*CurrentBout`,
табло/таймер 0015) **не меняются вовсе** — контейнер адресуется своим id, и
круг для них неотличим от группы (FR-12).

`StagePublicService`:

- `NominationLiveSnapshot` += `repeated Bracket brackets = 4;` — сетки
  номинации (FR-19). Заполняются только для зафиксированных этапов, как
  `pools` (0014, FR-12).
- `ListPublicPools` отдаёт только контейнеры **групповых** этапов: сетка
  публикуется через `brackets`, а не как список безымянных пулов.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

### Модуль `stage` — расширение

Межмодульные зависимости и их направления не меняются (`stage → fighter`,
`stage → bout`, `stage → arena`, `stage → nomination`). Новых портов нет:
у `BoutConductor` появляются два метода.

#### `domain/bracket.go` (новый файл) — чистое ядро сетки

```go
type BracketConfig struct {
    Size       int  // 4/8/16/32
    ThirdPlace bool
}

// Seed — посев одного слота первого круга (строка pool_members со slot).
type Seed struct {
    Slot    int
    Fighter FighterRef
}

// BracketBout — уже материализованный бой круга (вход резолва). Round/Pair
// восстанавливаются из координат контейнера (номер круга + половина) и
// sequence_number боя внутри контейнера: Pair = смещение половины +
// sequence (см. PairOfBout).
type BracketBout struct {
    Round, Pair    int
    ID             string
    A, B           FighterRef
    State          BoutState
    ScoreA, ScoreB int
}

type SlotState string // "filled" | "empty" | "pending"

type Slot struct {
    Number      int    // номер слота внутри круга, 1-based (proto: slot)
    State       SlotState
    Fighter     FighterRef
    SourceLabel string // «Победитель пары 3, 1/4 финала» у pending (FR-13)
}

type Pair struct {
    Index    int
    A, B     Slot
    Expected bool  // требуется бой: обе стороны filled
    Resolved bool  // бой завершён | бай | обе стороны пусты
    Bout     *BracketBout
}

// Half — половина круга = контейнер боёв (FR-12/FR-12a). Number — 1 или 2;
// у неделимого круга единственная половина с Number = 1.
type Half struct {
    Number          int
    Title           string // «Верхняя половина» / «Нижняя половина» / «»
    ContainerNumber int    // pools.number контейнера (ContainerNumberOf)
    Pairs           []Pair
}

type Round struct {
    Number     int
    Title      string
    ThirdPlace bool
    Halves     []Half // 1 или 2
}

type BracketView struct {
    Config           BracketConfig
    Rounds           []Round
    Champion         FighterRef
    ThirdPlaceWinner FighterRef
}

// ResolveBracket — чистая функция (FR-6/FR-9/FR-13/FR-14/FR-17):
// посев + материализованные бои → полное дерево слотов.
func ResolveBracket(cfg BracketConfig, seeds []Seed, bouts []BracketBout) BracketView

// RoundTitle — «Финал» (2 слота), «Полуфинал» (4), «1/4 финала» (8),
// «1/8 финала» (16), «1/16 финала» (32) — FR-5.
func RoundTitle(slotCount int) string

// RoundCount возвращает число боевых кругов (log2(size)); бой за 3-е место
// живёт кругом R+1 и в это число не входит.
func RoundCount(size int) int

// ValidBracketSize — размер допустим (степень двойки в [4..32], FR-1).
func ValidBracketSize(size int) bool

// --- координаты контейнеров (FR-6a/FR-12a) ---

// HalvesInRound — сколько контейнеров у круга: 2, если пар ≥ 2, иначе 1.
func HalvesInRound(cfg BracketConfig, round int) int

// ContainerNumberOf — pools.number контейнера (round, half): сквозная
// нумерация в порядке круг → половина, бой за 3-е место последним.
func ContainerNumberOf(cfg BracketConfig, round, half int) int

// ContainerCoords — обратное отображение: pools.number → (round, half).
func ContainerCoords(cfg BracketConfig, containerNumber int) (round, half int, ok bool)

// PairOfBout — глобальный номер пары в круге по половине и порядковому
// номеру боя внутри контейнера: (half-1)*парВПоловине + sequence.
func PairOfBout(cfg BracketConfig, round, half, sequence int) int

// HalfOfSlot — половина первого круга, которой принадлежит слот посева
// (слоты 1..size/2 — верхняя, остальные — нижняя): по ней SeedSlot
// выбирает контейнер-владельца членства.
func HalfOfSlot(cfg BracketConfig, slot int) int

// ContainerTitle — подпись контейнера (FR-19a): «1/4 финала, верхняя
// половина», «Финал», «Бой за 3-е место». Ложится в Pool.Name — там, где
// у группы стоит «Пул N»; строку формирует сервер, клиент её не собирает.
func ContainerTitle(cfg BracketConfig, containerNumber int) string

// SourceLabel — подпись пары-источника для нерешённого слота (FR-13):
// «Победитель пары 3, 1/4 финала». Ссылается на пару предыдущего круга, а
// не на «бой N»: нумерация боёв внутри контейнера своя у каждой половины.
func SourceLabel(cfg BracketConfig, round, pair int) string
```

Правила `ResolveBracket` (они же — таблица юнит-тестов):

1. Круг `r` имеет `size / 2^(r-1)` слотов и вдвое меньше пар; слоты пары
   `p` — это `2p-1` и `2p` (FR-6). Пары делятся поровну между верхней и
   нижней половиной круга (FR-6a); круг из одной пары половин не имеет.
2. Круг 1 заполняется посевом: слот занят → `filled`, иначе `empty`.
3. Слот `p` круга `r+1` — разрешение пары `p` круга `r`:
   - обе стороны `filled`: бой завершён → победитель (`filled`), иначе
     `pending` с меткой `SourceLabel(cfg, r, p)` (FR-13);
   - ровно одна сторона `filled` → этот боец (**бай**, FR-9), пара
     `Resolved`, бой не нужен;
   - обе стороны пусты → `empty`, пара `Resolved` (бай каскадится, FR-9).
4. Бой за 3-е место (если включён) — круг `R+1` на 2 слота: слот 1 —
   проигравший пары 1 полуфинала, слот 2 — пары 2. Полуфинал, разрешённый
   баем, проигравшего не даёт → слот `empty` (и тогда бронза достаётся
   второму без боя, а при двух пустых — не разыгрывается вовсе).
5. `Expected` = обе стороны `filled` — ровно те пары, у которых должен
   существовать бой.
6. Половина круга завершена ⟺ все её пары `Resolved`; круг завершён ⟺
   завершены обе половины (FR-17).
7. `Champion` — победитель финала, `ThirdPlaceWinner` — победитель круга
   `R+1` (FR-20); при бае — тот, кто прошёл без боя.

#### `domain/domain.go` — дополнения

- `StageTypeBracket StageType = "bracket"`; `Stage` += `Bracket BracketConfig`.
- Новые ошибки: `ErrStageTypeMismatch` (операция не применима к типу этапа,
  напр. `AutoDistribute` на сетке), `ErrDrawNotAllowed` (FR-15),
  `ErrDownstreamStarted` (FR-16), `ErrSlotOccupied` (FR-8),
  `ErrStageNotDeletable` (FR-3: групповой этап / есть начатые бои),
  `ErrNotEnoughSeeds` (FR-11).
- `UndoState`: снапшот `reset` начинает нести слоты —
  `ResetPool{Number int; Members []ResetMember}`,
  `ResetMember{FighterID string; Slot int}` (0 — без слота, группы).
  Форма JSONB меняется; продакшена нет, старые снапшоты не мигрируем.
- `Pool` += `StageID` (уже читается репозиторием, теперь отдаётся наружу).
- Порт `Repository` += `CreateStage`, `DeleteStage`, `MaxStagePosition`,
  `SeedSlot`, `SeedsByStage`, `DeleteContainers`; у `PruneMembers`
  появляется исключение для зафиксированных сеток (FR-22, см. ниже).
- Порт `BoutConductor` += `ScheduleBout(ctx, nominationID, poolID string,
  round, sequence int, a, b FighterRef) (string, error)` и
  `DeleteBouts(ctx, boutIDs []string) error`.

#### `service/bracket.go` (новый файл) — юзкейсы сетки

- `CreateStage(ctx, nominationID, title string, cfg BracketConfig)` —
  валидирует размер (FR-1), ставит `position = max+1`, создаёт этап и **два
  контейнера первого круга** (верхняя и нижняя половина, `number` 1 и 2);
  они же держат посев своей половины слотов.
- `DeleteStage(ctx, stageID)` — гейты: тип `bracket` (FR-3) и
  `AnyStartedInPools(контейнеры этапа)`; удаляет бои этапа
  (`ClearForPools`), затем строку этапа (контейнеры и членства уходят
  каскадом БД).
- `SeedBracketSlot(ctx, stageID, slot, fighterID)` — только в `draft`;
  слот в диапазоне `1..size`; контейнер-владелец членства выбирается по
  `HalfOfSlot`. Занятый слот: если сажаемый боец уже сидит в другом слоте
  этого этапа — **обмен местами** (FR-8, в т.ч. между разными половинами —
  тогда меняются и контейнеры членств), иначе `ErrSlotOccupied`. Дальше —
  как `AssignFighter`: синхронизация приёма заявок (FR-21) и очистка undo.
- `ClearBracketSlot(ctx, stageID, slot)` — идемпотентно, как
  `UnassignFighter`.
- `GetBracket(ctx, stageID)` — чтение: посев + бои контейнеров →
  `ResolveBracket` → обогащение контейнеров (`enrichPools`: статус, арена) +
  `unassigned` (активный ростер минус посеянные в этом этапе). **Ничего не
  материализует.**
- `syncBracket(ctx, stage)` — приведение боёв к резолву (единственное место,
  создающее и удаляющее бои сетки):
  1. контейнеры этапа + их бои → `ResolveBracket` (координаты пары
     восстанавливаются через `ContainerCoords` + `PairOfBout`);
  2. `Expected`-пара без боя → `ScheduleBout(контейнер своей половины,
     round=r, sequence = номер пары внутри половины, A, B)`;
  3. бой есть, но пара больше не `Expected` **или** состав пары изменился
     (последствие пересмотра, FR-16) → `DeleteBouts`, если бой не начат;
  4. возвращает свежий `BracketView`.
  Вызывается из `SetStatus(ready)`, `FinishCurrentBout`,
  `ReopenCurrentBout`, `ResetCurrentBout` — то есть отовсюду, где меняется
  множество завершённых боёв.
- Статус контейнера сетки: `ComputePoolStatus` получает знаменатель не из
  «сколько боёв материализовано», а из резолва — `finished` только когда
  все пары **этой половины** `Resolved` (FR-17). Реализуется тонкой
  обёрткой `computeHalfStatus(layoutStatus, arenaID, half Half, progress)`
  рядом с `ComputePoolStatus`, которая для групп не меняется.

#### `service/service.go` — правки существующего

- Все методы раскладки принимают `stageID` вместо `nominationID`
  (`stageForWrite` вырождается в `StageByID` + проверку существования);
  `nominationID` берётся из этапа. `ListStages` — единственное место, где
  сохраняется `EnsureStage` (материализация группового этапа): админский
  путь всегда начинается со списка этапов, поэтому дальше `stage.id`
  гарантированно непустой. Публичные чтения `stagesForRead` остаются
  как в 0017 — виртуальный этап с пустым `id`, если строки ещё нет: гость
  не адресует этап, а сеток у номинации без строки в `stages` быть не
  может по построению.
- `CreatePool`/`AutoDistribute`: `ErrStageTypeMismatch` для `bracket`.
- `SetStatus`:
  - `groups` — как сегодня (`GenerateForStage`/`ClearForPools`);
  - `bracket` `draft → ready`: гейт «посеяно ≥ 2» (FR-11) → создать
    контейнеры всех половин кругов `2..R` (+ `R+1` при бронзе) →
    `syncBracket`;
  - `bracket` `ready → draft`: существующие гейты (контейнер на арене,
    `AnyStartedInPools` — FR-10) → `ClearForPools(все контейнеры этапа)` →
    `DeleteContainers(контейнеры кругов ≥ 2)`; обе половины первого круга
    и посев остаются.
- `FinishCurrentBout`: для `bracket` — гейт ничьей (FR-15), затем
  `syncBracket`.
- `ReopenCurrentBout` / `ResetCurrentBout`: для `bracket` — гейт
  `ErrDownstreamStarted` (FR-16): у пары `(r, p)` смотрим пару
  `(r+1, ⌈p/2⌉)`, а для полуфинала при включённой бронзе ещё и пару круга
  `R+1`; если там есть начатый бой — отказ. Иначе действие + `syncBracket`
  (снимет неначатый бой следующего круга).
- `NominationLive`: `pools` — контейнеры групповых этапов, `brackets` —
  резолв каждого зафиксированного `bracket`-этапа (без `unassigned`).
- `hasDistributedAcrossStages` не меняется: посев — это членство (решение 3),
  значит FR-21 работает сам собой.
- **`PruneMembers` перестаёт трогать зафиксированные сетки** (FR-22).
  Побочный эффект решения 3: посев — это членство, а реконсиляция ростера
  чистит членства **на любом чтении** раскладки, независимо от статуса. Для
  групп это безобидно (бои держат снапшот участников и остаются), а для
  сетки — нет: исчезнувший посев меняет результат `ResolveBracket`, пара
  становится баем, и `syncBracket` снёс бы неначатый бой. Поэтому условие
  удаления сужается: `... AND NOT (тип этапа = bracket AND статус = ready)`.
  Гарантия «черновик реконсилируется как раньше» и «зафиксированная сетка
  не переигрывается сама» — оба случая под тестом (AC-16).

#### `repo/`

- `queries/stage.sql` += `CreateStage`, `DeleteStage`, `MaxStagePosition`,
  `SeedsByStage`, `SeedSlot` (транзакция обмена/посадки),
  `DeleteContainers`; `AssignFighter` получает параметр `slot`;
  `PruneMembers` — исключение зафиксированных сеток (FR-22).
- `make sqlc` → `repo/sqlc/*`.

#### `migrations/00002_bracket.sql` (goose)

История схемы, в отличие от 0017, **не переписывается**: переименований нет,
обычная эволюция отдельным файлом.

```sql
-- +goose Up
-- Тип этапа расширяется вторым значением (спека 0018, FR-1).
ALTER TABLE stage.stages DROP CONSTRAINT chk_stages_type;
ALTER TABLE stage.stages ADD CONSTRAINT chk_stages_type
    CHECK (type IN ('groups','bracket'));

-- Конфиг этапа-сетки (ADR 0014, §1a): две скалярные настройки —
-- отдельными колонками, а не jsonb: их можно проверить CHECK-ом, а
-- типизированный jsonb оправдан там, где полей много и они разнородны
-- (метаданные номинации, 0003). Когда конфигов станет больше (0020) —
-- переезд на jsonb отдельным шагом.
ALTER TABLE stage.stages ADD COLUMN bracket_size  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stage.stages ADD COLUMN third_place   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stage.stages ADD CONSTRAINT chk_stages_bracket
    CHECK ((type = 'groups'  AND bracket_size = 0 AND third_place = false)
        OR (type = 'bracket' AND bracket_size IN (4,8,16,32)));

-- Слот посева (FR-7): членство в контейнере первого круга + номер слота.
-- NULL — членство группы (слотов там нет). Уникальность слота — в пределах
-- контейнера; уникальность бойца в пределах этапа уже обеспечена
-- uq_members_stage_fighter (0017, FR-7).
ALTER TABLE stage.pool_members ADD COLUMN slot INTEGER NULL;
ALTER TABLE stage.pool_members ADD CONSTRAINT chk_members_slot
    CHECK (slot IS NULL OR slot >= 1);
CREATE UNIQUE INDEX uq_members_pool_slot
    ON stage.pool_members (pool_id, slot) WHERE slot IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS stage.uq_members_pool_slot;
ALTER TABLE stage.pool_members DROP CONSTRAINT IF EXISTS chk_members_slot;
ALTER TABLE stage.pool_members DROP COLUMN IF EXISTS slot;
ALTER TABLE stage.stages DROP CONSTRAINT IF EXISTS chk_stages_bracket;
ALTER TABLE stage.stages DROP COLUMN IF EXISTS third_place;
ALTER TABLE stage.stages DROP COLUMN IF EXISTS bracket_size;
ALTER TABLE stage.stages DROP CONSTRAINT IF EXISTS chk_stages_type;
ALTER TABLE stage.stages ADD CONSTRAINT chk_stages_type CHECK (type IN ('groups'));
```

Таблиц не добавляется вовсе: круги — строки `stage.pools`, слоты —
`stage.pool_members`, дерево — вычисляемое (решения 1–3).

#### `api/handler.go`

- **Имя контейнера переезжает из `api` в домен.** Сегодня подпись собирает
  `api/handler.go` (`poolName(number)` → «Пул N»), и это работало, пока
  имя зависело только от номера. Подпись контейнера сетки зависит от
  конфига этапа (`ContainerTitle`), которого у мапперов нет, — поэтому
  `Pool.Name` заполняет сервис при обогащении (`enrichPools`), а `api`
  просто отдаёт готовую строку. Для групп результат прежний, «Пул N»
  (FR-23); для сетки — «1/4 финала, верхняя половина» (FR-19a).
- Новые хендлеры под шесть RPC + маппинг новых ошибок:
  `ErrStageTypeMismatch`/`ErrDrawNotAllowed`/`ErrDownstreamStarted`/
  `ErrSlotOccupied`/`ErrStageNotDeletable`/`ErrNotEnoughSeeds` →
  `connect.CodeFailedPrecondition`; невалидный размер/слот →
  `CodeInvalidArgument`.
- Мапперы `bracketToProto` (слоты/пары/круги/чемпион), `stageToProto`
  (+`status`/`bracket`), `poolToProto` (+`stage_id`).

### Модуль `bout` — порт и репозиторий

- `Repository.ReplaceForNomination` → **`ReplaceForPools(ctx, poolIDs
  []string, bouts []Bout)`**: удаление адресуется пулами этапа, а не
  номинацией. Это не косметика: сегодняшний номинационный replace при
  фиксации второго этапа стёр бы бои первого (0017 оставила это допустимым,
  пока этап один, — 0018 это условие ломает).
- `Repository.ScheduleBouts(ctx, bouts []Bout) error` — вставка проекции +
  события `scheduled` без удаления чего-либо (материализация пары сетки).
- `Repository.DeleteBouts(ctx, ids []string) error` — точечное удаление
  потока (снятие продвижения, FR-16).
- `service`: `GenerateForStage` теперь зовёт `ReplaceForPools`; новые
  `ScheduleBout` (один бой, `domain.Scheduled` как первое событие) и
  `DeleteBouts`.
- Домен `bout` **не меняется**: ни новых состояний, ни опциональных
  участников — сетка материализует бой только с обоими бойцами (ADR 0014,
  §4/альтернатива E). Ничья остаётся допустимой в домене боя — запрет
  живёт в `stage`, потому что это правило сетки, а не боя (FR-15).

### Wiring

- `internal/platform/stage_bout_conductor.go` — адаптер получает
  `ScheduleBout`/`DeleteBouts` (маппинг ошибок как у существующих методов).
- `internal/platform` регистрация модулей не меняется.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

### Маршруты страниц

- `(admin)/admin/nominations/[id]/stages/page.tsx` — список этапов номинации
  + «Добавить этап» (FR-2/FR-18).
- `(admin)/admin/nominations/[id]/stages/[stageId]/page.tsx` — работа с
  составом выбранного этапа: групповой → существующий экран раскладки,
  сетка → экран посева/сетки. Тип этапа известен серверному компоненту из
  `ListStages`, поэтому нужный виджет выбирается на сервере, без лишнего
  round-trip.
- `(admin)/admin/nominations/[id]/pools/page.tsx` — **удаляется**; ссылки в
  списке номинаций ведут на `/stages` (NFR-1: совместимость адресов не
  требуется).
- `nominations/[id]/page.tsx` (публичный) — рендерит группы (как сейчас) и
  сетки из живого снапшота (FR-19).

### BFF (Route Handlers, Node runtime)

- Новые: `app/api/nominations/[id]/stages/route.ts` (GET список, POST
  создать), `app/api/stages/[stageId]/route.ts` (DELETE),
  `app/api/stages/[stageId]/{layout,pools,reset,assign,unassign,distribute,undo,status}/route.ts`,
  `app/api/stages/[stageId]/bracket/route.ts`,
  `app/api/stages/[stageId]/seed/route.ts` (POST `{fighterId, slot}`,
  DELETE `{slot}`).
- Удаляются: `app/api/nominations/[id]/pool-*` (переезд адресации).
- Не меняются: `app/api/pools/[poolId]/*` (seat/unseat/current-bout/bout) и
  всё вокруг арен/табло — контейнер адресуется своим id (FR-12).
- `lib/grpc/serialize.ts`: `stageToJson` += `status`/`bracket`;
  `poolToJson` += `stageId`; новые `bracketToJson` (слоты/пары/круги),
  `nominationLiveToJson` += `brackets`.

### Слои

- `entities/stage/lib/types.ts` — `StageType` += `"bracket"`, `Stage` +=
  `status`, `bracket?: BracketConfig`.
- `entities/bracket/` (новая сущность) — `lib/types.ts` (`Bracket`,
  `BracketRound`, `BracketPair`, `BracketSlot`), `lib/labels.ts` (подписи
  состояний слота). Отдельно от `entities/pool`: сетка — самостоятельное
  понятие, живущее и в админке, и на публичном экране.
- `widgets/bracket-view/` — отображение сетки кругами (общее для админа и
  гостя, read-only): круг → его половины → пары, счёт, состояние, площадка
  каждой половины, чемпион и бронза (FR-19/FR-20). Половина — визуально
  отдельный блок со своим статусом и площадкой, иначе параллельное ведение
  на двух аренах читается как каша. Горизонтальная прокрутка по кругам и
  вертикальный стек пар — сетка на 32 не должна ломать телефон (NFR-2).
- `features/stage-management/` — `api/` (список/создание/удаление этапа),
  `ui/` (карточки этапов, диалог создания: название, размер, флаг бронзы).
- `features/bracket-seeding/` — `api/` (посев/освобождение слота, reset,
  undo, фиксация), `ui/` (DnD-посев на `@dnd-kit`, по образцу
  `features/nomination-pools`: слева нераспределённые, справа пары первого
  круга, сгруппированные по половинам; слот — droppable).
- `features/nomination-pools/` — переезд запросов на `stage_id`
  (`requests.ts`, ключи RQ, хуки); UI меняется минимально.
- `features/nomination-live/` — снапшот получает `brackets`; публичный
  виджет рендерит `widgets/bracket-view` рядом с группами.
- Server components vs client: страницы этапов — серверные обёртки
  (номинация + список этапов), состав/сетка — клиентские (DnD, живые
  данные).
- State: server-state — TanStack Query (ключи `["stage", stageId, ...]`
  вместо `["nomination", id, "layout"]`), живой канал — существующий SSE
  (0014), UI-state (открытый диалог создания этапа) — локальный.

## События

> Placeholder. Отдельного EDD-ADR фича не требует.

- Издаёт: новых событий нет. Продвижение победителя — синхронное доменное
  действие внутри модуля `stage` (ADR 0014, §4). Существующий сигнал живой
  шины `PublishNominationChanged` (ADR 0012) публикуется после мутаций
  сетки — публичный экран перечитывает снапшот, включая `brackets`.
- Потребляет: нет.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит, `modules/stage/domain/bracket_test.go`** (чистые функции, ядро
  фичи — самый плотный тестовый файл инкремента):
  - размеры 4/8/16/32: число кругов, слотов и пар; `RoundTitle`;
  - координаты контейнеров: `ContainerNumberOf`/`ContainerCoords` —
    взаимно обратны на всех размерах; круг из одной пары даёт одну
    половину, финал и бронза — по одному контейнеру; `PairOfBout` и
    `HalfOfSlot` согласованы с делением пар (FR-6a);
  - полный посев без баёв: круг 1 — все пары `Expected`, круги дальше —
    `pending`;
  - недобор: 6 из 8 — пары с одним бойцом дают бай в следующий круг и
    `Resolved` без боя (AC-3);
  - каскад бая: пара из двух пустых слотов → пустой слот следующего круга;
  - продвижение: завершённый бой пары `p` ставит победителя в слот `p`
    следующего круга; вторая сторона остаётся `pending` со своей меткой
    `SourceLabel`, пока её пара не сыграна (AC-7);
  - бронза: проигравшие полуфиналов встают в отдельный круг `R+1` (AC-10);
    полуфинал-бай проигравшего не даёт;
  - `Champion`/`ThirdPlaceWinner` после завершения финала и бронзы (AC-11);
  - «половина завершена» = все её пары `Resolved`, в т.ч. разрешённые баем;
    круг завершён ⟺ завершены обе половины (FR-17).
- **Юнит, `modules/stage/service/bracket_test.go`** (fake-репо + fake
  `BoutConductor`):
  - создание этапа: позиция `max+1`, две половины первого круга, валидация
    размера (AC-1); `GROUPS` отклоняется;
  - обе половины круга ставятся на разные площадки одновременно и ведутся
    независимо — существующие `SeatPoolOnArena`/`GetBoutBoard` без правок
    (AC-5a, FR-12a);
  - удаление: запрещено для группового этапа и при начатых боях (AC-14);
  - посев: занятый слот — обмен для уже посеянного, `ErrSlotOccupied` для
    нового (FR-8); боец из группы другого этапа доступен (AC-2);
  - фиксация: `< 2` посеянных → `ErrNotEnoughSeeds` (AC-4); иначе создаются
    контейнеры кругов и бои только полных пар (AC-3);
  - завершение боя материализует следующую пару, когда известны обе
    стороны (AC-7);
  - ничья в сетке отклоняется, в группе — нет (AC-6);
  - `Reopen`/`Reset`: неначатый бой следующего круга удаляется (AC-8);
    начатый — отказ `ErrDownstreamStarted` (AC-9);
  - расфиксация: удаляет бои и круги ≥ 2, посев остаётся (AC-13);
  - `AutoDistribute`/`CreatePool` на сетке → `ErrStageTypeMismatch`;
  - приём заявок закрывается посадкой в слот (AC-15);
  - реконсиляция ростера: в черновике вывод бойца освобождает слот, в
    зафиксированной сетке — не трогает ни посев, ни бои (AC-16, FR-22);
  - подпись контейнера: «Пул N» у группы, «1/4 финала, верхняя половина» у
    сетки (FR-19a) — включая список готовых контейнеров для площадки.
- **Юнит, `modules/bout/service/service_test.go`**: `GenerateForStage`
  через `ReplaceForPools` **не трогает бои пулов другого этапа той же
  номинации** (регресс на латентный баг 0017); `ScheduleBout` создаёт поток
  с событием `scheduled`; `DeleteBouts` удаляет только перечисленные.
- **E2E ручек, `modules/stage/api/handler_test.go`**: шесть новых RPC
  (счастливый путь + коды ошибок); существующие RPC на `stage_id`;
  `GetNominationLive` отдаёт `brackets`.
- **Интеграционные, `modules/stage/integration/`** (testcontainers):
  миграция `00002` применяется; `uq_members_pool_slot` не даёт двух бойцов
  в одном слоте; `chk_stages_bracket` не пропускает `groups` с размером;
  удаление этапа каскадит контейнеры и членства; посев переживает
  фиксацию/расфиксацию.
- **Web (Vitest)**: сериализаторы (`bracketToJson`, `stageId`, `brackets`);
  новые BFF-роуты (маппинг `connect.Code` → HTTP); `widgets/bracket-view`
  (пары, «победитель боя N», чемпион, пустой слот как «бай»);
  `features/bracket-seeding` (drop в слот → запрос, занятый слот);
  `features/stage-management` (создание/удаление).
- **Ручная проверка на реальном стеке**: `make migrate` + расширенный
  демо-сид (`cmd/demo-bouts` добавляет номинации этап-сетку с частично
  сыгранными кругами) → пройти AC-5/AC-11/AC-12 в браузере: круг на арене,
  табло, публичный экран, продвижение победителя без перезагрузки.

## Риски и открытые вопросы

- **`ReplaceForNomination` — латентный баг, который включается этой фичей.**
  Пока у номинации один этап, номинационный replace безвреден; со вторым
  этапом фиксация сетки стёрла бы бои групп. Правка порта (`ReplaceForPools`)
  обязана попасть в тот же инкремент, а тест-регресс на «не задеть соседний
  этап» — в модуль `bout`, а не только в `stage`.
- **Наименование «пул» для контейнера.** Круг сетки становится строкой
  `stage.pools` — ровно та дезориентация, против которой ADR 0014 §3
  переименовывал модуль. Переименование сущности (`pool` → контейнер) — это
  ~1300 вхождений только в `web/src` плюс `pool_id` в event-sourced журнале
  боя: механический инкремент собственного размера, смешивать его с
  доменной фичей нельзя. Долг признан и вынесен в «Вне скоупа» спеки;
  кандидат на отдельную спеку перед 0020.
- **Вычисляемое дерево вместо хранимого.** Резолв читает бои всех
  контейнеров этапа на каждое чтение сетки. При ≤ 32 слотах (≤ 31 бой)
  это дешевле любой синхронизации второй копии, но если появятся сетки на
  128+, понадобится кеш проекции.
- **Пересчёт после пересмотра результата.** `syncBracket` удаляет
  неначатые бои с изменившимся составом — единственное место, где бой
  исчезает вместе со своим журналом. Гейт `ErrDownstreamStarted` обязан
  стоять **до** действия, иначе можно потерять начатый бой.
- **Имя контейнера на экране арены** (FR-19a). Список «готовых контейнеров
  для постановки» (0011, FR-9) собран из разных номинаций и теперь содержит
  половины кругов. Без внятной подписи («Лонгсворд open — 1/4 финала,
  верхняя половина») секретарь поставит на площадку не ту половину. Риск не
  в самой строке, а в её месте: сегодня подпись живёт в `api`, и там нет
  конфига этапа — переезд в сервис обязателен, иначе появится второй
  источник имени.
- **Реконсиляция ростера против вычисляемого дерева** (FR-22). Посев —
  это членство, а `PruneMembers` чистит членства на любом чтении: без
  исключения для зафиксированных сеток снятие одного бойца тихо
  переигрывало бы плейофф. Исключение сужает существующий запрос, то есть
  трогает общий с группами код — регресс «в черновике всё как раньше»
  обязателен.
- **Бронза при баях в полуфинале.** Возможны состояния «бронза без боя» и
  «бронза не разыгрывается» — это следствие ручного посева неполной сетки,
  а не ошибка. UI обязан показывать их словами, а не пустым местом.
- **Объём web-правок.** Переезд адресации на `stage_id` трогает все
  запросы и RQ-ключи раскладки плюс удаляет ветку `pool-*` BFF-роутов.
  Риск не в логике, а в объёме: любое изменившееся *поведение* групповой
  раскладки — сигнал ошибки (FR-23), а не ожидаемый результат.
- **Отображение сетки на 32 слота.** NFR-2 — единственное требование, где
  «работает» и «читаемо» расходятся; проверять на реальном телефоне, а не
  только в DevTools.
