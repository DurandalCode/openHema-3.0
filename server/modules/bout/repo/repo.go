// Package repo реализует domain.Repository поверх сгенерированного
// sqlc-кода (спека 0010).
package repo

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/modules/bout/domain"
	"github.com/hema/server/modules/bout/repo/sqlc"
)

// Repo — адаптер к PostgreSQL для модуля bout.
type Repo struct {
	pool *pgxpool.Pool
	q    *sqlc.Queries
}

// New создаёт репозиторий поверх пула соединений.
func New(pool *pgxpool.Pool) *Repo {
	return &Repo{pool: pool, q: sqlc.New(pool)}
}

var _ domain.Repository = (*Repo)(nil)

// ReplaceForNomination одной транзакцией удаляет все бои номинации и
// вставляет новые (bouts == nil → только удаление — это и есть «очистить»,
// используется для обоих направлений: generate и clear реализованы через
// один и тот же repo-метод с разным входом, plan.md «Server» → domain).
func (r *Repo) ReplaceForNomination(ctx context.Context, nominationID string, bouts []domain.Bout) error {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return fmt.Errorf("parse nomination id: %w", err)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	if err := q.DeleteBoutsByNomination(ctx, nid); err != nil {
		return fmt.Errorf("delete bouts: %w", err)
	}

	for _, b := range bouts {
		poolID, err := uuid.Parse(b.PoolID)
		if err != nil {
			return fmt.Errorf("parse pool id: %w", err)
		}
		fighterAID, err := uuid.Parse(b.FighterA.ID)
		if err != nil {
			return fmt.Errorf("parse fighter a id: %w", err)
		}
		fighterBID, err := uuid.Parse(b.FighterB.ID)
		if err != nil {
			return fmt.Errorf("parse fighter b id: %w", err)
		}
		if _, err := q.InsertBout(ctx, sqlc.InsertBoutParams{
			PoolID:         poolID,
			NominationID:   nid,
			RoundNumber:    int32(b.RoundNumber),
			SequenceNumber: int32(b.SequenceNumber),
			FighterAID:     fighterAID,
			FighterAName:   b.FighterA.Name,
			FighterAClub:   b.FighterA.Club,
			FighterBID:     fighterBID,
			FighterBName:   b.FighterB.Name,
			FighterBClub:   b.FighterB.Club,
		}); err != nil {
			return fmt.Errorf("insert bout: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// ListByNomination возвращает бои номинации, отсортированные по pool_id,
// затем sequence_number (порядок задан на уровне SQL-запроса).
func (r *Repo) ListByNomination(ctx context.Context, nominationID string) ([]domain.Bout, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return nil, fmt.Errorf("parse nomination id: %w", err)
	}

	rows, err := r.q.ListBoutsByNomination(ctx, nid)
	if err != nil {
		return nil, fmt.Errorf("list bouts: %w", err)
	}

	out := make([]domain.Bout, len(rows))
	for i, row := range rows {
		out[i] = domain.Bout{
			ID:             row.ID.String(),
			PoolID:         row.PoolID.String(),
			NominationID:   row.NominationID.String(),
			RoundNumber:    int(row.RoundNumber),
			SequenceNumber: int(row.SequenceNumber),
			FighterA: domain.FighterRef{
				ID: row.FighterAID.String(), Name: row.FighterAName, Club: row.FighterAClub,
			},
			FighterB: domain.FighterRef{
				ID: row.FighterBID.String(), Name: row.FighterBName, Club: row.FighterBClub,
			},
		}
	}
	return out, nil
}
