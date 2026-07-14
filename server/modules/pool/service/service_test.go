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

func newService() (*service.Service, *testutil.FakeRepo, *testutil.FakeActiveFightersProvider) {
	repo := testutil.NewFakeRepo()
	fighters := testutil.NewFakeActiveFightersProvider()
	return service.New(repo, fighters), repo, fighters
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
	svc, _, fighters := newService()
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
	svc, _, _ := newService()
	_, err := svc.GetLayout(context.Background(), "")
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}

// AC-2: создание пула — свободный номер, переиспользование после удаления.
func TestCreatePool_AC2_FreeNumberReuse(t *testing.T) {
	svc, _, fighters := newService()
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
	svc, _, fighters := newService()
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
	svc, repo, fighters := newService()
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
	svc, _, _ := newService()
	_, err := svc.DeletePool(context.Background(), "missing")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

// AC-4..7: DnD между нераспределёнными и пулами.
func TestAssignUnassignMove_AC4to7(t *testing.T) {
	ctx := context.Background()

	t.Run("AC-4 unassigned to pool", func(t *testing.T) {
		svc, repo, fighters := newService()
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
		svc, repo, fighters := newService()
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
		svc, repo, fighters := newService()
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
	svc, _, fighters := newService()
	fighters.Set("n1", domain.FighterRef{ID: "b1"})
	_, err := svc.AutoDistribute(context.Background(), "n1")
	if !errors.Is(err, domain.ErrNoPools) {
		t.Fatalf("expected ErrNoPools, got %v", err)
	}
}

// AC-9: автораспределение без нераспределённых — no-op.
func TestAutoDistribute_AC9_NoUnassignedIsNoop(t *testing.T) {
	svc, repo, fighters := newService()
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
	svc, repo, fighters := newService()
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
	svc, repo, fighters := newService()
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
	svc, repo, fighters := newService()
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
		svc, repo, fighters := newService()
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
	svc, repo, fighters := newService()
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
	svc, repo, fighters := newService()
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
	svc, repo, fighters := newService()
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
	svc, repo, fighters := newService()
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
	svc, _, fighters := newService()
	fighters.Set("n1")
	_, err := svc.Undo(context.Background(), "n1")
	if !errors.Is(err, domain.ErrNothingToUndo) {
		t.Fatalf("expected ErrNothingToUndo, got %v", err)
	}
}

// AC-13d: undo запрещён в ready.
func TestUndo_AC13d_ForbiddenInReady(t *testing.T) {
	svc, repo, fighters := newService()
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
	svc, _, fighters := newService()
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
	svc, _, _ := newService()
	_, err := svc.SetStatus(context.Background(), "n1", domain.LayoutActive)
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}

// AC-15: ready блокирует изменения раскладки.
func TestReadyBlocksMutations_AC15(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters := newService()
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
	svc, repo, fighters := newService()
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

// AC-17: выведенный боец не виден и его членство удаляется.
func TestReconciliation_AC17_WithdrawnFighterHiddenAndPruned(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters := newService()
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
	svc, repo, fighters := newService()
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
	svc, repo, fighters := newService()
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
}
