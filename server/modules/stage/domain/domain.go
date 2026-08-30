package domain

import (
	"context"
	"errors"
	"strings"
	"time"
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
	// ErrStageNotDeletable — удаление этапа отклонено: в нём (в его пулах)
	// уже начат хотя бы один бой (FR-3, AC-14). До спеки 0020 этой же
	// ошибкой отклонялось удаление авто-этапа номинации вовсе — начиная с
	// 0020 (FR-5) авто-этап не особенный и удаляется по тому же гейту, что
	// любой другой этап; отдельного «этот этап неудаляем по типу» больше
	// нет.
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

	// Спека 0020: конструктор схемы номинации + пресеты форматов (ADR 0014
	// §8/§9).

	// ErrStageLocked — конфиг этапа (число групп/размер сетки/бой за 3-е
	// место) и правило отбора редактируются, только пока состав этапа пуст и
	// этап не зафиксирован (draft) — так же, как правило и сегодня (0019,
	// FR-6), только теперь обобщено на весь конфиг (FR-2, AC-2).
	ErrStageLocked = errors.New("pool: stage config is locked once it has members")
	// ErrSourceCycle — назначение источника отклонено: этап не может прямо
	// или косвенно питаться от самого себя (FR-4, AC-5). Возвращается и
	// DetectSourceCycle-гейтом SetStageRule, и ResolveStagePositions при
	// обнаружении цикла на пересчёте (защита от рассинхрона).
	ErrSourceCycle = errors.New("pool: source assignment would create a cycle")
	// ErrSchemaNotEmpty — применение пресета/копирование схемы отклонено:
	// схема номинации тронута — хотя бы в одном этапе есть состав, хотя бы
	// один пул стоит на арене либо в нём начат бой. Сначала расформировать
	// этапы (FR-13, FR-14, AC-14).
	ErrSchemaNotEmpty = errors.New("pool: nomination schema already has data and cannot be replaced")
	// ErrPresetNameTaken — сохранение/переименование пресета отклонено: имя
	// библиотеки уникально без учёта регистра и краевых пробелов (FR-12,
	// AC-17).
	ErrPresetNameTaken = errors.New("pool: format preset name is already taken")
	// ErrInvalidSpec — FormatSpec структурно неисполнима: пустая, индекс
	// источника вне границ или указывает вперёд/на себя, правило невалидно,
	// либо групповой этап с правилом отбора не имеет заданного числа групп
	// (ValidateFormatSpec, план «domain/schema.go»).
	ErrInvalidSpec = errors.New("pool: format spec is structurally invalid")
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
	// ExecutionStatus — вычисляемый статус этапа целиком (спека 0021, FR-1):
	// заполняется сервисом при чтении (ComputeStageStatus), не хранится.
	ExecutionStatus StageStatus
}

// PoolMember — сырое членство: боец в пуле (репозиторное чтение, без
// обогащения именем/клубом). Комбинируется службой с bare-пулами из
// PoolsByStage/PoolsByNomination (по аналогии с тем, как repo раньше сам
// объединял ListPoolsByNomination + ListMembersByNomination).
type PoolMember struct {
	PoolID    string
	FighterID string
}

