// Package repo реализует domain.Repository поверх сгенерированного sqlc-кода.
package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/modules/nomination/domain"
	"github.com/hema/server/modules/nomination/repo/sqlc"
)

// uniqueViolation — код ошибки PostgreSQL для нарушения уникального
// констрейнта/индекса (используется для nominations_title_per_tournament).
const uniqueViolation = "23505"

// Repo — адаптер к PostgreSQL для модуля nomination.
type Repo struct {
	pool *pgxpool.Pool
	q    *sqlc.Queries
}

// New создаёт репозиторий поверх пула соединений.
func New(pool *pgxpool.Pool) *Repo {
	return &Repo{pool: pool, q: sqlc.New(pool)}
}

var _ domain.Repository = (*Repo)(nil)

// ListByTournament возвращает номинации турнира по порядку (position ASC).
func (r *Repo) ListByTournament(ctx context.Context, tournamentID string) ([]domain.Nomination, error) {
	tid, err := uuid.Parse(tournamentID)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	rows, err := r.q.ListNominationsByTournament(ctx, tid)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Nomination, 0, len(rows))
	for _, row := range rows {
		n, err := toDomain(row)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, nil
}

// GetByID возвращает номинацию по идентификатору.
func (r *Repo) GetByID(ctx context.Context, id string) (domain.Nomination, error) {
	nid, err := uuid.Parse(id)
	if err != nil {
		return domain.Nomination{}, domain.ErrNotFound
	}
	row, err := r.q.GetNomination(ctx, nid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Nomination{}, domain.ErrNotFound
		}
		return domain.Nomination{}, err
	}
	return toDomain(row)
}

