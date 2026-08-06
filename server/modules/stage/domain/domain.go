package domain

import (
	"context"
	"errors"
	"strings"
)

// Доменные ошибки. Слой api мапит их в connect.Code.
var (
	// ErrNotFound — пул или раскладка не найдены.
	ErrNotFound = errors.New("pool: not found")
	// ErrInvalidInput — некорректные входные данные (пустые id, недопустимый
	// целевой статус).
	ErrInvalidInput = errors.New("pool: invalid input")
	// ErrNotDraft — операция разрешена только в статусе draft (FR-10/FR-11).
	ErrNotDraft = errors.New("pool: layout is not in draft")
	// ErrNoPools — автораспределение отклонено: в номинации нет ни одного
	// пула (FR-7).
	ErrNoPools = errors.New("pool: no pools to distribute into")
	// ErrNothingToUndo — undo-данных нет (FR-7a).
	ErrNothingToUndo = errors.New("pool: nothing to undo")

	// ErrNotReady — постановка на арену отклонена: пул не в статусе «готов»
	// (раскладка не ready, спека 0011, FR-7).
	ErrNotReady = errors.New("pool: not ready to be seated")
	// ErrArenaBusy — арена уже ведёт другой пул (FR-6). Возвращается и при
	// проигрыше гонки на partial unique index uq_pools_arena (NFR-4).
	ErrArenaBusy = errors.New("pool: arena is already busy")
	// ErrAlreadySeated — пул уже стоит на (какой-то) арене — сначала снять
	// (FR-5, AC-7).
	ErrAlreadySeated = errors.New("pool: already seated on an arena")
	// ErrPoolSeated — расфиксация раскладки (ready → draft) отклонена: хотя
	// бы один пул номинации стоит на арене (FR-3, AC-3).
	ErrPoolSeated = errors.New("pool: a pool of this nomination is seated on an arena")
	// ErrArenaNotAvailable — арена не найдена или архивна: постановку не
	// принимает (FR-7/FR-9).
	ErrArenaNotAvailable = errors.New("pool: arena is not available")

	// Спека 0013: ведение текущего боя пула на арене.

	// ErrPoolNotSeated — ведение боя отклонено: пул не стоит на арене
	// (FR-12, AC-13). Начать/вести бой, циркулировать по пулу можно только
	// у пула на арене.
	ErrPoolNotSeated = errors.New("pool: pool is not seated on an arena")
	// ErrNoCurrentBout — у пула нет текущего боя, вести нечего (пул без
	// боёв — <2 бойцов, спека 0010 FR-4).
	ErrNoCurrentBout = errors.New("pool: no current bout to conduct")
	// ErrHasResults — расфиксация раскладки (ready → draft) отклонена: хотя
	// бы один бой номинации уже начат/проведён — есть результат, который
	// пересборка состава сотрёт (FR-13, AC-12).
	ErrHasResults = errors.New("pool: nomination has bouts with results")
	// ErrInvalidTransition — запрошенный переход ЖЦ боя недопустим в его
	// текущем состоянии (например, ввести счёт боя, который не идёт, AC-4).
	// Пул-локальный сентинел, соответствующий по смыслу одноимённой ошибке
	// модуля bout (план «Модуль pool»): адаптер BoutConductor в
	// internal/platform (join-волна) мапит ошибку bout в эту — api модуля
	// pool не зависит от типов ошибок модуля bout (ADR 0002).
	ErrInvalidTransition = errors.New("pool: invalid bout state transition")
	// ErrConcurrency — конфликт версии потока боя при параллельном ведении
	// (ADR 0011 п.3, AC-15): после прозрачного повтора на стороне
	// bout/adapter конфликт остался неустранимым.
	ErrConcurrency = errors.New("pool: concurrent bout modification conflict")

	// Спека 0018: этап-сетка с ручным посевом (ADR 0014 §1a/§3/§4).

	// ErrStageTypeMismatch — операция не применима к типу этапа (например,
	// AutoDistribute/CreatePool на сетке, план «service/service.go»).
	ErrStageTypeMismatch = errors.New("pool: operation not applicable to this stage type")
	// ErrDrawNotAllowed — завершение боя сетки с равным счётом отклонено:
	// ничья в сетке недопустима (FR-15, AC-6).
	ErrDrawNotAllowed = errors.New("pool: a draw is not allowed in a bracket stage")
	// ErrDownstreamStarted — пересмотр результата (reopen/reset) отклонён:
	// следующий бой победителя уже начат, результат уже «уехал» дальше
	// (FR-16, AC-9).
	ErrDownstreamStarted = errors.New("pool: the downstream bout has already started")
	// ErrSlotOccupied — посадка бойца в занятый слот сетки отклонена: слот
	// сначала освобождают, либо (для уже посеянного бойца) действие
	// становится обменом местами (FR-8).
	ErrSlotOccupied = errors.New("pool: slot is already occupied")
	// ErrStageNotDeletable — удаление этапа отклонено: групповой этап
	// удалить нельзя, этап-сетку — только пока в ней нет начатых боёв
	// (FR-3, AC-14).
	ErrStageNotDeletable = errors.New("pool: stage is not deletable")
	// ErrNotEnoughSeeds — фиксация посева отклонена: посеяно меньше двух
	// бойцов, сетка из одного участника не разыгрывает ничего (FR-11, AC-4).
	ErrNotEnoughSeeds = errors.New("pool: not enough seeded fighters to lock the bracket")

	// Спека 0019: переходы между этапами (ADR 0014 §5-7).

	// ErrNoSeedingRule — PreviewStageBuild/BuildStage вызваны на этапе без
	// установленного правила отбора: формировать нечего, состав набирается
	// руками (FR-1, FR-13).
	ErrNoSeedingRule = errors.New("pool: stage has no seeding rule")
	// ErrInvalidRule — SeedingRule.Validate: недопустимые значения полей
	// правила (source_kind/selector/method, границы мест, FR-2..FR-4). Тем
	// же сентинелом отклоняется правило для ЦЕЛЕВОГО группового этапа без
	// заданного числа групп — авто-этап и любой явный groups-этап, которому
	// не задан group_count (FR-9a, AC-20): формировать было бы некуда.
	ErrInvalidRule = errors.New("pool: invalid seeding rule")
	// ErrSourceNotAllowed — ИСТОЧНИК правила не подходит: не найден, не та
	// номинация, не групповой этап, либо стоит не раньше целевого этапа по
	// позиции (FR-2, AC-21).
	ErrSourceNotAllowed = errors.New("pool: seeding rule source is not allowed")
	// ErrSelectorOverlap — селекторы параллельных веток одного источника
	// пересекаются: формирование отклонено, кто-то попал бы в обе ветки
	// (FR-11, AC-3).
	ErrSelectorOverlap = errors.New("pool: selector overlaps with a parallel branch")
	// ErrCapacityExceeded — отобранных больше, чем вмещает целевой этап
	// (слотов сетки), формирование отклонено (FR-19, AC-11).
	ErrCapacityExceeded = errors.New("pool: selected fighters exceed target stage capacity")
	// ErrTieUnresolved — формирование отклонено: остался неразрешённый
	// дележ мест на границе отбора (FR-22).
	ErrTieUnresolved = errors.New("pool: a tie at the selection boundary is unresolved")
	// ErrStageNotEmpty — повторное формирование поверх непустого состава
	// (в том числе поправленного руками) отклонено: сначала расформировать
	// (FR-18, AC-10).
	ErrStageNotEmpty = errors.New("pool: stage build target already has members")
	// ErrRuleLocked — правило отбора редактируется, только пока состав
	// этапа пуст; после набора/формирования — отклонено (FR-6, AC-16).
	ErrRuleLocked = errors.New("pool: seeding rule is locked once the stage has members")
	// ErrStageIsSource — удаление этапа отклонено: он служит источником для
	// другой ветки — сначала удаляют ветку (FR-7a, AC-19).
	ErrStageIsSource = errors.New("pool: stage is a source for another stage")
)

