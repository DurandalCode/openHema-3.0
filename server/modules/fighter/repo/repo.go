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

// ListByTournament возвращает страницу ростера турнира: бойцов с их
// участиями, отфильтрованных/упорядоченных/нарезанных по filter (спека
// 0041, FR-1..FR-3).
func (r *Repo) ListByTournament(ctx context.Context, tournamentID string, filter domain.RosterFilter) ([]domain.Fighter, error) {
	tid, err := uuid.Parse(tournamentID)
	if err != nil {
		return nil, fmt.Errorf("parse tournament id: %w", err)
	}
	statuses, clubs, nominationIDs, err := rosterFilterSlices(filter)
	if err != nil {
		return nil, err
	}
	rows, err := r.q.ListRosterByTournament(ctx, sqlc.ListRosterByTournamentParams{
		TournamentID:  tid,
		Statuses:      statuses,
		Clubs:         clubs,
		IncludeNoClub: filter.IncludeNoClub,
		NominationIds: nominationIDs,
		Search:        filter.Search,
		RowLimit:      filter.Limit,
		RowOffset:     filter.Offset,
	})
	if err != nil {
		return nil, fmt.Errorf("list roster by tournament: %w", err)
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

// CountRoster возвращает число бойцов турнира, подходящих под filter, без
// Limit/Offset — для постраничной навигации (спека 0041, FR-5). Тот же
// WHERE, что ListByTournament.
func (r *Repo) CountRoster(ctx context.Context, tournamentID string, filter domain.RosterFilter) (int, error) {
	tid, err := uuid.Parse(tournamentID)
	if err != nil {
		return 0, fmt.Errorf("parse tournament id: %w", err)
	}
	statuses, clubs, nominationIDs, err := rosterFilterSlices(filter)
	if err != nil {
		return 0, err
	}
	count, err := r.q.CountRosterByTournament(ctx, sqlc.CountRosterByTournamentParams{
		TournamentID:  tid,
		Statuses:      statuses,
		Clubs:         clubs,
		IncludeNoClub: filter.IncludeNoClub,
		NominationIds: nominationIDs,
		Search:        filter.Search,
	})
	if err != nil {
		return 0, fmt.Errorf("count roster by tournament: %w", err)
	}
	return int(count), nil
}

// CountRosterByStatus возвращает счётчики бойцов по статусу для всего
// турнира вне зависимости от фильтра/поиска (спека 0041, FR-4) — только
// tournament_id.
func (r *Repo) CountRosterByStatus(ctx context.Context, tournamentID string) (map[domain.Status]int, error) {
	tid, err := uuid.Parse(tournamentID)
	if err != nil {
		return nil, fmt.Errorf("parse tournament id: %w", err)
	}
	rows, err := r.q.CountByTournamentStatus(ctx, tid)
	if err != nil {
		return nil, fmt.Errorf("count by tournament status: %w", err)
	}
	out := make(map[domain.Status]int, len(rows))
	for _, row := range rows {
		out[domain.Status(row.Status)] = int(row.Count)
	}
	return out, nil
}

// rosterFilterSlices преобразует срезы RosterFilter в SQL-параметры.
// Statuses/Clubs всегда возвращаются non-nil (пустой, но не NULL) срезом —
// иначе pgx закодирует их как SQL NULL, а cardinality(NULL::text[]) не
// равен 0, и условие "пустой фильтр = без ограничения" в
// repo/queries/fighter.sql перестанет работать (NULL OR ... даёт NULL/false,
// а не true).
func rosterFilterSlices(filter domain.RosterFilter) (statuses, clubs []string, nominationIDs []uuid.UUID, err error) {
	statuses = make([]string, len(filter.Statuses))
	for i, s := range filter.Statuses {
		statuses[i] = string(s)
	}
	clubs = make([]string, len(filter.Clubs))
	copy(clubs, filter.Clubs)

	nominationIDs = make([]uuid.UUID, 0, len(filter.NominationIDs))
	for _, id := range filter.NominationIDs {
		nid, parseErr := uuid.Parse(id)
		if parseErr != nil {
			return nil, nil, nil, fmt.Errorf("parse nomination id: %w", parseErr)
		}
		nominationIDs = append(nominationIDs, nid)
	}
	return statuses, clubs, nominationIDs, nil
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

// MergeParticipations переносит участия source в target в одной транзакции
// (спека 0040, FR-10): сначала удаляет строки source, дублирующие участие
// target по номинации, затем репойнтит остаток на target. Два отдельных
// sqlc-запроса вместо одного многостейтментного — см. комментарий в
// repo/queries/fighter.sql.
func (r *Repo) MergeParticipations(ctx context.Context, sourceID, targetID string) error {
	sid, err := uuid.Parse(sourceID)
	if err != nil {
		return fmt.Errorf("parse source id: %w", err)
	}
	tid, err := uuid.Parse(targetID)
	if err != nil {
		return fmt.Errorf("parse target id: %w", err)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	if err := q.DeleteDuplicateParticipationsForMerge(ctx, sqlc.DeleteDuplicateParticipationsForMergeParams{
		SourceID: sid,
		TargetID: tid,
	}); err != nil {
		return fmt.Errorf("delete duplicate participations: %w", err)
	}
	if err := q.RepointParticipations(ctx, sqlc.RepointParticipationsParams{
		SourceID: sid,
		TargetID: tid,
	}); err != nil {
		return fmt.Errorf("repoint participations: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// ClearOriginUserID снимает привязку записи к учётке (FR-10a).
func (r *Repo) ClearOriginUserID(ctx context.Context, fighterID string) error {
	fid, err := uuid.Parse(fighterID)
	if err != nil {
		return fmt.Errorf("parse fighter id: %w", err)
	}
	if err := r.q.ClearOriginUserID(ctx, fid); err != nil {
		return fmt.Errorf("clear origin user id: %w", err)
	}
	return nil
}

// SetMerged помечает source объединённым: status=merged,
// merged_into_id=targetID.
func (r *Repo) SetMerged(ctx context.Context, sourceID, targetID string) error {
	sid, err := uuid.Parse(sourceID)
	if err != nil {
		return fmt.Errorf("parse source id: %w", err)
	}
	tid, err := uuid.Parse(targetID)
	if err != nil {
		return fmt.Errorf("parse target id: %w", err)
	}
	if err := r.q.SetMerged(ctx, sqlc.SetMergedParams{
		SourceID: sid,
		TargetID: pgtype.UUID{Bytes: [16]byte(tid), Valid: true},
	}); err != nil {
		return fmt.Errorf("set merged: %w", err)
	}
	return nil
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
	if row.MergedIntoID.Valid {
		f.MergedIntoID = uuid.UUID(row.MergedIntoID.Bytes).String()
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
