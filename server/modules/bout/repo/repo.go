// Package repo реализует domain.Repository поверх сгенерированного
// sqlc-кода: снапшот боёв пула (спека 0010) + event-sourced журнал/проекция
// жизненного цикла (спека 0013, ADR 0011).
//
// Append атомарно пишет событие в журнал (bout.bout_events) и обновляет
// инлайн-проекцию (bout.bouts) в одной транзакции. Конфликт версии потока
// (UNIQUE(bout_id, version)) → domain.ErrConcurrency, детектируется по
// имени констрейнта.
package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/modules/bout/domain"
	"github.com/hema/server/modules/bout/repo/sqlc"
)

const (
	uniqueViolation = "23505"
	// Имя констрейнта — см. modules/bout/migrations/00002_bout_lifecycle.sql.
	constraintBoutEventsVersion = "uq_bout_events_version"
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

// ReplaceForPools одной транзакцией удаляет бои перечисленных пулов
// (события — каскадом FK, см. миграция 00002) и вставляет новые: на каждый
// бой — строку проекции (state=not_started, счёт 0:0, version=1) и событие
// scheduled (version 1) — bouts == nil → только удаление. Используется
// GenerateForStage: адресация удаления — явный список пулов этапа, не
// номинация целиком (спека 0018 — до неё был ReplaceForNomination,
// безвредный лишь пока у номинации был ровно один этап, 0017 FR-4; см.
// domain.Repository.ReplaceForPools и docs/specs/0018-playoff-bracket/
// plan.md «Риски»).
func (r *Repo) ReplaceForPools(ctx context.Context, poolIDs []string, bouts []domain.Bout) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	if len(poolIDs) > 0 {
		ids, err := parsePoolIDs(poolIDs)
		if err != nil {
			return err
		}
		if err := q.DeleteBoutsByPools(ctx, ids); err != nil {
			return fmt.Errorf("delete bouts: %w", err)
		}
	}

	if err := insertScheduledBouts(ctx, q, bouts); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// ScheduleBouts одной транзакцией вставляет проекции + события scheduled
// для перечисленных боёв, не удаляя ничего — точечная материализация пары
// сетки (спека 0018, FR-14), в отличие от ReplaceForPools (полная замена
// состава контейнера). Пустой список — no-op, без обращения к БД.
func (r *Repo) ScheduleBouts(ctx context.Context, bouts []domain.Bout) error {
	if len(bouts) == 0 {
		return nil
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	if err := insertScheduledBouts(ctx, q, bouts); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// insertScheduledBouts вставляет проекцию + событие scheduled (version 1)
// для каждого боя — общая логика ReplaceForPools и ScheduleBouts. bout.ID
// используется как есть, если задан (ScheduleBout генерирует его в service,
// чтобы вернуть вызывающему синхронно); иначе генерируется здесь
// (GenerateForStage не нуждается в id вставленных боёв).
func insertScheduledBouts(ctx context.Context, q *sqlc.Queries, bouts []domain.Bout) error {
	now := time.Now()
	for _, b := range bouts {
		id := b.ID
		if id == "" {
			id = uuid.NewString()
		}
		boutID, err := uuid.Parse(id)
		if err != nil {
			return fmt.Errorf("parse bout id: %w", err)
		}
		poolID, err := uuid.Parse(b.PoolID)
		if err != nil {
			return fmt.Errorf("parse pool id: %w", err)
		}
		nominationID, err := uuid.Parse(b.NominationID)
		if err != nil {
			return fmt.Errorf("parse nomination id: %w", err)
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
			ID:             boutID,
			PoolID:         poolID,
			NominationID:   nominationID,
			RoundNumber:    int32(b.RoundNumber),
			SequenceNumber: int32(b.SequenceNumber),
			FighterAID:     fighterAID,
			FighterAName:   b.FighterA.Name,
			FighterAClub:   b.FighterA.Club,
			FighterBID:     fighterBID,
			FighterBName:   b.FighterB.Name,
			FighterBClub:   b.FighterB.Club,
			State:          string(domain.StateNotStarted),
			ScoreA:         0,
			ScoreB:         0,
			Version:        1,
		}); err != nil {
			return fmt.Errorf("insert bout: %w", err)
		}

		payload, err := marshalPayload(domain.Payload{
			PoolID:         b.PoolID,
			NominationID:   b.NominationID,
			RoundNumber:    b.RoundNumber,
			SequenceNumber: b.SequenceNumber,
			FighterA:       b.FighterA,
			FighterB:       b.FighterB,
		})
		if err != nil {
			return fmt.Errorf("marshal scheduled payload: %w", err)
		}
		if err := q.AppendEvent(ctx, sqlc.AppendEventParams{
			BoutID:     boutID,
			Version:    1,
			EventType:  string(domain.EventScheduled),
			Payload:    payload,
			ActorID:    pgtype.UUID{}, // NULL — scheduled формируется системой, не человеком.
			OccurredAt: now,
		}); err != nil {
			return fmt.Errorf("insert scheduled event: %w", err)
		}
	}
	return nil
}

// DeleteBouts точечно удаляет перечисленные бои (события — каскадом FK,
// см. миграция 00002) по id — снятие продвижения при пересмотре результата
// (спека 0018, FR-16). Пустой список — no-op, без обращения к БД.
func (r *Repo) DeleteBouts(ctx context.Context, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	boutIDs := make([]uuid.UUID, len(ids))
	for i, id := range ids {
		parsed, err := uuid.Parse(id)
		if err != nil {
			return fmt.Errorf("parse bout id: %w", err)
		}
		boutIDs[i] = parsed
	}
	if err := r.q.DeleteBoutsByIDs(ctx, boutIDs); err != nil {
		return fmt.Errorf("delete bouts by ids: %w", err)
	}
	return nil
}

// DeleteBoutsByPools удаляет бои перечисленных пулов (события — каскадом FK,
// см. миграция 00002) — расфиксация этапа (спека 0017, ClearForPools):
// адресация по пулам этапа, не по номинации целиком, чтобы не задеть бои
// пулов других этапов той же номинации (FR-8). Пустой список — no-op, без
// обращения к БД.
func (r *Repo) DeleteBoutsByPools(ctx context.Context, poolIDs []string) error {
	if len(poolIDs) == 0 {
		return nil
	}
	ids, err := parsePoolIDs(poolIDs)
	if err != nil {
		return err
	}
	if err := r.q.DeleteBoutsByPools(ctx, ids); err != nil {
		return fmt.Errorf("delete bouts by pools: %w", err)
	}
	return nil
}

// ListByNomination возвращает бои номинации, отсортированные по pool_id,
// затем sequence_number.
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
			FighterA:       domain.FighterRef{ID: row.FighterAID.String(), Name: row.FighterAName, Club: row.FighterAClub},
			FighterB:       domain.FighterRef{ID: row.FighterBID.String(), Name: row.FighterBName, Club: row.FighterBClub},
			State:          domain.BoutState(row.State),
			ScoreA:         int(row.ScoreA),
			ScoreB:         int(row.ScoreB),
			Version:        int(row.Version),
		}
	}
	return out, nil
}