// LayoutStatus — статус раскладки номинации целиком (FR-9). Урезан спекой
// 0011 до двух значений: заглушки active/finished (спека 0009 «Вне скоупа»)
// убраны — исполнительная фаза («готовится к запуску» и далее) принадлежит
// отдельному пулу (см. PoolStatus), не раскладке целиком.
type LayoutStatus string

const (
	LayoutDraft LayoutStatus = "draft"
	LayoutReady LayoutStatus = "ready"
)

// PoolStatus — статус отдельного пула (спека 0011, FR-1): не готов → готов →
// готовится к запуску → идёт → завершён. В этом инкременте реализованы
// переходы только not_ready/ready (синхронны со статусом раскладки) и
// preparing (пул поставлен на арену); active/finished — задел под будущий
// ЖЦ боя (ЕДД), не назначаются нигде в этом инкременте.
type PoolStatus string

const (
	PoolStatusNotReady  PoolStatus = "not_ready"
	PoolStatusReady     PoolStatus = "ready"
	PoolStatusPreparing PoolStatus = "preparing"
	PoolStatusActive    PoolStatus = "active"
	PoolStatusFinished  PoolStatus = "finished"
)

// ComputePoolStatus вычисляет статус отдельного пула из статуса раскладки
// номинации, факта постановки на арену и прогресса его боёв (спека 0011,
// наполнено спекой 0013 FR-10, план «Модуль pool», решение 4). Порядок
// правил:
//  1. layout draft -> not_ready — независимо от прогресса/арены;
//  2. total>0 && finished==total -> finished — независимо от arenaID: снятие
//     пула с арены сохраняет результаты боёв (FR-11), поэтому завершённый
//     пул остаётся finished даже будучи снятым;
//  3. started>0 (и не все бои завершены) -> active;
//  4. arenaID непуст (started==0) -> preparing — пул на арене, ведение ещё
//     не начиналось (в т.ч. пул с total==0: вести нечего, но статус остаётся
//     preparing, а не finished — «Пул с 0 боёв на арене остаётся готовится к
//     запуску»);
//  5. иначе (ready, не на арене, started==0) -> ready.
//
// Чистая функция — юнит-тестируется без fake-портов.
func ComputePoolStatus(layout LayoutStatus, arenaID string, started, finished, total int) PoolStatus {
	if layout != LayoutReady {
		return PoolStatusNotReady
	}
	if total > 0 && finished == total {
		return PoolStatusFinished
	}
	if started > 0 {
		return PoolStatusActive
	}
	if strings.TrimSpace(arenaID) != "" {
		return PoolStatusPreparing
	}
	return PoolStatusReady
}

// UndoKind — вид последнего mutating-действия, доступного для отката (FR-7a).
// Undo относится к трём классам действий: автораспределение, удаление пула и
// сброс раскладки.
type UndoKind string

const (
	UndoNone       UndoKind = ""
	UndoAuto       UndoKind = "auto"
	UndoDeletePool UndoKind = "delete_pool"
	UndoReset      UndoKind = "reset"
	// UndoBuild — откат формирования этапа (спека 0019, FR-21): снапшот
	// пуст — состояние до формирования гарантированно пустое (FR-18,
	// повторное формирование поверх непустого состава отклонено), поэтому
	// откат сводится к очистке состава этапа.
	UndoBuild UndoKind = "build"
)

