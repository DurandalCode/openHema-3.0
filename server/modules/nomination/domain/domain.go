// Package domain описывает сущности, порты и ошибки модуля nomination.
package domain

import (
	"context"
	"errors"
	"time"
)

// Доменные ошибки. Слой api мапит их в connect.Code.
var (
	// ErrNotFound — номинация или указанный турнир не найдены (в MVP —
	// tournament_id не совпадает с активным турниром).
	ErrNotFound = errors.New("nomination: not found")
	// ErrInvalidInput — некорректные входные данные (пустое название,
	// отрицательная вместимость, пустой tournament_id, некорректный
	// упорядоченный список id в Reorder).
	ErrInvalidInput = errors.New("nomination: invalid input")
	// ErrConflict — дубликат названия номинации в пределах турнира.
	ErrConflict = errors.New("nomination: title already exists in tournament")
	// ErrCannotReopen — ReopenRegistration отклонён: закрытие не было ручным
	// (причина drawing) либо сейчас есть распределённые бойцы (раскладка
	// активна) — единый код для обоих случаев FR-4 (AC-9/AC-16), спека не
	// требует различать их в ответе клиенту.
	ErrCannotReopen = errors.New("nomination: registration cannot be reopened")
	// ErrHasDistributedFighters — Delete отклонён: в номинации есть боец,
	// распределённый в пул любой её стадии (спека 0040, FR-1а, AC-1).
	ErrHasDistributedFighters = errors.New("nomination: has distributed fighters")
	// ErrHasBouts — Delete отклонён: в номинации есть хотя бы один
	// поставленный (в процессе или завершённый) бой (спека 0040, FR-1б,
	// AC-2).
	ErrHasBouts = errors.New("nomination: has bouts")
)

// Status — статус жизненного цикла номинации (спека 0012, FR-1). Публичное
// перечисление; ACTIVE/FINISHED — закладки под будущую фазу боёв, в этом
// инкременте не назначаются и не имеют переходов.
type Status string

const (
	StatusOpen     Status = "open"
	StatusClosed   Status = "closed"
	StatusActive   Status = "active"
	StatusFinished Status = "finished"
)

// ExecutionState — исполнительная ось номинации: прогресс боёв этапов
// (спека 0021, FR-4/FR-5). Синхронизируется push'ом из модуля stage,
// независимо от регистрационной оси (Status). ExecutionNone — этапы ещё не
// начались или их нет.
type ExecutionState string

const (
	ExecutionNone     ExecutionState = "none"
	ExecutionActive   ExecutionState = "active"
	ExecutionFinished ExecutionState = "finished"
)

// ClosedReason — внутренняя (не публичная) причина статуса Closed. Нужна
// только для гейта ReopenRegistration (FR-4) и условного авто-отката
// SyncRegistrationState (FR-6). ClosedReasonNone — когда номинация не
// закрыта.
type ClosedReason string

const (
	ClosedReasonNone    ClosedReason = ""
	ClosedReasonManual  ClosedReason = "manual"
	ClosedReasonDrawing ClosedReason = "drawing"
)

// Metadata — типизированная закрытая схема прочих данных номинации. Все поля
// опциональны. Сериализуется в jsonb только объявленными ключами; пустая
// структура сериализуется в "{}".
type Metadata struct {
	// RulesURL — ссылка на правила/регламент номинации. Пусто = не задано.
	RulesURL string
}

// Nomination — доменная сущность номинации турнира.
type Nomination struct {
	ID           string
	TournamentID string
	Title        string
	Description  string
	// FighterCapacity — плановая вместимость. Опционально (нулевое
	// HasFighterCapacity означает «не задано»).
	FighterCapacity    int32
	HasFighterCapacity bool
	Metadata           Metadata
	// Position — порядок в списке номинаций турнира (0-индекс).
	Position  int32
	CreatedAt time.Time
	UpdatedAt time.Time
	// Status — статус жизненного цикла (спека 0012, FR-1). Публичное поле.
	Status Status
	// ClosedReason — внутренняя причина статуса Closed (manual/drawing).
	// Не публична (не выносится в proto). ClosedReasonNone, когда Status !=
	// Closed.
	ClosedReason ClosedReason
	// HasDistributedFighters — снапшот факта «раскладка активна» (есть ≥1
	// распределённый боец), обновляемый push'ом из модуля pool
	// (SyncRegistrationState). Внутреннее поле, не публично.
	HasDistributedFighters bool
	// Execution — исполнительная ось (спека 0021), обновляемая push'ом из
	// модуля stage (SyncExecutionState). Внутреннее поле, не публично —
	// наружу отдаётся через PublicStatus().
	Execution ExecutionState
}

