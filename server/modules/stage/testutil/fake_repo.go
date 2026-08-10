// Package testutil содержит test doubles (fake-реализации портов) модуля
// stage. Используется юнит-тестами service и e2e-тестами api-хендлеров.
package testutil

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"

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
	// bracket — конфиг этапа-сетки (спека 0018, FR-1): нулевое значение у
	// группового этапа.
	bracket domain.BracketConfig
	// groups — конфиг явно созданного группового этапа (спека 0019, FR-8):
	// нулевое значение у сетки и у авто-этапа (FR-9).
	groups domain.GroupsConfig
	// rule — правило отбора этапа (спека 0019, FR-1): нулевое значение —
	// правила нет, состав набирается руками.
	rule domain.SeedingRule
}

// memberRow — один боец в пуле: fighterID + номер слота посева (спека 0018,
// FR-7). slot == 0 — членство без слота (группа).
type memberRow struct {
	fighterID string
	slot      int
}

type poolRow struct {
	id            string
	stageID       string
	nominationID  string
	number        int
	members       []memberRow
	arenaID       string
	currentBoutID string
}

// presetRow — одна запись библиотеки пресетов формата (спека 0020, FR-11).
type presetRow struct {
	id        string
	name      string
	spec      domain.FormatSpec
	createdAt time.Time
	updatedAt time.Time
}

// FakeRepo — in-memory реализация domain.Repository для тестов.
// Потокобезопасна (мьютекс). Повторяет ключевые инварианты БД: один боец —
// не более одного пула в пределах ЭТАПА (спека 0017, FR-7 — было: в
// номинации), lazy-init единственного этапа номинации (FR-4/FR-14), не более
// одного слота на бойца в пределах этапа (спека 0018, FR-7 — слот = членство
// со slot > 0).
//
// canonicalStage хранит «тот самый» авто-управляемый этап номинации
// (EnsureStage/StageByNomination) отдельно от stages (все существующие
// этапы, включая вручную посеянные SeedStage/CreateStage) — так тесты
// (спека 0017: состояние «два этапа», достижимое в модели, но не через
// интерфейс, FR-12) могут завести второй этап той же номинации, не рискуя,
// что EnsureStage/StageByNomination его случайно подхватят вместо
// канонического.
type FakeRepo struct {
	mu             sync.Mutex
	stages         map[string]*stageRow // stage id -> stage (все этапы, включая вручную посеянные)
	canonicalStage map[string]string    // nomination id -> id канонического (auto-managed) этапа
	pools          map[string]*poolRow
	presets        map[string]*presetRow // preset id -> пресет формата (спека 0020, FR-11)

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
		presets:        make(map[string]*presetRow),
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
		members: membersOf(memberIDs...),
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

// SeedBracketStage — тестовый хелпер: как SeedStage, но с типом bracket и
// заданным конфигом (спека 0018) — для белопящичных тестов, которым нужен
// готовый этап-сетка без прохождения полного CreateStage.
func (r *FakeRepo) SeedBracketStage(nominationID string, position int, title string, cfg domain.BracketConfig) string {
	r.mu.Lock()
	defer r.mu.Unlock()

	id := uuid.NewString()
	r.stages[id] = &stageRow{
		id: id, nominationID: nominationID, position: position,
		title: title, stageType: domain.StageTypeBracket, status: domain.LayoutDraft,
		bracket: cfg,
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
		members: membersOf(memberIDs...),
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

// PoolCount — тестовый хелпер: число строк пулов в хранилище (спека 0018:
// удобно проверять каскадное удаление контейнеров DeleteStage/DeleteContainers
// без резолва по этапу).
func (r *FakeRepo) PoolCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.pools)
}

func membersOf(fighterIDs ...string) []memberRow {
	out := make([]memberRow, 0, len(fighterIDs))
	for _, fid := range fighterIDs {
		out = append(out, memberRow{fighterID: fid})
	}
	return out
}

// ---------------------------------------------------------------------
// domain.Repository — раскладка (спека 0009/0011/0013, переадресовано на
// этап спекой 0017, слот добавлен спекой 0018).
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
	fighterIDs := fighterIDsOf(p.members)
	delete(r.pools, poolID)
	r.setUndoLocked(p.stageID, domain.UndoState{
		Kind: domain.UndoDeletePool, FighterIDs: fighterIDs, PoolNumber: p.number,
	})
	return nil
}