// ResetMember — один боец в снапшоте пула на момент сброса раскладки
// (спека 0018): слот, в котором он стоял, если пул принадлежит этапу-сетке.
// Slot == 0 — членство без слота (группа, спека 0017 и ранее).
type ResetMember struct {
	FighterID string
	Slot      int
}

// ResetPool — снапшот одного пула номинации на момент сброса раскладки (для
// UndoReset): номер пула + его бойцы (со слотами — спека 0018, FR-8).
// Восстановление пересоздаёт пул с тем же номером и членствами (AC-13a4).
type ResetPool struct {
	Number  int
	Members []ResetMember
}

// UndoState — снапшот последнего undoable-действия раскладки.
type UndoState struct {
	Kind UndoKind
	// FighterIDs — для UndoAuto: кого расставило авто (вернуть в
	// нераспределённые); для UndoDeletePool: члены удалённого пула на момент
	// удаления (восстановить вместе с пулом).
	FighterIDs []string
	// PoolNumber — для UndoDeletePool: номер удалённого пула (восстановить
	// под тем же номером/именем, FR-3).
	PoolNumber int
	// Pools — для UndoReset: снапшот всех пулов номинации на момент сброса
	// (восстановить все пулы с их бойцами и слотами, AC-13a4, спека 0018).
	Pools []ResetPool
}

// StageType — тип этапа номинации (спека 0017, FR-3; ADR 0014 §1/§3):
// групповой (круговая система внутри групп, механика 0009/0010/0016) или
// сетка на выбывание (плейофф, спека 0018, FR-1).
type StageType string

const (
	StageTypeGroups  StageType = "groups"
	StageTypeBracket StageType = "bracket"
)

// DefaultStageTitle — название авто-создаваемого группового этапа (спека
// 0017, FR-4).
const DefaultStageTitle = "Групповой этап"

// Stage — этап номинации (спека 0017, FR-1). Status/Undo переезжают сюда с
// раскладки номинации целиком (FR-6): это ровно то, чем была pool_layouts —
// владелец статуса фиксации состава и undo-снапшота, — плюс идентичность
// (Position/Title/Type) и принадлежность номинации.
//
// Bracket — параметры этапа-сетки (спека 0018, FR-1); заполнен только у
// Type == StageTypeBracket, у группового этапа — нулевое значение.
//
// Rule/Groups — спека 0019: правило отбора (FR-1, нулевое значение — «правила
// нет», состав набирается руками) и число групп (FR-8, только у явно
// созданного группового этапа — у авто-этапа и у этапа-сетки нулевое).
type Stage struct {
	ID           string
	NominationID string
	Position     int
	Title        string
	Type         StageType
	Status       LayoutStatus
	Undo         UndoState
	Bracket      BracketConfig
	Rule         SeedingRule
	Groups       GroupsConfig
}

// PoolMember — сырое членство: боец в пуле (репозиторное чтение, без
// обогащения именем/клубом). Комбинируется службой с bare-пулами из
// PoolsByStage/PoolsByNomination (по аналогии с тем, как repo раньше сам
// объединял ListPoolsByNomination + ListMembersByNomination).
type PoolMember struct {
	PoolID    string
	FighterID string
}

// Layout — раскладка одного этапа номинации: статус, нераспределённые,
// пулы. CanUndo — доступна ли кнопка «Отменить» на экране (FR-7a). Stage —
// этап, которому принадлежит раскладка (спека 0017, FR-11): при отсутствии
// строки в БД — виртуальный этап с пустым ID (см. service.stageForRead).
type Layout struct {
	NominationID string
	Stage        Stage
	Status       LayoutStatus
	Unassigned   []FighterRef
	Pools        []Pool
	CanUndo      bool
}

// ---------------------------------------------------------------------
// Спека 0018: сетка целиком для внешнего представления (service/api
// граница, FR-19). Отдельно от BracketView (bracket.go) — то чистый
// результат ResolveBracket (Slot.Fighter — что дано на входе, Pair.Bout —
// внутренний BracketBout резолва); эти типы обогащены для показа: Fighter в
// Slot уже содержит имя/клуб (сервис передаёт в ResolveBracket уже
// обогащённые посев и бои), Bout в BracketPairView — это BoutRef, та же
// проекция, что у BoutBoard/LivePool (совместим с api-маппером
// toProtoBoardBouts без отдельного варианта), а Container — обогащённый
// Pool (статус/арена/имя), как в Layout.Pools.
// ---------------------------------------------------------------------

// BracketPairView — пара круга для внешнего представления (FR-13/FR-17):
// слоты — как в чистом резолве (Slot из bracket.go), Bout — обогащённая
// проекция боя (nil, если пара ещё не материализована).
type BracketPairView struct {
	Index    int
	A, B     Slot
	Bout     *BoutRef
	Resolved bool
}

// BracketHalfView — половина круга для внешнего представления (FR-12/
// FR-12a/FR-19a): тот же контейнер (Pool), что и у группы — с обогащённым
// статусом (FR-17, знаменатель — разрешённые пары, не материализованные
// бои) и подписью (ContainerTitle).
type BracketHalfView struct {
	Number        int
	Title         string
	Container     Pool
	Pairs         []BracketPairView
	CurrentBoutID string
}

// BracketRoundView — круг сетки для внешнего представления.
type BracketRoundView struct {
	Number     int
	Title      string
	ThirdPlace bool
	Halves     []BracketHalfView
}

