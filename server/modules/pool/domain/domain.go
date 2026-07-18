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
// номинации и факта постановки на арену (спека 0011, план «Обзор решения»):
// «готовится к запуску» ⟺ arenaID непуст (пул поставлен на арену), иначе
// «готов»/«не готов» синхронны со статусом раскладки. Чистая функция —
// юнит-тестируется без fake-портов.
func ComputePoolStatus(layout LayoutStatus, arenaID string) PoolStatus {
	if strings.TrimSpace(arenaID) != "" {
		return PoolStatusPreparing
	}
	if layout == LayoutReady {
		return PoolStatusReady
	}
	return PoolStatusNotReady
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

// BoutGenerator — межмодульная зависимость: формирование/очистка боёв пулов
// номинации через API модуля bout (без прямого доступа к его PG-схеме,
// ADR 0002). Направление зависимости — только pool → bout (спека 0010,
// «Обзор решения»). SetStatus вызывает GenerateForNomination на переходе
// draft → ready, ClearForNomination — на переходе ready → draft.
type BoutGenerator interface {
	GenerateForNomination(ctx context.Context, nominationID string, pools []BoutPoolInput) error
	ClearForNomination(ctx context.Context, nominationID string) error
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
}