// BoutsByPool возвращает бои пула (состояние/счёт), по sequence_number —
// для доски ведения (вызывается модулем pool через порт).
func (r *Repo) BoutsByPool(ctx context.Context, poolID string) ([]domain.Bout, error) {
	pid, err := uuid.Parse(poolID)
	if err != nil {
		return nil, fmt.Errorf("parse pool id: %w", err)
	}

	rows, err := r.q.BoutsByPool(ctx, pid)
	if err != nil {
		return nil, fmt.Errorf("bouts by pool: %w", err)
	}

	out := make([]domain.Bout, len(rows))
	for i, row := range rows {
		out[i] = domain.Bout{
			ID:             row.ID.String(),
			PoolID:         row.PoolID.String(),
			NominationID:   row.NominationID.String(),
			RoundNumber:    int(row.RoundNumber),
			SequenceNumber: int(row.SequenceNumber),
			FighterA:       domain.FighterRef{ID: row.FighterAID.String(), Name: row.FighterAName, Club: row.FighterAClub},
			FighterB:       domain.FighterRef{ID: row.FighterBID.String(), Name: row.FighterBName, Club: row.FighterBClub},
			State:          domain.BoutState(row.State),
			ScoreA:         int(row.ScoreA),
			ScoreB:         int(row.ScoreB),
			Version:        int(row.Version),
		}
	}
	return out, nil
}

