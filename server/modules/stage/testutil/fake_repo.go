// Package testutil содержит test doubles (fake-реализации портов) модуля
// stage. Используется юнит-тестами service и e2e-тестами api-хендлеров.
package testutil

import (
	"context"
	"sort"
	"sync"

	"github.com/google/uuid"

	"github.com/hema/server/modules/stage/domain"
)

type stageRow struct {
	id           string
	nominationID string
	position     int
	title        string
	stageType    domain.StageType
	status       domain.LayoutStatus
	undo         domain.UndoState
}

type poolRow struct {
	id            string
	stageID       string
	nominationID  string
	number        int
	memberIDs     []string
	arenaID       string
	currentBoutID string
}

// FakeRepo — in-memory реализация domain.Repository для тестов.
// Потокобезопасна (мьютекс). Повторяет ключевые инварианты БД: один боец —
// не более одного пула в пределах ЭТАПА (спека 0017, FR-7 — было: в
// номинации), lazy-init единственного этапа номинации (FR-4/FR-14).
//
// canonicalStage хранит «тот самый» авто-управляемый этап номинации
// (EnsureStage/StageByNomination) отдельно от stages (все существующие
// этапы, включая вручную посеянные SeedStage) — так тесты AC-4/AC-5 (спека
// 0017: состояние «два этапа», достижимое в модели, но не через интерфейс,
// FR-12) могут завести второй этап той же номинации, не рискуя, что
// EnsureStage/StageByNomination его случайно подхватят вместо канонического.
type FakeRepo struct {
	mu             sync.Mutex
	stages         map[string]*stageRow // stage id -> stage (все этапы, включая вручную посеянные)
	canonicalStage map[string]string    // nomination id -> id канонического (auto-managed) этапа
	pools          map[string]*poolRow

	// SetStatusCalls — счётчик вызовов SetStatus (спека 0010, T12): позволяет
	// тестам service убедиться, что при ошибке BoutConductor статус в repo не
	// меняется (порядок «эффект в bout → потом статус»).
	SetStatusCalls int
}

// NewFakeRepo создаёт пустой fake-репозиторий.
func NewFakeRepo() *FakeRepo {
	return &FakeRepo{
		stages:         make(map[string]*stageRow),
		canonicalStage: make(map[string]string),
		pools:          make(map[string]*poolRow),
	}
}

var _ domain.Repository = (*FakeRepo)(nil)

// ---------------------------------------------------------------------
// Тестовые хелперы посева (не часть domain.Repository).
// ---------------------------------------------------------------------

// SeedPool — тестовый хелпер: добавляет пул напрямую в (авто-создаваемый по
// необходимости) канонический этап номинации, в обход
// CreatePool/undo-семантики. Возвращает id пула.
func (r *FakeRepo) SeedPool(nominationID string, number int, memberIDs ...string) string {
	r.mu.Lock()
	defer r.mu.Unlock()

	stage := r.ensureStageLocked(nominationID)
	id := uuid.NewString()
	r.pools[id] = &poolRow{
		id: id, stageID: stage.id, nominationID: nominationID, number: number,
		memberIDs: append([]string{}, memberIDs...),
	}
	return id
}

// SeedStatus — тестовый хелпер: задаёт статус канонического этапа номинации
// напрямую (auto-ensures этап, если строки ещё нет).
func (r *FakeRepo) SeedStatus(nominationID string, status domain.LayoutStatus) {
	r.mu.Lock()
	defer r.mu.Unlock()

	stage := r.ensureStageLocked(nominationID)
	stage.status = status
}

// SeedStage — тестовый хелпер: заводит ДОПОЛНИТЕЛЬНЫЙ этап номинации напрямую
// (спека 0017: состояние «несколько этапов номинации» достижимо в модели, но
// не через интерфейс, FR-12) — используется тестами AC-4/AC-5, проверяющими,
// что работа с одним этапом не задета другим этапом той же номинации.
// Возвращает id этапа. Не регистрируется как канонический — EnsureStage/
// StageByNomination его не увидят.
func (r *FakeRepo) SeedStage(nominationID string, position int, title string, stageType domain.StageType) string {
	r.mu.Lock()
	defer r.mu.Unlock()

	id := uuid.NewString()
	r.stages[id] = &stageRow{
		id: id, nominationID: nominationID, position: position,
		title: title, stageType: stageType, status: domain.LayoutDraft,
	}
	return id
}

