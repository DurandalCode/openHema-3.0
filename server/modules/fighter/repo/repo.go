// Package repo реализует domain.Repository поверх сгенерированного sqlc-кода.
//
// Create/Update сохраняют бойца целиком (полный набор участий) в одной
// транзакции: участия синхронизируются через UpsertParticipation по каждой
// строке domain.Fighter.Participations (спека 0007, план — «upsert бойца+
// участий в транзакции»).
package repo

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/modules/fighter/domain"
	"github.com/hema/server/modules/fighter/repo/sqlc"
)

const (
	uniqueViolation = "23505"
	// Имя констрейнта — см. modules/fighter/migrations/00001_init.sql.
	constraintOriginPerTournament = "uq_fighters_origin_per_tournament"
)

// Repo — адаптер к PostgreSQL для модуля fighter.
type Repo struct {
	pool *pgxpool.Pool
	q    *sqlc.Queries
}

// New создаёт репозиторий поверх пула соединений.
func New(pool *pgxpool.Pool) *Repo {
	return &Repo{pool: pool, q: sqlc.New(pool)}
}

var _ domain.Repository = (*Repo)(nil)

// Create вставляет нового бойца с участиями в одной транзакции.
func (r *Repo) Create(ctx context.Context, f domain.Fighter) (domain.Fighter, error) {
	tid, err := uuid.Parse(f.TournamentID)
	if err != nil {
		return domain.Fighter{}, fmt.Errorf("parse tournament id: %w", err)
	}
	originUUID, err := toNullableUUID(f.OriginUserID)
	if err != nil {
		return domain.Fighter{}, fmt.Errorf("parse origin user id: %w", err)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.Fighter{}, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	row, err := q.InsertFighter(ctx, sqlc.InsertFighterParams{
		TournamentID:     tid,
		Name:             f.Name,
		Club:             f.Club,
		OriginUserID:     originUUID,
		Status:           string(f.Status),
		WithdrawalReason: string(f.WithdrawalReason),
	})
	if err != nil {
		if isUniqueViolation(err, constraintOriginPerTournament) {
			return domain.Fighter{}, domain.ErrOriginConflict
		}
		return domain.Fighter{}, fmt.Errorf("insert fighter: %w", err)
	}

	if err := upsertParticipations(ctx, q, row.ID, f.Participations); err != nil {
		return domain.Fighter{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.Fighter{}, fmt.Errorf("commit: %w", err)
	}

	out := toDomain(row)
	out.Participations = f.Participations
	return out, nil
}

// Update сохраняет полное состояние существующего бойца (статус, причину,
// имя/клуб, полный набор участий) в одной транзакции.
func (r *Repo) Update(ctx context.Context, f domain.Fighter) (domain.Fighter, error) {
	fid, err := uuid.Parse(f.ID)
	if err != nil {
		return domain.Fighter{}, domain.ErrNotFound
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.Fighter{}, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	row, err := q.UpdateFighter(ctx, sqlc.UpdateFighterParams{
		ID:               fid,
		Name:             f.Name,
		Club:             f.Club,
		Status:           string(f.Status),
		WithdrawalReason: string(f.WithdrawalReason),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Fighter{}, domain.ErrNotFound
		}
		return domain.Fighter{}, fmt.Errorf("update fighter: %w", err)
	}

	if err := upsertParticipations(ctx, q, fid, f.Participations); err != nil {
		return domain.Fighter{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.Fighter{}, fmt.Errorf("commit: %w", err)
	}

	out := toDomain(row)
	out.Participations = f.Participations
	return out, nil
}

// GetByID возвращает бойца со всеми участиями.
func (r *Repo) GetByID(ctx context.Context, id string) (domain.Fighter, error) {
	fid, err := uuid.Parse(id)
	if err != nil {
		return domain.Fighter{}, domain.ErrNotFound
	}
	row, err := r.q.GetFighterByID(ctx, fid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Fighter{}, domain.ErrNotFound
		}
		return domain.Fighter{}, fmt.Errorf("get fighter: %w", err)
	}
	parts, err := r.q.ListParticipationsByFighter(ctx, fid)
	if err != nil {
		return domain.Fighter{}, fmt.Errorf("list participations: %w", err)
	}
	out := toDomain(row)
	out.Participations = toDomainParticipations(parts)
	return out, nil
}

// FindByOrigin ищет бойца по ключу происхождения в пределах турнира.
func (r *Repo) FindByOrigin(ctx context.Context, tournamentID, originUserID string) (domain.Fighter, error) {
	tid, err := uuid.Parse(tournamentID)
	if err != nil {
		return domain.Fighter{}, fmt.Errorf("parse tournament id: %w", err)
	}
	oid, err := uuid.Parse(originUserID)
	if err != nil {
		return domain.Fighter{}, fmt.Errorf("parse origin user id: %w", err)
	}
	row, err := r.q.FindFighterByOrigin(ctx, sqlc.FindFighterByOriginParams{
		TournamentID: tid,
		OriginUserID: pgtype.UUID{Bytes: [16]byte(oid), Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Fighter{}, domain.ErrNotFound
		}
		return domain.Fighter{}, fmt.Errorf("find fighter by origin: %w", err)
	}
	parts, err := r.q.ListParticipationsByFighter(ctx, row.ID)
	if err != nil {
		return domain.Fighter{}, fmt.Errorf("list participations: %w", err)
	}
	out := toDomain(row)
	out.Participations = toDomainParticipations(parts)
	return out, nil
}

// ListByTournament возвращает ростер турнира: бойцов с их участиями.
func (r *Repo) ListByTournament(ctx context.Context, tournamentID string) ([]domain.Fighter, error) {
	tid, err := uuid.Parse(tournamentID)
	if err != nil {
		return nil, fmt.Errorf("parse tournament id: %w", err)
	}
	rows, err := r.q.ListFightersByTournament(ctx, tid)
	if err != nil {
		return nil, fmt.Errorf("list fighters by tournament: %w", err)
	}
	if len(rows) == 0 {
		return []domain.Fighter{}, nil
	}

	ids := make([]uuid.UUID, len(rows))
	for i, row := range rows {
		ids[i] = row.ID
	}
	parts, err := r.q.ListParticipationsByFighterIDs(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("list participations by fighter ids: %w", err)
	}
	byFighter := make(map[uuid.UUID][]domain.Participation, len(rows))
	for _, p := range parts {
		byFighter[p.FighterID] = append(byFighter[p.FighterID], domain.Participation{
			NominationID: p.NominationID.String(),
			Status:       domain.ParticipationStatus(p.Status),
		})
	}

	out := make([]domain.Fighter, 0, len(rows))
	for _, row := range rows {
		f := toDomain(row)
		f.Participations = byFighter[row.ID]
		out = append(out, f)
	}
	return out, nil
}

// RosterByNomination возвращает публичный состав номинации.
func (r *Repo) RosterByNomination(ctx context.Context, nominationID string) ([]domain.RosterEntry, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return nil, fmt.Errorf("parse nomination id: %w", err)
	}
	rows, err := r.q.RosterByNomination(ctx, nid)
	if err != nil {
		return nil, fmt.Errorf("roster by nomination: %w", err)
	}
	out := make([]domain.RosterEntry, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.RosterEntry{
			Name: row.Name,
			Club: row.Club,
			InRoster: row.FighterStatus == string(domain.StatusActive) &&
				row.ParticipationStatus == string(domain.ParticipationActive),
		})
	}
	return out, nil
}

// ActiveFightersByNomination возвращает бойцов «в составе» номинации.
func (r *Repo) ActiveFightersByNomination(ctx context.Context, nominationID string) ([]domain.FighterRef, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return nil, fmt.Errorf("parse nomination id: %w", err)
	}
	rows, err := r.q.ActiveFightersByNomination(ctx, nid)
	if err != nil {
		return nil, fmt.Errorf("active fighters by nomination: %w", err)
	}
	out := make([]domain.FighterRef, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.FighterRef{ID: row.ID.String(), Name: row.Name, Club: row.Club})
	}
	return out, nil
}