// GetBout возвращает проекцию одного боя.
func (r *Repo) GetBout(ctx context.Context, boutID string) (domain.Bout, error) {
	bid, err := uuid.Parse(boutID)
	if err != nil {
		return domain.Bout{}, domain.ErrNotFound
	}

	row, err := r.q.GetBout(ctx, bid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Bout{}, domain.ErrNotFound
		}
		return domain.Bout{}, fmt.Errorf("get bout: %w", err)
	}
	return domain.Bout{
		ID:             row.ID.String(),
		PoolID:         row.PoolID.String(),
		NominationID:   row.NominationID.String(),
		RoundNumber:    int(row.RoundNumber),
		SequenceNumber: int(row.SequenceNumber),
		FighterA:       domain.FighterRef{ID: row.FighterAID.String(), Name: row.FighterAName, Club: row.FighterAClub},
		FighterB:       domain.FighterRef{ID: row.FighterBID.String(), Name: row.FighterBName, Club: row.FighterBClub},
		State:          domain.BoutState(row.State),
		ScoreA:         int(row.ScoreA),
		ScoreB:         int(row.ScoreB),
		Version:        int(row.Version),
	}, nil
}

// PoolProgress возвращает total/started/finished боёв пула (FR-10).
func (r *Repo) PoolProgress(ctx context.Context, poolID string) (int, int, int, error) {
	pid, err := uuid.Parse(poolID)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("parse pool id: %w", err)
	}
	row, err := r.q.PoolProgress(ctx, pid)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("pool progress: %w", err)
	}
	return int(row.Total), int(row.Started), int(row.Finished), nil
}

// AnyStartedInPools — есть ли среди боёв перечисленных пулов хотя бы один со
// state ≠ not_started (гейт расфиксации этапа, спека 0017 FR-8/FR-13).
// Пустой список — no-op (false), без обращения к БД.
func (r *Repo) AnyStartedInPools(ctx context.Context, poolIDs []string) (bool, error) {
	if len(poolIDs) == 0 {
		return false, nil
	}
	ids, err := parsePoolIDs(poolIDs)
	if err != nil {
		return false, err
	}
	got, err := r.q.AnyStartedInPools(ctx, ids)
	if err != nil {
		return false, fmt.Errorf("any started in pools: %w", err)
	}
	return got, nil
}

// parsePoolIDs конвертирует список доменных ID пулов в []uuid.UUID для
// sqlc.arg(pool_ids) параметров ANY(...)-запросов.
func parsePoolIDs(poolIDs []string) ([]uuid.UUID, error) {
	ids := make([]uuid.UUID, len(poolIDs))
	for i, id := range poolIDs {
		pid, err := uuid.Parse(id)
		if err != nil {
			return nil, fmt.Errorf("parse pool id: %w", err)
		}
		ids[i] = pid
	}
	return ids, nil
}

