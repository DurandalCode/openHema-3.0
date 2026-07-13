// Package repo реализует domain.Repository поверх сгенерированного sqlc-кода.
//
// Append атомарно пишет событие в журнал (application.events) и обновляет
// инлайн-проекцию (application.application_current) в одной транзакции
// (ADR 0011). Два разных нарушения уникальности различаются по имени
// констрейнта: конфликт версии потока → ErrConcurrency, нарушение инварианта
// «нет активного дубля» → ErrDuplicateActive.
package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/modules/application/domain"
	"github.com/hema/server/modules/application/repo/sqlc"
)

const (
	uniqueViolation = "23505"
	// Имена констрейнтов — см. modules/application/migrations/00001_init.sql.
	constraintStreamVersion   = "uq_events_stream_version"
	constraintActiveDuplicate = "uq_current_active_per_user_nomination"
)

// Repo — адаптер к PostgreSQL для модуля application.
type Repo struct {
	pool *pgxpool.Pool
	q    *sqlc.Queries
}

// New создаёт репозиторий поверх пула соединений.
func New(pool *pgxpool.Pool) *Repo {
	return &Repo{pool: pool, q: sqlc.New(pool)}
}

var _ domain.Repository = (*Repo)(nil)

// Load возвращает поток событий заявки, упорядоченный по версии.
func (r *Repo) Load(ctx context.Context, appID string) ([]domain.Event, error) {
	aid, err := uuid.Parse(appID)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	rows, err := r.q.LoadStream(ctx, aid)
	if err != nil {
		return nil, fmt.Errorf("load stream: %w", err)
	}
	if len(rows) == 0 {
		return nil, domain.ErrNotFound
	}
	out := make([]domain.Event, 0, len(rows))
	for _, row := range rows {
		ev, err := toDomainEvent(row)
		if err != nil {
			return nil, err
		}
		out = append(out, ev)
	}
	return out, nil
}

// Append атомарно вставляет событие (version = expectedVersion+1) и обновляет
// проекцию в одной транзакции.
func (r *Repo) Append(ctx context.Context, appID string, expectedVersion int, ev domain.Event, view domain.ApplicationView) error {
	aid, err := uuid.Parse(appID)
	if err != nil {
		return domain.ErrNotFound
	}
	actorID, err := uuid.Parse(ev.ActorID)
	if err != nil {
		return fmt.Errorf("parse actor id: %w", err)
	}
	nominationID, err := uuid.Parse(view.NominationID)
	if err != nil {
		return fmt.Errorf("parse nomination id: %w", err)
	}
	tournamentID, err := uuid.Parse(view.TournamentID)
	if err != nil {
		return fmt.Errorf("parse tournament id: %w", err)
	}
	applicantID, err := uuid.Parse(view.ApplicantUserID)
	if err != nil {
		return fmt.Errorf("parse applicant id: %w", err)
	}
	payload, err := marshalPayload(ev.Payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := r.q.WithTx(tx)

	if err := q.AppendEvent(ctx, sqlc.AppendEventParams{
		AggregateID: aid,
		Version:     int32(expectedVersion + 1),
		EventType:   string(ev.Type),
		Payload:     payload,
		ActorID:     actorID,
		OccurredAt:  ev.OccurredAt,
	}); err != nil {
		if isUniqueViolation(err, constraintStreamVersion) {
			return domain.ErrConcurrency
		}
		return fmt.Errorf("append event: %w", err)
	}

	if err := q.UpsertCurrent(ctx, sqlc.UpsertCurrentParams{
		ApplicationID:         aid,
		NominationID:          nominationID,
		TournamentID:          tournamentID,
		ApplicantUserID:       applicantID,
		State:                 string(view.State),
		Version:               int32(view.Version),
		CreatedAt:             view.CreatedAt,
		UpdatedAt:             view.UpdatedAt,
		Club:                  view.Club,
		NeedsEquipment:        view.NeedsEquipment,
		ApplicantNameOverride: view.ApplicantNameOverride,
	}); err != nil {
		if isUniqueViolation(err, constraintActiveDuplicate) {
			return domain.ErrDuplicateActive
		}
		return fmt.Errorf("upsert current: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// ActiveExists — быстрая предпроверка активного дубля перед Submit.
func (r *Repo) ActiveExists(ctx context.Context, userID, nominationID string) (bool, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return false, fmt.Errorf("parse applicant id: %w", err)
	}
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return false, fmt.Errorf("parse nomination id: %w", err)
	}
	exists, err := r.q.ExistsActive(ctx, sqlc.ExistsActiveParams{ApplicantUserID: uid, NominationID: nid})
	if err != nil {
		return false, fmt.Errorf("exists active: %w", err)
	}
	return exists, nil
}

// ListByApplicant возвращает заявки пользователя («мои заявки»).
func (r *Repo) ListByApplicant(ctx context.Context, userID string) ([]domain.ApplicationView, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("parse applicant id: %w", err)
	}
	rows, err := r.q.ListByApplicant(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("list by applicant: %w", err)
	}
	return toViews(rows), nil
}

// ListByNomination возвращает все заявки номинации.
func (r *Repo) ListByNomination(ctx context.Context, nominationID string) ([]domain.ApplicationView, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return nil, fmt.Errorf("parse nomination id: %w", err)
	}
	rows, err := r.q.ListByNomination(ctx, nid)
	if err != nil {
		return nil, fmt.Errorf("list by nomination: %w", err)
	}
	return toViews(rows), nil
}