// Bracket — сетка целиком: этап + круги (FR-19). Unassigned заполняется
// только на админском пути (кого ещё можно посеять, FR-7); в публичном
// снапшоте пуст (NominationLive). Champion/ThirdPlaceWinner — отображение,
// выведенное из завершённых боёв (FR-20), не доменный факт.
type Bracket struct {
	Stage            Stage
	Rounds           []BracketRoundView
	Unassigned       []FighterRef
	CanUndo          bool
	Champion         FighterRef
	ThirdPlaceWinner FighterRef
}

// ArenaPools — данные для страницы конкретной арены (спека 0011, FR-9): пул,
// который сейчас на ней стоит (если есть), и список готовых пулов,
// доступных для постановки.
type ArenaPools struct {
	// Seated — пул на арене, nil если арена сейчас свободна.
	Seated *Pool
	// Available — пулы в статусе «готов», ещё не поставленные ни на одну
	// арену (кандидаты для постановки).
	Available []Pool
}

// Repository — порт доступа к хранилищу раскладки (PG-схема stage). Пулы
// возвращаются с «сырыми» членствами (Members[i].ID заполнен, Name/Club —
// нет): обогащение данными бойца — работа service через
// ActiveFightersProvider (модули не делят данные напрямую, ADR 0002).
//
// Спека 0017: раскладка принадлежит этапу, а не номинации целиком (FR-5).
// Мутирующие методы адресуются по stageID (EnsureStage/stageForWrite
// резолвит его от nominationID на входе в сервис); чтения, показывающие
// номинацию целиком (публичный экран, живой снапшот, реконсиляция ростера),
// остаются номинационными (FR-9) — см. PoolsByNomination/MembersByNomination/
// PruneMembers ниже.
type Repository interface {
	// GetPool возвращает один пул по id (включая StageID/NominationID/
	// ArenaID — для резолва этапа/раскладки перед мутацией по запросам без
	// явного stage_id).
	GetPool(ctx context.Context, poolID string) (Pool, error)

	// CreatePool вставляет пул с заданным number в указанный этап,
	// очищает undo этапа. Возвращает созданный пул.
	CreatePool(ctx context.Context, stageID string, number int) (Pool, error)
	// DeletePool атомарно удаляет пул (каскадом членства) и записывает
	// undo-снапшот его этапа (kind=delete_pool, number+fighter_ids
	// удалённого пула). Этап резолвится от пула — poolID уникален, явного
	// stageID не требуется.
	DeletePool(ctx context.Context, poolID string) error
	// ResetLayout атомарно удаляет все пулы этапа (каскадом членства) и
	// записывает undo-снапшот всех пулов с их членствами (kind=reset),
	// гарантирует статус draft (FR-4a, undoable — FR-7a).
	ResetLayout(ctx context.Context, stageID string) error
	// AssignFighter кладёт бойца в пул: upsert членства по (stage_id,
	// fighter_id) — move одним действием, если боец уже был в другом пуле
	// этого этапа (спека 0017, FR-7: тот же боец в пуле другого этапа той
	// же номинации не трогается). Очищает undo этапа. slot — номер слота
	// сетки (спека 0018, FR-7); 0 у группового этапа, где слотов нет.
	AssignFighter(ctx context.Context, stageID, fighterID, poolID string, slot int) error
	// UnassignFighter убирает бойца из пула этапа, если он там был
	// (идемпотентно). Очищает undo этапа.
	UnassignFighter(ctx context.Context, stageID, fighterID string) error
	// ApplyAutoDistribute атомарно применяет assignments (insert членств) и
	// записывает undo этапа (kind=auto, fighter_ids = кого расставило).
	ApplyAutoDistribute(ctx context.Context, stageID string, assignments []Assignment) error
	// UndoAuto удаляет членства перечисленных fighterIDs в этапе (возврат в
	// нераспределённые) и очищает undo.
	UndoAuto(ctx context.Context, stageID string, fighterIDs []string) error
	// UndoDeletePool пересоздаёт пул этапа с тем же number и восстанавливает
	// членства fighterIDs, очищает undo.
	UndoDeletePool(ctx context.Context, stageID string, number int, fighterIDs []string) error
	// UndoReset пересоздаёт все пулы этапа из снапшота с теми же номерами и
	// восстанавливает их членства, очищает undo (AC-13a4).
	UndoReset(ctx context.Context, stageID string, pools []ResetPool) error
	// PruneMembers удаляет членства бойцов номинации (по всем её этапам,
	// спека 0017, FR-9), которых нет среди activeFighterIDs (FR-15). Не
	// мутирует undo: реконсиляция — не admin-действие в смысле FR-7a, а
	// системное подчищение. Остаётся номинационным намеренно.
	PruneMembers(ctx context.Context, nominationID string, activeFighterIDs []string) error
	// SetStatus задаёт статус этапа (draft/ready), очищает undo (FR-9,
	// FR-7a — смена статуса мутирует раскладку).
	SetStatus(ctx context.Context, stageID string, status LayoutStatus) error

	// EnsureStage — get-or-create единственного этапа номинации (спека
	// 0017, FR-4): при отсутствии создаёт строку с position=0,
	// type=StageTypeGroups, title=DefaultStageTitle, status=draft; при
	// наличии — возвращает существующую как есть. Только для мутирующих
	// путей (stageForWrite) — GetLayout не должен писать в БД.
	EnsureStage(ctx context.Context, nominationID string) (Stage, error)
	// StageByNomination — чтение без создания (found=false, если строки
	// нет). Вызывающий (stageForRead) трактует found=false как виртуальный
	// этап — ровно как отсутствие строки раскладки трактовалось как пустой
	// draft (спека 0009, решение №9).
	StageByNomination(ctx context.Context, nominationID string) (Stage, bool, error)
	// StageByID резолвит этап по его id — используется там, где этап
	// известен через пул (pool.StageID), а не через nominationID
	// (SeatPoolOnArena: разные пулы номинации могут в будущем принадлежать
	// разным этапам, план «Модуль stage»).
	StageByID(ctx context.Context, stageID string) (Stage, bool, error)
	// StagesByNomination возвращает все этапы номинации (для публичных
	// ответов, repeated stages) — начиная со спеки 0018 может быть больше
	// одного (групповой + одна или несколько сеток).
	StagesByNomination(ctx context.Context, nominationID string) ([]Stage, error)
	// StagesBySource возвращает соседние ветки, питающиеся от того же
	// источника (спека 0019): проверка пересечения селекторов (FR-11,
	// ErrSelectorOverlap) и гейт удаления источника, пока ветка существует
	// (FR-7a, ErrStageIsSource).
	StagesBySource(ctx context.Context, sourceStageID string) ([]Stage, error)

	// CreateStage вставляет новый этап номинации (спека 0018, FR-2; спека
	// 0019 — groups/rule): позицию (`max+1`, MaxStagePosition либо
	// position(источника)+1, FR-10) вычисляет вызывающий — репозиторий
	// только пишет переданные значения. type теперь может быть и
	// StageTypeGroups (явно созданный групповой этап, FR-7) — не только
	// StageTypeBracket, как было в 0018.
	CreateStage(ctx context.Context, nominationID string, position int, title string, stageType StageType, bracket BracketConfig, groups GroupsConfig, rule SeedingRule) (Stage, error)
	// SetSeedingRule пишет правило отбора этапа и его пересчитанную позицию
	// (спека 0019, FR-6/FR-10), очищает undo: вызывающий (service.
	// SetStageRule) гейтит пустоту состава (ErrRuleLocked), валидность
	// источника (ErrSourceNotAllowed) и вычисляет position до вызова —
	// репозиторий только пишет переданные значения.
	SetSeedingRule(ctx context.Context, stageID string, rule SeedingRule, position int) error
	// ApplyStageBuild атомарно применяет план формирования этапа (спека
	// 0019, FR-16): создаёт группы (для группового целевого этапа) и/или
	// членства (со слотами — для сетки), записывает undo_kind=UndoBuild.
	// Гейты (состав пуст, нет дележей/пересечений, вместимость) проверяет
	// вызывающий (service.BuildStage) до вызова.
	ApplyStageBuild(ctx context.Context, stageID string, groups []BuildGroup, seeds []SeedPlan) error
	// DeleteStage удаляет этап вместе с его контейнерами и членствами
	// (каскад БД) — гейты (тип bracket, нет начатых боёв) проверяет
	// вызывающий (service.DeleteStage) до вызова (FR-3, AC-14).
	DeleteStage(ctx context.Context, stageID string) error
	// MaxStagePosition возвращает наибольшую position среди этапов
	// номинации (0, если этапов ещё нет) — CreateStage встаёт под max+1
	// (FR-2).
	MaxStagePosition(ctx context.Context, nominationID string) (int, error)

	// SeedSlot сажает бойца в слот первого круга сетки (спека 0018,
	// FR-7/FR-8): upsert членства (containerPoolID, fighterID, slot).
	// Занятый слот — обязанность вызывающего (service.SeedBracketSlot)
	// развести на обмен/отказ *до* вызова.
	SeedSlot(ctx context.Context, stageID, containerPoolID, fighterID string, slot int) error
	// SeedsByStage возвращает текущий посев первого круга этапа (слот →
	// боец) — сырые членства с непустым slot, по обоим контейнерам первого
	// круга.
	SeedsByStage(ctx context.Context, stageID string) ([]Seed, error)
	// DeleteContainers удаляет контейнеры (пулы) по id, каскадом членства —
	// расфиксация сетки удаляет так круги >= 2 (посев первого круга
	// остаётся), DeleteStage — все контейнеры этапа целиком.
	DeleteContainers(ctx context.Context, poolIDs []string) error

	// PoolsByStage возвращает bare-пулы этапа (без обогащённых членств —
	// см. MembersByStage) для админ-раскладки одного этапа (loadLayout).
	PoolsByStage(ctx context.Context, stageID string) ([]Pool, error)
	// MembersByStage возвращает сырые членства (pool_id/fighter_id) этапа —
	// комбинируется службой с PoolsByStage.
	MembersByStage(ctx context.Context, stageID string) ([]PoolMember, error)
	// PoolsByNomination возвращает bare-пулы номинации целиком, по всем её
	// этапам (спека 0017, FR-9: публичный экран и живой снапшот показывают
	// номинацию целиком, а не один этап).
	PoolsByNomination(ctx context.Context, nominationID string) ([]Pool, error)
	// MembersByNomination возвращает сырые членства номинации целиком, по
	// всем её этапам — комбинируется службой с PoolsByNomination.
	MembersByNomination(ctx context.Context, nominationID string) ([]PoolMember, error)

	// SeatPool закрепляет пул за площадкой (готов → готовится к запуску,
	// спека 0011, FR-7). Атомарно: полагается на partial unique index
	// uq_pools_arena при гонке параллельной постановки на ту же арену —
	// конфликт мапится в ErrArenaBusy (FR-6, NFR-4).
	SeatPool(ctx context.Context, poolID, arenaID string) error
	// UnseatPool снимает пул с площадки (готовится к запуску → готов,
	// FR-8). Идемпотентно: пул, не стоящий ни на одной арене, не даёт
	// ошибку.
	UnseatPool(ctx context.Context, poolID string) error
	// PoolsForArena возвращает пул, стоящий на арене (found=false, если
	// арена сейчас свободна, спека 0011, FR-9).
	PoolsForArena(ctx context.Context, arenaID string) (pool Pool, found bool, err error)
	// ReadyUnseatedPools возвращает все пулы в статусе «готов» (раскладка их
	// этапа ready), ещё не поставленные ни на одну арену — кандидаты для
	// постановки (FR-9).
	ReadyUnseatedPools(ctx context.Context) ([]Pool, error)
	// AnySeatedInStage — стоит ли хотя бы один пул этапа на арене (гейт
	// FR-8 спеки 0017, было AnySeatedInNomination: расфиксация раскладки
	// запрещена, пока пул ЭТОГО этапа на арене — занятость арены пулом
	// другого этапа той же номинации не блокирует).
	AnySeatedInStage(ctx context.Context, stageID string) (bool, error)
	// SetCurrentBout записывает указатель текущего боя пула (спека 0013,
	// FR-7/FR-8/FR-9): boutID пуст — указатель сбрасывается (нет
	// непроведённых боёв после авто-продвижения, AC-10).
	SetCurrentBout(ctx context.Context, poolID, boutID string) error
}

