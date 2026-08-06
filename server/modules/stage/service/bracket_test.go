// Тесты юзкейсов этапа-сетки (спека 0018, T12-T16): создание/удаление
// этапа, посев, фиксация/расфиксация, материализация боёв, реконсиляция.
package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/stage/domain"
	"github.com/hema/server/modules/stage/service"
	"github.com/hema/server/modules/stage/testutil"
)

// ---------------------------------------------------------------------
// T12: этапы (CreateStage/DeleteStage/ListStages).
// ---------------------------------------------------------------------

func TestCreateStage_T12_PositionAndTwoHalves(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")

	// Групповой этап уже материализован (сценарий AC-1: номинация с
	// групповым этапом) — сетка встаёт следующей по позиции.
	groupsStageID := stageIDFor(t, repo, "n1")

	created, stages, err := svc.CreateStage(ctx, "n1", domain.StageTypeBracket, "Плейофф", domain.BracketConfig{Size: 8, ThirdPlace: true}, domain.GroupsConfig{}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if created.Type != domain.StageTypeBracket {
		t.Fatalf("expected bracket type, got %s", created.Type)
	}
	if created.Position != 1 {
		t.Fatalf("expected position 1 (after groups at 0), got %d", created.Position)
	}
	if created.Bracket.Size != 8 || !created.Bracket.ThirdPlace {
		t.Fatalf("unexpected bracket config: %+v", created.Bracket)
	}
	if created.Status != domain.LayoutDraft {
		t.Fatalf("expected draft status, got %s", created.Status)
	}
	if len(stages) != 2 {
		t.Fatalf("expected 2 stages (groups + bracket), got %d", len(stages))
	}
	if stages[0].ID != groupsStageID || stages[1].ID != created.ID {
		t.Fatalf("expected stages sorted by position (groups, bracket), got %+v", stages)
	}

	pools, err := repo.PoolsByStage(ctx, created.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(pools) != 2 {
		t.Fatalf("expected 2 first-round containers, got %d", len(pools))
	}
	numbers := map[int]bool{}
	for _, p := range pools {
		numbers[p.Number] = true
	}
	if !numbers[1] || !numbers[2] {
		t.Fatalf("expected containers numbered 1 and 2, got %+v", pools)
	}
}

func TestCreateStage_T12_InvalidSize(t *testing.T) {
	ctx := context.Background()
	svc, _, fighters, _, _ := newService()
	fighters.Set("n1")

	if _, _, err := svc.CreateStage(ctx, "n1", domain.StageTypeBracket, "Плейофф", domain.BracketConfig{Size: 6}, domain.GroupsConfig{}, domain.SeedingRule{}); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for size=6, got %v", err)
	}
	if _, _, err := svc.CreateStage(ctx, "n1", domain.StageTypeBracket, "", domain.BracketConfig{Size: 8}, domain.GroupsConfig{}, domain.SeedingRule{}); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for empty title, got %v", err)
	}
	if _, _, err := svc.CreateStage(ctx, "", domain.StageTypeBracket, "Плейофф", domain.BracketConfig{Size: 8}, domain.GroupsConfig{}, domain.SeedingRule{}); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for empty nomination, got %v", err)
	}
}

