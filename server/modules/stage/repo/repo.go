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

	"github.com/hema/server/modules/stage/domain"
	"github.com/hema/server/modules/stage/repo/sqlc"
)

// uniqueViolation — код ошибки PostgreSQL при нарушении unique-констрейнта
// (23505), в частности partial unique index uq_pools_arena (спека 0011,
// FR-6/NFR-4).
const uniqueViolation = "23505"

// constraintPoolsArena — имя partial unique index, защищающего инвариант
// «одна арена ↔ один пул» на уровне данных (см. migrations/00001_init.sql).
const constraintPoolsArena = "uq_pools_arena"

// Repo — адаптер к PostgreSQL для модуля stage.
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
// (спека 0009, решение №16; расширено спекой 0018 — слоты в снапшоте
// reset). Одна форма покрывает все три вида undo:
// - UndoAuto: FighterIDs (кого расставило авто → вернуть в нераспределённые);
// - UndoDeletePool: Number + FighterIDs (восстановить пул + членства; DeletePool
//   — действие только группового этапа, слотов не несёт);
// - UndoReset: Pools (снапшот всех пулов с их членствами, включая слоты
//   посева сетки, спека 0018 FR-8 → восстановить все).
// Для UndoAuto/UndoDeletePool Pools пуст (omitempty); для UndoReset
// FighterIDs/Number не используются (omitempty).
type undoDataJSON struct {
	FighterIDs []string       `json:"fighter_ids,omitempty"`
	Number     int            `json:"number,omitempty"`
	Pools      []undoPoolJSON `json:"pools,omitempty"`
}

// undoPoolJSON — один пул в снапшоте undo-reset: номер + бойцы (со слотами,
// спека 0018).
type undoPoolJSON struct {
	Number  int              `json:"number"`
	Members []undoMemberJSON `json:"members,omitempty"`
}

// undoMemberJSON — один боец в снапшоте пула: id + слот (0 — без слота,
// группа; спека 0018, FR-8).
type undoMemberJSON struct {
	FighterID string `json:"fighter_id"`
	Slot      int    `json:"slot,omitempty"`
}

// ---------------------------------------------------------------------
// Этапы (спека 0017, расширено спекой 0018 — bracket_size/third_place).
// ---------------------------------------------------------------------

// EnsureStage — get-or-create канонического (группового) этапа номинации
// (FR-4): SELECT, и если не найдено — INSERT. «Ровно один этап на
// номинацию» — инвариант сервиса, не БД (нет unique-констрейнта на
// nomination_id, план «Модуль stage»): при гонке параллельного первого
// мутирующего вызова возможна кратковременная дублирующая строка —
// принятый в плане trade-off, снимается конструктором схемы в 0020.
func (r *Repo) EnsureStage(ctx context.Context, nominationID string) (domain.Stage, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return domain.Stage{}, fmt.Errorf("parse nomination id: %w", err)
	}
	row, err := r.q.GetStageByNomination(ctx, nid)
	switch {
	case err == nil:
		return toDomainStage(row.ID, row.NominationID, row.Position, row.Title, row.Type, row.Status, row.UndoKind, row.UndoData, row.BracketSize, row.ThirdPlace)
	case errors.Is(err, pgx.ErrNoRows):
		inserted, err := r.q.InsertStage(ctx, sqlc.InsertStageParams{
			NominationID: nid, Position: 0, Title: domain.DefaultStageTitle, Type: string(domain.StageTypeGroups),
		})
		if err != nil {
			return domain.Stage{}, fmt.Errorf("insert stage: %w", err)
		}
		return toDomainStage(inserted.ID, inserted.NominationID, inserted.Position, inserted.Title, inserted.Type, inserted.Status, inserted.UndoKind, inserted.UndoData, inserted.BracketSize, inserted.ThirdPlace)
	default:
		return domain.Stage{}, fmt.Errorf("get stage by nomination: %w", err)
	}
}

// StageByNomination — чтение канонического этапа без создания (FR-4:
// found=false, если строки ещё нет — вызывающий трактует как виртуальный
// этап).
func (r *Repo) StageByNomination(ctx context.Context, nominationID string) (domain.Stage, bool, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return domain.Stage{}, false, fmt.Errorf("parse nomination id: %w", err)
	}
	row, err := r.q.GetStageByNomination(ctx, nid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Stage{}, false, nil
		}
		return domain.Stage{}, false, fmt.Errorf("get stage by nomination: %w", err)
	}
	stage, err := toDomainStage(row.ID, row.NominationID, row.Position, row.Title, row.Type, row.Status, row.UndoKind, row.UndoData, row.BracketSize, row.ThirdPlace)
	return stage, true, err
}