// ActiveFightersProvider — межмодульная зависимость: активный ростер
// номинации через API модуля fighter (без прямого доступа к его PG-схеме,
// ADR 0002). Направление зависимости — только pool → fighter.
type ActiveFightersProvider interface {
	ActiveFightersByNomination(ctx context.Context, nominationID string) ([]FighterRef, error)
}

// BoutPoolInput — состав одного пула на момент фиксации раскладки
// (`draft → ready`), вход генерации боёв (спека 0010). Fighters — уже
// обогащённые активные бойцы пула (то, что loadLayout кладёт в
// Layout.Pools[i].Members).
type BoutPoolInput struct {
	PoolID   string
	Fighters []FighterRef
}

// BoutState — состояние отдельного боя, проекция для доски ведения (спека
// 0013, FR-1). Собственный тип pool (не переиспользует bout.domain.BoutState
// — модули не делят типы напрямую, ADR 0002).
type BoutState string

const (
	BoutStateNotStarted BoutState = "not_started"
	BoutStateInProgress BoutState = "in_progress"
	BoutStateFinished   BoutState = "finished"
)

// BoutRef — проекция одного боя пула для оркестрации ведения (спека 0013):
// то, что нужно pool, чтобы собрать доску ведения (BoardBout в proto) и
// резолвить текущий бой — без доступа к PG-схеме bout (ADR 0002).
type BoutRef struct {
	ID             string
	RoundNumber    int
	SequenceNumber int
	FighterA       FighterRef
	FighterB       FighterRef
	State          BoutState
	ScoreA         int
	ScoreB         int
}

