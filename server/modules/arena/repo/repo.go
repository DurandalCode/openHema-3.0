// Package repo реализует domain.Repository поверх сгенерированного sqlc-кода.
package repo

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/modules/arena/domain"
	"github.com/hema/server/modules/arena/repo/sqlc"
)

// Repo — адаптер к PostgreSQL для модуля arena.
type Repo struct {
	pool *pgxpool.Pool
	q    *sqlc.Queries
}

// New создаёт репозиторий поверх пула соединений.
func New(pool *pgxpool.Pool) *Repo {
	return &Repo{pool: pool, q: sqlc.New(pool)}
}

var _ domain.Repository = (*Repo)(nil)

// ListByTournament возвращает площадки турнира по порядку (position ASC),
// включая архивные.
func (r *Repo) ListByTournament(ctx context.Context, tournamentID string) ([]domain.Arena, error) {
	tid, err := uuid.Parse(tournamentID)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	rows, err := r.q.ListArenasByTournament(ctx, tid)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Arena, 0, len(rows))
	for _, row := range rows {
		out = append(out, toDomain(row))
	}
	return out, nil
}

// GetByID возвращает площадку по идентификатору.
func (r *Repo) GetByID(ctx context.Context, id string) (domain.Arena, error) {
	aid, err := uuid.Parse(id)
	if err != nil {
		return domain.Arena{}, domain.ErrNotFound
	}
	row, err := r.q.GetArena(ctx, aid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Arena{}, domain.ErrNotFound
		}
		return domain.Arena{}, err
	}
	return toDomain(row), nil
}

// Create создаёт площадку у турнира; position = следующий за максимумом
// среди существующих площадок турнира. MaxPosition + Insert выполняются в
// одной транзакции, чтобы конкурентные Create не получили одинаковую позицию.
func (r *Repo) Create(ctx context.Context, tournamentID string, in domain.CreateInput) (domain.Arena, error) {
	tid, err := uuid.Parse(tournamentID)
	if err != nil {
		return domain.Arena{}, domain.ErrNotFound
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.Arena{}, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := r.q.WithTx(tx)
	maxPos, err := q.MaxPosition(ctx, tid)
	if err != nil {
		return domain.Arena{}, fmt.Errorf("max position: %w", err)
	}

	row, err := q.CreateArena(ctx, sqlc.CreateArenaParams{
		TournamentID: tid,
		Name:         in.Name,
		Description:  in.Description,
		Position:     maxPos + 1,
	})
	if err != nil {
		return domain.Arena{}, fmt.Errorf("insert arena: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.Arena{}, fmt.Errorf("commit: %w", err)
	}
	return toDomain(row), nil
}

// Update обновляет редактируемые поля существующей площадки.
func (r *Repo) Update(ctx context.Context, in domain.UpdateInput) (domain.Arena, error) {
	aid, err := uuid.Parse(in.ID)
	if err != nil {
		return domain.Arena{}, domain.ErrNotFound
	}
	row, err := r.q.UpdateArena(ctx, sqlc.UpdateArenaParams{
		ID:          aid,
		Name:        in.Name,
		Description: in.Description,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Arena{}, domain.ErrNotFound
		}
		return domain.Arena{}, fmt.Errorf("update arena: %w", err)
	}
	return toDomain(row), nil
}

// SetStatus переключает статус площадки (active↔archived). Идемпотентна.
func (r *Repo) SetStatus(ctx context.Context, id string, status domain.Status) (domain.Arena, error) {
	aid, err := uuid.Parse(id)
	if err != nil {
		return domain.Arena{}, domain.ErrNotFound
	}
	row, err := r.q.SetArenaStatus(ctx, sqlc.SetArenaStatusParams{
		ID:     aid,
		Status: string(status),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Arena{}, domain.ErrNotFound
		}
		return domain.Arena{}, fmt.Errorf("set arena status: %w", err)
	}
	return toDomain(row), nil
}

// Reorder атомарно задаёт позиции площадок турнира по порядку orderedIDs и
// возвращает обновлённый список. Предполагает, что orderedIDs уже
// провалидирован вызывающим (service) как ровно текущий набор id турнира.
func (r *Repo) Reorder(ctx context.Context, tournamentID string, orderedIDs []string) ([]domain.Arena, error) {
	tid, err := uuid.Parse(tournamentID)
	if err != nil {
		return nil, domain.ErrNotFound
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := r.q.WithTx(tx)
	for i, id := range orderedIDs {
		aid, err := uuid.Parse(id)
		if err != nil {
			return nil, domain.ErrNotFound
		}
		affected, err := q.SetArenaPosition(ctx, sqlc.SetArenaPositionParams{
			ID:       aid,
			Position: int32(i),
		})
		if err != nil {
			return nil, fmt.Errorf("set position %d: %w", i, err)
		}
		if affected == 0 {
			return nil, domain.ErrNotFound
		}
	}

	rows, err := q.ListArenasByTournament(ctx, tid)
	if err != nil {
		return nil, fmt.Errorf("list after reorder: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	out := make([]domain.Arena, 0, len(rows))
	for _, row := range rows {
		out = append(out, toDomain(row))
	}
	return out, nil
}

func toDomain(row sqlc.ArenaArena) domain.Arena {
	return domain.Arena{
		ID:           row.ID.String(),
		TournamentID: row.TournamentID.String(),
		Name:         row.Name,
		Description:  row.Description,
		Position:     row.Position,
		Status:       domain.Status(row.Status),
		CreatedAt:    row.CreatedAt,
		UpdatedAt:    row.UpdatedAt,
	}
}