// StageByID резолвит этап по id (пул адресует этап через pool.StageID,
// напр. SeatPoolOnArena; спека 0018 — раскладка адресуется этапом напрямую,
// FR-18).
func (r *Repo) StageByID(ctx context.Context, stageID string) (domain.Stage, bool, error) {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return domain.Stage{}, false, fmt.Errorf("parse stage id: %w", err)
	}
	row, err := r.q.GetStageByID(ctx, sid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Stage{}, false, nil
		}
		return domain.Stage{}, false, fmt.Errorf("get stage by id: %w", err)
	}
	stage, err := toDomainStage(row.ID, row.NominationID, row.Position, row.Title, row.Type, row.Status, row.UndoKind, row.UndoData, row.BracketSize, row.ThirdPlace)
	return stage, true, err
}

// StagesByNomination возвращает все этапы номинации (для публичных ответов,
// repeated stages) — с 0018 может быть больше одного (групповой + одна или
// несколько сеток).
func (r *Repo) StagesByNomination(ctx context.Context, nominationID string) ([]domain.Stage, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return nil, fmt.Errorf("parse nomination id: %w", err)
	}
	rows, err := r.q.ListStagesByNomination(ctx, nid)
	if err != nil {
		return nil, fmt.Errorf("list stages by nomination: %w", err)
	}
	out := make([]domain.Stage, 0, len(rows))
	for _, row := range rows {
		stage, err := toDomainStage(row.ID, row.NominationID, row.Position, row.Title, row.Type, row.Status, row.UndoKind, row.UndoData, row.BracketSize, row.ThirdPlace)
		if err != nil {
			return nil, err
		}
		out = append(out, stage)
	}
	return out, nil
}

// CreateStage вставляет новый этап-сетку номинации (спека 0018, FR-2):
// позицию (max+1, MaxStagePosition) и всё остальное вычисляет вызывающий
// (service.CreateStage) — репозиторий только пишет переданные значения.
func (r *Repo) CreateStage(ctx context.Context, nominationID string, position int, title string, stageType domain.StageType, bracket domain.BracketConfig) (domain.Stage, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return domain.Stage{}, fmt.Errorf("parse nomination id: %w", err)
	}
	row, err := r.q.CreateStage(ctx, sqlc.CreateStageParams{
		NominationID: nid, Position: int32(position), Title: title, Type: string(stageType),
		BracketSize: int32(bracket.Size), ThirdPlace: bracket.ThirdPlace,
	})
	if err != nil {
		return domain.Stage{}, fmt.Errorf("create stage: %w", err)
	}
	return toDomainStage(row.ID, row.NominationID, row.Position, row.Title, row.Type, row.Status, row.UndoKind, row.UndoData, row.BracketSize, row.ThirdPlace)
}

// DeleteStage удаляет этап вместе с его контейнерами и членствами (каскад
// БД, ON DELETE CASCADE — см. миграция) — гейты (тип bracket, нет начатых
// боёв) проверяет вызывающий (service.DeleteStage) до вызова (FR-3, AC-14).
func (r *Repo) DeleteStage(ctx context.Context, stageID string) error {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return fmt.Errorf("parse stage id: %w", err)
	}
	if err := r.q.DeleteStage(ctx, sid); err != nil {
		return fmt.Errorf("delete stage: %w", err)
	}
	return nil
}

// MaxStagePosition возвращает наибольшую position среди этапов номинации
// (0, если этапов ещё нет) — CreateStage встаёт под max+1 (FR-2).
func (r *Repo) MaxStagePosition(ctx context.Context, nominationID string) (int, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return 0, fmt.Errorf("parse nomination id: %w", err)
	}
	max, err := r.q.MaxStagePosition(ctx, nid)
	if err != nil {
		return 0, fmt.Errorf("max stage position: %w", err)
	}
	return int(max), nil
}

