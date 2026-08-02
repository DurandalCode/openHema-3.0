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
)

// ResetPool — снапшот одного пула номинации на момент сброса раскладки (для
// UndoReset): номер пула + его бойцы. Восстановление пересоздаёт пул с тем же
// номером и членствами (AC-13a4).
type ResetPool struct {
	Number     int
	FighterIDs []string
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
	// (восстановить все пулы с их бойцами, AC-13a4).
	Pools []ResetPool
}

// Layout — раскладка номинации целиком: статус, нераспределённые, пулы.
// CanUndo — доступна ли кнопка «Отменить» на экране (FR-7a).
type Layout struct {
	NominationID string
	Status       LayoutStatus
	Unassigned   []FighterRef
	Pools        []Pool
	CanUndo      bool
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

// Repository — порт доступа к хранилищу раскладки (PG-схема pool).
// Пулы возвращаются с «сырыми» членствами (Members[i].ID заполнен,
// Name/Club — нет): обогащение данными бойца — работа service через
// ActiveFightersProvider (модули не делят данные напрямую, ADR 0002).
type Repository interface {
	// GetLayout возвращает статус, undo-снапшот и пулы номинации (включая
	// ArenaID каждого пула, спека 0011). Отсутствие строки раскладки
	// трактуется как draft + UndoNone (lazy-init, FR-14).
	GetLayout(ctx context.Context, nominationID string) (LayoutStatus, UndoState, []Pool, error)
	// GetPool возвращает один пул по id (включая NominationID/ArenaID — для
	// резолва раскладки перед мутацией по запросам без nomination_id).
	GetPool(ctx context.Context, poolID string) (Pool, error)

	// CreatePool вставляет пул с заданным number, материализует lazy-строку
	// раскладки в draft, очищает undo. Возвращает созданный пул.
	CreatePool(ctx context.Context, nominationID string, number int) (Pool, error)
	// DeletePool атомарно удаляет пул (каскадом членства) и записывает
	// undo-снапшот (kind=delete_pool, number+fighter_ids удалённого пула).
	DeletePool(ctx context.Context, poolID string) error
	// ResetLayout атомарно удаляет все пулы номинации (каскадом членства) и
	// записывает undo-снапшот всех пулов с их членствами (kind=reset),
	// гарантирует статус draft (FR-4a, undoable — FR-7a).
	ResetLayout(ctx context.Context, nominationID string) error
	// AssignFighter кладёт бойца в пул: upsert членства по (nomination_id,
	// fighter_id) — move одним действием, если боец уже был в другом пуле
	// этой номинации (FR-1/FR-5). Очищает undo.
	AssignFighter(ctx context.Context, nominationID, fighterID, poolID string) error
	// UnassignFighter убирает бойца из пула, если он там был (идемпотентно).
	// Очищает undo.
	UnassignFighter(ctx context.Context, nominationID, fighterID string) error
	// ApplyAutoDistribute атомарно применяет assignments (insert членств) и
	// записывает undo (kind=auto, fighter_ids = кого расставило).
	ApplyAutoDistribute(ctx context.Context, nominationID string, assignments []Assignment) error
	// UndoAuto удаляет членства перечисленных fighterIDs (возврат в
	// нераспределённые) и очищает undo.
	UndoAuto(ctx context.Context, nominationID string, fighterIDs []string) error
	// UndoDeletePool пересоздаёт пул с тем же number и восстанавливает
	// членства fighterIDs, очищает undo.
	UndoDeletePool(ctx context.Context, nominationID string, number int, fighterIDs []string) error
	// UndoReset пересоздаёт все пулы из снапшота с теми же номерами и
	// восстанавливает их членства, очищает undo (AC-13a4).
	UndoReset(ctx context.Context, nominationID string, pools []ResetPool) error
	// PruneMembers удаляет членства бойцов номинации, которых нет среди
	// activeFighterIDs (FR-15). Не мутирует undo: реконсиляция — не
	// admin-действие в смысле FR-7a, а системное подчищение.
	PruneMembers(ctx context.Context, nominationID string, activeFighterIDs []string) error
	// SetStatus задаёт статус раскладки (draft/ready), материализует
	// lazy-строку, очищает undo (FR-9, FR-7a — смена статуса мутирует
	// раскладку).
	SetStatus(ctx context.Context, nominationID string, status LayoutStatus) error

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
	// ReadyUnseatedPools возвращает все пулы в статусе «готов» (раскладка
	// ready), ещё не поставленные ни на одну арену — кандидаты для
	// постановки (FR-9).
	ReadyUnseatedPools(ctx context.Context) ([]Pool, error)
	// AnySeatedInNomination — стоит ли хотя бы один пул номинации на арене
	// (гейт FR-3: расфиксация раскладки запрещена, пока пул на арене).
	AnySeatedInNomination(ctx context.Context, nominationID string) (bool, error)
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
// формирование/очистка боёв пулов номинации через API модуля bout (без
// прямого доступа к его PG-схеме, ADR 0002). Направление зависимости —
// только pool → bout (спека 0010, «Обзор решения», расширено спекой 0013).
//
// GenerateForNomination/ClearForNomination — как в спеке 0010: SetStatus
// вызывает GenerateForNomination на переходе draft → ready,
// ClearForNomination — на переходе ready → draft (теперь гейтится
// AnyStartedInNomination, FR-13).
//
// Start/Score/Finish/Reopen/ResetBout — лайфсайкл-команды текущего боя
// (спека 0013, FR-1/FR-4..FR-6): делегируются сервисом pool после резолва
// эффективного текущего боя пула. actorID — кто выполнил действие (для
// журнала боя, ADR 0011, NFR-1). ScoreBout принимает абсолютные значения
// счёта (план «Способ выражения счёта»: команда идемпотентна, шаги ±N —
// клиентская арифметика поверх текущего счёта из доски).
//
// BoutsByPool/PoolProgress/AnyStartedInNomination — чтения для доски и
// вычисляемого статуса пула (FR-10).
//
// Ошибки: реализация мапит доменные ошибки bout в ErrInvalidTransition/
// ErrConcurrency этого пакета (см. комментарий у этих сентинелов) либо в
// ErrNotFound (boutID не существует).
type BoutConductor interface {
	GenerateForNomination(ctx context.Context, nominationID string, pools []BoutPoolInput) error
	ClearForNomination(ctx context.Context, nominationID string) error

	StartBout(ctx context.Context, boutID, actorID string) error
	ScoreBout(ctx context.Context, boutID, actorID string, scoreA, scoreB int) error
	FinishBout(ctx context.Context, boutID, actorID string) error
	ReopenBout(ctx context.Context, boutID, actorID string) error
	ResetBout(ctx context.Context, boutID, actorID string) error

	// BoutsByPool возвращает бои пула (id/раунд/порядок/пара/состояние/
	// счёт), порядок не гарантирован — сервис pool сортирует по
	// SequenceNumber сам (см. service.sortedBySequence).
	BoutsByPool(ctx context.Context, poolID string) ([]BoutRef, error)
	// PoolProgress — сколько всего боёв у пула, сколько начато (state ≠
	// not_started) и сколько завершено (FR-10).
	PoolProgress(ctx context.Context, poolID string) (total, started, finished int, err error)
	// AnyStartedInNomination — есть ли в номинации хотя бы один бой со
	// state ≠ not_started (гейт FR-13, AC-12).
	AnyStartedInNomination(ctx context.Context, nominationID string) (bool, error)
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

// NominationSnapshot — живой снапшот номинации целиком (спека 0014). Pools
// пуст, пока раскладка номинации в статусе draft (FR-12) — публично нечего
// показывать, как и ListPublicPools.
type NominationSnapshot struct {
	NominationID string
	Pools        []LivePool
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
