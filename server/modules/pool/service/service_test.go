package service_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/hema/server/modules/pool/domain"
	"github.com/hema/server/modules/pool/service"
	"github.com/hema/server/modules/pool/testutil"
)

func newService() (*service.Service, *testutil.FakeRepo, *testutil.FakeActiveFightersProvider, *testutil.FakeBoutGenerator) {
	repo := testutil.NewFakeRepo()
	fighters := testutil.NewFakeActiveFightersProvider()
	bouts := testutil.NewFakeBoutGenerator()
	arenas := testutil.NewFakeArenaProvider()
	return service.New(repo, fighters, bouts, arenas), repo, fighters, bouts
}

// newServiceWithArenas — как newService, но также возвращает
// FakeArenaProvider (спека 0011: тесты постановки/снятия пула на арену).
func newServiceWithArenas() (*service.Service, *testutil.FakeRepo, *testutil.FakeActiveFightersProvider, *testutil.FakeBoutGenerator, *testutil.FakeArenaProvider) {
	repo := testutil.NewFakeRepo()
	fighters := testutil.NewFakeActiveFightersProvider()
	bouts := testutil.NewFakeBoutGenerator()
	arenas := testutil.NewFakeArenaProvider()
	return service.New(repo, fighters, bouts, arenas), repo, fighters, bouts, arenas
}

func poolNumbers(pools []domain.Pool) []int {
	out := make([]int, len(pools))
	for i, p := range pools {
		out[i] = p.Number
	}
	return out
}

func containsInt(list []int, v int) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func poolByID(pools []domain.Pool, id string) domain.Pool {
	for _, p := range pools {
		if p.ID == id {
			return p
		}
	}
	return domain.Pool{}
}

func memberIDs(p domain.Pool) map[string]bool {
	out := make(map[string]bool, len(p.Members))
	for _, m := range p.Members {
		out[m.ID] = true
	}
	return out
}

// AC-1: начальный экран — draft, все активные бойцы в нераспределённых,
// пулов нет.
func TestGetLayout_AC1_InitialLazyDraft(t *testing.T) {
	svc, _, fighters, _ := newService()
	fighters.Set("n1",
		domain.FighterRef{ID: "f1", Name: "A", Club: "X"},
		domain.FighterRef{ID: "f2", Name: "B", Club: "Y"},
	)
	layout, err := svc.GetLayout(context.Background(), "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if layout.Status != domain.LayoutDraft {
		t.Fatalf("expected draft, got %s", layout.Status)
	}
	if len(layout.Pools) != 0 {
		t.Fatalf("expected no pools, got %v", layout.Pools)
	}
	if len(layout.Unassigned) != 2 {
		t.Fatalf("expected 2 unassigned, got %d", len(layout.Unassigned))
	}
}

func TestGetLayout_EmptyNominationID(t *testing.T) {
	svc, _, _, _ := newService()
	_, err := svc.GetLayout(context.Background(), "")
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}