// PublicStatus — публичный статус номинации: исполнительная ось (Execution)
// вытесняет регистрационную (Status), когда она не ExecutionNone (спека
// 0021, FR-4, NFR-4). Регистрационная ось (Status/ClosedReason) при этом не
// меняется — она нужна, чтобы знать, куда вернуться при откате из
// ACTIVE/FINISHED (0012, FR-4/FR-5).
func (n Nomination) PublicStatus() Status {
	switch n.Execution {
	case ExecutionActive:
		return StatusActive
	case ExecutionFinished:
		return StatusFinished
	default:
		return n.Status
	}
}

// CreateInput — значения полей при создании номинации.
type CreateInput struct {
	Title              string
	Description        string
	FighterCapacity    int32
	HasFighterCapacity bool
	Metadata           Metadata
}

// UpdateInput — новые значения полей существующей номинации (полная замена).
// TournamentID неизменяем и в структуре не участвует.
type UpdateInput struct {
	ID                 string
	Title              string
	Description        string
	FighterCapacity    int32
	HasFighterCapacity bool
	Metadata           Metadata
}

// Repository — порт доступа к хранилищу номинаций.
// Реализуется в слое repo; service зависит от этого интерфейса, не от pg.
type Repository interface {
	// ListByTournament возвращает номинации турнира по порядку (position ASC).
	ListByTournament(ctx context.Context, tournamentID string) ([]Nomination, error)
	// GetByID возвращает номинацию по идентификатору.
	GetByID(ctx context.Context, id string) (Nomination, error)
	// Create создаёт номинацию у турнира; position = следующий за максимумом
	// среди существующих номинаций турнира.
	Create(ctx context.Context, tournamentID string, in CreateInput) (Nomination, error)
	// Update обновляет поля существующей номинации.
	Update(ctx context.Context, in UpdateInput) (Nomination, error)
	// Delete удаляет номинацию по идентификатору.
	Delete(ctx context.Context, id string) error
	// Reorder атомарно задаёт позиции номинаций турнира по порядку orderedIDs
	// и возвращает обновлённый список.
	Reorder(ctx context.Context, tournamentID string, orderedIDs []string) ([]Nomination, error)
	// SetRegistrationState — единая точка записи статуса, причины закрытия и
	// снапшота «раскладка активна». Используется CloseRegistration,
	// ReopenRegistration и SyncRegistrationState (спека 0012).
	SetRegistrationState(ctx context.Context, id string, status Status, reason ClosedReason, hasDistributed bool) (Nomination, error)
	// SetExecutionState записывает исполнительную ось номинации (спека 0021,
	// push из модуля stage). Используется SyncExecutionState.
	SetExecutionState(ctx context.Context, id string, state ExecutionState) (Nomination, error)
}

// ActiveTournamentProvider — межмодульная зависимость: резолв идентификатора
// активного турнира через API модуля tournament (без прямого доступа к его
// PG-схеме). Используется service для валидации tournament_id, переданного
// клиентом (в MVP: должен совпадать с активным турниром).
type ActiveTournamentProvider interface {
	ActiveTournamentID(ctx context.Context) (string, error)
}

// PoolOccupancyChecker — межмодульная зависимость: есть ли в номинации хотя
// бы один боец, распределённый в пул любой её стадии (через API модуля
// stage, без прямого доступа к его PG-схеме — ADR 0002). Используется
// Delete как гейт на удаление номинации (спека 0040, FR-1а).
type PoolOccupancyChecker interface {
	HasDistributedFighters(ctx context.Context, nominationID string) (bool, error)
}

// BoutOccupancyChecker — межмодульная зависимость: есть ли в номинации хотя
// бы один поставленный (в процессе или завершённый) бой (через API модуля
// bout, без прямого доступа к его PG-схеме — ADR 0002). Используется Delete
// как гейт на удаление номинации (спека 0040, FR-1б).
type BoutOccupancyChecker interface {
	HasBouts(ctx context.Context, nominationID string) (bool, error)
}