// DraftMembership — членство бойца в пуле этапа, который ещё в статусе
// draft (спека 0040, FR-4) — вход OnFighterWithdrawn: только такие
// членства запоминаются в withdrawn_seeds при выводе бойца, членства вне
// draft остаются как есть (посев там уже зафиксирован, тот же порог, что у
// DeletePool/ResetLayout).
type DraftMembership struct {
	NominationID string
	StageID      string
	PoolID       string
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

	// Спека 0020: конструктор схемы номинации + пресеты форматов.

	// UpdateStage пишет название и (если он изменился) конфиг этапа —
	// bracket у сетки, groups у группового этапа (FR-2). Гейт «конфиг
	// правится только пока состав пуст» (ErrStageLocked) и сравнение
	// «конфиг реально изменился» проверяет вызывающий (service.UpdateStage)
	// до вызова — репозиторий только пишет переданные значения.
	UpdateStage(ctx context.Context, stageID, title string, bracket BracketConfig, groups GroupsConfig) error
	// SetStagePositions пишет позиции сразу нескольких этапов одной
	// транзакцией (FR-3) — каскадный результат ResolveStagePositions,
	// применяемый после смены источника одной ветки: без транзакции
	// промежуточное состояние схемы было бы видно параллельному чтению.
	SetStagePositions(ctx context.Context, positions map[string]int) error
	// MembersCountByNomination — сколько всего членств по всем этапам
	// номинации (гейт «схема не тронута», FR-13): 0 — необходимое (но не
	// единственное, см. AnySeatedInStage/AnyStartedInPools) условие
	// применения пресета/копирования.
	MembersCountByNomination(ctx context.Context, nominationID string) (int, error)
	// ReplaceSchema атомарно заменяет схему номинации целиком (FR-13/FR-14,
	// NFR-1 — либо схема заменена целиком, либо не тронута вовсе): удаляет
	// все существующие этапы номинации (каскадом пулы и членства — гейт
	// «схема не тронута» уже проверен вызывающим), вставляет новые из specs
	// в порядке спецификации под заданными positions (результат симуляции
	// последовательного создания + ResolveStagePositions, FR-8a/AC-22),
	// резолвит FormatStageSpec.SourceIndex → source_stage_id вторым
	// проходом внутри той же транзакции (id новых этапов известны только
	// после вставки) и создаёт по два контейнера первого круга каждой
	// сетке — как CreateStage (0018, FR-6a). Возвращает созданные этапы.
	ReplaceSchema(ctx context.Context, nominationID string, specs []FormatStageSpec, positions []int) ([]Stage, error)

	// ListFormatPresets возвращает библиотеку пресетов целиком (FR-12,
	// NFR-3 — без пагинации: рассчитана на десятки записей).
	ListFormatPresets(ctx context.Context) ([]FormatPreset, error)
	// GetFormatPreset возвращает один пресет по id (found=false, если не
	// существует) — вход ApplyFormat (FR-13).
	GetFormatPreset(ctx context.Context, presetID string) (FormatPreset, bool, error)
	// InsertFormatPreset сохраняет схему номинации как именованный пресет
	// (FR-11/FR-12): уникальность имени без учёта регистра/краевых пробелов
	// обеспечивает БД (уникальный индекс миграции 00004) — конфликт
	// вызывающий (service.SaveFormatPreset) мапит в ErrPresetNameTaken
	// (AC-17).
	InsertFormatPreset(ctx context.Context, name string, spec FormatSpec) (FormatPreset, error)
	// RenameFormatPreset переименовывает пресет, не трогая его схему и уже
	// применённые к номинациям копии (FR-12, FR-16) — ErrPresetNameTaken
	// при конфликте, ErrNotFound, если пресета нет.
	RenameFormatPreset(ctx context.Context, presetID, name string) (FormatPreset, error)
	// DeleteFormatPreset удаляет пресет из библиотеки; номинации, к которым
	// он уже был применён, не затрагивает (FR-16) — идемпотентно по
	// отсутствию (ErrNotFound от вызывающего, если нужно).
	DeleteFormatPreset(ctx context.Context, presetID string) error

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

	// Спека 0040: гейт на удаление номинации, память посева при возврате
	// выведенного бойца, репойнт при слиянии дублей бойца.

	// ExistsDistributedFighterForNomination — есть ли в номинации хотя бы
	// один боец, распределённый в пул любой её стадии (FR-1 гейта удаления
	// номинации) — читает stage.PoolOccupancyAdapter поверх
	// nomination/domain.PoolOccupancyChecker.
	ExistsDistributedFighterForNomination(ctx context.Context, nominationID string) (bool, error)
	// DraftMembershipsByFighter возвращает членства бойца в пулах этапов,
	// ещё находящихся в draft (FR-4) — вход OnFighterWithdrawn: только эти
	// членства запоминаются в withdrawn_seeds, членства вне draft остаются
	// как есть (посев там уже зафиксирован — тот же порог, что у
	// DeletePool/ResetLayout).
	DraftMembershipsByFighter(ctx context.Context, fighterID string) ([]DraftMembership, error)
	// CaptureWithdrawnSeed атомарно переносит членство бойца в указанном
	// draft-этапе из pool_members в withdrawn_seeds (FR-4, «память» пула,
	// откуда боец выведен). Идемпотентно: если членства уже нет (гонка),
	// no-op.
	CaptureWithdrawnSeed(ctx context.Context, fighterID, stageID string) error
	// RestoreWithdrawnSeed пытается восстановить все запомненные посевы
	// бойца (по всем номинациям, FR-5): для каждой строки withdrawn_seeds —
	// если её стадия всё ещё draft и пул ещё существует, членство
	// восстанавливается в pool_members; иначе память просто освобождается
	// (FR-6, best-effort истечение — без силового восстановления).
	RestoreWithdrawnSeed(ctx context.Context, fighterID string) error
	// RepointFighter переносит членства source в target по всем этапам, где
	// target ещё не состоит (сценарий 3, слияние дублей бойца) — коллизия
	// по uq_members_stage_fighter не репойнтится молча (см.
	// repo/queries/stage.sql).
	RepointFighter(ctx context.Context, sourceFighterID, targetFighterID string) error
	// RepointWithdrawnSeed переносит запомненные посевы source в target той
	// же защитой от коллизии — по PK (fighter_id, nomination_id).
	RepointWithdrawnSeed(ctx context.Context, sourceFighterID, targetFighterID string) error
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
	// Forecast — ориентировочное время этого боя (спека 0043, ADR 0020),
	// заполняется вызывающим (service.enrichBoutForecasts) поверх уже
	// собранной доски: nil у боёв, для которых прогноза нет (не not_started
	// — уже идёт/завершён — либо пул не поставлен на площадку, FR-9/FR-24).
	Forecast *BoutForecast
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
// EventsForPools — журнал боёв площадки (спека 0033, FR-33): чтение
// event-sourced потока боя (0013, ADR 0011) по пулам, без свёртки.
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

	// EventsForPools возвращает журнал боёв перечисленных пулов (спека 0033,
	// FR-33): новыми вперёд, ограничен limit. Пустой список пулов — валидный
	// вход, no-op → пустой срез (как AnyStartedInPools).
	EventsForPools(ctx context.Context, poolIDs []string, limit int) ([]BoutEventRecord, error)

	// BoutTimesForPools возвращает фактическое время начала/завершения боёв
	// перечисленных пулов (спека 0034, FR-16) — проекция того же событийного
	// журнала боя, что EventsForPools, свёрнутая до последней отметки
	// каждого вида на бой (переоткрытие/сброс делают более ранние отметки
	// неактуальными, AC-14). Пустой список пулов — валидный вход, no-op →
	// пустая карта (как AnyStartedInPools).
	BoutTimesForPools(ctx context.Context, poolIDs []string) (map[string]BoutTimes, error)

	// StartedAtByBouts возвращает первый момент начала каждого боя из
	// перечисленных (спека 0043, ADR 0020) — наблюдения для темпа
	// площадки: MIN(occurred_at) события started, не последний актуальный
	// (в отличие от BoutTimesForPools). Бои без started просто отсутствуют
	// в карте. Пустой список — валидный вход, no-op → пустая карта.
	StartedAtByBouts(ctx context.Context, boutIDs []string) (map[string]time.Time, error)
}

