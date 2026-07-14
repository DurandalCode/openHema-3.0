package domain

import (
	"context"
	"errors"
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
)

// LayoutStatus — статус раскладки номинации целиком (FR-9). В этой фиче
// реализованы только переходы draft↔ready; active/finished — задел под
// будущие бои (спека 0009 «Вне скоупа»).
type LayoutStatus string

const (
	LayoutDraft    LayoutStatus = "draft"
	LayoutReady    LayoutStatus = "ready"
	LayoutActive   LayoutStatus = "active"
	LayoutFinished LayoutStatus = "finished"
)

// UndoKind — вид последнего mutating-действия, доступного для отката (FR-7a).
// Undo относится только к двум классам действий: автораспределение и
// удаление пула.
type UndoKind string

const (
	UndoNone       UndoKind = ""
	UndoAuto       UndoKind = "auto"
	UndoDeletePool UndoKind = "delete_pool"
)

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

// Repository — порт доступа к хранилищу раскладки (PG-схема pool).
// Пулы возвращаются с «сырыми» членствами (Members[i].ID заполнен,
// Name/Club — нет): обогащение данными бойца — работа service через
// ActiveFightersProvider (модули не делят данные напрямую, ADR 0002).
type Repository interface {
	// GetLayout возвращает статус, undo-снапшот и пулы номинации. Отсутствие
	// строки раскладки трактуется как draft + UndoNone (lazy-init, FR-14).
	GetLayout(ctx context.Context, nominationID string) (LayoutStatus, UndoState, []Pool, error)
	// GetPool возвращает один пул по id (включая NominationID — для
	// резолва раскладки перед мутацией по запросам без nomination_id).
	GetPool(ctx context.Context, poolID string) (Pool, error)

	// CreatePool вставляет пул с заданным number, материализует lazy-строку
	// раскладки в draft, очищает undo. Возвращает созданный пул.
	CreatePool(ctx context.Context, nominationID string, number int) (Pool, error)
	// DeletePool атомарно удаляет пул (каскадом членства) и записывает
	// undo-снапшот (kind=delete_pool, number+fighter_ids удалённого пула).
	DeletePool(ctx context.Context, poolID string) error
	// ResetLayout атомарно удаляет все пулы номинации (каскадом членства),
	// очищает undo, гарантирует статус draft (FR-4a).
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
	// PruneMembers удаляет членства бойцов номинации, которых нет среди
	// activeFighterIDs (FR-15). Не мутирует undo: реконсиляция — не
	// admin-действие в смысле FR-7a, а системное подчищение.
	PruneMembers(ctx context.Context, nominationID string, activeFighterIDs []string) error
	// SetStatus задаёт статус раскладки (draft/ready), материализует
	// lazy-строку, очищает undo (FR-9, FR-7a — смена статуса мутирует
	// раскладку).
	SetStatus(ctx context.Context, nominationID string, status LayoutStatus) error
}

// ActiveFightersProvider — межмодульная зависимость: активный ростер
// номинации через API модуля fighter (без прямого доступа к его PG-схеме,
// ADR 0002). Направление зависимости — только pool → fighter.
type ActiveFightersProvider interface {
	ActiveFightersByNomination(ctx context.Context, nominationID string) ([]FighterRef, error)
}

