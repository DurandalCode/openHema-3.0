// Package repo реализует domain.Repository поверх сгенерированного sqlc-кода.
//
// Пулы возвращаются с «сырыми» членствами (Members[i].ID заполнен,
// Name/Club — нет): обогащение данными бойца — работа service через
// ActiveFightersProvider (модули не делят данные напрямую, ADR 0002).
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

	"github.com/hema/server/modules/pool/domain"
	"github.com/hema/server/modules/pool/repo/sqlc"
)

// uniqueViolation — код ошибки PostgreSQL при нарушении unique-констрейнта
// (23505), в частности partial unique index uq_pools_arena (спека 0011,
// FR-6/NFR-4).
const uniqueViolation = "23505"

// constraintPoolsArena — имя partial unique index, защищающего инвариант
// «одна арена ↔ один пул» на уровне данных (см. migrations/00003_pool_arena.sql).
const constraintPoolsArena = "uq_pools_arena"

// Repo — адаптер к PostgreSQL для модуля pool.
type Repo struct {
	pool *pgxpool.Pool
	q    *sqlc.Queries
}

// New создаёт репозиторий поверх пула соединений.
func New(pool *pgxpool.Pool) *Repo {
	return &Repo{pool: pool, q: sqlc.New(pool)}
}

var _ domain.Repository = (*Repo)(nil)

// undoDataJSON — сериализуемая форма undo-снапшота для JSONB-колонки
// (спека 0009, решение №16). Одна форма покрывает все три вида undo:
// - UndoAuto: FighterIDs (кого расставило авто → вернуть в нераспределённые);
// - UndoDeletePool: Number + FighterIDs (восстановить пул + членства);
// - UndoReset: Pools (снапшот всех пулов с их членствами → восстановить все).
// Для UndoAuto/UndoDeletePool Pools пуст (omitempty); для UndoReset
// FighterIDs/Number не используются (omitempty).
type undoDataJSON struct {
	FighterIDs []string       `json:"fighter_ids,omitempty"`
	Number     int            `json:"number,omitempty"`
	Pools      []undoPoolJSON `json:"pools,omitempty"`
}

// undoPoolJSON — один пул в снапшоте undo-reset: номер + бойцы.
type undoPoolJSON struct {
	Number     int      `json:"number"`
	FighterIDs []string `json:"fighter_ids,omitempty"`
}

// GetLayout возвращает статус, undo-снапшот и пулы номинации. Отсутствие
// строки раскладки трактуется как draft + UndoNone (lazy-init, FR-14).
func (r *Repo) GetLayout(ctx context.Context, nominationID string) (domain.LayoutStatus, domain.UndoState, []domain.Pool, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return "", domain.UndoState{}, nil, fmt.Errorf("parse nomination id: %w", err)
	}

	status := domain.LayoutDraft
	var undo domain.UndoState
	row, err := r.q.GetPoolLayout(ctx, nid)
	switch {
	case err == nil:
		status = domain.LayoutStatus(row.Status)
		undo, err = decodeUndo(row.UndoKind, row.UndoData)
		if err != nil {
			return "", domain.UndoState{}, nil, err
		}
	case errors.Is(err, pgx.ErrNoRows):
		// lazy-init: раскладки ещё нет — draft, без undo.
	default:
		return "", domain.UndoState{}, nil, fmt.Errorf("get pool layout: %w", err)
	}

	pools, err := r.listPools(ctx, nid)
	if err != nil {
		return "", domain.UndoState{}, nil, err
	}
	return status, undo, pools, nil
}

func (r *Repo) listPools(ctx context.Context, nid uuid.UUID) ([]domain.Pool, error) {
	poolRows, err := r.q.ListPoolsByNomination(ctx, nid)
	if err != nil {
		return nil, fmt.Errorf("list pools: %w", err)
	}
	memberRows, err := r.q.ListMembersByNomination(ctx, nid)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	byPool := make(map[uuid.UUID][]domain.FighterRef, len(poolRows))
	for _, m := range memberRows {
		byPool[m.PoolID] = append(byPool[m.PoolID], domain.FighterRef{ID: m.FighterID.String()})
	}
	out := make([]domain.Pool, 0, len(poolRows))
	for _, p := range poolRows {
		out = append(out, domain.Pool{
			ID: p.ID.String(), NominationID: p.NominationID.String(), Number: int(p.Number),
			Members: byPool[p.ID], ArenaID: fromNullableUUID(p.ArenaID),
		})
	}
	return out, nil
}