// ResetLayout удаляет все пулы этапа, записывает undo-снапшот всех пулов с
// их членствами (kind=reset), включая слоты посева (спека 0018, FR-8).
func (r *FakeRepo) ResetLayout(_ context.Context, stageID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	snapshot := make([]domain.ResetPool, 0)
	for _, p := range r.pools {
		if p.stageID == stageID {
			snapshot = append(snapshot, domain.ResetPool{
				Number:  p.number,
				Members: resetMembersOf(p.members),
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
// 0017 FR-7). slot — номер слота сетки (спека 0018, FR-7); 0 у группового
// этапа.
func (r *FakeRepo) AssignFighter(_ context.Context, stageID, fighterID, poolID string, slot int) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	target, ok := r.pools[poolID]
	if !ok || target.stageID != stageID {
		return domain.ErrNotFound
	}
	for _, p := range r.pools {
		if p.stageID == stageID {
			p.members = deleteMemberByFighter(p.members, fighterID)
		}
	}
	target.members = append(target.members, memberRow{fighterID: fighterID, slot: slot})
	r.clearUndoLocked(stageID)
	return nil
}

// UnassignFighter убирает бойца из пула этапа, если он там был (идемпотентно).
func (r *FakeRepo) UnassignFighter(_ context.Context, stageID, fighterID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, p := range r.pools {
		if p.stageID == stageID {
			p.members = deleteMemberByFighter(p.members, fighterID)
		}
	}
	r.clearUndoLocked(stageID)
	return nil
}

// ApplyAutoDistribute атомарно применяет assignments (insert членств) и
// записывает undo этапа (kind=auto, fighter_ids = кого расставило). Только
// для групп — слот всегда 0.
func (r *FakeRepo) ApplyAutoDistribute(_ context.Context, stageID string, assignments []domain.Assignment) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	fighterIDs := make([]string, 0, len(assignments))
	for _, a := range assignments {
		p, ok := r.pools[a.PoolID]
		if !ok {
			return domain.ErrNotFound
		}
		if !containsMember(p.members, a.FighterID) {
			p.members = append(p.members, memberRow{fighterID: a.FighterID})
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
			p.members = deleteMemberByFighter(p.members, fid)
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
		members: membersOf(fighterIDs...),
	}
	r.clearUndoLocked(stageID)
	return nil
}

// UndoReset пересоздаёт все пулы этапа из снапшота с теми же номерами и
// членами (со слотами, спека 0018), очищает undo (AC-13a4).
func (r *FakeRepo) UndoReset(_ context.Context, stageID string, pools []domain.ResetPool) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	nominationID := ""
	if st, ok := r.stages[stageID]; ok {
		nominationID = st.nominationID
	}
	for _, p := range pools {
		id := uuid.NewString()
		members := make([]memberRow, 0, len(p.Members))
		for _, m := range p.Members {
			members = append(members, memberRow{fighterID: m.FighterID, slot: m.Slot})
		}
		r.pools[id] = &poolRow{
			id: id, stageID: stageID, nominationID: nominationID, number: p.Number,
			members: members,
		}
	}
	r.clearUndoLocked(stageID)
	return nil
}

// PruneMembers удаляет членства бойцов номинации (по всем её этапам), которых
// нет среди activeFighterIDs. Не трогает undo. Остаётся номинационным
// (спека 0017, FR-9). Исключение (спека 0018, FR-22): зафиксированные сетки
// (type=bracket, status=ready) не трогаются — снятие бойца после фиксации не
// переигрывает сетку.
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
		if st, ok := r.stages[p.stageID]; ok && st.stageType == domain.StageTypeBracket && st.status == domain.LayoutReady {
			continue
		}
		kept := p.members[:0]
		for _, m := range p.members {
			if active[m.fighterID] {
				kept = append(kept, m)
			}
		}
		p.members = kept
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
// domain.Repository — этапы (спека 0017, расширено спекой 0018).
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
// посеянные/созданные), отсортированные по Position, затем ID
// (детерминированность).
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

// CreateStage вставляет новый этап номинации (спека 0018, FR-2; спека 0019 —
// groups/rule, FR-7/FR-8). Не регистрируется как канонический —
// EnsureStage/StageByNomination его не подхватят.
func (r *FakeRepo) CreateStage(_ context.Context, nominationID string, position int, title string, stageType domain.StageType, bracket domain.BracketConfig, groups domain.GroupsConfig, rule domain.SeedingRule) (domain.Stage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	id := uuid.NewString()
	st := &stageRow{
		id: id, nominationID: nominationID, position: position, title: title,
		stageType: stageType, status: domain.LayoutDraft, bracket: bracket,
		groups: groups, rule: rule,
	}
	r.stages[id] = st
	return toDomainStage(st), nil
}

// SetSeedingRule пишет правило отбора этапа и пересчитанную позицию,
// очищает undo (спека 0019, FR-6/FR-10). Гейты (состав пуст, источник
// валиден) и вычисление position — забота вызывающего (service.SetStageRule).
func (r *FakeRepo) SetSeedingRule(_ context.Context, stageID string, rule domain.SeedingRule, position int) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	st, ok := r.stages[stageID]
	if !ok {
		return domain.ErrNotFound
	}
	st.rule = rule
	st.position = position
	st.undo = domain.UndoState{}
	return nil
}

// StagesBySource возвращает соседние этапы, питающиеся от sourceStageID
// (спека 0019): проверка пересечения селекторов (FR-11) и гейт удаления
// источника, пока ветка существует (FR-7a).
func (r *FakeRepo) StagesBySource(_ context.Context, sourceStageID string) ([]domain.Stage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.Stage, 0)
	for _, st := range r.stages {
		if st.rule.SourceKind == domain.SourceKindStage && st.rule.SourceStageID == sourceStageID {
			out = append(out, toDomainStage(st))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

// ApplyStageBuild атомарно применяет план формирования этапа (спека 0019,
// FR-16): groups — создаёт по пулу на каждую запланированную группу (число
// пулов = число групп конфига, даже если какая-то из них осталась пустой);
// seeds — сажает бойцов в существующие контейнеры первого круга сетки
// (созданные CreateStage, спека 0018) по слоту, резолвя половину через
// domain.HalfOfSlot(bracket-конфиг этапа). Записывает undo_kind=UndoBuild
// (FR-21) — снапшота не несёт: состояние до формирования гарантированно
// пустое (FR-18), откат сводится к очистке состава (см. service.Undo).
func (r *FakeRepo) ApplyStageBuild(_ context.Context, stageID string, groups []domain.BuildGroup, seeds []domain.SeedPlan) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	st, ok := r.stages[stageID]
	if !ok {
		return domain.ErrNotFound
	}

	for _, g := range groups {
		id := uuid.NewString()
		r.pools[id] = &poolRow{
			id: id, stageID: stageID, nominationID: st.nominationID, number: g.Number,
			members: membersOf(g.FighterIDs...),
		}
	}

	if len(seeds) > 0 {
		containerByHalf := make(map[int]*poolRow, 2)
		for _, p := range r.pools {
			if p.stageID == stageID {
				containerByHalf[p.number] = p
			}
		}
		for _, sd := range seeds {
			half := domain.HalfOfSlot(st.bracket, sd.Slot)
			target, ok := containerByHalf[half]
			if !ok {
				return domain.ErrNotFound
			}
			target.members = append(target.members, memberRow{fighterID: sd.FighterID, slot: sd.Slot})
		}
	}

	r.setUndoLocked(stageID, domain.UndoState{Kind: domain.UndoBuild})
	return nil
}

// DeleteStage удаляет этап вместе с его контейнерами и членствами (каскад).
// Гейты — забота вызывающего (service.DeleteStage).
func (r *FakeRepo) DeleteStage(_ context.Context, stageID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.stages[stageID]; !ok {
		return domain.ErrNotFound
	}
	for id, p := range r.pools {
		if p.stageID == stageID {
			delete(r.pools, id)
		}
	}
	delete(r.stages, stageID)
	for nomID, sID := range r.canonicalStage {
		if sID == stageID {
			delete(r.canonicalStage, nomID)
		}
	}
	return nil
}

// MaxStagePosition возвращает наибольшую position среди этапов номинации (0,
// если этапов ещё нет).
func (r *FakeRepo) MaxStagePosition(_ context.Context, nominationID string) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	max := 0
	for _, st := range r.stages {
		if st.nominationID == nominationID && st.position > max {
			max = st.position
		}
	}
	return max, nil
}

// ---------------------------------------------------------------------
// domain.Repository — спека 0020: конструктор схемы + пресеты формата.
// ---------------------------------------------------------------------

// UpdateStage пишет название и конфиг этапа. Гейты («конфиг правится только
// пока состав пуст») — забота вызывающего (service.UpdateStage).
func (r *FakeRepo) UpdateStage(_ context.Context, stageID, title string, bracket domain.BracketConfig, groups domain.GroupsConfig) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	st, ok := r.stages[stageID]
	if !ok {
		return domain.ErrNotFound
	}
	st.title = title
	st.bracket = bracket
	st.groups = groups
	return nil
}

// SetStagePositions пишет позиции сразу нескольких этапов (каскад FR-3) —
// этапы, отсутствующие в хранилище, молча пропускаются (симметрично тому,
// что вызывающий уже прочитал их из этого же репозитория).
func (r *FakeRepo) SetStagePositions(_ context.Context, positions map[string]int) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for id, pos := range positions {
		if st, ok := r.stages[id]; ok {
			st.position = pos
		}
	}
	return nil
}