// AC-14: удаление этапа-сетки без начатых боёв; групповой этап удалить
// нельзя; этап с начатым боем удалить нельзя.
func TestDeleteStage_T12_AC14(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _ := newService()
	fighters.Set("n1")

	groupsStageID := stageIDFor(t, repo, "n1")
	if _, err := svc.DeleteStage(ctx, groupsStageID); !errors.Is(err, domain.ErrStageNotDeletable) {
		t.Fatalf("expected ErrStageNotDeletable for groups stage, got %v", err)
	}

	created, _, err := svc.CreateStage(ctx, "n1", domain.StageTypeBracket, "Плейофф", domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	stagesAfter, err := svc.DeleteStage(ctx, created.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, s := range stagesAfter {
		if s.ID == created.ID {
			t.Fatalf("expected stage removed from list, got %+v", stagesAfter)
		}
	}
	if pools, _ := repo.PoolsByStage(ctx, created.ID); len(pools) != 0 {
		t.Fatalf("expected containers cascaded away, got %v", pools)
	}

	// Начатый бой блокирует удаление.
	created2, _, err := svc.CreateStage(ctx, "n1", domain.StageTypeBracket, "Плейофф 2", domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	pools2, err := repo.PoolsByStage(ctx, created2.ID)
	if err != nil || len(pools2) == 0 {
		t.Fatalf("unexpected pools state: %v %v", pools2, err)
	}
	bouts.SetAnyStartedForPool(pools2[0].ID, true)
	if _, err := svc.DeleteStage(ctx, created2.ID); !errors.Is(err, domain.ErrStageNotDeletable) {
		t.Fatalf("expected ErrStageNotDeletable when a bout has started, got %v", err)
	}

	if _, err := svc.DeleteStage(ctx, "missing-stage"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestListStages_T12_MaterializesGroupsThenIncludesBracket(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")

	if got := repo.StageCount(); got != 0 {
		t.Fatalf("expected no stage rows yet, got %d", got)
	}
	stages, err := svc.ListStages(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(stages) != 1 || stages[0].Type != domain.StageTypeGroups {
		t.Fatalf("expected 1 materialized groups stage, got %+v", stages)
	}
	if got := repo.StageCount(); got != 1 {
		t.Fatalf("expected ListStages to materialize the groups stage, got %d rows", got)
	}

	created, _, err := svc.CreateStage(ctx, "n1", domain.StageTypeBracket, "Плейофф", domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	stages2, err := svc.ListStages(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(stages2) != 2 || stages2[1].ID != created.ID {
		t.Fatalf("expected groups + bracket, got %+v", stages2)
	}
}

// ---------------------------------------------------------------------
// T13: посев (SeedBracketSlot/ClearBracketSlot/GetBracket).
// ---------------------------------------------------------------------

func createBracket(t *testing.T, ctx context.Context, svc *service.Service, nominationID string, cfg domain.BracketConfig) domain.Stage {
	t.Helper()
	created, _, err := svc.CreateStage(ctx, nominationID, domain.StageTypeBracket, "Плейофф", cfg, domain.GroupsConfig{}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("create stage: %v", err)
	}
	return created
}

func pairAt(b domain.Bracket, round, half, pair int) domain.BracketPairView {
	return b.Rounds[round-1].Halves[half-1].Pairs[pair-1]
}

func TestSeedBracketSlot_T13_FillMoveSwapAndOccupied(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1",
		domain.FighterRef{ID: "f1", Name: "Alice"},
		domain.FighterRef{ID: "f2", Name: "Bob"},
		domain.FighterRef{ID: "f3", Name: "Carl"},
	)
	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 4})

	b, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	slot := pairAt(b, 1, 1, 1).A
	if slot.State != domain.SlotFilled || slot.Fighter.ID != "f1" || slot.Fighter.Name != "Alice" {
		t.Fatalf("expected slot1 filled with Alice, got %+v", slot)
	}
	for _, u := range b.Unassigned {
		if u.ID == "f1" {
			t.Fatalf("expected f1 not to appear in unassigned")
		}
	}

	// Занятый слот, новый (ещё не посеянный) боец — отказ.
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f2"); !errors.Is(err, domain.ErrSlotOccupied) {
		t.Fatalf("expected ErrSlotOccupied, got %v", err)
	}

	// Перестановка посеянного бойца в другой (пустой) слот.
	b2, err := svc.SeedBracketSlot(ctx, stage.ID, 2, "f1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pairAt(b2, 1, 1, 1).A.State != domain.SlotEmpty {
		t.Fatalf("expected slot1 freed after move, got %+v", pairAt(b2, 1, 1, 1).A)
	}
	if pairAt(b2, 1, 1, 1).B.Fighter.ID != "f1" {
		t.Fatalf("expected f1 at slot2, got %+v", pairAt(b2, 1, 1, 1).B)
	}

	// Посадка f2 в слот 1, затем обмен местами f1<->f2 (перестановка
	// посеянного бойца в занятый слот).
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f2"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	b3, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f1")
	if err != nil {
		t.Fatalf("unexpected error (swap): %v", err)
	}
	if pairAt(b3, 1, 1, 1).A.Fighter.ID != "f1" || pairAt(b3, 1, 1, 1).B.Fighter.ID != "f2" {
		t.Fatalf("expected swap f1<->f2, got A=%+v B=%+v", pairAt(b3, 1, 1, 1).A, pairAt(b3, 1, 1, 1).B)
	}

	// Диапазон слота.
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 0, "f3"); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for slot 0, got %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 5, "f3"); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for slot > size, got %v", err)
	}

	// Тип этапа: групповой этап отклоняет посев.
	groupsStageID := stageIDFor(t, repo, "n1")
	if _, err := svc.SeedBracketSlot(ctx, groupsStageID, 1, "f3"); !errors.Is(err, domain.ErrStageTypeMismatch) {
		t.Fatalf("expected ErrStageTypeMismatch, got %v", err)
	}
}