// BoutBoard — доска ведения боёв одной арены (спека 0013, FR-14): стоящий
// на ней пул (обогащённый — Status/ArenaName/NominationName/Members), его
// бои по порядку проведения (0010, отсортированы по SequenceNumber) и
// эффективный текущий бой. CurrentBoutID пуст, если у пула нет боёв (0010,
// FR-4) или все бои завершены без последующего непроведённого (AC-10).
type BoutBoard struct {
	Pool          Pool
	Bouts         []BoutRef
	CurrentBoutID string
}

// BoutConductor — межмодульная зависимость: жизненный цикл боя и
// формирование/очистка боёв пулов этапа через API модуля bout (без прямого
// доступа к его PG-схеме, ADR 0002). Направление зависимости — только
// stage → bout (спека 0010, «Обзор решения», расширено спекой 0013,
// переадресовано на пулы этапа спекой 0017).
//
// GenerateForStage/ClearForPools — SetStatus вызывает GenerateForStage на
// переходе draft → ready этапа, ClearForPools — на переходе ready → draft
// (гейтится AnyStartedInPools, FR-13/спека 0017 FR-8). GenerateForStage
// сохраняет nominationID: он не адресует (это по-прежнему пулы этапа), а
// штампуется в payload события Scheduled — бой по-прежнему принадлежит
// номинации (спека 0017, план «Обзор решения»). ClearForPools адресуется
// списком id пулов этого этапа — не трогает бои пулов другого этапа той же
// номинации (регресс-гарантия спеки 0017).
//
// Start/Score/Finish/Reopen/ResetBout — лайфсайкл-команды текущего боя
// (спека 0013, FR-1/FR-4..FR-6): делегируются сервисом stage после резолва
// эффективного текущего боя пула. actorID — кто выполнил действие (для
// журнала боя, ADR 0011, NFR-1). ScoreBout принимает абсолютные значения
// счёта (план «Способ выражения счёта»: команда идемпотентна, шаги ±N —
// клиентская арифметика поверх текущего счёта из доски).
//
// BoutsByPool/PoolProgress/AnyStartedInPools — чтения для доски и
// вычисляемого статуса пула (FR-10).
//
// Ошибки: реализация мапит доменные ошибки bout в ErrInvalidTransition/
// ErrConcurrency этого пакета (см. комментарий у этих сентинелов) либо в
// ErrNotFound (boutID не существует).
type BoutConductor interface {
	GenerateForStage(ctx context.Context, nominationID string, pools []BoutPoolInput) error
	ClearForPools(ctx context.Context, poolIDs []string) error

	// ScheduleBout материализует один бой пары сетки (спека 0018, FR-14):
	// создаёт бой в контейнере poolID с заданными координатами
	// (round/sequence — порядковый номер боя внутри контейнера, спека 0010)
	// и участниками; возвращает id созданного боя. В отличие от
	// GenerateForStage — точечная вставка, ничего не удаляет.
	ScheduleBout(ctx context.Context, nominationID, poolID string, round, sequence int, a, b FighterRef) (string, error)
	// DeleteBouts точечно удаляет перечисленные бои (снятие продвижения при
	// пересмотре результата, FR-16) — в отличие от ClearForPools, не
	// трогает остальные бои контейнера.
	DeleteBouts(ctx context.Context, boutIDs []string) error

	StartBout(ctx context.Context, boutID, actorID string) error
	ScoreBout(ctx context.Context, boutID, actorID string, scoreA, scoreB int) error
	FinishBout(ctx context.Context, boutID, actorID string) error
	ReopenBout(ctx context.Context, boutID, actorID string) error
	ResetBout(ctx context.Context, boutID, actorID string) error

	// BoutsByPool возвращает бои пула (id/раунд/порядок/пара/состояние/
	// счёт), порядок не гарантирован — сервис stage сортирует по
	// SequenceNumber сам (см. service.sortedBySequence).
	BoutsByPool(ctx context.Context, poolID string) ([]BoutRef, error)
	// PoolProgress — сколько всего боёв у пула, сколько начато (state ≠
	// not_started) и сколько завершено (FR-10).
	PoolProgress(ctx context.Context, poolID string) (total, started, finished int, err error)
	// AnyStartedInPools — есть ли среди перечисленных пулов хотя бы один
	// бой со state ≠ not_started (гейт FR-13/спека 0017 FR-8, AC-12). Пустой
	// список — валидный вход, no-op → false.
	AnyStartedInPools(ctx context.Context, poolIDs []string) (bool, error)
}