// SeedPoolInStage — тестовый хелпер: добавляет пул напрямую в указанный этап
// (для сценариев с несколькими этапами, см. SeedStage). Возвращает id пула,
// либо "" — если этап не найден.
func (r *FakeRepo) SeedPoolInStage(stageID string, number int, memberIDs ...string) string {
	r.mu.Lock()
	defer r.mu.Unlock()

	st, ok := r.stages[stageID]
	if !ok {
		return ""
	}
	id := uuid.NewString()
	r.pools[id] = &poolRow{
		id: id, stageID: stageID, nominationID: st.nominationID, number: number,
		memberIDs: append([]string{}, memberIDs...),
	}
	return id
}

// SeedStageStatus — тестовый хелпер: задаёт статус конкретного (в т.ч.
// вручную посеянного через SeedStage) этапа.
func (r *FakeRepo) SeedStageStatus(stageID string, status domain.LayoutStatus) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if st, ok := r.stages[stageID]; ok {
		st.status = status
	}
}

// StageCount — тестовый хелпер: число строк этапов в хранилище (используется
// T5-тестами, чтобы убедиться, что read-only чтения не материализуют
// виртуальный этап, спека 0017, FR-4/раздел «Риски»).
func (r *FakeRepo) StageCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.stages)
}

// ---------------------------------------------------------------------
// domain.Repository — раскладка (спека 0009/0011/0013, переадресовано на
// этап спекой 0017).
// ---------------------------------------------------------------------

// GetPool возвращает один пул по id.
func (r *FakeRepo) GetPool(_ context.Context, poolID string) (domain.Pool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	p, ok := r.pools[poolID]
	if !ok {
		return domain.Pool{}, domain.ErrNotFound
	}
	return toDomainPool(p), nil
}

// CreatePool вставляет пул в этап, очищает undo этапа.
func (r *FakeRepo) CreatePool(_ context.Context, stageID string, number int) (domain.Pool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	st, ok := r.stages[stageID]
	if !ok {
		return domain.Pool{}, domain.ErrNotFound
	}
	id := uuid.NewString()
	r.pools[id] = &poolRow{id: id, stageID: stageID, nominationID: st.nominationID, number: number}
	r.clearUndoLocked(stageID)
	return domain.Pool{ID: id, StageID: stageID, NominationID: st.nominationID, Number: number}, nil
}

// DeletePool удаляет пул и записывает undo-снапшот его этапа.
func (r *FakeRepo) DeletePool(_ context.Context, poolID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	p, ok := r.pools[poolID]
	if !ok {
		return domain.ErrNotFound
	}
	fighterIDs := append([]string{}, p.memberIDs...)
	delete(r.pools, poolID)
	r.setUndoLocked(p.stageID, domain.UndoState{
		Kind: domain.UndoDeletePool, FighterIDs: fighterIDs, PoolNumber: p.number,
	})
	return nil
}

// ResetLayout удаляет все пулы этапа, записывает undo-снапшот всех пулов с
// их членствами (kind=reset).
func (r *FakeRepo) ResetLayout(_ context.Context, stageID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	snapshot := make([]domain.ResetPool, 0)
	for _, p := range r.pools {
		if p.stageID == stageID {
			snapshot = append(snapshot, domain.ResetPool{
				Number:     p.number,
				FighterIDs: append([]string{}, p.memberIDs...),
			})
		}
	}
	for id, p := range r.pools {
		if p.stageID == stageID {
			delete(r.pools, id)
		}
	}
	r.setUndoLocked(stageID, domain.UndoState{Kind: domain.UndoReset, Pools: snapshot})
	return nil
}

// AssignFighter кладёт бойца в пул этапа (move, если он уже был в другом
// пуле ЭТОГО этапа — членство в пуле другого этапа не трогается, спека
// 0017 FR-7).
func (r *FakeRepo) AssignFighter(_ context.Context, stageID, fighterID, poolID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	target, ok := r.pools[poolID]
	if !ok || target.stageID != stageID {
		return domain.ErrNotFound
	}
	for _, p := range r.pools {
		if p.stageID == stageID {
			p.memberIDs = removeString(p.memberIDs, fighterID)
		}
	}
	target.memberIDs = append(target.memberIDs, fighterID)
	r.clearUndoLocked(stageID)
	return nil
}