// BoutTimes — фактическое время одного боя (спека 0034, FR-16): начало и
// завершение, оба nil, если соответствующее событие ещё не произошло.
// Собственный тип этого модуля — не импортируем modules/bout/domain.BoutTimes
// (ADR 0002 запрещает межмодульный доступ к чужим доменным типам); адаптер в
// internal/platform сконвертирует один в другой.
type BoutTimes struct {
	StartedAt  *time.Time
	FinishedAt *time.Time
}

// ---------------------------------------------------------------------
// Спека 0033: журнал боёв площадки (FR-33/FR-34/FR-36).
// ---------------------------------------------------------------------

// BoutEventKind — вид записи журнала боя для площадки (спека 0033,
// FR-33/FR-34): read-model, собственный тип модуля (не импорт bout/domain,
// ADR 0002). EventKind — строковый литерал по образцу BoutState.
// `scheduled` намеренно отсутствует — формирование пар системное, без
// автора-человека, в журнале площадки не показывается (FR-34/FR-36).
type BoutEventKind string

const (
	BoutEventStarted  BoutEventKind = "started"
	BoutEventScored   BoutEventKind = "scored"
	BoutEventFinished BoutEventKind = "finished"
	BoutEventReopened BoutEventKind = "reopened"
	BoutEventReset    BoutEventKind = "reset"
)