// ---------------------------------------------------------------------
// Спека 0014: публичный живой снапшот номинации (bout state/score/outcome +
// исполнительный статус пула на экране номинации).
// ---------------------------------------------------------------------

// LiveNotifier — publish-сторона порта живой шины (спека 0014, ADR 0012):
// сигнал без payload — «публичный снапшот этой номинации мог измениться,
// перечитайте». Не событийная шина (нет типов событий/полезной нагрузки).
type LiveNotifier interface {
	PublishNominationChanged(nominationID string)
}

// LiveSubscriber — subscribe-сторона порта живой шины (спека 0014, ADR
// 0012). Возвращает канал сигналов по топику nominationID и функцию отписки
// (вызывающий обязан вызвать её по завершении подписки — освобождает
// ресурсы шины).
type LiveSubscriber interface {
	SubscribeNomination(nominationID string) (<-chan struct{}, func())
}

// LiveBus — обе стороны порта живой шины вместе. Service — единственный
// держатель этой зависимости (по аналогии с остальными межмодульными
// портами этого файла): AdminHandler/PublicHandler держат только
// *service.Service, ничего больше — сервис сам публикует после мутаций и
// прокидывает подписку наружу через тонкий passthrough-метод
// (Service.SubscribeNomination) для стримингового хендлера. Реальный
// адаптер к pkg/livebus.Bus подключается в internal/platform отдельной
// join-волной (не в этом модуле, ADR 0002/0012).
type LiveBus interface {
	LiveNotifier
	LiveSubscriber
}

// LivePool — один пул живого снапшота номинации (спека 0014, FR-1..FR-3):
// сам пул (состав/статус/арена — как обогащает service.enrichPools), его
// бои по порядку проведения со состоянием/счётом и эффективный текущий бой.
type LivePool struct {
	Pool          Pool
	Bouts         []BoutRef
	CurrentBoutID string
}

// NominationSnapshot — живой снапшот номинации целиком (спека 0014). Pools —
// только контейнеры ГРУППОВЫХ этапов (спека 0018); пуст, пока групповой
// этап в статусе draft (FR-12) — публично нечего показывать, как и
// ListPublicPools. Brackets — сетки номинации (спека 0018, FR-19),
// заполнены только для зафиксированных (ready) bracket-этапов, без
// unassigned (публичный путь не показывает админский посев). Stages —
// этапы номинации (спека 0017, FR-11): не менее одного элемента
// (виртуальный singleton, если строк в БД ещё нет — см. service.stagesForRead).
type NominationSnapshot struct {
	NominationID string
	Stages       []Stage
	Pools        []LivePool
	Brackets     []Bracket
}

// ArenaRef — проекция площадки для постановки пула (спека 0011, план
// «Обзор решения»): идентификатор, (резолвленное) имя, активна ли (архивная
// арена постановку не принимает, FR-9).
type ArenaRef struct {
	ID     string
	Name   string
	Active bool
}

// ArenaProvider — межмодульная зависимость: резолв площадок через API
// модуля arena (без прямого доступа к его PG-схеме, ADR 0002). Направление
// зависимости — только pool → arena (спека 0011, «Обзор решения»).
type ArenaProvider interface {
	// ArenaByID возвращает площадку по id (для валидации постановки —
	// активна ли, спека 0011, FR-7/FR-9). service мапит любую ошибку в
	// ErrArenaNotAvailable.
	ArenaByID(ctx context.Context, id string) (ArenaRef, error)
	// ArenasByIDs — батч-резолв имён площадок (для обогащения списков
	// пулов, ListPublicPools/GetPoolsForArena). Отсутствующие id в ответе
	// просто не встречаются в карте.
	ArenasByIDs(ctx context.Context, ids []string) (map[string]ArenaRef, error)
	// DefaultDurationSeconds возвращает персистентный дефолт длительности
	// таймера табло арены (спека 0015): используется для инициализации/
	// сброса таймера у авторитетного табло и как default_duration_seconds
	// в ArenaLiveSnapshot. Владелец значения — модуль arena (ADR 0002);
	// сама длительность таймера при этом недоменная и не хранится модулем
	// pool (ADR 0013).
	DefaultDurationSeconds(ctx context.Context, arenaID string) (int, error)
}