func TestClearBracketSlot_T13_Idempotent(t *testing.T) {
	ctx := context.Background()
	svc, _, fighters, _, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 4})

	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	b, err := svc.ClearBracketSlot(ctx, stage.ID, 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pairAt(b, 1, 1, 1).A.State != domain.SlotEmpty {
		t.Fatalf("expected slot1 empty after clear, got %+v", pairAt(b, 1, 1, 1).A)
	}
	// Повторный clear того же (уже пустого) слота — не ошибка.
	if _, err := svc.ClearBracketSlot(ctx, stage.ID, 1); err != nil {
		t.Fatalf("expected idempotent no-op, got error: %v", err)
	}
}

func TestSeedBracketSlot_T13_OnlyInDraft(t *testing.T) {
	ctx := context.Background()
	svc, _, fighters, _, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 4})

	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 2, "f2"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.SetStatus(ctx, stage.ID, domain.LayoutReady); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 3, "f2"); !errors.Is(err, domain.ErrNotDraft) {
		t.Fatalf("expected ErrNotDraft, got %v", err)
	}
	if _, err := svc.ClearBracketSlot(ctx, stage.ID, 1); !errors.Is(err, domain.ErrNotDraft) {
		t.Fatalf("expected ErrNotDraft, got %v", err)
	}
}

// ---------------------------------------------------------------------
// T14: фиксация/расфиксация, материализация, computeHalfStatus.
// ---------------------------------------------------------------------

func TestSetStatus_T14_LockGate_AC4_NotEnoughSeeds(t *testing.T) {
	ctx := context.Background()
	svc, _, fighters, _, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 4})

	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.SetStatus(ctx, stage.ID, domain.LayoutReady); !errors.Is(err, domain.ErrNotEnoughSeeds) {
		t.Fatalf("expected ErrNotEnoughSeeds, got %v", err)
	}

	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 2, "f2"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.SetStatus(ctx, stage.ID, domain.LayoutReady); err != nil {
		t.Fatalf("expected fixation to succeed with 2 seeds, got %v", err)
	}
}

// AC-3: недобор — сформированы бои только пар с двумя известными
// участниками; байи продвигаются без боя; половины кругов появляются как
// контейнеры.
func TestSetStatus_T14_AC3_LockMaterializesOnlyFullPairsAndByes(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _ := newService()
	fighters.Set("n1",
		domain.FighterRef{ID: "f1", Name: "F1"}, domain.FighterRef{ID: "f2", Name: "F2"},
		domain.FighterRef{ID: "f3", Name: "F3"}, domain.FighterRef{ID: "f4", Name: "F4"},
		domain.FighterRef{ID: "f5", Name: "F5"}, domain.FighterRef{ID: "f6", Name: "F6"},
	)
	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 8, ThirdPlace: true})

	// Пара 1 (слоты 1,2): оба заняты. Пара 2 (слоты 3,4): слот4 пуст — бай.
	// Пара 3 (слоты 5,6): оба заняты. Пара 4 (слоты 7,8): слот7 пуст — бай.
	seed := map[int]string{1: "f1", 2: "f2", 3: "f3", 5: "f4", 6: "f5", 8: "f6"}
	for slot, fid := range seed {
		if _, err := svc.SeedBracketSlot(ctx, stage.ID, slot, fid); err != nil {
			t.Fatalf("seed slot %d: %v", slot, err)
		}
	}

	if _, err := svc.SetStatus(ctx, stage.ID, domain.LayoutReady); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(bouts.ScheduleCalls) != 2 {
		t.Fatalf("expected exactly 2 materialized bouts (pairs 1 and 3), got %d: %+v", len(bouts.ScheduleCalls), bouts.ScheduleCalls)
	}

	pools, err := repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Круги: 1(2 половины) + 2(2 половины) + 3(финал,1) + 4(бронза,1) = 6.
	if len(pools) != 6 {
		t.Fatalf("expected 6 containers (round1 x2 + round2 x2 + final + bronze), got %d: %+v", len(pools), pools)
	}

	b, err := svc.GetBracket(ctx, stage.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Пара 2 (бай): резолвлена без боя, победитель — f3, продвинут в слот
	// полуфинала без боя.
	pair2 := pairAt(b, 1, 1, 2)
	if !pair2.Resolved || pair2.Bout != nil {
		t.Fatalf("expected pair2 resolved by bye without a bout, got %+v", pair2)
	}
	pair4 := pairAt(b, 1, 2, 2)
	if !pair4.Resolved || pair4.Bout != nil {
		t.Fatalf("expected pair4 resolved by bye without a bout, got %+v", pair4)
	}
	// Полуфинал (круг 2): пара, куда пришёл бай f3, ждёт исхода пары 1
	// (не решена — обе стороны неизвестны/pending).
	semi1 := pairAt(b, 2, 1, 1)
	if semi1.Resolved {
		t.Fatalf("expected semifinal pair pending winner of pair1, got resolved: %+v", semi1)
	}
}