// GetPool возвращает один пул по id (включая StageID/ArenaID/CurrentBoutID,
// спека 0011/0013/0017).
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
		ID: row.ID.String(), StageID: row.StageID.String(), NominationID: row.NominationID.String(),
		Number: int(row.Number), Members: members,
		ArenaID: fromNullableUUID(row.ArenaID), CurrentBoutID: fromNullableUUID(row.CurrentBoutID),
	}, nil
}

// CreatePool вставляет пул в этап, очищает undo этапа.
func (r *Repo) CreatePool(ctx context.Context, stageID string, number int) (domain.Pool, error) {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return domain.Pool{}, fmt.Errorf("parse stage id: %w", err)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return domain.Pool{}, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	row, err := q.InsertPool(ctx, sqlc.InsertPoolParams{StageID: sid, Number: int32(number)})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Pool{}, domain.ErrNotFound
		}
		return domain.Pool{}, fmt.Errorf("insert pool: %w", err)
	}
	if err := q.ClearStageUndo(ctx, sid); err != nil {
		return domain.Pool{}, fmt.Errorf("clear stage undo: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.Pool{}, fmt.Errorf("commit: %w", err)
	}
	return domain.Pool{ID: row.ID.String(), StageID: row.StageID.String(), NominationID: row.NominationID.String(), Number: int(row.Number)}, nil
}