// UnassignFighter убирает бойца из пула этапа, если он там был (идемпотентно).
func (r *FakeRepo) UnassignFighter(_ context.Context, stageID, fighterID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, p := range r.pools {
		if p.stageID == stageID {
			p.memberIDs = removeString(p.memberIDs, fighterID)
		}
	}
	r.clearUndoLocked(stageID)
	return nil
}

// ApplyAutoDistribute применяет назначения и записывает undo этапа (kind=auto).
func (r *FakeRepo) ApplyAutoDistribute(_ context.Context, stageID string, assignments []domain.Assignment) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	fighterIDs := make([]string, 0, len(assignments))
	for _, a := range assignments {
		p, ok := r.pools[a.PoolID]
		if !ok {
			return domain.ErrNotFound
		}
		if !containsString(p.memberIDs, a.FighterID) {
			p.memberIDs = append(p.memberIDs, a.FighterID)
		}
		fighterIDs = append(fighterIDs, a.FighterID)
	}
	r.setUndoLocked(stageID, domain.UndoState{Kind: domain.UndoAuto, FighterIDs: fighterIDs})
	return nil
}

// UndoAuto возвращает перечисленных бойцов в нераспределённые (в пределах
// этапа), очищает undo.
func (r *FakeRepo) UndoAuto(_ context.Context, stageID string, fighterIDs []string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, p := range r.pools {
		if p.stageID != stageID {
			continue
		}
		for _, fid := range fighterIDs {
			p.memberIDs = removeString(p.memberIDs, fid)
		}
	}
	r.clearUndoLocked(stageID)
	return nil
}

// UndoDeletePool пересоздаёт пул этапа с тем же number и членами, очищает undo.
func (r *FakeRepo) UndoDeletePool(_ context.Context, stageID string, number int, fighterIDs []string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	nominationID := ""
	if st, ok := r.stages[stageID]; ok {
		nominationID = st.nominationID
	}
	id := uuid.NewString()
	r.pools[id] = &poolRow{
		id: id, stageID: stageID, nominationID: nominationID, number: number,
		memberIDs: append([]string{}, fighterIDs...),
	}
	r.clearUndoLocked(stageID)
	return nil
}

// UndoReset пересоздаёт все пулы этапа из снапшота с теми же номерами и
// членами, очищает undo (AC-13a4).
func (r *FakeRepo) UndoReset(_ context.Context, stageID string, pools []domain.ResetPool) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	nominationID := ""
	if st, ok := r.stages[stageID]; ok {
		nominationID = st.nominationID
	}
	for _, p := range pools {
		id := uuid.NewString()
		r.pools[id] = &poolRow{
			id: id, stageID: stageID, nominationID: nominationID, number: p.Number,
			memberIDs: append([]string{}, p.FighterIDs...),
		}
	}
	r.clearUndoLocked(stageID)
	return nil
}

// PruneMembers удаляет членства бойцов номинации (по всем её этапам), которых
// нет среди activeFighterIDs. Не трогает undo. Остаётся номинационным
// (спека 0017, FR-9).
func (r *FakeRepo) PruneMembers(_ context.Context, nominationID string, activeFighterIDs []string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	active := make(map[string]bool, len(activeFighterIDs))
	for _, id := range activeFighterIDs {
		active[id] = true
	}
	for _, p := range r.pools {
		if p.nominationID != nominationID {
			continue
		}
		kept := p.memberIDs[:0]
		for _, fid := range p.memberIDs {
			if active[fid] {
				kept = append(kept, fid)
			}
		}
		p.memberIDs = kept
	}
	return nil
}

// SetStatus задаёт статус этапа, очищает undo.
func (r *FakeRepo) SetStatus(_ context.Context, stageID string, status domain.LayoutStatus) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.SetStatusCalls++
	if st, ok := r.stages[stageID]; ok {
		st.status = status
		st.undo = domain.UndoState{}
	}
	return nil
}

// clearUndoLocked очищает undo этапа. Вызывающий обязан держать r.mu.
func (r *FakeRepo) clearUndoLocked(stageID string) {
	if st, ok := r.stages[stageID]; ok {
		st.undo = domain.UndoState{}
	}
}