// AC-2: создание пула — свободный номер, переиспользование после удаления.
func TestCreatePool_AC2_FreeNumberReuse(t *testing.T) {
	svc, _, fighters, _ := newService()
	fighters.Set("n1")
	ctx := context.Background()

	if _, err := svc.CreatePool(ctx, "n1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	l2, err := svc.CreatePool(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(l2.Pools) != 2 {
		t.Fatalf("expected 2 pools, got %d", len(l2.Pools))
	}
	numbers := poolNumbers(l2.Pools)
	if !containsInt(numbers, 1) || !containsInt(numbers, 2) {
		t.Fatalf("expected pools numbered 1 and 2, got %v", numbers)
	}

	var poolOneID string
	for _, p := range l2.Pools {
		if p.Number == 1 {
			poolOneID = p.ID
		}
	}
	l3, err := svc.DeletePool(ctx, poolOneID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(l3.Pools) != 1 {
		t.Fatalf("expected 1 pool after delete, got %d", len(l3.Pools))
	}

	l4, err := svc.CreatePool(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !containsInt(poolNumbers(l4.Pools), 1) {
		t.Fatalf("expected new pool to reuse number 1, got %v", poolNumbers(l4.Pools))
	}
}

func TestCreatePool_ForbiddenInReady(t *testing.T) {
	svc, _, fighters, _ := newService()
	fighters.Set("n1")
	ctx := context.Background()
	if _, err := svc.SetStatus(ctx, "n1", domain.LayoutReady); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.CreatePool(ctx, "n1"); !errors.Is(err, domain.ErrNotDraft) {
		t.Fatalf("expected ErrNotDraft, got %v", err)
	}
}

// AC-3: удаление пула возвращает бойцов в нераспределённые.
func TestDeletePool_AC3_ReturnsFightersToUnassigned(t *testing.T) {
	svc, repo, fighters, _ := newService()
	fighters.Set("n1",
		domain.FighterRef{ID: "b1"},
		domain.FighterRef{ID: "b2"},
	)
	poolID := repo.SeedPool("n1", 1, "b1", "b2")
	ctx := context.Background()
	layout, err := svc.DeletePool(ctx, poolID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(layout.Pools) != 0 {
		t.Fatalf("expected pool removed, got %v", layout.Pools)
	}
	if len(layout.Unassigned) != 2 {
		t.Fatalf("expected 2 unassigned, got %d", len(layout.Unassigned))
	}
}

func TestDeletePool_NotFound(t *testing.T) {
	svc, _, _, _ := newService()
	_, err := svc.DeletePool(context.Background(), "missing")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

// AC-4..7: DnD между нераспределёнными и пулами.
func TestAssignUnassignMove_AC4to7(t *testing.T) {
	ctx := context.Background()

	t.Run("AC-4 unassigned to pool", func(t *testing.T) {
		svc, repo, fighters, _ := newService()
		fighters.Set("n1", domain.FighterRef{ID: "b1"})
		poolID := repo.SeedPool("n1", 1)
		layout, err := svc.AssignFighter(ctx, "n1", "b1", poolID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(layout.Unassigned) != 0 {
			t.Fatalf("expected 0 unassigned, got %d", len(layout.Unassigned))
		}
		if len(layout.Pools[0].Members) != 1 {
			t.Fatalf("expected 1 member in pool, got %d", len(layout.Pools[0].Members))
		}
	})

	t.Run("AC-5 pool to unassigned", func(t *testing.T) {
		svc, repo, fighters, _ := newService()
		fighters.Set("n1", domain.FighterRef{ID: "b1"})
		repo.SeedPool("n1", 1, "b1")
		layout, err := svc.UnassignFighter(ctx, "n1", "b1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(layout.Unassigned) != 1 {
			t.Fatalf("expected 1 unassigned, got %d", len(layout.Unassigned))
		}
		if len(layout.Pools[0].Members) != 0 {
			t.Fatalf("expected pool empty, got %d", len(layout.Pools[0].Members))
		}
	})

	t.Run("AC-6/7 pool to pool moves, does not duplicate", func(t *testing.T) {
		svc, repo, fighters, _ := newService()
		fighters.Set("n1", domain.FighterRef{ID: "b1"})
		p1 := repo.SeedPool("n1", 1, "b1")
		p2 := repo.SeedPool("n1", 2)
		layout, err := svc.AssignFighter(ctx, "n1", "b1", p2)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(poolByID(layout.Pools, p1).Members) != 0 {
			t.Fatalf("expected p1 empty after move, got %v", poolByID(layout.Pools, p1).Members)
		}
		if len(poolByID(layout.Pools, p2).Members) != 1 {
			t.Fatalf("expected p2 has 1 member, got %v", poolByID(layout.Pools, p2).Members)
		}
		if len(layout.Unassigned) != 0 {
			t.Fatalf("expected fighter not left in unassigned, got %v", layout.Unassigned)
		}
	})
}

// AC-8: автораспределение без пулов отклоняется.
func TestAutoDistribute_AC8_NoPools(t *testing.T) {
	svc, _, fighters, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"})
	_, err := svc.AutoDistribute(context.Background(), "n1")
	if !errors.Is(err, domain.ErrNoPools) {
		t.Fatalf("expected ErrNoPools, got %v", err)
	}
}

// AC-9: автораспределение без нераспределённых — no-op.
func TestAutoDistribute_AC9_NoUnassignedIsNoop(t *testing.T) {
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"})
	repo.SeedPool("n1", 1, "b1")
	layout, err := svc.AutoDistribute(context.Background(), "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if layout.CanUndo {
		t.Fatalf("expected no undo recorded for no-op auto-distribute")
	}
}

func redBlueFighters() []domain.FighterRef {
	return []domain.FighterRef{
		{ID: "R1", Club: "Red"},
		{ID: "R2", Club: "Red"},
		{ID: "R3", Club: "Red"},
		{ID: "B1", Club: "Blue"},
		{ID: "B2", Club: "Blue"},
		{ID: "X", Club: ""},
	}
}

// AC-10: основной сценарий автораспределения — P={B1,R1,R3}, Q={B2,R2,X}.
func TestAutoDistribute_AC10_BasicScenario(t *testing.T) {
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", redBlueFighters()...)
	p := repo.SeedPool("n1", 1)
	q := repo.SeedPool("n1", 2)

	layout, err := svc.AutoDistribute(context.Background(), "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(layout.Unassigned) != 0 {
		t.Fatalf("expected all distributed, got %d unassigned", len(layout.Unassigned))
	}
	if !layout.CanUndo {
		t.Fatalf("expected undo recorded")
	}
	wantP := map[string]bool{"B1": true, "R1": true, "R3": true}
	wantQ := map[string]bool{"B2": true, "R2": true, "X": true}
	if got := memberIDs(poolByID(layout.Pools, p)); !reflect.DeepEqual(got, wantP) {
		t.Fatalf("P members = %v, want %v", got, wantP)
	}
	if got := memberIDs(poolByID(layout.Pools, q)); !reflect.DeepEqual(got, wantQ) {
		t.Fatalf("Q members = %v, want %v", got, wantQ)
	}
}

// AC-11: автораспределение не трогает уже расставленных.
func TestAutoDistribute_AC11_DoesNotTouchAlreadyAssigned(t *testing.T) {
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", redBlueFighters()...)
	p := repo.SeedPool("n1", 1, "R1")
	q := repo.SeedPool("n1", 2)

	layout, err := svc.AutoDistribute(context.Background(), "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	wantP := map[string]bool{"R1": true, "B2": true, "R3": true}
	wantQ := map[string]bool{"B1": true, "R2": true, "X": true}
	if got := memberIDs(poolByID(layout.Pools, p)); !reflect.DeepEqual(got, wantP) {
		t.Fatalf("P members = %v, want %v", got, wantP)
	}
	if got := memberIDs(poolByID(layout.Pools, q)); !reflect.DeepEqual(got, wantQ) {
		t.Fatalf("Q members = %v, want %v", got, wantQ)
	}
}

// AC-12: пустой клуб не считается общим — все попадают в единственный пул.
func TestAutoDistribute_AC12_EmptyClubNotCommon(t *testing.T) {
	svc, repo, fighters, _ := newService()
	fighters.Set("n1",
		domain.FighterRef{ID: "x1"}, domain.FighterRef{ID: "x2"},
		domain.FighterRef{ID: "x3"}, domain.FighterRef{ID: "x4"},
	)
	p := repo.SeedPool("n1", 1)

	layout, err := svc.AutoDistribute(context.Background(), "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(poolByID(layout.Pools, p).Members) != 4 {
		t.Fatalf("expected all 4 fighters in the only pool, got %v", poolByID(layout.Pools, p).Members)
	}
}

// AC-13: детерминированность — два независимых запуска с одними входами
// дают идентичный результат.
func TestAutoDistribute_AC13_Deterministic(t *testing.T) {
	run := func() map[string]bool {
		svc, repo, fighters, _ := newService()
		fighters.Set("n1", redBlueFighters()...)
		p := repo.SeedPool("n1", 1)
		repo.SeedPool("n1", 2)
		layout, err := svc.AutoDistribute(context.Background(), "n1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		return memberIDs(poolByID(layout.Pools, p))
	}
	first := run()
	second := run()
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("not deterministic: %v vs %v", first, second)
	}
}

// AC-13a: undo автораспределения возвращает только расставленных авто,
// ручная раскладка сохраняется.
func TestUndo_AC13a_UndoAutoPreservesManual(t *testing.T) {
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", redBlueFighters()...)
	p := repo.SeedPool("n1", 1, "R1") // R1 расставлен вручную
	q := repo.SeedPool("n1", 2)
	ctx := context.Background()

	if _, err := svc.AutoDistribute(ctx, "n1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	layout, err := svc.Undo(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := memberIDs(poolByID(layout.Pools, p)); !reflect.DeepEqual(got, map[string]bool{"R1": true}) {
		t.Fatalf("expected P to retain only manually placed R1, got %v", got)
	}
	if got := poolByID(layout.Pools, q).Members; len(got) != 0 {
		t.Fatalf("expected Q empty after undo, got %v", got)
	}
	if len(layout.Unassigned) != 5 {
		t.Fatalf("expected 5 unassigned after undo, got %d", len(layout.Unassigned))
	}
}

// AC-13a2: undo удаления пула восстанавливает пул со всеми бойцами.
func TestUndo_AC13a2_UndoDeletePool(t *testing.T) {
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"}, domain.FighterRef{ID: "b2"})
	poolID := repo.SeedPool("n1", 3, "b1", "b2")
	ctx := context.Background()

	if _, err := svc.DeletePool(ctx, poolID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	layout, err := svc.Undo(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(layout.Pools) != 1 {
		t.Fatalf("expected pool restored, got %d pools", len(layout.Pools))
	}
	restored := layout.Pools[0]
	if restored.Number != 3 {
		t.Fatalf("expected restored pool number 3, got %d", restored.Number)
	}
	if len(restored.Members) != 2 {
		t.Fatalf("expected 2 members restored, got %d", len(restored.Members))
	}
}

// AC-13a3: если авто идёт после удаления пула — undo относится к авто.
func TestUndo_AC13a3_LatestActionWins(t *testing.T) {
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"})
	poolID := repo.SeedPool("n1", 1, "b1")
	ctx := context.Background()

	if _, err := svc.DeletePool(ctx, poolID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.CreatePool(ctx, "n1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	afterAuto, err := svc.AutoDistribute(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !afterAuto.CanUndo {
		t.Fatalf("expected undo available")
	}

	layout, err := svc.Undo(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(layout.Pools) != 1 {
		t.Fatalf("expected still 1 pool (the newly created one, deleted P stays deleted), got %d", len(layout.Pools))
	}
	if len(layout.Unassigned) != 1 {
		t.Fatalf("expected b1 back in unassigned, got %d", len(layout.Unassigned))
	}
}

// AC-13b: undo одноразовый — любая иная мутация обнуляет его.
func TestUndo_AC13b_AnyMutationClearsUndo(t *testing.T) {
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"})
	repo.SeedPool("n1", 1)
	ctx := context.Background()

	afterAuto, err := svc.AutoDistribute(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !afterAuto.CanUndo {
		t.Fatalf("expected undo available after auto-distribute")
	}
	afterCreate, err := svc.CreatePool(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if afterCreate.CanUndo {
		t.Fatalf("expected undo cleared after subsequent mutation")
	}
}

// AC-13c: undo без предыдущего mutating-действия отклоняется.
func TestUndo_AC13c_NothingToUndo(t *testing.T) {
	svc, _, fighters, _ := newService()
	fighters.Set("n1")
	_, err := svc.Undo(context.Background(), "n1")
	if !errors.Is(err, domain.ErrNothingToUndo) {
		t.Fatalf("expected ErrNothingToUndo, got %v", err)
	}
}

// AC-13d: undo запрещён в ready.
func TestUndo_AC13d_ForbiddenInReady(t *testing.T) {
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"})
	repo.SeedPool("n1", 1)
	ctx := context.Background()
	if _, err := svc.AutoDistribute(ctx, "n1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.SetStatus(ctx, "n1", domain.LayoutReady); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, err := svc.Undo(ctx, "n1")
	if !errors.Is(err, domain.ErrNotDraft) {
		t.Fatalf("expected ErrNotDraft, got %v", err)
	}
}

// AC-14: переход draft → ready.
func TestSetStatus_AC14_DraftToReady(t *testing.T) {
	svc, _, fighters, _ := newService()
	fighters.Set("n1")
	layout, err := svc.SetStatus(context.Background(), "n1", domain.LayoutReady)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if layout.Status != domain.LayoutReady {
		t.Fatalf("expected ready, got %s", layout.Status)
	}
}

func TestSetStatus_InvalidTarget(t *testing.T) {
	svc, _, _, _ := newService()
	// active/finished убраны спекой 0011 — статус раскладки урезан до
	// draft/ready; любое иное значение отклоняется как невалидный вход.
	_, err := svc.SetStatus(context.Background(), "n1", domain.LayoutStatus("active"))
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}

// AC-15: ready блокирует изменения раскладки.
func TestReadyBlocksMutations_AC15(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"})
	poolID := repo.SeedPool("n1", 1)
	if _, err := svc.SetStatus(ctx, "n1", domain.LayoutReady); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := svc.CreatePool(ctx, "n1"); !errors.Is(err, domain.ErrNotDraft) {
		t.Fatalf("CreatePool: expected ErrNotDraft, got %v", err)
	}
	if _, err := svc.DeletePool(ctx, poolID); !errors.Is(err, domain.ErrNotDraft) {
		t.Fatalf("DeletePool: expected ErrNotDraft, got %v", err)
	}
	if _, err := svc.AssignFighter(ctx, "n1", "b1", poolID); !errors.Is(err, domain.ErrNotDraft) {
		t.Fatalf("AssignFighter: expected ErrNotDraft, got %v", err)
	}
	if _, err := svc.UnassignFighter(ctx, "n1", "b1"); !errors.Is(err, domain.ErrNotDraft) {
		t.Fatalf("UnassignFighter: expected ErrNotDraft, got %v", err)
	}
	if _, err := svc.AutoDistribute(ctx, "n1"); !errors.Is(err, domain.ErrNotDraft) {
		t.Fatalf("AutoDistribute: expected ErrNotDraft, got %v", err)
	}
	if _, err := svc.ResetLayout(ctx, "n1"); !errors.Is(err, domain.ErrNotDraft) {
		t.Fatalf("ResetLayout: expected ErrNotDraft, got %v", err)
	}
}

// AC-16: возврат ready → draft, состав пулов не меняется.
func TestSetStatus_AC16_ReadyToDraftPreservesPools(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"})
	repo.SeedPool("n1", 1, "b1")
	if _, err := svc.SetStatus(ctx, "n1", domain.LayoutReady); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	layout, err := svc.SetStatus(ctx, "n1", domain.LayoutDraft)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if layout.Status != domain.LayoutDraft {
		t.Fatalf("expected draft, got %s", layout.Status)
	}
	if len(layout.Pools) != 1 || len(layout.Pools[0].Members) != 1 {
		t.Fatalf("expected pool composition preserved, got %+v", layout.Pools)
	}
}

// T12 (спека 0010): draft → ready вызывает BoutGenerator.GenerateForNomination
// с составом каждого пула — только активные (обогащённые) бойцы, как в
// Layout.Pools[i].Members; осиротевшие членства (withdrawn) не передаются.
func TestSetStatus_T12_DraftToReadyGeneratesBouts(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts := newService()
	fighters.Set("n1",
		domain.FighterRef{ID: "f1", Name: "A", Club: "X"},
		domain.FighterRef{ID: "f2", Name: "B", Club: "Y"},
		domain.FighterRef{ID: "f3", Name: "C", Club: "Z"},
	)
	p1 := repo.SeedPool("n1", 1, "f1", "f2", "withdrawn")
	p2 := repo.SeedPool("n1", 2, "f3")

	layout, err := svc.SetStatus(ctx, "n1", domain.LayoutReady)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if layout.Status != domain.LayoutReady {
		t.Fatalf("expected ready, got %s", layout.Status)
	}
	if len(bouts.GenerateCalls) != 1 {
		t.Fatalf("expected 1 GenerateForNomination call, got %d", len(bouts.GenerateCalls))
	}
	call := bouts.GenerateCalls[0]
	if call.NominationID != "n1" {
		t.Fatalf("expected nominationID n1, got %s", call.NominationID)
	}
	if len(call.Pools) != 2 {
		t.Fatalf("expected 2 pools passed, got %d", len(call.Pools))
	}
	gotP1 := boutPoolByID(call.Pools, p1)
	if got := memberIDs(domain.Pool{Members: gotP1.Fighters}); !reflect.DeepEqual(got, map[string]bool{"f1": true, "f2": true}) {
		t.Fatalf("pool1 fighters = %v, want {f1,f2} (withdrawn excluded)", got)
	}
	gotP2 := boutPoolByID(call.Pools, p2)
	if got := memberIDs(domain.Pool{Members: gotP2.Fighters}); !reflect.DeepEqual(got, map[string]bool{"f3": true}) {
		t.Fatalf("pool2 fighters = %v, want {f3}", got)
	}
	if len(bouts.ClearCalls) != 0 {
		t.Fatalf("expected no ClearForNomination calls, got %d", len(bouts.ClearCalls))
	}
}

// T12: ready → draft вызывает BoutGenerator.ClearForNomination.
func TestSetStatus_T12_ReadyToDraftClearsBouts(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"})
	repo.SeedPool("n1", 1, "b1")
	if _, err := svc.SetStatus(ctx, "n1", domain.LayoutReady); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(bouts.GenerateCalls) != 1 {
		t.Fatalf("expected 1 generate call before draft transition, got %d", len(bouts.GenerateCalls))
	}

	layout, err := svc.SetStatus(ctx, "n1", domain.LayoutDraft)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if layout.Status != domain.LayoutDraft {
		t.Fatalf("expected draft, got %s", layout.Status)
	}
	if len(bouts.ClearCalls) != 1 {
		t.Fatalf("expected 1 ClearForNomination call, got %d", len(bouts.ClearCalls))
	}
	if bouts.ClearCalls[0].NominationID != "n1" {
		t.Fatalf("expected nominationID n1, got %s", bouts.ClearCalls[0].NominationID)
	}
}

// T12: повторный SetStatus с уже текущим статусом (draft→draft, ready→ready)
// не переход — BoutGenerator вообще не вызывается.
func TestSetStatus_T12_SameStatusDoesNotTouchBoutGenerator(t *testing.T) {
	ctx := context.Background()

	t.Run("draft to draft", func(t *testing.T) {
		svc, _, fighters, bouts := newService()
		fighters.Set("n1")
		if _, err := svc.SetStatus(ctx, "n1", domain.LayoutDraft); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(bouts.GenerateCalls) != 0 || len(bouts.ClearCalls) != 0 {
			t.Fatalf("expected no bout generator calls, got generate=%d clear=%d", len(bouts.GenerateCalls), len(bouts.ClearCalls))
		}
	})

	t.Run("ready to ready", func(t *testing.T) {
		svc, _, fighters, bouts := newService()
		fighters.Set("n1")
		if _, err := svc.SetStatus(ctx, "n1", domain.LayoutReady); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(bouts.GenerateCalls) != 1 {
			t.Fatalf("expected 1 generate call for the actual transition, got %d", len(bouts.GenerateCalls))
		}
		if _, err := svc.SetStatus(ctx, "n1", domain.LayoutReady); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(bouts.GenerateCalls) != 1 {
			t.Fatalf("expected still 1 generate call after repeat ready->ready (no-op), got %d", len(bouts.GenerateCalls))
		}
		if len(bouts.ClearCalls) != 0 {
			t.Fatalf("expected no clear calls, got %d", len(bouts.ClearCalls))
		}
	})
}

// T12: ошибка GenerateForNomination пробрасывается из SetStatus, и
// repo.SetStatus при этом не вызывается (порядок «эффект в bout → потом
// статус» из plan «Обзор решения»).
func TestSetStatus_T12_GenerateErrorPreventsStatusChange(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"})
	repo.SeedPool("n1", 1, "b1")
	wantErr := errors.New("bout generation failed")
	bouts.GenerateErr = wantErr

	_, err := svc.SetStatus(ctx, "n1", domain.LayoutReady)
	if !errors.Is(err, wantErr) {
		t.Fatalf("expected generate error, got %v", err)
	}
	if repo.SetStatusCalls != 0 {
		t.Fatalf("expected repo.SetStatus not called, got %d calls", repo.SetStatusCalls)
	}
	status, _, _, err := repo.GetLayout(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status != domain.LayoutDraft {
		t.Fatalf("expected status to remain draft, got %s", status)
	}
}

// T12: ошибка ClearForNomination пробрасывается из SetStatus, и
// repo.SetStatus при этом не вызывается для этого перехода.
func TestSetStatus_T12_ClearErrorPreventsStatusChange(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"})
	repo.SeedPool("n1", 1, "b1")
	if _, err := svc.SetStatus(ctx, "n1", domain.LayoutReady); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	callsAfterReady := repo.SetStatusCalls

	wantErr := errors.New("bout clear failed")
	bouts.ClearErr = wantErr

	_, err := svc.SetStatus(ctx, "n1", domain.LayoutDraft)
	if !errors.Is(err, wantErr) {
		t.Fatalf("expected clear error, got %v", err)
	}
	if repo.SetStatusCalls != callsAfterReady {
		t.Fatalf("expected repo.SetStatus not called again, got %d calls (was %d)", repo.SetStatusCalls, callsAfterReady)
	}
	status, _, _, err := repo.GetLayout(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status != domain.LayoutReady {
		t.Fatalf("expected status to remain ready, got %s", status)
	}
}

func boutPoolByID(pools []domain.BoutPoolInput, id string) domain.BoutPoolInput {
	for _, p := range pools {
		if p.PoolID == id {
			return p
		}
	}
	return domain.BoutPoolInput{}
}

// AC-17: выведенный боец не виден и его членство удаляется.
func TestReconciliation_AC17_WithdrawnFighterHiddenAndPruned(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1", Club: "X"}) // b2/withdrawn не активен
	repo.SeedPool("n1", 1, "b1", "withdrawn-b2")

	layout, err := svc.GetLayout(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(layout.Pools[0].Members) != 1 || layout.Pools[0].Members[0].ID != "b1" {
		t.Fatalf("expected only active fighter visible, got %+v", layout.Pools[0].Members)
	}

	_, _, rawPools, err := repo.GetLayout(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rawPools[0].Members) != 1 {
		t.Fatalf("expected withdrawn fighter's membership pruned from storage, got %d members", len(rawPools[0].Members))
	}
}

// AC-17a: восстановленный боец появляется в нераспределённых, не в старом пуле.
func TestReconciliation_AC17a_ReturnedFighterGoesToUnassigned(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"})
	repo.SeedPool("n1", 1, "b1", "b2")

	if _, err := svc.GetLayout(ctx, "n1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	fighters.Set("n1", domain.FighterRef{ID: "b1"}, domain.FighterRef{ID: "b2"})
	layout, err := svc.GetLayout(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	found := false
	for _, f := range layout.Unassigned {
		if f.ID == "b2" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected returned fighter b2 in unassigned, got %+v", layout.Unassigned)
	}
	if len(poolByID(layout.Pools, "irrelevant").Members) != 0 {
		t.Fatalf("sanity check failed")
	}
}

// AC-17b: сброс раскладки удаляет все пулы, возвращает всех в нераспределённые.
func TestResetLayout_AC17b(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"}, domain.FighterRef{ID: "b2"}, domain.FighterRef{ID: "b3"})
	repo.SeedPool("n1", 1, "b1")
	repo.SeedPool("n1", 2, "b2")
	repo.SeedPool("n1", 3)

	layout, err := svc.ResetLayout(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(layout.Pools) != 0 {
		t.Fatalf("expected all pools removed, got %d", len(layout.Pools))
	}
	if len(layout.Unassigned) != 3 {
		t.Fatalf("expected all fighters unassigned, got %d", len(layout.Unassigned))
	}
	if layout.Status != domain.LayoutDraft {
		t.Fatalf("expected draft, got %s", layout.Status)
	}
	// Инкремент 2026-07-14: сброс раскладки создаёт undo (FR-4a/FR-7a).
	if !layout.CanUndo {
		t.Fatalf("expected CanUndo=true after reset (undo available)")
	}
}

// AC-13a4: undo сброса раскладки восстанавливает все пулы со всеми бойцами.
func TestUndo_AC13a4_UndoResetRestoresAllPools(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _ := newService()
	fighters.Set("n1",
		domain.FighterRef{ID: "b1"}, domain.FighterRef{ID: "b2"},
		domain.FighterRef{ID: "b3"},
	)
	repo.SeedPool("n1", 1, "b1", "b2")
	repo.SeedPool("n1", 2, "b3")
	repo.SeedPool("n1", 3) // пустой

	afterReset, err := svc.ResetLayout(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !afterReset.CanUndo {
		t.Fatalf("expected CanUndo=true after reset")
	}
	if len(afterReset.Pools) != 0 {
		t.Fatalf("expected reset to remove all pools, got %d", len(afterReset.Pools))
	}

	layout, err := svc.Undo(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(layout.Pools) != 3 {
		t.Fatalf("expected 3 pools restored, got %d", len(layout.Pools))
	}
	// Номера восстановленных пулов.
	numbers := poolNumbers(layout.Pools)
	if !containsInt(numbers, 1) || !containsInt(numbers, 2) || !containsInt(numbers, 3) {
		t.Fatalf("expected pools numbered 1,2,3 restored, got %v", numbers)
	}
	// Членства восстановленных пулов.
	for _, p := range layout.Pools {
		switch p.Number {
		case 1:
			if got := memberIDs(p); !reflect.DeepEqual(got, map[string]bool{"b1": true, "b2": true}) {
				t.Fatalf("pool 1 members = %v, want {b1,b2}", got)
			}
		case 2:
			if got := memberIDs(p); !reflect.DeepEqual(got, map[string]bool{"b3": true}) {
				t.Fatalf("pool 2 members = %v, want {b3}", got)
			}
		case 3:
			if len(p.Members) != 0 {
				t.Fatalf("expected pool 3 empty, got %v", p.Members)
			}
		}
	}
	// Все бойцы снова распределены — нераспределённых нет.
	if len(layout.Unassigned) != 0 {
		t.Fatalf("expected all fighters back in pools after undo, got %d unassigned", len(layout.Unassigned))
	}
	if layout.CanUndo {
		t.Fatalf("expected CanUndo=false after undo (undo cleared)")
	}
}

// AC-13a4 (доп): повторный undo после undo-reset — undo очищен, даёт
// ErrNothingToUndo (как и для UndoAuto/UndoDeletePool — «undo самого undo
// не предусмотрено» означает, что undo одноразовый, не циклический).
func TestUndo_AC13a4_RepeatUndoAfterResetGivesNothingToUndo(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"}, domain.FighterRef{ID: "b2"})
	repo.SeedPool("n1", 1, "b1")
	repo.SeedPool("n1", 2, "b2")

	if _, err := svc.ResetLayout(ctx, "n1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	first, err := svc.Undo(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(first.Pools) != 2 {
		t.Fatalf("expected 2 pools restored, got %d", len(first.Pools))
	}
	if first.CanUndo {
		t.Fatalf("expected CanUndo=false after undo (undo cleared)")
	}
	// Повторный undo — undo очищен, откатывать нечего.
	_, err = svc.Undo(ctx, "n1")
	if !errors.Is(err, domain.ErrNothingToUndo) {
		t.Fatalf("expected ErrNothingToUndo on repeat undo, got %v", err)
	}
}

// AC-13b (доп): сброс раскладки создаёт свой undo, а не обнуляет (против
// прежней семантики, где reset обнулял undo).
func TestUndo_AC13b_ResetCreatesItsOwnUndo(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"}, domain.FighterRef{ID: "b2"})
	repo.SeedPool("n1", 1, "b1")
	// b2 — нераспределённый, чтобы авто что-то расставило и записало undo.

	// Сначала авто — создаёт undo (auto).
	afterAuto, err := svc.AutoDistribute(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !afterAuto.CanUndo {
		t.Fatalf("expected CanUndo=true after auto")
	}
	// Затем сброс — обнуляет undo авто, но создаёт свой (reset).
	afterReset, err := svc.ResetLayout(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !afterReset.CanUndo {
		t.Fatalf("expected CanUndo=true after reset (reset creates its own undo)")
	}
	// Undo после сброса восстанавливает раскладку (как она была до сброса, т.е.
	// с пулом 1 + b1 и b2 — авто расставило b2 в единственный пул).
	layout, err := svc.Undo(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(layout.Pools) != 1 {
		t.Fatalf("expected 1 pool restored after undo-reset, got %d", len(layout.Pools))
	}
	if len(layout.Pools[0].Members) != 2 {
		t.Fatalf("expected 2 members in restored pool, got %v", layout.Pools[0].Members)
	}
}

// ---------------------------------------------------------------------
// Спека 0011: постановка пула на арену.
// ---------------------------------------------------------------------

// AC-3: расфиксация раскладки отклоняется, пока пул номинации стоит на
// арене; раскладка остаётся ready.
func TestSetStatus_AC3_CannotUnfixWhilePoolSeated(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, arenas := newServiceWithArenas()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool("n1", 1, "f1")
	if _, err := svc.SetStatus(ctx, "n1", domain.LayoutReady); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "Ристалище 1", Active: true})
	if _, err := svc.SeatPoolOnArena(ctx, poolID, "a1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	_, err := svc.SetStatus(ctx, "n1", domain.LayoutDraft)
	if !errors.Is(err, domain.ErrPoolSeated) {
		t.Fatalf("expected ErrPoolSeated, got %v", err)
	}
	status, _, _, err := repo.GetLayout(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status != domain.LayoutReady {
		t.Fatalf("expected status to remain ready, got %s", status)
	}
}

// Once the pool is unseated, ready→draft works again (sanity check on the
// AC-3 gate: it only blocks while a pool is actually seated).
func TestSetStatus_AC3_UnfixWorksAfterUnseat(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, arenas := newServiceWithArenas()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool("n1", 1, "f1")
	if _, err := svc.SetStatus(ctx, "n1", domain.LayoutReady); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "R1", Active: true})
	if _, err := svc.SeatPoolOnArena(ctx, poolID, "a1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := svc.UnseatPool(ctx, poolID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	layout, err := svc.SetStatus(ctx, "n1", domain.LayoutDraft)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if layout.Status != domain.LayoutDraft {
		t.Fatalf("expected draft, got %s", layout.Status)
	}
}

// AC-4: постановка готового пула на свободную активную арену.
func TestSeatPoolOnArena_AC4_HappyPath(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, arenas := newServiceWithArenas()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool("n1", 1, "f1")
	repo.SeedStatus("n1", domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "Ристалище 1", Active: true})

	layout, err := svc.SeatPoolOnArena(ctx, poolID, "a1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	pool := poolByID(layout.Pools, poolID)
	if pool.Status != domain.PoolStatusPreparing {
		t.Errorf("Status = %q, want preparing", pool.Status)
	}
	if pool.ArenaID != "a1" {
		t.Errorf("ArenaID = %q, want a1", pool.ArenaID)
	}
	if pool.ArenaName != "Ристалище 1" {
		t.Errorf("ArenaName = %q, want Ристалище 1", pool.ArenaName)
	}
}

// AC-5: пул «не готов» (раскладка draft) поставить нельзя.
func TestSeatPoolOnArena_AC5_NotReadyRejected(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, arenas := newServiceWithArenas()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool("n1", 1, "f1")
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "R1", Active: true})

	_, err := svc.SeatPoolOnArena(ctx, poolID, "a1")
	if !errors.Is(err, domain.ErrNotReady) {
		t.Fatalf("expected ErrNotReady, got %v", err)
	}
}

// AC-6: занятая арена не принимает второй пул; первый остаётся на месте.
func TestSeatPoolOnArena_AC6_ArenaBusyRejected(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, arenas := newServiceWithArenas()
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	p1 := repo.SeedPool("n1", 1, "f1")
	p2 := repo.SeedPool("n1", 2, "f2")
	repo.SeedStatus("n1", domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "R1", Active: true})

	if _, err := svc.SeatPoolOnArena(ctx, p1, "a1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, err := svc.SeatPoolOnArena(ctx, p2, "a1")
	if !errors.Is(err, domain.ErrArenaBusy) {
		t.Fatalf("expected ErrArenaBusy, got %v", err)
	}
	pool, err := repo.GetPool(ctx, p1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pool.ArenaID != "a1" {
		t.Fatalf("expected p1 to remain seated on a1, got %q", pool.ArenaID)
	}
}

// AC-7: пул, уже стоящий на одной арене, нельзя поставить на другую —
// сначала снять.
func TestSeatPoolOnArena_AC7_AlreadySeatedRejected(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, arenas := newServiceWithArenas()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool("n1", 1, "f1")
	repo.SeedStatus("n1", domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "R1", Active: true})
	arenas.Set(domain.ArenaRef{ID: "a2", Name: "R2", Active: true})

	if _, err := svc.SeatPoolOnArena(ctx, poolID, "a1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, err := svc.SeatPoolOnArena(ctx, poolID, "a2")
	if !errors.Is(err, domain.ErrAlreadySeated) {
		t.Fatalf("expected ErrAlreadySeated, got %v", err)
	}
}

// AC-8: снятие с арены освобождает площадку, возвращает пул в «готов»,
// сохраняет бои (здесь — сохраняет состав пула; сами бои — модуль bout, не
// трогается снятием).
func TestUnseatPool_AC8_FreesArenaAndReturnsToReady(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, arenas := newServiceWithArenas()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool("n1", 1, "f1")
	repo.SeedStatus("n1", domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "R1", Active: true})
	if _, err := svc.SeatPoolOnArena(ctx, poolID, "a1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	layout, err := svc.UnseatPool(ctx, poolID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	pool := poolByID(layout.Pools, poolID)
	if pool.ArenaID != "" {
		t.Errorf("ArenaID = %q, want empty", pool.ArenaID)
	}
	if pool.Status != domain.PoolStatusReady {
		t.Errorf("Status = %q, want ready", pool.Status)
	}
	if len(pool.Members) != 1 {
		t.Errorf("expected pool composition preserved, got %v", pool.Members)
	}

	// Площадка снова свободна.
	if _, err := svc.SeatPoolOnArena(ctx, poolID, "a1"); err != nil {
		t.Fatalf("expected arena free again after unseat, got error: %v", err)
	}
}

// AC-9: постановка на архивную (Active=false) или несуществующую арену
// отклоняется.
func TestSeatPoolOnArena_AC9_ArenaNotAvailable(t *testing.T) {
	ctx := context.Background()

	t.Run("archived", func(t *testing.T) {
		svc, repo, fighters, _, arenas := newServiceWithArenas()
		fighters.Set("n1", domain.FighterRef{ID: "f1"})
		poolID := repo.SeedPool("n1", 1, "f1")
		repo.SeedStatus("n1", domain.LayoutReady)
		arenas.Set(domain.ArenaRef{ID: "a1", Name: "R1", Active: false})

		_, err := svc.SeatPoolOnArena(ctx, poolID, "a1")
		if !errors.Is(err, domain.ErrArenaNotAvailable) {
			t.Fatalf("expected ErrArenaNotAvailable, got %v", err)
		}
	})

	t.Run("not found", func(t *testing.T) {
		svc, repo, fighters, _, _ := newServiceWithArenas()
		fighters.Set("n1", domain.FighterRef{ID: "f1"})
		poolID := repo.SeedPool("n1", 1, "f1")
		repo.SeedStatus("n1", domain.LayoutReady)

		_, err := svc.SeatPoolOnArena(ctx, poolID, "missing-arena")
		if !errors.Is(err, domain.ErrArenaNotAvailable) {
			t.Fatalf("expected ErrArenaNotAvailable, got %v", err)
		}
	})
}

// GetPoolsForArena (FR-9): пул на арене + готовые пулы всех номинаций,
// доступные для постановки.
func TestGetPoolsForArena_SeatedAndAvailable(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, arenas := newServiceWithArenas()
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	p1 := repo.SeedPool("n1", 1, "f1")
	p2 := repo.SeedPool("n1", 2, "f2")
	repo.SeedStatus("n1", domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "R1", Active: true})
	if _, err := svc.SeatPoolOnArena(ctx, p1, "a1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, err := svc.GetPoolsForArena(ctx, "a1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Seated == nil || result.Seated.ID != p1 {
		t.Fatalf("expected seated pool %s, got %+v", p1, result.Seated)
	}
	if len(result.Available) != 1 || result.Available[0].ID != p2 {
		t.Fatalf("expected available pool %s, got %+v", p2, result.Available)
	}
}

// GetPoolsForArena: арена свободна — Seated=nil, только available.
func TestGetPoolsForArena_EmptyArenaHasNoSeated(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newServiceWithArenas()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	repo.SeedPool("n1", 1, "f1")
	repo.SeedStatus("n1", domain.LayoutReady)

	result, err := svc.GetPoolsForArena(ctx, "empty-arena")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Seated != nil {
		t.Fatalf("expected no seated pool, got %+v", result.Seated)
	}
	if len(result.Available) != 1 {
		t.Fatalf("expected 1 available pool, got %d", len(result.Available))
	}
}

// AC-14: пока раскладка draft, публичный список пулов пуст.
func TestListPublicPools_AC14_DraftReturnsEmpty(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	repo.SeedPool("n1", 1, "f1")

	pools, err := svc.ListPublicPools(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(pools) != 0 {
		t.Fatalf("expected empty pools while draft, got %d", len(pools))
	}
}

// AC-11/AC-12/AC-13: готовая раскладка показывает состав всех пулов;
// пул на арене — с площадкой и статусом preparing, остальные — ready без
// площадки.
func TestListPublicPools_AC11to13_ReadyShowsCompositionAndArena(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, arenas := newServiceWithArenas()
	fighters.Set("n1",
		domain.FighterRef{ID: "f1", Name: "A", Club: "X"},
		domain.FighterRef{ID: "f2", Name: "B", Club: "Y"},
	)
	p1 := repo.SeedPool("n1", 1, "f1") // будет на арене
	p2 := repo.SeedPool("n1", 2, "f2") // просто готов
	if _, err := svc.SetStatus(ctx, "n1", domain.LayoutReady); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "Ристалище 1", Active: true})
	if _, err := svc.SeatPoolOnArena(ctx, p1, "a1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	pools, err := svc.ListPublicPools(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(pools) != 2 {
		t.Fatalf("expected 2 pools, got %d", len(pools))
	}
	seated := poolByID(pools, p1)
	if seated.Status != domain.PoolStatusPreparing {
		t.Errorf("seated.Status = %q, want preparing", seated.Status)
	}
	if seated.ArenaName != "Ристалище 1" {
		t.Errorf("seated.ArenaName = %q, want Ристалище 1", seated.ArenaName)
	}
	if len(seated.Members) != 1 || seated.Members[0].Name != "A" {
		t.Errorf("seated.Members = %+v, want [A]", seated.Members)
	}
	notSeated := poolByID(pools, p2)
	if notSeated.Status != domain.PoolStatusReady {
		t.Errorf("notSeated.Status = %q, want ready", notSeated.Status)
	}
	if notSeated.ArenaID != "" || notSeated.ArenaName != "" {
		t.Errorf("notSeated arena = (%q,%q), want empty", notSeated.ArenaID, notSeated.ArenaName)
	}
}

// Пустые id — InvalidArgument на уровне domain для новых юзкейсов.
func TestPoolOnArena_EmptyInputsReturnInvalidInput(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newServiceWithArenas()

	if _, err := svc.SeatPoolOnArena(ctx, "", "a1"); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("SeatPoolOnArena empty poolID: expected ErrInvalidInput, got %v", err)
	}
	if _, err := svc.SeatPoolOnArena(ctx, "p1", ""); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("SeatPoolOnArena empty arenaID: expected ErrInvalidInput, got %v", err)
	}
	if _, err := svc.UnseatPool(ctx, ""); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("UnseatPool empty poolID: expected ErrInvalidInput, got %v", err)
	}
	if _, err := svc.GetPoolsForArena(ctx, ""); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("GetPoolsForArena empty arenaID: expected ErrInvalidInput, got %v", err)
	}
	if _, err := svc.ListPublicPools(ctx, ""); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("ListPublicPools empty nominationID: expected ErrInvalidInput, got %v", err)
	}
}