// NominationRef — проекция номинации для обогащения пулов именем номинации
// (по аналогии с ArenaRef, спека 0011, FR-9: список «готовых пулов для
// постановки» собран из разных номинаций — без имени номинации на экране
// арены пулы с одинаковым номером неотличимы).
type NominationRef struct {
	ID    string
	Title string
}

// NominationProvider — межмодульная зависимость: резолв названий номинаций
// через API модуля nomination (без прямого доступа к его PG-схеме, ADR
// 0002). Направление зависимости — только pool → nomination.
type NominationProvider interface {
	// NominationsByIDs — батч-резолв имён номинаций (для обогащения списков
	// пулов). Отсутствующие id в ответе просто не встречаются в карте —
	// service оставляет NominationName пустым, не падая.
	NominationsByIDs(ctx context.Context, ids []string) (map[string]NominationRef, error)
	// SyncRegistrationState уведомляет nomination о текущем факте «есть ли у
	// номинации хотя бы один распределённый по пулам боец» (спека 0012,
	// FR-5/FR-6/FR-10). Вызывается после каждой pool-мутирующей операции,
	// способной изменить число распределённых бойцов — сервис сам решает,
	// когда звать (по результирующему состоянию, не по имени RPC).
	SyncRegistrationState(ctx context.Context, nominationID string, hasDistributedFighters bool) error
}

// ---------------------------------------------------------------------
// Спека 0015: недоменный таймер табло арены (ADR 0013 — сервер как реле).
// Комната живая (в памяти процесса, эфемерна, без PG) — эти типы описывают
// только форму данных, которыми обмениваются участники комнаты; сама
// комната — service.arenaRooms (не domain: не переживает рестарт процесса,
// не персистентная сущность в смысле остального пакета domain).
// ---------------------------------------------------------------------

// ScoreboardRole — роль подключённого к живой комнате арены участника:
// табло (полноэкранный зрительский экран, участвует в ordinal/source) или
// панель управления ареной (this_ordinal всегда 0, никогда не источник).
type ScoreboardRole string

const (
	ScoreboardRoleScoreboard ScoreboardRole = "scoreboard"
	ScoreboardRolePanel      ScoreboardRole = "panel"
)

// TimerStatus — состояние недоменного таймера табло (спека 0015, FR-9).
// Источник истины — авторитетное табло (клиент); сервер лишь ретранслирует
// и кеширует последний присланный кадр (ADR 0013).
type TimerStatus string

const (
	TimerStatusStopped TimerStatus = "stopped"
	TimerStatusRunning TimerStatus = "running"
	TimerStatusPaused  TimerStatus = "paused"
	TimerStatusExpired TimerStatus = "expired"
)

// TimerCommandKind — команды панели управления таймером (спека 0015, FR-7).
type TimerCommandKind string

const (
	TimerCommandStart  TimerCommandKind = "start"
	TimerCommandPause  TimerCommandKind = "pause"
	TimerCommandReset  TimerCommandKind = "reset"
	TimerCommandAdjust TimerCommandKind = "adjust"
)

// TimerCommand — команда таймера, ретранслируемая сервером от панели
// авторитетному табло (спека 0015, FR-7). AmountSeconds — знаковое смещение,
// используется только для TimerCommandAdjust (±1/±2/±3/±5).
type TimerCommand struct {
	Kind          TimerCommandKind
	AmountSeconds int32
}

// TimerFrame — полное состояние таймера в момент SampledUnixMS по часам
// авторитетного табло (спека 0015, «синхроним полное время»). RemainingCS —
// сантисекунды (сотые доли секунды); DefaultCS — текущий дефолт комнаты
// (сантисекунды). Followers доводят локально между кадрами (клиентское
// сглаживание) — сервер математику таймера не считает (ADR 0013).
type TimerFrame struct {
	Status        TimerStatus
	RemainingCS   int32
	SampledUnixMS int64
	DefaultCS     int32
}

// ScoreboardRoom — состав живой комнаты арены с точки зрения текущего
// подписчика (спека 0015, FR-11/FR-12): сколько табло подключено, какой у
// этого подписчика порядковый номер (панель — 0) и является ли он
// источником таймера (табло ordinal 1). SidesSwapped — эфемерный swap
// синий/красный (FR-6), не персистится за пределами живой комнаты.
type ScoreboardRoom struct {
	ScoreboardCount  int
	ThisOrdinal      int
	ThisIsSource     bool
	SidesSwapped     bool
	RevealGeneration int32
}

// ArenaLiveSnapshot — живой снапшот табло арены целиком (спека 0015): доска
// ведения (пусто, если на арене никто не стоит, FR-5), последнее известное
// состояние таймера, состав комнаты для конкретного подписчика,
// персистентный дефолт арены и серверное время в момент сборки кадра
// (опора клиентской синхронизации часов).
type ArenaLiveSnapshot struct {
	Board                  BoutBoard
	Timer                  TimerFrame
	Room                   ScoreboardRoom
	DefaultDurationSeconds int32
	ServerNowUnixMS        int64
}