func TestSetStatus_T14_UnlockKeepsFirstRoundAndSeeds(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 4})

	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 2, "f2"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.SetStatus(ctx, stage.ID, domain.LayoutReady); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	poolsReady, err := repo.PoolsByStage(ctx, stage.ID)
	if err != nil || len(poolsReady) != 3 { // round1 x2 + final
		t.Fatalf("expected 3 containers after lock, got %d (%v)", len(poolsReady), err)
	}

	if _, err := svc.SetStatus(ctx, stage.ID, domain.LayoutDraft); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	poolsDraft, err := repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(poolsDraft) != 2 {
		t.Fatalf("expected round >= 2 containers removed, only round1 (2) left, got %d: %+v", len(poolsDraft), poolsDraft)
	}
	seeds, err := repo.SeedsByStage(ctx, stage.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(seeds) != 2 {
		t.Fatalf("expected seeds preserved through unlock, got %d: %+v", len(seeds), seeds)
	}
}

// ---------------------------------------------------------------------
// T15: ведение (ничья, материализация следующей пары, гейт FR-16).
// ---------------------------------------------------------------------

// seedAndLockBracket4 создаёт сетку на 4 с двумя посеянными бойцами в
// первой паре (для теста ведения первого круга, без байев) — используется
// T15-тестами finish/reopen.
func seedAndLockBracket4(t *testing.T, ctx context.Context, svc *service.Service, repoNominationID string, fighters *testutil.FakeActiveFightersProvider) domain.Stage {
	t.Helper()
	stage := createBracket(t, ctx, svc, repoNominationID, domain.BracketConfig{Size: 4})
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f1"); err != nil {
		t.Fatalf("seed slot1: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 2, "f2"); err != nil {
		t.Fatalf("seed slot2: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 3, "f3"); err != nil {
		t.Fatalf("seed slot3: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 4, "f4"); err != nil {
		t.Fatalf("seed slot4: %v", err)
	}
	if _, err := svc.SetStatus(ctx, stage.ID, domain.LayoutReady); err != nil {
		t.Fatalf("lock: %v", err)
	}
	return stage
}

func TestFinishCurrentBout_T15_RejectsDrawAndMaterializesNextPair(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, arenas, _ := newServiceWithArenas()
	fighters.Set("n1",
		domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"},
		domain.FighterRef{ID: "f3"}, domain.FighterRef{ID: "f4"},
	)
	stage := seedAndLockBracket4(t, ctx, svc, "n1", fighters)

	pools, err := repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var pool1ID string
	for _, p := range pools {
		if p.Number == 1 {
			pool1ID = p.ID
		}
	}
	if pool1ID == "" {
		t.Fatalf("expected container 1 to exist, got %+v", pools)
	}

	arenas.Set(domain.ArenaRef{ID: "a1", Name: "Arena 1", Active: true})
	if _, err := svc.SeatPoolOnArena(ctx, pool1ID, "a1"); err != nil {
		t.Fatalf("seat pool1: %v", err)
	}
	board, err := svc.GetBoutBoard(ctx, "a1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(board.Bouts) != 1 {
		t.Fatalf("expected 1 materialized bout in container1, got %d", len(board.Bouts))
	}
	boutID := board.Bouts[0].ID
	if _, err := svc.StartCurrentBout(ctx, pool1ID, "secretary"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// AC-6: ничья отклоняется.
	if _, err := svc.ScoreCurrentBout(ctx, pool1ID, "secretary", 5, 5); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.FinishCurrentBout(ctx, pool1ID, "secretary"); !errors.Is(err, domain.ErrDrawNotAllowed) {
		t.Fatalf("expected ErrDrawNotAllowed, got %v", err)
	}

	// Неравный счёт — завершение проходит.
	if _, err := svc.ScoreCurrentBout(ctx, pool1ID, "secretary", 6, 5); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.FinishCurrentBout(ctx, pool1ID, "secretary"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Оба круга-1 pair'а (f1-f2 и f3-f4) заполнены и материализуются при
	// фиксации (2 боя); финал ждёт исход обеих — завершение только одной
	// (pool1) не добавляет третий бой.
	scheduledAfterOnePairFinished := len(bouts.ScheduleCalls)
	if scheduledAfterOnePairFinished != 2 {
		t.Fatalf("expected exactly 2 bouts scheduled at lock time (no new one until both round1 pairs are done), got %d", scheduledAfterOnePairFinished)
	}

	b, err := svc.GetBracket(ctx, stage.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	final := pairAt(b, 2, 1, 1)
	if final.A.State != domain.SlotFilled || final.A.Fighter.ID != "f1" {
		t.Fatalf("expected f1 advanced to final slotA, got %+v", final.A)
	}
	if final.B.State != domain.SlotPending {
		t.Fatalf("expected final slotB still pending (pair2 not played), got %+v", final.B)
	}

	_ = boutID
}

func TestReopenCurrentBout_T15_UndoesProgressionOrBlocksDownstream(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, arenas, _ := newServiceWithArenas()
	fighters.Set("n1",
		domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"},
		domain.FighterRef{ID: "f3"}, domain.FighterRef{ID: "f4"},
	)
	stage := seedAndLockBracket4(t, ctx, svc, "n1", fighters)

	pools, err := repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	byNumber := map[int]string{}
	for _, p := range pools {
		byNumber[p.Number] = p.ID
	}
	pool1, pool2, final := byNumber[1], byNumber[2], byNumber[3]

	arenas.Set(domain.ArenaRef{ID: "a1", Name: "Arena 1", Active: true})
	arenas.Set(domain.ArenaRef{ID: "a2", Name: "Arena 2", Active: true})
	arenas.Set(domain.ArenaRef{ID: "a3", Name: "Arena 3", Active: true})

	playAndFinish := func(poolID, arenaID string, scoreA, scoreB int) string {
		t.Helper()
		if _, err := svc.SeatPoolOnArena(ctx, poolID, arenaID); err != nil {
			t.Fatalf("seat %s: %v", poolID, err)
		}
		board, err := svc.GetBoutBoard(ctx, arenaID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		boutID := board.CurrentBoutID
		if _, err := svc.StartCurrentBout(ctx, poolID, "secretary"); err != nil {
			t.Fatalf("start: %v", err)
		}
		if _, err := svc.ScoreCurrentBout(ctx, poolID, "secretary", scoreA, scoreB); err != nil {
			t.Fatalf("score: %v", err)
		}
		if _, err := svc.FinishCurrentBout(ctx, poolID, "secretary"); err != nil {
			t.Fatalf("finish: %v", err)
		}
		return boutID
	}

	bout1 := playAndFinish(pool1, "a1", 6, 5) // f1 beats f2
	_ = playAndFinish(pool2, "a2", 6, 5)      // f3 beats f4 -> final pair now Expected

	b, err := svc.GetBracket(ctx, stage.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	finalPair := pairAt(b, 2, 1, 1)
	if finalPair.Bout == nil {
		t.Fatalf("expected final bout materialized once both semifinal results known, got %+v", finalPair)
	}

	// AC-8: пересмотр pool1 (ещё не начатый следующий бой) — снимает
	// продвижение, финальный бой исчезает.
	if _, err := svc.SetCurrentBout(ctx, pool1, bout1); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.ReopenCurrentBout(ctx, pool1, "secretary"); err != nil {
		t.Fatalf("unexpected error (reopen should succeed, final bout not started): %v", err)
	}
	b2, err := svc.GetBracket(ctx, stage.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pairAt(b2, 2, 1, 1).Bout != nil {
		t.Fatalf("expected final bout removed after reopen, got %+v", pairAt(b2, 2, 1, 1))
	}

	// Повторно завершаем pool1, затем СТАРТУЕМ финал — теперь reopen
	// должен быть отклонён (AC-9).
	if _, err := svc.ScoreCurrentBout(ctx, pool1, "secretary", 6, 5); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	bout1b, err := svc.FinishCurrentBout(ctx, pool1, "secretary")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_ = bout1b
	if _, err := svc.SeatPoolOnArena(ctx, final, "a3"); err != nil {
		t.Fatalf("seat final: %v", err)
	}
	if _, err := svc.StartCurrentBout(ctx, final, "secretary"); err != nil {
		t.Fatalf("start final: %v", err)
	}

	board1, err := svc.GetBoutBoard(ctx, "a1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.SetCurrentBout(ctx, pool1, board1.Bouts[0].ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.ReopenCurrentBout(ctx, pool1, "secretary"); !errors.Is(err, domain.ErrDownstreamStarted) {
		t.Fatalf("expected ErrDownstreamStarted, got %v", err)
	}
}

func TestCreatePoolAutoDistribute_T15_StageTypeMismatchOnBracket(t *testing.T) {
	ctx := context.Background()
	svc, _, fighters, _, _ := newService()
	fighters.Set("n1")
	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 4})

	if _, err := svc.CreatePool(ctx, stage.ID); !errors.Is(err, domain.ErrStageTypeMismatch) {
		t.Fatalf("expected ErrStageTypeMismatch, got %v", err)
	}
	if _, err := svc.AutoDistribute(ctx, stage.ID); !errors.Is(err, domain.ErrStageTypeMismatch) {
		t.Fatalf("expected ErrStageTypeMismatch, got %v", err)
	}
}

// ---------------------------------------------------------------------
// T16: реконсиляция ростера и подпись контейнера.
// ---------------------------------------------------------------------

// AC-16/FR-22: зафиксированная сетка не переигрывается при выводе бойца;
// в черновике тот же вывод освобождает слот, как и раньше.
func TestReconciliation_T16_FrozenBracketIgnoresWithdrawal(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 4})

	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 2, "f2"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.SetStatus(ctx, stage.ID, domain.LayoutReady); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// f1 выведен с турнира (больше не активен) — сетка зафиксирована,
	// слот должен остаться занятым.
	fighters.Set("n1", domain.FighterRef{ID: "f2"})
	if _, err := svc.GetBracket(ctx, stage.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	seeds, err := repo.SeedsByStage(ctx, stage.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(seeds) != 2 {
		t.Fatalf("expected fixed bracket to keep both seeds despite withdrawal, got %d: %+v", len(seeds), seeds)
	}

	// В черновике другой сетки тот же вывод освобождает слот.
	stage2 := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 4})
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"}, domain.FighterRef{ID: "f9"})
	if _, err := svc.SeedBracketSlot(ctx, stage2.ID, 1, "f9"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	if _, err := svc.GetBracket(ctx, stage2.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	seeds2, err := repo.SeedsByStage(ctx, stage2.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(seeds2) != 0 {
		t.Fatalf("expected draft bracket to release the withdrawn fighter's slot, got %+v", seeds2)
	}
}

// FR-19a: подпись контейнера — «Пул N» у группы, «1/4 финала, верхняя
// половина» у сетки — заполняется сервисом (GetLayout/GetBracket), а не
// api (T19 убирает api.poolName).
func TestContainerName_T16_GroupVsBracket(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")

	groupsStageID := stageIDFor(t, repo, "n1")
	if _, err := svc.CreatePool(ctx, groupsStageID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	groupLayout, err := svc.GetLayout(ctx, groupsStageID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(groupLayout.Pools) != 1 || groupLayout.Pools[0].Name != "Пул 1" {
		t.Fatalf(`expected container named "Пул 1", got %+v`, groupLayout.Pools)
	}

	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 8})
	b, err := svc.GetBracket(ctx, stage.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	upper := pairAt(b, 1, 1, 1) // только чтобы использовать helper и не иметь unused warning
	_ = upper
	round1 := b.Rounds[0]
	if round1.Halves[0].Container.Name != "1/4 финала, верхняя половина" {
		t.Fatalf("unexpected half1 container name: %q", round1.Halves[0].Container.Name)
	}
	if round1.Halves[1].Container.Name != "1/4 финала, нижняя половина" {
		t.Fatalf("unexpected half2 container name: %q", round1.Halves[1].Container.Name)
	}
}