// setUndoLocked задаёт undo этапа. Вызывающий обязан держать r.mu.
func (r *FakeRepo) setUndoLocked(stageID string, undo domain.UndoState) {
	if st, ok := r.stages[stageID]; ok {
		st.undo = undo
	}
}

// ---------------------------------------------------------------------
// domain.Repository — этапы (спека 0017).
// ---------------------------------------------------------------------

// EnsureStage — get-or-create канонического этапа номинации.
func (r *FakeRepo) EnsureStage(_ context.Context, nominationID string) (domain.Stage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return toDomainStage(r.ensureStageLocked(nominationID)), nil
}

// StageByNomination — чтение канонического этапа без создания.
func (r *FakeRepo) StageByNomination(_ context.Context, nominationID string) (domain.Stage, bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	id, ok := r.canonicalStage[nominationID]
	if !ok {
		return domain.Stage{}, false, nil
	}
	return toDomainStage(r.stages[id]), true, nil
}

// StageByID резолвит этап по id.
func (r *FakeRepo) StageByID(_ context.Context, stageID string) (domain.Stage, bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	st, ok := r.stages[stageID]
	if !ok {
		return domain.Stage{}, false, nil
	}
	return toDomainStage(st), true, nil
}

// StagesByNomination возвращает все этапы номинации (канонический + вручную
// посеянные), отсортированные по Position, затем ID (детерминированность).
func (r *FakeRepo) StagesByNomination(_ context.Context, nominationID string) ([]domain.Stage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.Stage, 0)
	for _, st := range r.stages {
		if st.nominationID == nominationID {
			out = append(out, toDomainStage(st))
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Position != out[j].Position {
			return out[i].Position < out[j].Position
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

// ensureStageLocked — get-or-create канонического этапа номинации
// (position=0, type=groups, title=DefaultStageTitle, status=draft).
// Вызывающий обязан держать r.mu.
func (r *FakeRepo) ensureStageLocked(nominationID string) *stageRow {
	if id, ok := r.canonicalStage[nominationID]; ok {
		return r.stages[id]
	}
	id := uuid.NewString()
	st := &stageRow{
		id: id, nominationID: nominationID, position: 0,
		title: domain.DefaultStageTitle, stageType: domain.StageTypeGroups,
		status: domain.LayoutDraft,
	}
	r.stages[id] = st
	r.canonicalStage[nominationID] = id
	return st
}

// ---------------------------------------------------------------------
// domain.Repository — чтения пулов/членств по этапу и по номинации целиком
// (спека 0017).
// ---------------------------------------------------------------------

// PoolsByStage возвращает bare-пулы этапа (без Members — см. MembersByStage).
func (r *FakeRepo) PoolsByStage(_ context.Context, stageID string) ([]domain.Pool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.Pool, 0)
	for _, p := range r.pools {
		if p.stageID == stageID {
			out = append(out, toDomainPoolBare(p))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Number < out[j].Number })
	return out, nil
}

// MembersByStage возвращает сырые членства этапа.
func (r *FakeRepo) MembersByStage(_ context.Context, stageID string) ([]domain.PoolMember, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.PoolMember, 0)
	for _, p := range r.pools {
		if p.stageID != stageID {
			continue
		}
		for _, fid := range p.memberIDs {
			out = append(out, domain.PoolMember{PoolID: p.id, FighterID: fid})
		}
	}
	return out, nil
}

// PoolsByNomination возвращает bare-пулы номинации целиком, по всем её этапам.
func (r *FakeRepo) PoolsByNomination(_ context.Context, nominationID string) ([]domain.Pool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.Pool, 0)
	for _, p := range r.pools {
		if p.nominationID == nominationID {
			out = append(out, toDomainPoolBare(p))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Number < out[j].Number })
	return out, nil
}

