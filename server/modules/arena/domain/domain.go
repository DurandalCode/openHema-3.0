// Package domain описывает сущности, порты и ошибки модуля arena.
package domain

import (
	"context"
	"errors"
	"strings"
	"time"
)

// Доменные ошибки. Слой api мапит их в connect.Code.
var (
	// ErrNotFound — площадка или указанный турнир не найдены (в MVP —
	// tournament_id не совпадает с активным турниром).
	ErrNotFound = errors.New("arena: not found")
	// ErrInvalidInput — некорректные входные данные (пустое имя, пустой
	// tournament_id, некорректный упорядоченный список id в Reorder).
	ErrInvalidInput = errors.New("arena: invalid input")
)

// Status — статус площадки. Архивация — обратимое «удаление» (FR-5):
// строка остаётся в системе, на неё сошлются будущие бои.
type Status string

const (
	// StatusActive — активная площадка, участвует в конфигурации турнира.
	StatusActive Status = "active"
	// StatusArchived — площадка в архиве; остаётся доступной по стабильному
	// URL, но не принимает новые бои (когда они появятся).
	StatusArchived Status = "archived"
)

// Arena — доменная сущность площадки/ристалища турнира. Независимый агрегат:
// не ссылается на бойцов/номинации/заявки. Будущие бои будут ссылаться на
// arena_id (без кросс-схемного FK, ADR 0002).
type Arena struct {
	ID           string
	TournamentID string
	Name         string
	Description  string
	// Position — порядок в списке площадок турнира (0-индекс).
	Position   int32
	Status     Status
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// CreateInput — значения полей при создании площадки.
type CreateInput struct {
	Name        string
	Description string
}

// UpdateInput — новые значения полей существующей площадки (полная замена
// редактируемых полей: name, description). ID и TournamentID неизменяемы.
type UpdateInput struct {
	ID          string
	Name        string
	Description string
}

// Repository — порт доступа к хранилищу площадок.
// Реализуется в слое repo; service зависит от этого интерфейса, не от pg.
type Repository interface {
	// ListByTournament возвращает площадки турнира по порядку (position ASC),
	// включая архивные (различимы по Status).
	ListByTournament(ctx context.Context, tournamentID string) ([]Arena, error)
	// GetByID возвращает площадку по идентификатору.
	GetByID(ctx context.Context, id string) (Arena, error)
	// Create создаёт площадку у турнира; position = следующий за максимумом
	// среди существующих площадок турнира.
	Create(ctx context.Context, tournamentID string, in CreateInput) (Arena, error)
	// Update обновляет редактируемые поля существующей площадки.
	Update(ctx context.Context, in UpdateInput) (Arena, error)
	// SetStatus переключает статус площадки (active↔archived). Идемпотентна.
	SetStatus(ctx context.Context, id string, status Status) (Arena, error)
	// Reorder атомарно задаёт позиции площадок турнира по порядку orderedIDs
	// и возвращает обновлённый список.
	Reorder(ctx context.Context, tournamentID string, orderedIDs []string) ([]Arena, error)
}

// ActiveTournamentProvider — межмодульная зависимость: резолв идентификатора
// активного турнира через API модуля tournament (без прямого доступа к его
// PG-схеме). Используется service для валидации tournament_id, переданного
// клиентом (в MVP: должен совпадать с активным турниром).
type ActiveTournamentProvider interface {
	ActiveTournamentID(ctx context.Context) (string, error)
}

// ValidateName проверяет инвариант имени площадки: непустое после тримминга
// (FR-2, FR-4). Используется service-слоем и юнит-тестом domain.
func ValidateName(name string) error {
	if strings.TrimSpace(name) == "" {
		return ErrInvalidInput
	}
	return nil
}