func upsertParticipations(ctx context.Context, q *sqlc.Queries, fighterID uuid.UUID, participations []domain.Participation) error {
	for _, p := range participations {
		nid, err := uuid.Parse(p.NominationID)
		if err != nil {
			return fmt.Errorf("parse nomination id: %w", err)
		}
		if err := q.UpsertParticipation(ctx, sqlc.UpsertParticipationParams{
			FighterID:    fighterID,
			NominationID: nid,
			Status:       string(p.Status),
		}); err != nil {
			return fmt.Errorf("upsert participation: %w", err)
		}
	}
	return nil
}

func toDomain(row sqlc.FighterFighter) domain.Fighter {
	f := domain.Fighter{
		ID:               row.ID.String(),
		TournamentID:     row.TournamentID.String(),
		Name:             row.Name,
		Club:             row.Club,
		Status:           domain.Status(row.Status),
		WithdrawalReason: domain.Reason(row.WithdrawalReason),
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}
	if row.OriginUserID.Valid {
		s := uuid.UUID(row.OriginUserID.Bytes).String()
		f.OriginUserID = &s
	}
	return f
}

func toDomainParticipations(rows []sqlc.FighterParticipation) []domain.Participation {
	out := make([]domain.Participation, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.Participation{
			NominationID: row.NominationID.String(),
			Status:       domain.ParticipationStatus(row.Status),
		})
	}
	return out
}

func toNullableUUID(s *string) (pgtype.UUID, error) {
	if s == nil {
		return pgtype.UUID{}, nil
	}
	id, err := uuid.Parse(*s)
	if err != nil {
		return pgtype.UUID{}, err
	}
	return pgtype.UUID{Bytes: [16]byte(id), Valid: true}, nil
}

func isUniqueViolation(err error, constraintName string) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return false
	}
	return pgErr.Code == uniqueViolation && pgErr.ConstraintName == constraintName
}