// MembersByNomination возвращает сырые членства номинации целиком, по всем
// её этапам.
func (r *FakeRepo) MembersByNomination(_ context.Context, nominationID string) ([]domain.PoolMember, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.PoolMember, 0)
	for _, p := range r.pools {
		if p.nominationID != nominationID {
			continue
		}
		for _, fid := range p.memberIDs {
			out = append(out, domain.PoolMember{PoolID: p.id, FighterID: fid})
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------
// domain.Repository — арена/ведение боя (спека 0011/0013, poolID-адресация
// не задета спекой 0017).
// ---------------------------------------------------------------------

// SeatPool закрепляет пул за площадкой. Повторяет инвариант partial unique
// index uq_pools_arena (FR-6/NFR-4): вторая постановка на ту же арену —
// domain.ErrArenaBusy.
func (r *FakeRepo) SeatPool(_ context.Context, poolID, arenaID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	p, ok := r.pools[poolID]
	if !ok {
		return domain.ErrNotFound
	}
	for _, other := range r.pools {
		if other.id != poolID && other.arenaID == arenaID {
			return domain.ErrArenaBusy
		}
	}
	p.arenaID = arenaID
	return nil
}

// UnseatPool снимает пул с площадки (FR-8). Идемпотентно.
func (r *FakeRepo) UnseatPool(_ context.Context, poolID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	p, ok := r.pools[poolID]
	if !ok {
		return domain.ErrNotFound
	}
	p.arenaID = ""
	return nil
}

// PoolsForArena возвращает пул, стоящий на арене (found=false — арена
// свободна, FR-9).
func (r *FakeRepo) PoolsForArena(_ context.Context, arenaID string) (domain.Pool, bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, p := range r.pools {
		if p.arenaID == arenaID {
			return toDomainPool(p), true, nil
		}
	}
	return domain.Pool{}, false, nil
}

// ReadyUnseatedPools возвращает пулы в статусе «готов» (раскладка их этапа
// ready), ещё не поставленные ни на одну арену (FR-9).
func (r *FakeRepo) ReadyUnseatedPools(_ context.Context) ([]domain.Pool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.Pool, 0)
	for _, p := range r.pools {
		if p.arenaID != "" {
			continue
		}
		st, ok := r.stages[p.stageID]
		if !ok || st.status != domain.LayoutReady {
			continue
		}
		out = append(out, toDomainPool(p))
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].NominationID != out[j].NominationID {
			return out[i].NominationID < out[j].NominationID
		}
		return out[i].Number < out[j].Number
	})
	return out, nil
}

// AnySeatedInStage — стоит ли хотя бы один пул этапа на арене (гейт FR-8
// спеки 0017).
func (r *FakeRepo) AnySeatedInStage(_ context.Context, stageID string) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, p := range r.pools {
		if p.stageID == stageID && p.arenaID != "" {
			return true, nil
		}
	}
	return false, nil
}

// SetCurrentBout записывает указатель текущего боя пула (спека 0013,
// FR-7/FR-8/FR-9).
func (r *FakeRepo) SetCurrentBout(_ context.Context, poolID, boutID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	p, ok := r.pools[poolID]
	if !ok {
		return domain.ErrNotFound
	}
	p.currentBoutID = boutID
	return nil
}

// ---------------------------------------------------------------------
// Конверсии.
// ---------------------------------------------------------------------

func toDomainStage(s *stageRow) domain.Stage {
	return domain.Stage{
		ID: s.id, NominationID: s.nominationID, Position: s.position,
		Title: s.title, Type: s.stageType, Status: s.status, Undo: s.undo,
	}
}

// toDomainPool — полная проекция пула, включая Members (для GetPool/
// PoolsForArena/ReadyUnseatedPools — единичные/арена-скоуп чтения).
func toDomainPool(p *poolRow) domain.Pool {
	members := make([]domain.FighterRef, 0, len(p.memberIDs))
	for _, fid := range p.memberIDs {
		members = append(members, domain.FighterRef{ID: fid})
	}
	return domain.Pool{
		ID: p.id, StageID: p.stageID, NominationID: p.nominationID, Number: p.number, Members: members,
		ArenaID: p.arenaID, CurrentBoutID: p.currentBoutID,
	}
}

// toDomainPoolBare — проекция пула без Members (для PoolsByStage/
// PoolsByNomination — сервис комбинирует членства отдельным вызовом
// MembersByStage/MembersByNomination, по аналогии с тем, как repo раньше сам
// объединял ListPoolsByNomination + ListMembersByNomination).
func toDomainPoolBare(p *poolRow) domain.Pool {
	return domain.Pool{
		ID: p.id, StageID: p.stageID, NominationID: p.nominationID, Number: p.number,
		ArenaID: p.arenaID, CurrentBoutID: p.currentBoutID,
	}
}

func removeString(list []string, s string) []string {
	out := list[:0]
	for _, v := range list {
		if v != s {
			out = append(out, v)
		}
	}
	return out
}

func containsString(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