// MembersCountByNomination — сколько всего членств по всем этапам номинации
// (гейт «схема не тронута», FR-13).
func (r *FakeRepo) MembersCountByNomination(_ context.Context, nominationID string) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	n := 0
	for _, p := range r.pools {
		if p.nominationID == nominationID {
			n += len(p.members)
		}
	}
	return n, nil
}

// ReplaceSchema атомарно заменяет схему номинации целиком (FR-13/FR-14):
// удаляет все существующие этапы/пулы/членства номинации (гейт «схема не
// тронута» уже проверен вызывающим — пулы в любом случае пусты), вставляет
// новые этапы из specs под заданными positions (параллельный массив,
// FR-8a), резолвит FormatStageSpec.SourceIndex → id новых этапов вторым
// проходом (id известны только после вставки) и создаёт по два контейнера
// первого круга каждой сетке — как service.CreateStage (0018, FR-6a).
func (r *FakeRepo) ReplaceSchema(_ context.Context, nominationID string, specs []domain.FormatStageSpec, positions []int) ([]domain.Stage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if len(specs) != len(positions) {
		return nil, domain.ErrInvalidInput
	}

	for id, st := range r.stages {
		if st.nominationID == nominationID {
			delete(r.stages, id)
		}
	}
	for id, p := range r.pools {
		if p.nominationID == nominationID {
			delete(r.pools, id)
		}
	}
	delete(r.canonicalStage, nominationID)

	newIDs := make([]string, len(specs))
	for i, spec := range specs {
		id := uuid.NewString()
		newIDs[i] = id
		r.stages[id] = &stageRow{
			id: id, nominationID: nominationID, position: positions[i], title: spec.Title,
			stageType: spec.Type, status: domain.LayoutDraft,
			bracket: spec.Bracket, groups: spec.Groups,
		}
	}
	for i, spec := range specs {
		if spec.SourceKind == "" {
			continue
		}
		rule := domain.SeedingRule{
			SourceKind: spec.SourceKind, Selector: spec.Selector,
			PlaceFrom: spec.PlaceFrom, PlaceTo: spec.PlaceTo, Method: spec.Method,
		}
		if spec.SourceKind == domain.SourceKindStage {
			rule.SourceStageID = newIDs[spec.SourceIndex]
		}
		r.stages[newIDs[i]].rule = rule
	}
	for i, spec := range specs {
		if spec.Type != domain.StageTypeBracket {
			continue
		}
		stID := newIDs[i]
		id1 := uuid.NewString()
		r.pools[id1] = &poolRow{id: id1, stageID: stID, nominationID: nominationID, number: domain.ContainerNumberOf(spec.Bracket, 1, 1)}
		id2 := uuid.NewString()
		r.pools[id2] = &poolRow{id: id2, stageID: stID, nominationID: nominationID, number: domain.ContainerNumberOf(spec.Bracket, 1, 2)}
	}

	out := make([]domain.Stage, len(newIDs))
	for i, id := range newIDs {
		out[i] = toDomainStage(r.stages[id])
	}
	return out, nil
}