// BoutEventRecord — одна запись журнала боя для площадки (спека 0033,
// FR-33/FR-34): плоский read-model, полученный от BoutConductor.
// EventsForPools — свёртки не требует, из журнала читается как есть.
type BoutEventRecord struct {
	BoutID         string
	SequenceNumber int
	FighterA       FighterRef
	FighterB       FighterRef
	Kind           BoutEventKind
	ScoreA         int
	ScoreB         int
	ActorID        string
	OccurredAt     time.Time
}

// JournalEntry — запись журнала боёв площадки для внешнего представления
// (спека 0033, FR-33/FR-34): BoutEventRecord, обогащённый именем автора на
// чтении (приём 0025, UserProvider.DisplayNames). ActorDisplayName пусто,
// если ActorID пуст (события без автора в журнал не попадают, FR-34) или
// пользователь не резолвится (удалён) — не ошибка.
type JournalEntry struct {
	BoutID           string
	SequenceNumber   int
	FighterA         FighterRef
	FighterB         FighterRef
	Kind             BoutEventKind
	ScoreA           int
	ScoreB           int
	ActorID          string
	OccurredAt       time.Time
	ActorDisplayName string
}

// UserProvider — межмодульная зависимость: отображаемые имена авторов
// событий журнала площадки (спека 0033, FR-34, приём 0025 —
// application/domain.UserProvider). Отсутствие пользователя в результате —
// не ошибка (событие без известного автора остаётся без имени).
type UserProvider interface {
	DisplayNames(ctx context.Context, ids []string) (map[string]string, error)
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
	// PublishTournamentChanged — сигнал «публичная живая сводка турнира
	// (спека 0034) могла измениться, перечитайте». Без аргумента: топик один
	// на процесс — в MVP активный турнир один (GetActiveTournament/
	// UpdateActiveTournament), как и у SubscribeTournament ниже.
	PublishTournamentChanged()
}

// LiveSubscriber — subscribe-сторона порта живой шины (спека 0014, ADR
// 0012). Возвращает канал сигналов по топику nominationID и функцию отписки
// (вызывающий обязан вызвать её по завершении подписки — освобождает
// ресурсы шины).
type LiveSubscriber interface {
	SubscribeNomination(nominationID string) (<-chan struct{}, func())
	// SubscribeTournament — один топик на процесс (спека 0034): MVP
	// допускает единственный активный турнир, как и везде в этом модуле
	// (GetActiveTournament/UpdateActiveTournament) — без параметра
	// tournamentID.
	SubscribeTournament() (<-chan struct{}, func())
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
	// Results — итоговый протокол номинации (спека 0021, FR-18): едет тем же
	// живым каналом, чтобы призёры появлялись без перезагрузки.
	Results NominationResults
}

// ArenaRef — проекция площадки для постановки пула (спека 0011, план
// «Обзор решения»): идентификатор, (резолвленное) имя, активна ли (архивная
// арена постановку не принимает, FR-9).
//
// Position — порядок площадки, заданный admin (спека 0027; спека 0034,
// FR-14): заполняется только у результата ActiveArenas — остальные пути
// (ArenaByID/ArenasByIDs) её не резолвят и оставляют нулевой.
type ArenaRef struct {
	ID       string
	Name     string
	Active   bool
	Position int
	// LastFreedAt — момент последнего освобождения площадки (спека 0043,
	// FR-26/FR-28): nil, если площадку никогда не освобождали («ждёт
	// первый пул»). Заполняется только у результата ActiveArenas — как и
	// Position, остальные пути его не резолвят (см. комментарий у Position).
	LastFreedAt *time.Time
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
	// ActiveArenas — неархивные площадки турнира в admin-порядке (спека
	// 0034, FR-14). tournamentID обязателен и должен указывать на активный
	// турнир — валидацию делает сама реализация (по аналогии с
	// arena.Service.List/resolveTournament), этот порт её не дублирует.
	ActiveArenas(ctx context.Context, tournamentID string) ([]ArenaRef, error)
	// MarkFreed проставляет момент освобождения площадки (спека 0043,
	// FR-26/FR-27) — вызывается сервисом на UnseatPool, единственном
	// действии, которое площадку освобождает. Ошибку не мапит в доменные
	// ошибки этого пакета: вызывается уже после успешного снятия пула,
	// падение здесь — инфраструктурная аномалия, не доменный отказ.
	MarkFreed(ctx context.Context, arenaID string) error
}

