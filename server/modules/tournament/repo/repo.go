// Package repo реализует domain.Repository поверх сгенерированного sqlc-кода.
package repo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/modules/tournament/domain"
	"github.com/hema/server/modules/tournament/repo/sqlc"
)

// Repo — адаптер к PostgreSQL для модуля tournament.
type Repo struct {
	pool *pgxpool.Pool
	q    *sqlc.Queries
}

// New создаёт репозиторий поверх пула соединений.
func New(pool *pgxpool.Pool) *Repo {
	return &Repo{pool: pool, q: sqlc.New(pool)}
}

var _ domain.Repository = (*Repo)(nil)

// GetActive возвращает активный турнир с контактами.
func (r *Repo) GetActive(ctx context.Context) (domain.Tournament, error) {
	row, err := r.q.GetActiveTournament(ctx)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Tournament{}, domain.ErrNotFound
		}
		return domain.Tournament{}, err
	}
	contacts, err := r.q.ListContactsByTournament(ctx, row.ID)
	if err != nil {
		return domain.Tournament{}, fmt.Errorf("list contacts: %w", err)
	}
	return toDomainFromGet(row, contacts), nil
}

// UpdateActive атомарно обновляет поля активного турнира и заменяет набор
// контактов. Замена контактов (delete+insert) выполняется в одной транзакции
// с обновлением турнира.
func (r *Repo) UpdateActive(ctx context.Context, in domain.UpdateInput) (domain.Tournament, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.Tournament{}, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := r.q.WithTx(tx)
	row, err := q.UpdateActiveTournament(ctx, sqlc.UpdateActiveTournamentParams{
		Title:          in.Title,
		Description:    in.Description,
		EventStartAt:  toPgTimestamptz(in.EventStartAt, in.HasEventStartAt),
		EventEndAt:    toPgTimestamptz(in.EventEndAt, in.HasEventEndAt),
		EmblemUrl:      in.EmblemURL,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Tournament{}, domain.ErrNotFound
		}
		return domain.Tournament{}, fmt.Errorf("update tournament: %w", err)
	}

	if err := q.DeleteContactsByTournament(ctx, row.ID); err != nil {
		return domain.Tournament{}, fmt.Errorf("delete contacts: %w", err)
	}

	contacts := make([]sqlc.TournamentContact, 0, len(in.Contacts))
	for i, c := range in.Contacts {
		inserted, err := q.InsertContact(ctx, sqlc.InsertContactParams{
			TournamentID: row.ID,
			Type:         string(c.Type),
			Value:        c.Value,
			Position:     int32(i),
		})
		if err != nil {
			return domain.Tournament{}, fmt.Errorf("insert contact %d: %w", i, err)
		}
		contacts = append(contacts, inserted)
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.Tournament{}, fmt.Errorf("commit: %w", err)
	}
	return toDomainFromUpdate(row, contacts), nil
}

// toDomainFromGet отображает sqlc Row (Get) в доменный турнир вместе с контактами.
func toDomainFromGet(row sqlc.GetActiveTournamentRow, contacts []sqlc.TournamentContact) domain.Tournament {
	return buildTournament(
		row.ID.String(), row.Title, row.Description,
		row.EventStartAt, row.EventEndAt, row.EmblemUrl,
		row.IsActive, row.CreatedAt, row.UpdatedAt, contacts,
	)
}

// toDomainFromUpdate отображает sqlc Row (Update) в доменный турнир вместе с контактами.
func toDomainFromUpdate(row sqlc.UpdateActiveTournamentRow, contacts []sqlc.TournamentContact) domain.Tournament {
	return buildTournament(
		row.ID.String(), row.Title, row.Description,
		row.EventStartAt, row.EventEndAt, row.EmblemUrl,
		row.IsActive, row.CreatedAt, row.UpdatedAt, contacts,
	)
}

func buildTournament(
	id, title, description string,
	eventStartAt, eventEndAt pgtype.Timestamptz, emblemUrl string,
	isActive bool, createdAt, updatedAt time.Time,
	contacts []sqlc.TournamentContact,
) domain.Tournament {
	out := domain.Tournament{
		ID:               id,
		Title:            title,
		Description:      description,
		EventStartAt:     eventStartAt.Time,
		HasEventStartAt:  eventStartAt.Valid,
		EventEndAt:       eventEndAt.Time,
		HasEventEndAt:    eventEndAt.Valid,
		EmblemURL:        emblemUrl,
		IsActive:         isActive,
		CreatedAt:        createdAt,
		UpdatedAt:        updatedAt,
		Contacts:         make([]domain.Contact, 0, len(contacts)),
	}
	for _, c := range contacts {
		out.Contacts = append(out.Contacts, domain.Contact{
			ID:       c.ID.String(),
			Type:     domain.ContactType(c.Type),
			Value:    c.Value,
			Position: c.Position,
		})
	}
	return out
}

func toPgTimestamptz(t time.Time, ok bool) pgtype.Timestamptz {
	if !ok {
		return pgtype.Timestamptz{Valid: false}
	}
	return pgtype.Timestamptz{Time: t, Valid: true}
}