// ListFormatPresets возвращает библиотеку пресетов, по имени (FR-12).
func (r *FakeRepo) ListFormatPresets(_ context.Context) ([]domain.FormatPreset, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.FormatPreset, 0, len(r.presets))
	for _, p := range r.presets {
		out = append(out, toDomainPreset(p))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// GetFormatPreset возвращает один пресет по id (found=false, если нет).
func (r *FakeRepo) GetFormatPreset(_ context.Context, presetID string) (domain.FormatPreset, bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	p, ok := r.presets[presetID]
	if !ok {
		return domain.FormatPreset{}, false, nil
	}
	return toDomainPreset(p), true, nil
}

// InsertFormatPreset сохраняет схему как именованный пресет (FR-11/FR-12).
// Уникальность имени без учёта регистра/краевых пробелов — как у реального
// уникального индекса миграции 00004 (ErrPresetNameTaken, AC-17).
func (r *FakeRepo) InsertFormatPreset(_ context.Context, name string, spec domain.FormatSpec) (domain.FormatPreset, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	norm := normalizedPresetName(name)
	for _, p := range r.presets {
		if normalizedPresetName(p.name) == norm {
			return domain.FormatPreset{}, domain.ErrPresetNameTaken
		}
	}
	id := uuid.NewString()
	now := time.Now()
	row := &presetRow{id: id, name: name, spec: spec, createdAt: now, updatedAt: now}
	r.presets[id] = row
	return toDomainPreset(row), nil
}

// RenameFormatPreset переименовывает пресет, не трогая его схему (FR-12/FR-16).
func (r *FakeRepo) RenameFormatPreset(_ context.Context, presetID, name string) (domain.FormatPreset, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	p, ok := r.presets[presetID]
	if !ok {
		return domain.FormatPreset{}, domain.ErrNotFound
	}
	norm := normalizedPresetName(name)
	for id, other := range r.presets {
		if id != presetID && normalizedPresetName(other.name) == norm {
			return domain.FormatPreset{}, domain.ErrPresetNameTaken
		}
	}
	p.name = name
	p.updatedAt = time.Now()
	return toDomainPreset(p), nil
}

// DeleteFormatPreset удаляет пресет из библиотеки; номинации, к которым он
// уже применялся, не затрагивает (FR-16).
func (r *FakeRepo) DeleteFormatPreset(_ context.Context, presetID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.presets[presetID]; !ok {
		return domain.ErrNotFound
	}
	delete(r.presets, presetID)
	return nil
}

func normalizedPresetName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

func toDomainPreset(p *presetRow) domain.FormatPreset {
	return domain.FormatPreset{ID: p.id, Name: p.name, Spec: p.spec, CreatedAt: p.createdAt, UpdatedAt: p.updatedAt}
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
// domain.Repository — посев сетки (спека 0018, FR-7/FR-8).
// ---------------------------------------------------------------------

// SeedSlot сажает бойца в слот первого круга сетки: upsert членства
// (containerPoolID, fighterID, slot). Если fighterID уже сидел в другом
// слоте этого этапа — снимается оттуда; если целевой слот уже занят другим
// бойцом — тот вытесняется на освободившееся (или отсутствующее) старое
// место fighterID, реализуя обмен местами (FR-8). Легитимность вызова
// (обмен vs отказ) — забота вызывающего (service.SeedBracketSlot), см.
// domain.Repository.SeedSlot.
func (r *FakeRepo) SeedSlot(_ context.Context, stageID, containerPoolID, fighterID string, slot int) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	target, ok := r.pools[containerPoolID]
	if !ok || target.stageID != stageID {
		return domain.ErrNotFound
	}

	var fighterOldPool *poolRow
	fighterOldSlot := 0
	for _, p := range r.pools {
		if p.stageID != stageID {
			continue
		}
		for _, m := range p.members {
			if m.fighterID == fighterID {
				fighterOldPool, fighterOldSlot = p, m.slot
			}
		}
	}
	if fighterOldPool != nil {
		fighterOldPool.members = deleteMemberByFighter(fighterOldPool.members, fighterID)
	}

	occupant := ""
	for _, m := range target.members {
		if m.slot == slot {
			occupant = m.fighterID
		}
	}
	if occupant != "" && occupant != fighterID {
		target.members = deleteMemberByFighter(target.members, occupant)
		if fighterOldPool != nil {
			fighterOldPool.members = append(fighterOldPool.members, memberRow{fighterID: occupant, slot: fighterOldSlot})
		}
	}

	target.members = append(target.members, memberRow{fighterID: fighterID, slot: slot})
	r.clearUndoLocked(stageID)
	return nil
}

// SeedsByStage возвращает текущий посев первого круга этапа (слот → боец) —
// сырые членства с непустым slot, по обоим контейнерам первого круга.
func (r *FakeRepo) SeedsByStage(_ context.Context, stageID string) ([]domain.Seed, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.Seed, 0)
	for _, p := range r.pools {
		if p.stageID != stageID {
			continue
		}
		for _, m := range p.members {
			if m.slot > 0 {
				out = append(out, domain.Seed{Slot: m.slot, Fighter: domain.FighterRef{ID: m.fighterID}})
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Slot < out[j].Slot })
	return out, nil
}

// DeleteContainers удаляет контейнеры (пулы) по id, каскадом членства.
func (r *FakeRepo) DeleteContainers(_ context.Context, poolIDs []string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, id := range poolIDs {
		delete(r.pools, id)
	}
	return nil
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
		for _, m := range p.members {
			out = append(out, domain.PoolMember{PoolID: p.id, FighterID: m.fighterID})
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
		for _, m := range p.members {
			out = append(out, domain.PoolMember{PoolID: p.id, FighterID: m.fighterID})
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------
// domain.Repository — арена/ведение боя (спека 0011/0013, poolID-адресация
// не задета спекой 0017/0018).
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
		Bracket: s.bracket, Groups: s.groups, Rule: s.rule,
	}
}

// toDomainPool — полная проекция пула, включая Members (для GetPool/
// PoolsForArena/ReadyUnseatedPools — единичные/арена-скоуп чтения).
func toDomainPool(p *poolRow) domain.Pool {
	members := make([]domain.FighterRef, 0, len(p.members))
	for _, m := range p.members {
		members = append(members, domain.FighterRef{ID: m.fighterID})
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

func deleteMemberByFighter(members []memberRow, fighterID string) []memberRow {
	out := members[:0]
	for _, m := range members {
		if m.fighterID != fighterID {
			out = append(out, m)
		}
	}
	return out
}

func containsMember(members []memberRow, fighterID string) bool {
	for _, m := range members {
		if m.fighterID == fighterID {
			return true
		}
	}
	return false
}

func fighterIDsOf(members []memberRow) []string {
	out := make([]string, len(members))
	for i, m := range members {
		out[i] = m.fighterID
	}
	return out
}

func resetMembersOf(members []memberRow) []domain.ResetMember {
	out := make([]domain.ResetMember, len(members))
	for i, m := range members {
		out[i] = domain.ResetMember{FighterID: m.fighterID, Slot: m.slot}
	}
	return out
}