// NominationRef — проекция номинации для обогащения пулов именем номинации
// (по аналогии с ArenaRef, спека 0011, FR-9: список «готовых пулов для
// постановки» собран из разных номинаций — без имени номинации на экране
// арены пулы с одинаковым номером неотличимы).
//
// Position — порядок номинации, заданный admin (спека 0034, FR-20):
// заполняется только у результата NominationsByTournament — NominationsByIDs
// её не резолвит и оставляет нулевой.
type NominationRef struct {
	ID       string
	Title    string
	Position int
}

// NominationProvider — межмодульная зависимость: резолв названий номинаций
// через API модуля nomination (без прямого доступа к его PG-схеме, ADR
// 0002). Направление зависимости — только pool → nomination.
type NominationProvider interface {
	// NominationsByIDs — батч-резолв имён номинаций (для обогащения списков
	// пулов). Отсутствующие id в ответе просто не встречаются в карте —
	// service оставляет NominationName пустым, не падая.
	NominationsByIDs(ctx context.Context, ids []string) (map[string]NominationRef, error)
	// SyncNominationState уведомляет nomination о текущем факте «есть ли у
	// номинации хотя бы один распределённый по пулам боец» (спека 0012,
	// FR-5/FR-6/FR-10) и об исполнительной оси, выведенной из статусов этапов
	// (спека 0021, FR-4/FR-5). Один вызов вместо двух отдельных портов — обе
	// оси считаются в одной точке сервиса stage и пишутся одной операцией на
	// стороне nomination. Вызывается после каждой мутирующей операции,
	// способной изменить любую из осей — сервис сам решает, когда звать (по
	// результирующему состоянию, не по имени RPC).
	SyncNominationState(ctx context.Context, nominationID string, hasDistributedFighters bool, execution NominationExecution) error
	// NominationsByTournament возвращает номинации турнира в admin-порядке
	// (спека 0034, FR-20) — явная адресация, без дефолта на «активный
	// турнир» (см. комментарий у ArenaProvider.ActiveArenas).
	NominationsByTournament(ctx context.Context, tournamentID string) ([]NominationRef, error)
}

// ---------------------------------------------------------------------
// Спека 0042: уведомление о постановке пула на площадку (FR-24/FR-29,
// план «Модуль stage — точка уведомления»).
// ---------------------------------------------------------------------

// PoolSeatedNotice — данные для письма бойцам о постановке их пула на
// площадку (спека 0042, FR-24). FighterIDs — id бойцов пула на момент
// постановки (не участников по учётке — резолв бойца в получателя письма
// делает адаптер в internal/platform через модуль fighter, FR-25).
//
// Упрощение относительно исходного описания плана: вместо NominationName —
// NominationID. Имя номинации сервису тут доступно только новым вызовом
// NominationProvider.NominationsByIDs — лишний межмодульный round-trip на
// синхронном пути SeatPoolOnArena (нарушал бы FR-28: доменная операция не
// должна ждать почтовую инфраструктуру). PoolName/ArenaName, в отличие от
// имени номинации, сервис и так уже считает/резолвит в SeatPoolOnArena для
// собственных нужд (доска арены, статус пула) — их отдаём как есть. Адаптер
// в internal/platform, реализующий Notifier по-настоящему, уже резолвит
// имена номинаций для соседних уведомлений (план «internal/platform —
// composition root», ADR 0002) и дорезолвит недостающее сам.
type PoolSeatedNotice struct {
	FighterIDs   []string
	NominationID string
	PoolName     string
	ArenaName    string
}