// GetPool возвращает один пул по id (включая ArenaID, спека 0011).
func (r *Repo) GetPool(ctx context.Context, poolID string) (domain.Pool, error) {
	pid, err := uuid.Parse(poolID)
	if err != nil {
		return domain.Pool{}, domain.ErrNotFound
	}
	row, err := r.q.GetPoolByID(ctx, pid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Pool{}, domain.ErrNotFound
		}
		return domain.Pool{}, fmt.Errorf("get pool: %w", err)
	}
	memberIDs, err := r.q.ListMembersByPool(ctx, pid)
	if err != nil {
		return domain.Pool{}, fmt.Errorf("list members by pool: %w", err)
	}
	members := make([]domain.FighterRef, len(memberIDs))
	for i, id := range memberIDs {
		members[i] = domain.FighterRef{ID: id.String()}
	}
	return domain.Pool{
		ID: row.ID.String(), NominationID: row.NominationID.String(), Number: int(row.Number), Members: members,
		ArenaID: fromNullableUUID(row.ArenaID),
	}, nil
}

// CreatePool вставляет пул, материализует раскладку в draft, очищает undo.
func (r *Repo) CreatePool(ctx context.Context, nominationID string, number int) (domain.Pool, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return domain.Pool{}, fmt.Errorf("parse nomination id: %w", err)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.Pool{}, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	row, err := q.InsertPool(ctx, sqlc.InsertPoolParams{NominationID: nid, Number: int32(number)})
	if err != nil {
		return domain.Pool{}, fmt.Errorf("insert pool: %w", err)
	}
	if err := q.EnsureLayoutAndClearUndo(ctx, nid); err != nil {
		return domain.Pool{}, fmt.Errorf("ensure layout: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.Pool{}, fmt.Errorf("commit: %w", err)
	}
	return domain.Pool{ID: row.ID.String(), NominationID: row.NominationID.String(), Number: int(row.Number)}, nil
}

// DeletePool атомарно удаляет пул и записывает undo-снапшот удалённого пула.
func (r *Repo) DeletePool(ctx context.Context, poolID string) error {
	pid, err := uuid.Parse(poolID)
	if err != nil {
		return domain.ErrNotFound
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	poolRow, err := q.GetPoolByID(ctx, pid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrNotFound
		}
		return fmt.Errorf("get pool: %w", err)
	}
	memberIDs, err := q.ListMembersByPool(ctx, pid)
	if err != nil {
		return fmt.Errorf("list members by pool: %w", err)
	}
	if err := q.DeletePoolByID(ctx, pid); err != nil {
		return fmt.Errorf("delete pool: %w", err)
	}
	undoData, err := encodeUndo(undoDataJSON{FighterIDs: uuidsToStrings(memberIDs), Number: int(poolRow.Number)})
	if err != nil {
		return err
	}
	if err := q.SetLayoutUndo(ctx, sqlc.SetLayoutUndoParams{
		NominationID: poolRow.NominationID, UndoKind: string(domain.UndoDeletePool), UndoData: undoData,
	}); err != nil {
		return fmt.Errorf("set layout undo: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// ResetLayout атомарно удаляет все пулы номинации, записывает undo-снапшот
// всех пулов с их членствами (kind=reset), гарантирует статус draft
// (FR-4a, undoable — FR-7a).
func (r *Repo) ResetLayout(ctx context.Context, nominationID string) error {
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

	// Снапшот всех пулов номинации (number + fighter_ids) до удаления.
	poolRows, err := q.ListPoolsByNomination(ctx, nid)
	if err != nil {
		return fmt.Errorf("list pools: %w", err)
	}
	memberRows, err := q.ListMembersByNomination(ctx, nid)
	if err != nil {
		return fmt.Errorf("list members: %w", err)
	}
	byPool := make(map[uuid.UUID][]string, len(poolRows))
	for _, m := range memberRows {
		byPool[m.PoolID] = append(byPool[m.PoolID], m.FighterID.String())
	}
	pools := make([]undoPoolJSON, 0, len(poolRows))
	for _, p := range poolRows {
		pools = append(pools, undoPoolJSON{Number: int(p.Number), FighterIDs: byPool[p.ID]})
	}

	if err := q.DeleteAllPoolsByNomination(ctx, nid); err != nil {
		return fmt.Errorf("delete all pools: %w", err)
	}
	undoData, err := encodeUndo(undoDataJSON{Pools: pools})
	if err != nil {
		return err
	}
	if err := q.SetLayoutUndo(ctx, sqlc.SetLayoutUndoParams{
		NominationID: nid, UndoKind: string(domain.UndoReset), UndoData: undoData,
	}); err != nil {
		return fmt.Errorf("set layout undo: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// UndoReset пересоздаёт все пулы из снапшота с теми же номерами и членами,
// очищает undo (AC-13a4). Идемпотентно: повторный вызов даёт тот же результат
// (InsertPool на свободный номер + InsertMember; если пул с номером уже
// существует — UNIQUE(nomination_id, number) даст конфликт, но после undo
// undo обнулён, повторный undo не должен доходить сюда; для надёжности
// используем тот же инвариант «любая мутация обнуляет undo» → номера свободны).
func (r *Repo) UndoReset(ctx context.Context, nominationID string, pools []domain.ResetPool) error {
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

	for _, p := range pools {
		fids, err := parseUUIDs(p.FighterIDs)
		if err != nil {
			return err
		}
		poolRow, err := q.InsertPool(ctx, sqlc.InsertPoolParams{NominationID: nid, Number: int32(p.Number)})
		if err != nil {
			return fmt.Errorf("insert pool %d: %w", p.Number, err)
		}
		for _, fid := range fids {
			if err := q.InsertMember(ctx, sqlc.InsertMemberParams{
				PoolID: poolRow.ID, NominationID: nid, FighterID: fid,
			}); err != nil {
				return fmt.Errorf("insert member: %w", err)
			}
		}
	}
	if err := q.EnsureLayoutAndClearUndo(ctx, nid); err != nil {
		return fmt.Errorf("ensure layout: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// AssignFighter кладёт бойца в пул: move одним действием, если боец уже был
// в другом пуле этой номинации (FR-1/FR-5).
func (r *Repo) AssignFighter(ctx context.Context, nominationID, fighterID, poolID string) error {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return fmt.Errorf("parse nomination id: %w", err)
	}
	fid, err := uuid.Parse(fighterID)
	if err != nil {
		return fmt.Errorf("parse fighter id: %w", err)
	}
	pid, err := uuid.Parse(poolID)
	if err != nil {
		return domain.ErrNotFound
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	poolRow, err := q.GetPoolByID(ctx, pid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrNotFound
		}
		return fmt.Errorf("get pool: %w", err)
	}
	if poolRow.NominationID != nid {
		return domain.ErrNotFound
	}
	if err := q.DeleteMemberByFighter(ctx, sqlc.DeleteMemberByFighterParams{
		NominationID: nid, FighterID: fid,
	}); err != nil {
		return fmt.Errorf("delete existing membership: %w", err)
	}
	if err := q.InsertMember(ctx, sqlc.InsertMemberParams{PoolID: pid, NominationID: nid, FighterID: fid}); err != nil {
		return fmt.Errorf("insert member: %w", err)
	}
	if err := q.EnsureLayoutAndClearUndo(ctx, nid); err != nil {
		return fmt.Errorf("ensure layout: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// UnassignFighter убирает бойца из пула, если он там был (идемпотентно).
func (r *Repo) UnassignFighter(ctx context.Context, nominationID, fighterID string) error {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return fmt.Errorf("parse nomination id: %w", err)
	}
	fid, err := uuid.Parse(fighterID)
	if err != nil {
		return fmt.Errorf("parse fighter id: %w", err)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	if err := q.DeleteMemberByFighter(ctx, sqlc.DeleteMemberByFighterParams{
		NominationID: nid, FighterID: fid,
	}); err != nil {
		return fmt.Errorf("delete membership: %w", err)
	}
	if err := q.EnsureLayoutAndClearUndo(ctx, nid); err != nil {
		return fmt.Errorf("ensure layout: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// ApplyAutoDistribute атомарно применяет assignments и записывает undo
// (kind=auto).
func (r *Repo) ApplyAutoDistribute(ctx context.Context, nominationID string, assignments []domain.Assignment) error {
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

	fighterIDs := make([]string, 0, len(assignments))
	for _, a := range assignments {
		fid, err := uuid.Parse(a.FighterID)
		if err != nil {
			return fmt.Errorf("parse fighter id: %w", err)
		}
		pid, err := uuid.Parse(a.PoolID)
		if err != nil {
			return fmt.Errorf("parse pool id: %w", err)
		}
		if err := q.InsertMember(ctx, sqlc.InsertMemberParams{PoolID: pid, NominationID: nid, FighterID: fid}); err != nil {
			return fmt.Errorf("insert member: %w", err)
		}
		fighterIDs = append(fighterIDs, a.FighterID)
	}

	undoData, err := encodeUndo(undoDataJSON{FighterIDs: fighterIDs})
	if err != nil {
		return err
	}
	if err := q.SetLayoutUndo(ctx, sqlc.SetLayoutUndoParams{
		NominationID: nid, UndoKind: string(domain.UndoAuto), UndoData: undoData,
	}); err != nil {
		return fmt.Errorf("set layout undo: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// UndoAuto удаляет членства перечисленных fighterIDs, очищает undo.
func (r *Repo) UndoAuto(ctx context.Context, nominationID string, fighterIDs []string) error {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return fmt.Errorf("parse nomination id: %w", err)
	}
	fids, err := parseUUIDs(fighterIDs)
	if err != nil {
		return err
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	if err := q.DeleteMembersByFighterIDs(ctx, sqlc.DeleteMembersByFighterIDsParams{
		NominationID: nid, FighterIds: fids,
	}); err != nil {
		return fmt.Errorf("delete members: %w", err)
	}
	if err := q.EnsureLayoutAndClearUndo(ctx, nid); err != nil {
		return fmt.Errorf("ensure layout: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// UndoDeletePool пересоздаёт пул с тем же number и членами, очищает undo.
func (r *Repo) UndoDeletePool(ctx context.Context, nominationID string, number int, fighterIDs []string) error {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return fmt.Errorf("parse nomination id: %w", err)
	}
	fids, err := parseUUIDs(fighterIDs)
	if err != nil {
		return err
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	poolRow, err := q.InsertPool(ctx, sqlc.InsertPoolParams{NominationID: nid, Number: int32(number)})
	if err != nil {
		return fmt.Errorf("insert pool: %w", err)
	}
	for _, fid := range fids {
		if err := q.InsertMember(ctx, sqlc.InsertMemberParams{
			PoolID: poolRow.ID, NominationID: nid, FighterID: fid,
		}); err != nil {
			return fmt.Errorf("insert member: %w", err)
		}
	}
	if err := q.EnsureLayoutAndClearUndo(ctx, nid); err != nil {
		return fmt.Errorf("ensure layout: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// PruneMembers удаляет членства бойцов, которых нет среди activeFighterIDs
// (FR-15). Не трогает undo.
func (r *Repo) PruneMembers(ctx context.Context, nominationID string, activeFighterIDs []string) error {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return fmt.Errorf("parse nomination id: %w", err)
	}
	fids, err := parseUUIDs(activeFighterIDs)
	if err != nil {
		return err
	}
	if err := r.q.PruneMembers(ctx, sqlc.PruneMembersParams{
		NominationID: nid, ActiveFighterIds: fids,
	}); err != nil {
		return fmt.Errorf("prune members: %w", err)
	}
	return nil
}

// SetStatus задаёт статус раскладки, очищает undo.
func (r *Repo) SetStatus(ctx context.Context, nominationID string, status domain.LayoutStatus) error {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return fmt.Errorf("parse nomination id: %w", err)
	}
	if err := r.q.SetLayoutStatus(ctx, sqlc.SetLayoutStatusParams{
		NominationID: nid, Status: string(status),
	}); err != nil {
		return fmt.Errorf("set layout status: %w", err)
	}
	return nil
}

// SeatPool закрепляет пул за площадкой (спека 0011, FR-7). Нарушение
// partial unique index uq_pools_arena (арена уже занята другим пулом,
// гонка параллельной постановки) мапится в domain.ErrArenaBusy (NFR-4).
func (r *Repo) SeatPool(ctx context.Context, poolID, arenaID string) error {
	pid, err := uuid.Parse(poolID)
	if err != nil {
		return domain.ErrNotFound
	}
	aid, err := uuid.Parse(arenaID)
	if err != nil {
		return fmt.Errorf("parse arena id: %w", err)
	}
	if _, err := r.q.SeatPool(ctx, sqlc.SeatPoolParams{
		ID: pid, ArenaID: pgtype.UUID{Bytes: [16]byte(aid), Valid: true},
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrNotFound
		}
		if isUniqueViolation(err, constraintPoolsArena) {
			return domain.ErrArenaBusy
		}
		return fmt.Errorf("seat pool: %w", err)
	}
	return nil
}

// UnseatPool снимает пул с площадки (FR-8). Идемпотентно.
func (r *Repo) UnseatPool(ctx context.Context, poolID string) error {
	pid, err := uuid.Parse(poolID)
	if err != nil {
		return domain.ErrNotFound
	}
	if err := r.q.UnseatPool(ctx, pid); err != nil {
		return fmt.Errorf("unseat pool: %w", err)
	}
	return nil
}

// PoolsForArena возвращает пул, стоящий на арене (found=false — арена
// свободна, FR-9).
func (r *Repo) PoolsForArena(ctx context.Context, arenaID string) (domain.Pool, bool, error) {
	aid, err := uuid.Parse(arenaID)
	if err != nil {
		return domain.Pool{}, false, fmt.Errorf("parse arena id: %w", err)
	}
	row, err := r.q.GetPoolByArena(ctx, pgtype.UUID{Bytes: [16]byte(aid), Valid: true})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Pool{}, false, nil
		}
		return domain.Pool{}, false, fmt.Errorf("get pool by arena: %w", err)
	}
	memberIDs, err := r.q.ListMembersByPool(ctx, row.ID)
	if err != nil {
		return domain.Pool{}, false, fmt.Errorf("list members by pool: %w", err)
	}
	members := make([]domain.FighterRef, len(memberIDs))
	for i, id := range memberIDs {
		members[i] = domain.FighterRef{ID: id.String()}
	}
	return domain.Pool{
		ID: row.ID.String(), NominationID: row.NominationID.String(), Number: int(row.Number), Members: members,
		ArenaID: fromNullableUUID(row.ArenaID),
	}, true, nil
}

// ReadyUnseatedPools возвращает пулы в статусе «готов», ещё не поставленные
// ни на одну арену (FR-9).
func (r *Repo) ReadyUnseatedPools(ctx context.Context) ([]domain.Pool, error) {
	rows, err := r.q.ListReadyUnseatedPools(ctx)
	if err != nil {
		return nil, fmt.Errorf("list ready unseated pools: %w", err)
	}
	out := make([]domain.Pool, 0, len(rows))
	for _, p := range rows {
		memberIDs, err := r.q.ListMembersByPool(ctx, p.ID)
		if err != nil {
			return nil, fmt.Errorf("list members by pool: %w", err)
		}
		members := make([]domain.FighterRef, len(memberIDs))
		for i, id := range memberIDs {
			members[i] = domain.FighterRef{ID: id.String()}
		}
		out = append(out, domain.Pool{
			ID: p.ID.String(), NominationID: p.NominationID.String(), Number: int(p.Number), Members: members,
			ArenaID: fromNullableUUID(p.ArenaID),
		})
	}
	return out, nil
}

// AnySeatedInNomination — стоит ли хотя бы один пул номинации на арене
// (гейт FR-3).
func (r *Repo) AnySeatedInNomination(ctx context.Context, nominationID string) (bool, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return false, fmt.Errorf("parse nomination id: %w", err)
	}
	exists, err := r.q.ExistsSeatedInNomination(ctx, nid)
	if err != nil {
		return false, fmt.Errorf("exists seated in nomination: %w", err)
	}
	return exists, nil
}

func decodeUndo(kind string, data []byte) (domain.UndoState, error) {
	if kind == "" {
		return domain.UndoState{}, nil
	}
	var parsed undoDataJSON
	if len(data) > 0 {
		if err := json.Unmarshal(data, &parsed); err != nil {
			return domain.UndoState{}, fmt.Errorf("unmarshal undo data: %w", err)
		}
	}
	state := domain.UndoState{
		Kind:       domain.UndoKind(kind),
		FighterIDs: parsed.FighterIDs,
		PoolNumber: parsed.Number,
	}
	if len(parsed.Pools) > 0 {
		state.Pools = make([]domain.ResetPool, len(parsed.Pools))
		for i, p := range parsed.Pools {
			state.Pools[i] = domain.ResetPool{Number: p.Number, FighterIDs: p.FighterIDs}
		}
	}
	return state, nil
}

func encodeUndo(d undoDataJSON) ([]byte, error) {
	b, err := json.Marshal(d)
	if err != nil {
		return nil, fmt.Errorf("marshal undo data: %w", err)
	}
	return b, nil
}

func parseUUIDs(ids []string) ([]uuid.UUID, error) {
	out := make([]uuid.UUID, len(ids))
	for i, s := range ids {
		id, err := uuid.Parse(s)
		if err != nil {
			return nil, fmt.Errorf("parse id %q: %w", s, err)
		}
		out[i] = id
	}
	return out, nil
}

func uuidsToStrings(ids []uuid.UUID) []string {
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = id.String()
	}
	return out
}

// fromNullableUUID конвертирует nullable UUID-колонку (arena_id) в строку:
// "" — NULL (пул не на арене), иначе строковое представление (спека 0011).
func fromNullableUUID(id pgtype.UUID) string {
	if !id.Valid {
		return ""
	}
	return uuid.UUID(id.Bytes).String()
}

// isUniqueViolation определяет, что ошибка PG — нарушение unique-констрейнта
// (или partial unique index) с заданным именем.
func isUniqueViolation(err error, constraintName string) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return false
	}
	return pgErr.Code == uniqueViolation && pgErr.ConstraintName == constraintName
}