// DeletePool атомарно удаляет пул и записывает undo-снапшот его этапа.
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
	if err := q.SetStageUndo(ctx, sqlc.SetStageUndoParams{
		ID: poolRow.StageID, UndoKind: string(domain.UndoDeletePool), UndoData: undoData,
	}); err != nil {
		return fmt.Errorf("set stage undo: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// ResetLayout атомарно удаляет все пулы этапа, записывает undo-снапшот всех
// пулов с их членствами, включая слоты посева (kind=reset, спека 0018,
// FR-8).
func (r *Repo) ResetLayout(ctx context.Context, stageID string) error {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return fmt.Errorf("parse stage id: %w", err)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	// Снапшот всех пулов этапа (number + члены со слотами) до удаления.
	poolRows, err := q.ListPoolsByStage(ctx, sid)
	if err != nil {
		return fmt.Errorf("list pools: %w", err)
	}
	memberRows, err := q.ListMembersByStage(ctx, sid)
	if err != nil {
		return fmt.Errorf("list members: %w", err)
	}
	byPool := make(map[uuid.UUID][]undoMemberJSON, len(poolRows))
	for _, m := range memberRows {
		byPool[m.PoolID] = append(byPool[m.PoolID], undoMemberJSON{FighterID: m.FighterID.String(), Slot: fromNullableInt32(m.Slot)})
	}
	pools := make([]undoPoolJSON, 0, len(poolRows))
	for _, p := range poolRows {
		pools = append(pools, undoPoolJSON{Number: int(p.Number), Members: byPool[p.ID]})
	}

	if err := q.DeleteAllPoolsByStage(ctx, sid); err != nil {
		return fmt.Errorf("delete all pools: %w", err)
	}
	undoData, err := encodeUndo(undoDataJSON{Pools: pools})
	if err != nil {
		return err
	}
	if err := q.SetStageUndo(ctx, sqlc.SetStageUndoParams{
		ID: sid, UndoKind: string(domain.UndoReset), UndoData: undoData,
	}); err != nil {
		return fmt.Errorf("set stage undo: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// UndoReset пересоздаёт все пулы этапа из снапшота с теми же номерами и
// членами (со слотами, спека 0018), очищает undo (AC-13a4). Идемпотентно:
// повторный вызов даёт тот же результат (InsertPool на свободный номер +
// InsertMember; если пул с номером уже существует — UNIQUE(stage_id,
// number) даст конфликт, но после undo undo обнулён, повторный undo не
// должен доходить сюда).
func (r *Repo) UndoReset(ctx context.Context, stageID string, pools []domain.ResetPool) error {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return fmt.Errorf("parse stage id: %w", err)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	for _, p := range pools {
		poolRow, err := q.InsertPool(ctx, sqlc.InsertPoolParams{StageID: sid, Number: int32(p.Number)})
		if err != nil {
			return fmt.Errorf("insert pool %d: %w", p.Number, err)
		}
		for _, m := range p.Members {
			fid, err := uuid.Parse(m.FighterID)
			if err != nil {
				return fmt.Errorf("parse fighter id: %w", err)
			}
			if err := q.InsertMember(ctx, sqlc.InsertMemberParams{PoolID: poolRow.ID, FighterID: fid, Slot: nullableSlot(m.Slot)}); err != nil {
				return fmt.Errorf("insert member: %w", err)
			}
		}
	}
	if err := q.ClearStageUndo(ctx, sid); err != nil {
		return fmt.Errorf("clear stage undo: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// AssignFighter кладёт бойца в пул этапа: move одним действием, если боец
// уже был в другом пуле ЭТОГО этапа (спека 0017, FR-1/FR-5/FR-7). slot —
// номер слота сетки (спека 0018, FR-7); 0 у группового этапа, где слотов
// нет (сохраняется как NULL).
func (r *Repo) AssignFighter(ctx context.Context, stageID, fighterID, poolID string, slot int) error {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return fmt.Errorf("parse stage id: %w", err)
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
	if poolRow.StageID != sid {
		return domain.ErrNotFound
	}
	if err := q.DeleteMemberByFighter(ctx, sqlc.DeleteMemberByFighterParams{
		StageID: sid, FighterID: fid,
	}); err != nil {
		return fmt.Errorf("delete existing membership: %w", err)
	}
	if err := q.InsertMember(ctx, sqlc.InsertMemberParams{PoolID: pid, FighterID: fid, Slot: nullableSlot(slot)}); err != nil {
		return fmt.Errorf("insert member: %w", err)
	}
	if err := q.ClearStageUndo(ctx, sid); err != nil {
		return fmt.Errorf("clear stage undo: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// UnassignFighter убирает бойца из пула этапа, если он там был (идемпотентно).
func (r *Repo) UnassignFighter(ctx context.Context, stageID, fighterID string) error {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return fmt.Errorf("parse stage id: %w", err)
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
		StageID: sid, FighterID: fid,
	}); err != nil {
		return fmt.Errorf("delete membership: %w", err)
	}
	if err := q.ClearStageUndo(ctx, sid); err != nil {
		return fmt.Errorf("clear stage undo: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// ApplyAutoDistribute атомарно применяет assignments и записывает undo этапа
// (kind=auto). Только для групп — слот всегда 0/NULL (AutoDistribute
// отклоняется на сетке уровнем выше, спека 0018).
func (r *Repo) ApplyAutoDistribute(ctx context.Context, stageID string, assignments []domain.Assignment) error {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return fmt.Errorf("parse stage id: %w", err)
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
		if err := q.InsertMember(ctx, sqlc.InsertMemberParams{PoolID: pid, FighterID: fid}); err != nil {
			return fmt.Errorf("insert member: %w", err)
		}
		fighterIDs = append(fighterIDs, a.FighterID)
	}

	undoData, err := encodeUndo(undoDataJSON{FighterIDs: fighterIDs})
	if err != nil {
		return err
	}
	if err := q.SetStageUndo(ctx, sqlc.SetStageUndoParams{
		ID: sid, UndoKind: string(domain.UndoAuto), UndoData: undoData,
	}); err != nil {
		return fmt.Errorf("set stage undo: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// UndoAuto удаляет членства перечисленных fighterIDs в этапе, очищает undo.
func (r *Repo) UndoAuto(ctx context.Context, stageID string, fighterIDs []string) error {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return fmt.Errorf("parse stage id: %w", err)
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
		StageID: sid, FighterIds: fids,
	}); err != nil {
		return fmt.Errorf("delete members: %w", err)
	}
	if err := q.ClearStageUndo(ctx, sid); err != nil {
		return fmt.Errorf("clear stage undo: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// UndoDeletePool пересоздаёт пул этапа с тем же number и членами, очищает undo.
func (r *Repo) UndoDeletePool(ctx context.Context, stageID string, number int, fighterIDs []string) error {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return fmt.Errorf("parse stage id: %w", err)
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

	poolRow, err := q.InsertPool(ctx, sqlc.InsertPoolParams{StageID: sid, Number: int32(number)})
	if err != nil {
		return fmt.Errorf("insert pool: %w", err)
	}
	for _, fid := range fids {
		if err := q.InsertMember(ctx, sqlc.InsertMemberParams{PoolID: poolRow.ID, FighterID: fid}); err != nil {
			return fmt.Errorf("insert member: %w", err)
		}
	}
	if err := q.ClearStageUndo(ctx, sid); err != nil {
		return fmt.Errorf("clear stage undo: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// PruneMembers удаляет членства бойцов номинации (по всем её этапам),
// которых нет среди activeFighterIDs (FR-15). Не трогает undo. Остаётся
// номинационным (спека 0017, FR-9). Исключение (спека 0018, FR-22):
// зафиксированные сетки (type=bracket, status=ready) не трогает — забота
// самого SQL-запроса (queries/stage.sql).
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

// SetStatus задаёт статус этапа, очищает undo.
func (r *Repo) SetStatus(ctx context.Context, stageID string, status domain.LayoutStatus) error {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return fmt.Errorf("parse stage id: %w", err)
	}
	if err := r.q.SetStageStatus(ctx, sqlc.SetStageStatusParams{
		ID: sid, Status: string(status),
	}); err != nil {
		return fmt.Errorf("set stage status: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------
// Посев сетки (спека 0018, FR-7/FR-8).
// ---------------------------------------------------------------------

// SeedSlot сажает бойца в слот первого круга сетки (спека 0018, FR-7/FR-8):
// upsert членства (containerPoolID, fighterID, slot) в одной транзакции.
// Если fighterID уже сидел в другом слоте этого этапа — снимается оттуда;
// если целевой слот уже занят другим бойцом — тот вытесняется на
// освободившееся (или отсутствующее) старое место fighterID, реализуя
// обмен местами (в т.ч. между половинами). Легитимность вызова (обмен vs
// отказ ErrSlotOccupied) — уже решена вызывающим (service.SeedBracketSlot)
// до вызова.
func (r *Repo) SeedSlot(ctx context.Context, stageID, containerPoolID, fighterID string, slot int) error {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return fmt.Errorf("parse stage id: %w", err)
	}
	pid, err := uuid.Parse(containerPoolID)
	if err != nil {
		return fmt.Errorf("parse pool id: %w", err)
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

	oldRow, err := q.MemberSlotInStage(ctx, sqlc.MemberSlotInStageParams{StageID: sid, FighterID: fid})
	hadOld := true
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			hadOld = false
		} else {
			return fmt.Errorf("member slot in stage: %w", err)
		}
	}

	occupantID, err := q.MemberAtSlot(ctx, sqlc.MemberAtSlotParams{PoolID: pid, Slot: int32(slot)})
	hasOccupant := true
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			hasOccupant = false
		} else {
			return fmt.Errorf("member at slot: %w", err)
		}
	}

	if hadOld {
		if err := q.DeleteMemberByFighter(ctx, sqlc.DeleteMemberByFighterParams{StageID: sid, FighterID: fid}); err != nil {
			return fmt.Errorf("delete existing membership: %w", err)
		}
	}
	if hasOccupant && occupantID != fid {
		if err := q.DeleteMemberByFighter(ctx, sqlc.DeleteMemberByFighterParams{StageID: sid, FighterID: occupantID}); err != nil {
			return fmt.Errorf("delete occupant membership: %w", err)
		}
		if hadOld {
			if err := q.InsertMember(ctx, sqlc.InsertMemberParams{
				PoolID: oldRow.PoolID, FighterID: occupantID, Slot: oldRow.Slot,
			}); err != nil {
				return fmt.Errorf("insert displaced occupant: %w", err)
			}
		}
	}
	if err := q.InsertMember(ctx, sqlc.InsertMemberParams{PoolID: pid, FighterID: fid, Slot: nullableSlot(slot)}); err != nil {
		return fmt.Errorf("insert member: %w", err)
	}
	if err := q.ClearStageUndo(ctx, sid); err != nil {
		return fmt.Errorf("clear stage undo: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// SeedsByStage возвращает текущий посев первого круга этапа (слот → боец) —
// сырые членства с непустым slot, по обоим контейнерам первого круга.
func (r *Repo) SeedsByStage(ctx context.Context, stageID string) ([]domain.Seed, error) {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return nil, fmt.Errorf("parse stage id: %w", err)
	}
	rows, err := r.q.SeedsByStage(ctx, sid)
	if err != nil {
		return nil, fmt.Errorf("seeds by stage: %w", err)
	}
	out := make([]domain.Seed, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.Seed{Slot: fromNullableInt32(row.Slot), Fighter: domain.FighterRef{ID: row.FighterID.String()}})
	}
	return out, nil
}

// DeleteContainers удаляет контейнеры (пулы) по id, каскадом членства —
// расфиксация сетки удаляет так круги >= 2 (посев первого круга остаётся),
// DeleteStage — все контейнеры этапа целиком (через каскад ON DELETE
// CASCADE самого DeleteStage, эта функция для точечной расфиксации).
func (r *Repo) DeleteContainers(ctx context.Context, poolIDs []string) error {
	if len(poolIDs) == 0 {
		return nil
	}
	ids, err := parseUUIDs(poolIDs)
	if err != nil {
		return err
	}
	if err := r.q.DeleteContainers(ctx, ids); err != nil {
		return fmt.Errorf("delete containers: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------
// Чтения пулов/членств по этапу и по номинации целиком (спека 0017).
// ---------------------------------------------------------------------

// PoolsByStage возвращает bare-пулы этапа (без Members — см. MembersByStage).
func (r *Repo) PoolsByStage(ctx context.Context, stageID string) ([]domain.Pool, error) {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return nil, fmt.Errorf("parse stage id: %w", err)
	}
	rows, err := r.q.ListPoolsByStage(ctx, sid)
	if err != nil {
		return nil, fmt.Errorf("list pools by stage: %w", err)
	}
	out := make([]domain.Pool, 0, len(rows))
	for _, p := range rows {
		out = append(out, domain.Pool{
			ID: p.ID.String(), StageID: p.StageID.String(), NominationID: p.NominationID.String(), Number: int(p.Number),
			ArenaID: fromNullableUUID(p.ArenaID), CurrentBoutID: fromNullableUUID(p.CurrentBoutID),
		})
	}
	return out, nil
}

// MembersByStage возвращает сырые членства этапа.
func (r *Repo) MembersByStage(ctx context.Context, stageID string) ([]domain.PoolMember, error) {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return nil, fmt.Errorf("parse stage id: %w", err)
	}
	rows, err := r.q.ListMembersByStage(ctx, sid)
	if err != nil {
		return nil, fmt.Errorf("list members by stage: %w", err)
	}
	out := make([]domain.PoolMember, 0, len(rows))
	for _, m := range rows {
		out = append(out, domain.PoolMember{PoolID: m.PoolID.String(), FighterID: m.FighterID.String()})
	}
	return out, nil
}

// PoolsByNomination возвращает bare-пулы номинации целиком, по всем её
// этапам (спека 0017, FR-9).
func (r *Repo) PoolsByNomination(ctx context.Context, nominationID string) ([]domain.Pool, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return nil, fmt.Errorf("parse nomination id: %w", err)
	}
	rows, err := r.q.ListPoolsByNomination(ctx, nid)
	if err != nil {
		return nil, fmt.Errorf("list pools by nomination: %w", err)
	}
	out := make([]domain.Pool, 0, len(rows))
	for _, p := range rows {
		out = append(out, domain.Pool{
			ID: p.ID.String(), StageID: p.StageID.String(), NominationID: p.NominationID.String(), Number: int(p.Number),
			ArenaID: fromNullableUUID(p.ArenaID), CurrentBoutID: fromNullableUUID(p.CurrentBoutID),
		})
	}
	return out, nil
}

// MembersByNomination возвращает сырые членства номинации целиком, по всем
// её этапам.
func (r *Repo) MembersByNomination(ctx context.Context, nominationID string) ([]domain.PoolMember, error) {
	nid, err := uuid.Parse(nominationID)
	if err != nil {
		return nil, fmt.Errorf("parse nomination id: %w", err)
	}
	rows, err := r.q.ListMembersByNomination(ctx, nid)
	if err != nil {
		return nil, fmt.Errorf("list members by nomination: %w", err)
	}
	out := make([]domain.PoolMember, 0, len(rows))
	for _, m := range rows {
		out = append(out, domain.PoolMember{PoolID: m.PoolID.String(), FighterID: m.FighterID.String()})
	}
	return out, nil
}

// ---------------------------------------------------------------------
// Арена/ведение боя (спека 0011/0013, poolID-адресация не задета спекой
// 0017/0018).
// ---------------------------------------------------------------------

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
		ID: row.ID.String(), StageID: row.StageID.String(), NominationID: row.NominationID.String(),
		Number: int(row.Number), Members: members,
		ArenaID: fromNullableUUID(row.ArenaID), CurrentBoutID: fromNullableUUID(row.CurrentBoutID),
	}, true, nil
}

// ReadyUnseatedPools возвращает пулы в статусе «готов» (раскладка их этапа
// ready), ещё не поставленные ни на одну арену (FR-9).
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
			ID: p.ID.String(), StageID: p.StageID.String(), NominationID: p.NominationID.String(),
			Number: int(p.Number), Members: members,
			ArenaID: fromNullableUUID(p.ArenaID), CurrentBoutID: fromNullableUUID(p.CurrentBoutID),
		})
	}
	return out, nil
}

// SetCurrentBout записывает указатель текущего боя пула (спека 0013,
// FR-7/FR-8/FR-9). boutID пуст — указатель сбрасывается в NULL
// (авто-продвижение после завершения последнего боя пула, AC-10).
func (r *Repo) SetCurrentBout(ctx context.Context, poolID, boutID string) error {
	pid, err := uuid.Parse(poolID)
	if err != nil {
		return domain.ErrNotFound
	}
	var boutUUID pgtype.UUID
	if boutID != "" {
		bid, err := uuid.Parse(boutID)
		if err != nil {
			return fmt.Errorf("parse bout id: %w", err)
		}
		boutUUID = pgtype.UUID{Bytes: [16]byte(bid), Valid: true}
	}
	if err := r.q.SetCurrentBout(ctx, sqlc.SetCurrentBoutParams{ID: pid, BoutID: boutUUID}); err != nil {
		return fmt.Errorf("set current bout: %w", err)
	}
	return nil
}

// AnySeatedInStage — стоит ли хотя бы один пул этапа на арене (гейт FR-8
// спеки 0017, было AnySeatedInNomination).
func (r *Repo) AnySeatedInStage(ctx context.Context, stageID string) (bool, error) {
	sid, err := uuid.Parse(stageID)
	if err != nil {
		return false, fmt.Errorf("parse stage id: %w", err)
	}
	exists, err := r.q.ExistsSeatedInStage(ctx, sid)
	if err != nil {
		return false, fmt.Errorf("exists seated in stage: %w", err)
	}
	return exists, nil
}

// ---------------------------------------------------------------------
// Конверсии/хелперы.
// ---------------------------------------------------------------------

// toDomainStage собирает domain.Stage из полей строки stage.stages (общая
// форма у GetStageByNomination/GetStageByID/InsertStage/CreateStage/
// ListStagesByNomination). bracketSize/thirdPlace — 0/false у группового
// этапа (chk_stages_bracket).
func toDomainStage(id, nominationID uuid.UUID, position int32, title, stageType, status, undoKind string, undoData []byte, bracketSize int32, thirdPlace bool) (domain.Stage, error) {
	undo, err := decodeUndo(undoKind, undoData)
	if err != nil {
		return domain.Stage{}, err
	}
	return domain.Stage{
		ID: id.String(), NominationID: nominationID.String(), Position: int(position),
		Title: title, Type: domain.StageType(stageType), Status: domain.LayoutStatus(status), Undo: undo,
		Bracket: domain.BracketConfig{Size: int(bracketSize), ThirdPlace: thirdPlace},
	}, nil
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
			members := make([]domain.ResetMember, len(p.Members))
			for j, m := range p.Members {
				members[j] = domain.ResetMember{FighterID: m.FighterID, Slot: m.Slot}
			}
			state.Pools[i] = domain.ResetPool{Number: p.Number, Members: members}
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

// nullableSlot конвертирует доменный slot (0 — без слота, спека 0018) в
// указатель для nullable-колонки pool_members.slot: 0/отрицательное → NULL,
// иначе — значение.
func nullableSlot(slot int) *int32 {
	if slot <= 0 {
		return nil
	}
	v := int32(slot)
	return &v
}

// fromNullableInt32 конвертирует nullable int32-колонку (pool_members.slot)
// в доменный int: NULL → 0 (спека 0018, ResetMember.Slot == 0 — без слота).
func fromNullableInt32(v *int32) int {
	if v == nil {
		return 0
	}
	return int(*v)
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