// Notifier — межмодульный порт уведомлений модуля stage (тот же приём, что
// в модуле application, ADR 0011 п.5): реальный адаптер (internal/platform)
// спрашивает у auth готовый список получателей и кладёт письмо в
// pkg/notify.Dispatcher, который отправляет вне запроса (FR-27/FR-28). Не
// возвращает ошибку — почта не должна влиять на исход доменной операции
// постановки пула (FR-27); сервис дополнительно гасит панику реализации
// (см. service.notifyPoolSeated), чтобы сбойный адаптер тоже не ронял
// SeatPoolOnArena. nil-Notifier допустим (no-op, письма не шлются) —
// существующие вызовы service.New без уведомлений остаются рабочими.
type Notifier interface {
	PoolSeated(ctx context.Context, n PoolSeatedNotice)
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

// ---------------------------------------------------------------------
// Спека 0034: публичная живая сводка турнира целиком для главной страницы
// (FR-12..FR-20). В отличие от NominationSnapshot (одна номинация) — по всем
// номинациям турнира разом, одной подпиской (NFR-2).
// ---------------------------------------------------------------------

// LiveArenaState — состояние площадки в публичной сводке турнира (спека
// 0034, FR-14). Своя ось, отдельная от PoolStatus/BoutState — гость видит
// только «идёт бой / готовится / свободна», не внутренние статусы
// раскладки.
type LiveArenaState string

const (
	LiveArenaFree           LiveArenaState = "free"
	LiveArenaPreparing      LiveArenaState = "preparing"
	LiveArenaBoutInProgress LiveArenaState = "bout_in_progress"
)

// NominationPhase — фаза номинации для сайдбара публичной сводки турнира
// (спека 0034, FR-20). Собственный тип, не NominationStatus (модуля
// nomination): та ось про приём заявок (open/closed), эта — про исполнение,
// выведена из ExecutionStatus этапов номинации (спека 0021) — оси
// независимы.
type NominationPhase string

const (
	NominationPhaseUpcoming NominationPhase = "upcoming"
	NominationPhaseRunning  NominationPhase = "running"
	NominationPhaseFinished NominationPhase = "finished"
)

// FeedBout — одна строка ленты боёв турнира (спека 0034, FR-15/FR-16): бой
// любой номинации турнира (группового этапа либо разрешённой пары сетки —
// оба типа готового этапа обходятся сборкой сводки, см.
// service.TournamentLive) с площадкой и фактическим временем.
// StartedAt/FinishedAt — nil, если соответствующее событие ещё не
// произошло (FR-16, AC-13): представление показывает прочерк, не эпоху.
type FeedBout struct {
	BoutID         string
	NominationID   string
	NominationName string
	StageTitle     string
	PoolName       string
	ArenaID        string
	ArenaName      string
	SequenceNumber int
	PoolBoutTotal  int
	FighterA       FighterRef
	FighterB       FighterRef
	State          BoutState
	ScoreA         int
	ScoreB         int
	StartedAt      *time.Time
	FinishedAt     *time.Time
	// Forecast — ориентировочное время боя (спека 0043, ADR 0020), см.
	// комментарий у BoutRef.Forecast: nil, если бой не подходит под
	// прогноз (не not_started либо пул не поставлен на площадку).
	Forecast *BoutForecast
}

// LiveArenaView — карточка площадки публичной сводки турнира (спека 0034,
// FR-14). CurrentBout заполнен у Preparing (первая непроведённая пара пула)
// и у BoutInProgress (идущий бой); у Free — nil, и Nomination/Pool/StageTitle
// тоже пусты (в т.ч. когда пул на арене стоит, но все его бои уже
// завершены, а UnseatPool ещё не вызван — сознательное сужение против
// макета, см. service.TournamentLive).
type LiveArenaView struct {
	ArenaID          string
	ArenaName        string
	Position         int
	State            LiveArenaState
	NominationID     string
	NominationName   string
	PoolName         string
	StageTitle       string
	CurrentBout      *FeedBout
	PoolBoutTotal    int
	PoolBoutFinished int
	// NextBoutForecast — ориентировочное время СЛЕДУЮЩЕГО боя площадки
	// (спека 0043, FR-21): при State == LiveArenaPreparing совпадает по
	// значению с CurrentBout.Forecast (сам CurrentBout и есть следующий
	// бой); при LiveArenaBoutInProgress — прогноз бой ПОСЛЕ идущего
	// (CurrentBout в этом состоянии сам прогноза не несёт — он уже идёт).
	// nil у LiveArenaFree и когда в контейнере не осталось не начатых боёв.
	NextBoutForecast *BoutForecast
}

// LiveNominationView — строка сайдбара «Номинации» публичной сводки турнира
// (спека 0034, FR-20).
type LiveNominationView struct {
	NominationID      string
	Title             string
	Position          int
	Phase             NominationPhase
	CurrentStageTitle string
	BoutTotal         int
	BoutFinished      int
	FighterCount      int
}

// TournamentSnapshot — живая сводка турнира целиком (спека 0034): карточки
// площадок, лента боёв (без сортировки — порядок ленты, FR-17, представление,
// считается на web) и сайдбар номинаций. ServerNowUnixMS — опора клиентской
// метки «обновлено N сек назад» (тот же паттерн, что ArenaLiveSnapshot).
type TournamentSnapshot struct {
	TournamentID    string
	Arenas          []LiveArenaView
	Bouts           []FeedBout
	Nominations     []LiveNominationView
	ServerNowUnixMS int64
}

// ---------------------------------------------------------------------
// Спека 0041: агрегирующие RPC живого статуса турнира (FR-7/FR-8) — доска
// всех неархивных площадок и схема+диагностика всех номинаций турнира одним
// обращением вместо одного на площадку/номинацию за цикл обновления (0027
// NFR-3, 0028 NFR-2, отложено и теперь реализовано). Не меняют модель данных
// площадок/этапов, не вводят новых состояний (NFR-2) — только форма выдачи.
// ---------------------------------------------------------------------

// ArenaBoardEntry — доска ведения боёв одной площадки в составе агрегирующего
// ответа GetArenaBoards (спека 0041, FR-7): та же проекция, что у одиночного
// GetBoutBoard (service.BoutBoard, arena_id + board), на каждую неархивную
// площадку турнира (ArenaProvider.ActiveArenas). Board — нулевое значение
// (Pool.ID пуст), если на площадке никто не стоит — не ошибка, ровно та же
// семантика, что у одиночного GetBoutBoard. Отдельного флага ошибки на
// запись нет (см. комментарий у service.Service.GetArenaBoards) — как и
// GetBoutBoardResponse.board, форма ответа этой спекой не меняется.
type ArenaBoardEntry struct {
	ArenaID string
	Board   BoutBoard
	// IdleState/FreeSince — простой площадки (спека 0043, FR-26/FR-28):
	// FreeSince заполнен только у ArenaIdleFree.
	IdleState ArenaIdleState
	FreeSince *time.Time
}

// ArenaIdleState — состояние простоя площадки (спека 0043, FR-26/FR-28).
// ArenaIdleWaitingFirstPool — на площадку в этом турнире ни разу не ставили
// пул (LastFreedAt не задан); ArenaIdleFree — пул сняли, FreeSince задан;
// ArenaIdleOccupied — пул стоит.
type ArenaIdleState string

const (
	ArenaIdleOccupied         ArenaIdleState = "occupied"
	ArenaIdleWaitingFirstPool ArenaIdleState = "waiting_first_pool"
	ArenaIdleFree             ArenaIdleState = "free"
)

// IdleStateOf вычисляет ArenaIdleState площадки (спека 0043, FR-28) из
// того, стоит ли на ней пул сейчас (occupied) и момента последнего
// освобождения (arena.LastFreedAt, спека 0043 FR-26) — единственного
// нового персистентного факта фичи. Используется и доской площадок
// (GetArenaBoards), и пультом (GetTournamentConsole) — одна точка правды
// для обоих экранов.
func IdleStateOf(occupied bool, lastFreedAt *time.Time) (ArenaIdleState, *time.Time) {
	if occupied {
		return ArenaIdleOccupied, nil
	}
	if lastFreedAt == nil {
		return ArenaIdleWaitingFirstPool, nil
	}
	return ArenaIdleFree, lastFreedAt
}

// NominationStagesEntry — этапы и диагностика схемы одной номинации в
// составе агрегирующего ответа ListStagesForTournament (спека 0041, FR-8):
// та же проекция, что у одиночного ListStages (nomination_id + stages +
// issues), на каждую номинацию турнира (NominationProvider.
// NominationsByTournament). Как и у ArenaBoardEntry, отдельного флага
// ошибки на запись нет.
type NominationStagesEntry struct {
	NominationID string
	Stages       []Stage
	Issues       []SchemaIssue
}

// ---------------------------------------------------------------------
// Спека 0043: пульт турнира и прогноз очереди (ADR 0020). ConsoleAlert/
// ConsoleAlertKind — в alerts.go (чистая доменная модель, без чтений);
// остальные типы пульта — здесь, по образцу TournamentSnapshot/
// LiveArenaView (спека 0034).
// ---------------------------------------------------------------------

// ConsoleArena — карточка площадки на пульте (FR-11): что на ней стоит,
// идущий/следующий бой (через CurrentBout), темп и прогноз завершения
// пула, простой. CurrentBout/Pace/PoolExpectedFinishAt заполнены, только
// когда на площадке сейчас стоит пул (IdleState == ArenaIdleOccupied);
// PoolExpectedFinishAtOK=false, если стоящий пул уже полностью проведён
// (доигран, но не снят — сигнал ConsoleAlertPoolDoneNotUnseated, а не
// прогноз).
type ConsoleArena struct {
	ArenaID                string
	ArenaName              string
	Position               int
	IdleState              ArenaIdleState
	FreeSince              *time.Time
	NominationID           string
	NominationName         string
	StageTitle             string
	PoolID                 string
	PoolName               string
	CurrentBout            *BoutRef
	BoutTotal              int
	BoutFinished           int
	Pace                   PaceEstimate
	PoolExpectedFinishAt   time.Time
	PoolExpectedFinishAtOK bool
}

// ConsoleNomination — строка номинации на пульте (FR-12). ExpectedFinishAt
// считается только по её ПОСТАВЛЕННЫМ пулам (максимум по ним, ADR 0020) —
// BoutRemainingUnseated считает остаток непоставленных пулов числом, без
// времени (горизонт оценки, FR-9): ExpectedFinishAtOK=false, если у
// номинации сейчас нет ни одного поставленного пула с непроведёнными
// боями (нечего прогнозировать).
type ConsoleNomination struct {
	NominationID          string
	Title                 string
	Position              int
	Phase                 NominationPhase
	CurrentStageTitle     string
	BoutTotal             int
	BoutFinished          int
	BoutRemainingUnseated int
	ExpectedFinishAt      time.Time
	ExpectedFinishAtOK    bool
	Provisional           bool
}

// ConsoleQueueItem — готовый к постановке пул в очереди пульта (FR-13):
// тот же набор, что предлагает SeatPoolOnArena (пулы READY, ни на одной
// арене). EstimatedSeconds — сколько такой пул займёт при темпе турнира
// (BoutCount × темп, FR-13) — не при темпе своей будущей площадки: она
// ещё не выбрана.
type ConsoleQueueItem struct {
	PoolID           string
	NominationID     string
	NominationName   string
	StageTitle       string
	PoolName         string
	BoutCount        int
	EstimatedSeconds int
}

// ConsoleSnapshot — пульт турнира целиком (FR-8/FR-9/FR-19): общий payload
// unary- и streaming-ответа, одним агрегирующим обращением — по образцу
// TournamentSnapshot (спека 0034).
type ConsoleSnapshot struct {
	TournamentID    string
	Arenas          []ConsoleArena
	Nominations     []ConsoleNomination
	Queue           []ConsoleQueueItem
	Alerts          []ConsoleAlert
	ServerNowUnixMS int64
}