// Create создаёт номинацию у турнира; position = следующий за максимумом
// среди существующих номинаций турнира. MaxPosition + Insert выполняются в
// одной транзакции, чтобы конкурентные Create не получили одинаковую позицию.
func (r *Repo) Create(ctx context.Context, tournamentID string, in domain.CreateInput) (domain.Nomination, error) {
	tid, err := uuid.Parse(tournamentID)
	if err != nil {
		return domain.Nomination{}, domain.ErrNotFound
	}

	metadata, err := marshalMetadata(in.Metadata)
	if err != nil {
		return domain.Nomination{}, fmt.Errorf("marshal metadata: %w", err)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.Nomination{}, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := r.q.WithTx(tx)
	maxPos, err := q.MaxPosition(ctx, tid)
	if err != nil {
		return domain.Nomination{}, fmt.Errorf("max position: %w", err)
	}

	row, err := q.CreateNomination(ctx, sqlc.CreateNominationParams{
		TournamentID:    tid,
		Title:           in.Title,
		Description:     in.Description,
		FighterCapacity: capacityPtr(in.FighterCapacity, in.HasFighterCapacity),
		Metadata:        metadata,
		Position:        maxPos + 1,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return domain.Nomination{}, domain.ErrConflict
		}
		return domain.Nomination{}, fmt.Errorf("insert nomination: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.Nomination{}, fmt.Errorf("commit: %w", err)
	}
	return toDomain(row)
}

// Update обновляет поля существующей номинации.
func (r *Repo) Update(ctx context.Context, in domain.UpdateInput) (domain.Nomination, error) {
	nid, err := uuid.Parse(in.ID)
	if err != nil {
		return domain.Nomination{}, domain.ErrNotFound
	}
	metadata, err := marshalMetadata(in.Metadata)
	if err != nil {
		return domain.Nomination{}, fmt.Errorf("marshal metadata: %w", err)
	}

	row, err := r.q.UpdateNomination(ctx, sqlc.UpdateNominationParams{
		ID:              nid,
		Title:           in.Title,
		Description:     in.Description,
		FighterCapacity: capacityPtr(in.FighterCapacity, in.HasFighterCapacity),
		Metadata:        metadata,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Nomination{}, domain.ErrNotFound
		}
		if isUniqueViolation(err) {
			return domain.Nomination{}, domain.ErrConflict
		}
		return domain.Nomination{}, fmt.Errorf("update nomination: %w", err)
	}
	return toDomain(row)
}

// Delete удаляет номинацию по идентификатору.
func (r *Repo) Delete(ctx context.Context, id string) error {
	nid, err := uuid.Parse(id)
	if err != nil {
		return domain.ErrNotFound
	}
	affected, err := r.q.DeleteNomination(ctx, nid)
	if err != nil {
		return fmt.Errorf("delete nomination: %w", err)
	}
	if affected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// Reorder атомарно задаёт позиции номинаций турнира по порядку orderedIDs и
// возвращает обновлённый список. Предполагает, что orderedIDs уже
// провалидирован вызывающим (service) как ровно текущий набор id турнира.
func (r *Repo) Reorder(ctx context.Context, tournamentID string, orderedIDs []string) ([]domain.Nomination, error) {
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
		nid, err := uuid.Parse(id)
		if err != nil {
			return nil, domain.ErrNotFound
		}
		affected, err := q.SetNominationPosition(ctx, sqlc.SetNominationPositionParams{
			ID:       nid,
			Position: int32(i),
		})
		if err != nil {
			return nil, fmt.Errorf("set position %d: %w", i, err)
		}
		if affected == 0 {
			return nil, domain.ErrNotFound
		}
	}

	rows, err := q.ListNominationsByTournament(ctx, tid)
	if err != nil {
		return nil, fmt.Errorf("list after reorder: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	out := make([]domain.Nomination, 0, len(rows))
	for _, row := range rows {
		n, err := toDomain(row)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, nil
}

// SetRegistrationState записывает статус, причину закрытия и снапшот
// «раскладка активна» существующей номинации (спека 0012).
func (r *Repo) SetRegistrationState(ctx context.Context, id string, status domain.Status, reason domain.ClosedReason, hasDistributed bool) (domain.Nomination, error) {
	nid, err := uuid.Parse(id)
	if err != nil {
		return domain.Nomination{}, domain.ErrNotFound
	}

	row, err := r.q.SetRegistrationState(ctx, sqlc.SetRegistrationStateParams{
		ID:                     nid,
		Status:                 string(status),
		ClosedReason:           closedReasonPtr(reason),
		HasDistributedFighters: hasDistributed,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Nomination{}, domain.ErrNotFound
		}
		return domain.Nomination{}, fmt.Errorf("set registration state: %w", err)
	}
	return toDomain(row)
}

func toDomain(row sqlc.NominationNomination) (domain.Nomination, error) {
	meta, err := unmarshalMetadata(row.Metadata)
	if err != nil {
		return domain.Nomination{}, fmt.Errorf("unmarshal metadata: %w", err)
	}
	out := domain.Nomination{
		ID:           row.ID.String(),
		TournamentID: row.TournamentID.String(),
		Title:        row.Title,
		Description:  row.Description,
		Metadata:     meta,
		Position:     row.Position,
		CreatedAt:    row.CreatedAt,
		UpdatedAt:    row.UpdatedAt,
		Status:       domain.Status(row.Status),
	}
	if row.ClosedReason != nil {
		out.ClosedReason = domain.ClosedReason(*row.ClosedReason)
	}
	out.HasDistributedFighters = row.HasDistributedFighters
	if row.FighterCapacity != nil {
		out.FighterCapacity = *row.FighterCapacity
		out.HasFighterCapacity = true
	}
	return out, nil
}

// jsonMetadata — сериализуемое представление domain.Metadata: пишем/читаем
// только объявленные ключи типизированной схемы (закрытая схема на уровне
// contract'а; на уровне jsonb — только известные поля).
type jsonMetadata struct {
	RulesURL string `json:"rules_url,omitempty"`
}

func marshalMetadata(m domain.Metadata) ([]byte, error) {
	return json.Marshal(jsonMetadata{RulesURL: m.RulesURL})
}

func unmarshalMetadata(raw []byte) (domain.Metadata, error) {
	if len(raw) == 0 {
		return domain.Metadata{}, nil
	}
	var m jsonMetadata
	if err := json.Unmarshal(raw, &m); err != nil {
		return domain.Metadata{}, err
	}
	return domain.Metadata{RulesURL: m.RulesURL}, nil
}

func capacityPtr(v int32, has bool) *int32 {
	if !has {
		return nil
	}
	return &v
}

// closedReasonPtr преобразует domain.ClosedReason в *string для колонки
// closed_reason (NULL, когда причина не задана — ClosedReasonNone).
func closedReasonPtr(r domain.ClosedReason) *string {
	if r == domain.ClosedReasonNone {
		return nil
	}
	s := string(r)
	return &s
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == uniqueViolation
}