// ListByTournament — сводный экран с опциональными фильтрами по статусу и/или
// номинации.
func (r *Repo) ListByTournament(ctx context.Context, tournamentID string, status *domain.State, nominationID *string) ([]domain.ApplicationView, error) {
	tid, err := uuid.Parse(tournamentID)
	if err != nil {
		return nil, fmt.Errorf("parse tournament id: %w", err)
	}
	params := sqlc.ListByTournamentParams{TournamentID: tid}
	if status != nil {
		s := string(*status)
		params.Status = &s
	}
	if nominationID != nil {
		nid, err := uuid.Parse(*nominationID)
		if err != nil {
			return nil, fmt.Errorf("parse nomination id: %w", err)
		}
		params.NominationID = pgtype.UUID{Bytes: [16]byte(nid), Valid: true}
	}
	rows, err := r.q.ListByTournament(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("list by tournament: %w", err)
	}
	return toViews(rows), nil
}

// ParticipantsByNomination возвращает неотозванные заявки номинации.
func (r *Repo) ParticipantsByNomination(ctx context.Context, nominationID string) ([]domain.ApplicationView, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return nil, fmt.Errorf("parse nomination id: %w", err)
	}
	rows, err := r.q.ParticipantsByNomination(ctx, nid)
	if err != nil {
		return nil, fmt.Errorf("participants by nomination: %w", err)
	}
	return toViews(rows), nil
}

// CountRegistered возвращает число зарегистрированных заявок номинации.
func (r *Repo) CountRegistered(ctx context.Context, nominationID string) (int, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return 0, fmt.Errorf("parse nomination id: %w", err)
	}
	n, err := r.q.CountRegistered(ctx, nid)
	if err != nil {
		return 0, fmt.Errorf("count registered: %w", err)
	}
	return int(n), nil
}

// CountsByNomination возвращает «заявлено» и «подтверждено» для счётчика.
func (r *Repo) CountsByNomination(ctx context.Context, nominationID string) (int, int, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return 0, 0, fmt.Errorf("parse nomination id: %w", err)
	}
	row, err := r.q.CountsByNomination(ctx, nid)
	if err != nil {
		return 0, 0, fmt.Errorf("counts by nomination: %w", err)
	}
	return int(row.Applied), int(row.Confirmed), nil
}

func toViews(rows []sqlc.ApplicationApplicationCurrent) []domain.ApplicationView {
	out := make([]domain.ApplicationView, 0, len(rows))
	for _, row := range rows {
		out = append(out, toView(row))
	}
	return out
}

func toView(row sqlc.ApplicationApplicationCurrent) domain.ApplicationView {
	return domain.ApplicationView{
		ID:                    row.ApplicationID.String(),
		NominationID:          row.NominationID.String(),
		TournamentID:          row.TournamentID.String(),
		ApplicantUserID:       row.ApplicantUserID.String(),
		State:                 domain.State(row.State),
		Club:                  row.Club,
		NeedsEquipment:        row.NeedsEquipment,
		ApplicantNameOverride: row.ApplicantNameOverride,
		Version:               int(row.Version),
		CreatedAt:             row.CreatedAt,
		UpdatedAt:             row.UpdatedAt,
	}
}

func toDomainEvent(row sqlc.LoadStreamRow) (domain.Event, error) {
	payload, err := unmarshalPayload(row.Payload)
	if err != nil {
		return domain.Event{}, fmt.Errorf("unmarshal payload: %w", err)
	}
	return domain.Event{
		Type:       domain.EventType(row.EventType),
		ActorID:    row.ActorID.String(),
		OccurredAt: row.OccurredAt,
		Sequence:   int(row.Version),
		Payload:    payload,
	}, nil
}

// jsonPayload — сериализуемое представление domain.Payload. Для Submitted
// значимы NominationID/TournamentID/ApplicantUserID (идентичность потока) и
// Club/NeedsEquipment (детали). Для Amended (спека 0006) — Club/
// NeedsEquipment/ApplicantNameOverride как полный снапшот, и опционально
// NominationID+TournamentID (перенос) / NewState (ручная смена статуса).
type jsonPayload struct {
	NominationID          string `json:"nomination_id,omitempty"`
	TournamentID          string `json:"tournament_id,omitempty"`
	ApplicantUserID       string `json:"applicant_user_id,omitempty"`
	Club                  string `json:"club,omitempty"`
	NeedsEquipment        bool   `json:"needs_equipment,omitempty"`
	ApplicantNameOverride string `json:"applicant_name_override,omitempty"`
	NewState              string `json:"new_state,omitempty"`
}

func marshalPayload(p domain.Payload) ([]byte, error) {
	return json.Marshal(jsonPayload{
		NominationID:          p.NominationID,
		TournamentID:          p.TournamentID,
		ApplicantUserID:       p.ApplicantUserID,
		Club:                  p.Club,
		NeedsEquipment:        p.NeedsEquipment,
		ApplicantNameOverride: p.ApplicantNameOverride,
		NewState:              string(p.NewState),
	})
}

func unmarshalPayload(raw []byte) (domain.Payload, error) {
	if len(raw) == 0 {
		return domain.Payload{}, nil
	}
	var p jsonPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return domain.Payload{}, err
	}
	return domain.Payload{
		NominationID:          p.NominationID,
		TournamentID:          p.TournamentID,
		ApplicantUserID:       p.ApplicantUserID,
		Club:                  p.Club,
		NeedsEquipment:        p.NeedsEquipment,
		ApplicantNameOverride: p.ApplicantNameOverride,
		NewState:              domain.State(p.NewState),
	}, nil
}

func isUniqueViolation(err error, constraintName string) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return false
	}
	return pgErr.Code == uniqueViolation && pgErr.ConstraintName == constraintName
}