// Load возвращает поток событий боя, упорядоченный по версии.
func (r *Repo) Load(ctx context.Context, boutID string) ([]domain.Event, error) {
	bid, err := uuid.Parse(boutID)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	rows, err := r.q.LoadEvents(ctx, bid)
	if err != nil {
		return nil, fmt.Errorf("load events: %w", err)
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

// EventsForPools возвращает журнал боёв перечисленных пулов (спека 0033,
// FR-33): join с проекцией (bout.bouts) за pool_id/sequence_number/именами
// бойцов — эти поля не дублируются в payload события (только scheduled его
// несёт, а scheduled сюда не попадает — исключён на уровне SQL, FR-34/
// FR-36). ScoreA/ScoreB разбираются из payload через unmarshalPayload —
// значимы только для scored/finished, у остальных типов будут нулями.
// Пустой poolIDs — no-op (пустой срез), без обращения к БД.
func (r *Repo) EventsForPools(ctx context.Context, poolIDs []string, limit int) ([]domain.EventRecord, error) {
	if len(poolIDs) == 0 {
		return nil, nil
	}
	ids, err := parsePoolIDs(poolIDs)
	if err != nil {
		return nil, err
	}

	rows, err := r.q.EventsForPools(ctx, sqlc.EventsForPoolsParams{
		PoolIds:  ids,
		RowLimit: int32(limit),
	})
	if err != nil {
		return nil, fmt.Errorf("events for pools: %w", err)
	}

	out := make([]domain.EventRecord, 0, len(rows))
	for _, row := range rows {
		payload, err := unmarshalPayload(row.Payload)
		if err != nil {
			return nil, fmt.Errorf("unmarshal payload: %w", err)
		}
		out = append(out, domain.EventRecord{
			BoutID:         row.BoutID.String(),
			PoolID:         row.PoolID.String(),
			SequenceNumber: int(row.SequenceNumber),
			FighterA:       domain.FighterRef{ID: row.FighterAID.String(), Name: row.FighterAName, Club: row.FighterAClub},
			FighterB:       domain.FighterRef{ID: row.FighterBID.String(), Name: row.FighterBName, Club: row.FighterBClub},
			Type:           domain.EventType(row.EventType),
			ScoreA:         payload.ScoreA,
			ScoreB:         payload.ScoreB,
			ActorID:        fromNullableUUID(row.ActorID),
			OccurredAt:     row.OccurredAt,
		})
	}
	return out, nil
}

// BoutTimesForPools возвращает фактическое время начала/завершения каждого
// боя перечисленных пулов (спека 0034, FR-16) — см. doc-комментарий SQL
// (repo/queries/bout.sql, BoutTimesForPools) на предмет того, почему это не
// просто MAX(occurred_at) по типу события: reopened/reset (спека 0013)
// делают старые отметки устаревшими, и запрос отсекает по последнему
// restart-маркеру потока. Пустой poolIDs — no-op: пустая карта без
// обращения к БД (как EventsForPools/AnyStartedInPools).
func (r *Repo) BoutTimesForPools(ctx context.Context, poolIDs []string) (map[string]domain.BoutTimes, error) {
	if len(poolIDs) == 0 {
		return map[string]domain.BoutTimes{}, nil
	}
	ids, err := parsePoolIDs(poolIDs)
	if err != nil {
		return nil, err
	}

	rows, err := r.q.BoutTimesForPools(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("bout times for pools: %w", err)
	}

	out := make(map[string]domain.BoutTimes, len(rows))
	for _, row := range rows {
		out[row.BoutID.String()] = domain.BoutTimes{
			StartedAt:  fromNullableTimestamp(row.StartedAt),
			FinishedAt: fromNullableTimestamp(row.FinishedAt),
		}
	}
	return out, nil
}

// StartedAtByBouts возвращает первый момент начала каждого боя из списка
// (спека 0043, ADR 0020) — MIN(occurred_at) события 'started', не свёртка
// по restart-маркерам (в отличие от BoutTimesForPools, здесь нужен ПЕРВЫЙ
// started, не последний актуальный). Бои без событий 'started' просто
// отсутствуют в результирующей карте. Пустой boutIDs — no-op: пустая карта
// без обращения к БД.
func (r *Repo) StartedAtByBouts(ctx context.Context, boutIDs []string) (map[string]time.Time, error) {
	if len(boutIDs) == 0 {
		return map[string]time.Time{}, nil
	}
	ids, err := parsePoolIDs(boutIDs)
	if err != nil {
		return nil, err
	}

	rows, err := r.q.StartedAtByBouts(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("started at by bouts: %w", err)
	}

	out := make(map[string]time.Time, len(rows))
	for _, row := range rows {
		out[row.BoutID.String()] = row.StartedAt
	}
	return out, nil
}

// Append атомарно вставляет событие (version = expectedVersion+1) и
// обновляет проекцию в одной транзакции (ADR 0011 п.3/п.4).
func (r *Repo) Append(ctx context.Context, boutID string, expectedVersion int, ev domain.Event, view domain.BoutView) error {
	bid, err := uuid.Parse(boutID)
	if err != nil {
		return domain.ErrNotFound
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
		BoutID:     bid,
		Version:    int32(expectedVersion + 1),
		EventType:  string(ev.Type),
		Payload:    payload,
		ActorID:    toNullableUUID(ev.ActorID),
		OccurredAt: ev.OccurredAt,
	}); err != nil {
		if isUniqueViolation(err, constraintBoutEventsVersion) {
			return domain.ErrConcurrency
		}
		return fmt.Errorf("append event: %w", err)
	}

	if err := q.UpdateProjection(ctx, sqlc.UpdateProjectionParams{
		ID:      bid,
		State:   string(view.State),
		ScoreA:  int32(view.ScoreA),
		ScoreB:  int32(view.ScoreB),
		Version: int32(view.Version),
	}); err != nil {
		return fmt.Errorf("update projection: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// jsonPayload — сериализуемое представление domain.Payload.
type jsonPayload struct {
	PoolID         string          `json:"pool_id,omitempty"`
	NominationID   string          `json:"nomination_id,omitempty"`
	RoundNumber    int             `json:"round_number,omitempty"`
	SequenceNumber int             `json:"sequence_number,omitempty"`
	FighterA       *jsonFighterRef `json:"fighter_a,omitempty"`
	FighterB       *jsonFighterRef `json:"fighter_b,omitempty"`
	ScoreA         int             `json:"score_a,omitempty"`
	ScoreB         int             `json:"score_b,omitempty"`
}

type jsonFighterRef struct {
	ID   string `json:"id"`
	Name string `json:"name,omitempty"`
	Club string `json:"club,omitempty"`
}

func marshalPayload(p domain.Payload) ([]byte, error) {
	jp := jsonPayload{
		PoolID:         p.PoolID,
		NominationID:   p.NominationID,
		RoundNumber:    p.RoundNumber,
		SequenceNumber: p.SequenceNumber,
		ScoreA:         p.ScoreA,
		ScoreB:         p.ScoreB,
	}
	if p.FighterA.ID != "" {
		jp.FighterA = &jsonFighterRef{ID: p.FighterA.ID, Name: p.FighterA.Name, Club: p.FighterA.Club}
	}
	if p.FighterB.ID != "" {
		jp.FighterB = &jsonFighterRef{ID: p.FighterB.ID, Name: p.FighterB.Name, Club: p.FighterB.Club}
	}
	return json.Marshal(jp)
}

func unmarshalPayload(raw []byte) (domain.Payload, error) {
	if len(raw) == 0 {
		return domain.Payload{}, nil
	}
	var jp jsonPayload
	if err := json.Unmarshal(raw, &jp); err != nil {
		return domain.Payload{}, err
	}
	p := domain.Payload{
		PoolID:         jp.PoolID,
		NominationID:   jp.NominationID,
		RoundNumber:    jp.RoundNumber,
		SequenceNumber: jp.SequenceNumber,
		ScoreA:         jp.ScoreA,
		ScoreB:         jp.ScoreB,
	}
	if jp.FighterA != nil {
		p.FighterA = domain.FighterRef{ID: jp.FighterA.ID, Name: jp.FighterA.Name, Club: jp.FighterA.Club}
	}
	if jp.FighterB != nil {
		p.FighterB = domain.FighterRef{ID: jp.FighterB.ID, Name: jp.FighterB.Name, Club: jp.FighterB.Club}
	}
	return p, nil
}

func toDomainEvent(row sqlc.LoadEventsRow) (domain.Event, error) {
	payload, err := unmarshalPayload(row.Payload)
	if err != nil {
		return domain.Event{}, fmt.Errorf("unmarshal payload: %w", err)
	}
	return domain.Event{
		Type:       domain.EventType(row.EventType),
		ActorID:    fromNullableUUID(row.ActorID),
		OccurredAt: row.OccurredAt,
		Sequence:   int(row.Version),
		Payload:    payload,
	}, nil
}

// toNullableUUID конвертирует доменный actor_id ("" — нет инициатора,
// событие scheduled) в pgtype.UUID.
func toNullableUUID(id string) pgtype.UUID {
	if id == "" {
		return pgtype.UUID{}
	}
	parsed, err := uuid.Parse(id)
	if err != nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: [16]byte(parsed), Valid: true}
}

// fromNullableUUID — обратное преобразование.
func fromNullableUUID(id pgtype.UUID) string {
	if !id.Valid {
		return ""
	}
	return uuid.UUID(id.Bytes).String()
}

// fromNullableTimestamp конвертирует nullable timestamptz (агрегат
// BoutTimesForPools — событие ещё не произошло → NULL) в *time.Time для
// domain.BoutTimes (спека 0034, FR-16).
func fromNullableTimestamp(ts pgtype.Timestamptz) *time.Time {
	if !ts.Valid {
		return nil
	}
	t := ts.Time
	return &t
}

// isUniqueViolation определяет, что ошибка PG — нарушение конкретного
// unique-констрейнта (по имени).
// ExistsBoutForNomination — есть ли среди боёв номинации хотя бы один
// поставленный (спека 0040, гейт удаления номинации, FR-1б). Использует
// idx_bouts_nomination.
func (r *Repo) ExistsBoutForNomination(ctx context.Context, nominationID string) (bool, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return false, fmt.Errorf("parse nomination id: %w", err)
	}
	got, err := r.q.ExistsBoutForNomination(ctx, nid)
	if err != nil {
		return false, fmt.Errorf("exists bout for nomination: %w", err)
	}
	return got, nil
}

// RepointFighter переносит оба борта (fighter_a_id/fighter_b_id) всех боёв
// дубля-источника (oldID) на итоговую запись (newID) одной транзакцией —
// сторона слияния дублей бойца (спека 0040, сценарий 3). Денормализованные
// fighter_a_name/fighter_a_club/fighter_b_name/fighter_b_club НЕ
// переписываются — журнал боя остаётся историческим снапшотом на момент
// проведения, не текущим состоянием ростера (plan.md, «Риски»).
func (r *Repo) RepointFighter(ctx context.Context, oldID, newID string) error {
	oid, err := uuid.Parse(oldID)
	if err != nil {
		return fmt.Errorf("parse old fighter id: %w", err)
	}
	nid, err := uuid.Parse(newID)
	if err != nil {
		return fmt.Errorf("parse new fighter id: %w", err)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	if _, err := q.RepointFighterA(ctx, sqlc.RepointFighterAParams{NewFighterID: nid, OldFighterID: oid}); err != nil {
		return fmt.Errorf("repoint fighter a: %w", err)
	}
	if _, err := q.RepointFighterB(ctx, sqlc.RepointFighterBParams{NewFighterID: nid, OldFighterID: oid}); err != nil {
		return fmt.Errorf("repoint fighter b: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

func isUniqueViolation(err error, constraintName string) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return false
	}
	return pgErr.Code == uniqueViolation && pgErr.ConstraintName == constraintName
}
