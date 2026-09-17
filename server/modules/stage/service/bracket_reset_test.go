// Сброс состава этапа-сетки: контейнеры первого круга переживают
// ResetLayout.
//
// Баг с боевого турнира («после сброса посева в плейоффе нельзя больше
// добавлять бойцов»): ResetLayout был общим для обоих типов этапа и сносил
// ВСЕ пулы этапа (repo.DeleteAllPoolsByStage), включая два контейнера
// первого круга сетки. Их создаёт только CreateStage, поэтому после сброса
// посев становился невозможен навсегда: containerOfHalf не находил
// контейнер → ErrNotFound → клиенту 404. Инвариант тот же, что у
// undoBuild/unlockBracket: контейнеры 1/2 принадлежат этапу, а не
// конкретному составу, и сбросом состава не удаляются.
package service_test

import (
	"context"
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

func TestResetLayout_Bracket_KeepsContainersAndAllowsReseeding(t *testing.T) {
	ctx := context.Background()
	svc, _, fighters, _, _ := newService()
	fighters.Set("n1",
		domain.FighterRef{ID: "f1", Name: "Alice"},
		domain.FighterRef{ID: "f2", Name: "Bob"},
	)
	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 4})

	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f1"); err != nil {
		t.Fatalf("seed slot 1: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 4, "f2"); err != nil {
		t.Fatalf("seed slot 4: %v", err)
	}

	if _, err := svc.ResetLayout(ctx, stage.ID); err != nil {
		t.Fatalf("reset layout: %v", err)
	}

	// Посев снят...
	afterReset, err := svc.GetBracket(ctx, stage.ID)
	if err != nil {
		t.Fatalf("get bracket after reset: %v", err)
	}
	if pairAt(afterReset, 1, 1, 1).A.State != domain.SlotEmpty {
		t.Fatalf("expected slot 1 empty after reset, got %+v", pairAt(afterReset, 1, 1, 1).A)
	}
	if len(afterReset.Unassigned) != 2 {
		t.Fatalf("expected both fighters back in unassigned, got %+v", afterReset.Unassigned)
	}
	// ...но контейнеры обеих половин на месте.
	if len(afterReset.Rounds) == 0 || len(afterReset.Rounds[0].Halves) != 2 {
		t.Fatalf("expected two halves in round 1 after reset, got %+v", afterReset.Rounds)
	}
	for i, h := range afterReset.Rounds[0].Halves {
		if h.Container.ID == "" {
			t.Fatalf("expected half %d to keep its container after reset, got %+v", i+1, h.Container)
		}
	}

	// Главное: сажать бойцов снова можно.
	reseeded, err := svc.SeedBracketSlot(ctx, stage.ID, 2, "f1")
	if err != nil {
		t.Fatalf("expected reseeding to work after reset, got %v", err)
	}
	if pairAt(reseeded, 1, 1, 1).B.Fighter.ID != "f1" {
		t.Fatalf("expected f1 at slot 2 after reseeding, got %+v", pairAt(reseeded, 1, 1, 1).B)
	}
	// Вторая половина тоже посеваема (её контейнер — отдельная строка).
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 3, "f2"); err != nil {
		t.Fatalf("expected reseeding into the lower half to work, got %v", err)
	}
}

func TestResetLayout_Bracket_UndoRestoresSeeding(t *testing.T) {
	ctx := context.Background()
	svc, _, fighters, _, _ := newService()
	fighters.Set("n1",
		domain.FighterRef{ID: "f1", Name: "Alice"},
		domain.FighterRef{ID: "f2", Name: "Bob"},
	)
	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 4})
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f1"); err != nil {
		t.Fatalf("seed slot 1: %v", err)
	}
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 4, "f2"); err != nil {
		t.Fatalf("seed slot 4: %v", err)
	}
	if _, err := svc.ResetLayout(ctx, stage.ID); err != nil {
		t.Fatalf("reset layout: %v", err)
	}

	if _, err := svc.Undo(ctx, stage.ID); err != nil {
		t.Fatalf("undo after reset: %v", err)
	}
	restored, err := svc.GetBracket(ctx, stage.ID)
	if err != nil {
		t.Fatalf("get bracket after undo: %v", err)
	}
	if got := pairAt(restored, 1, 1, 1).A; got.Fighter.ID != "f1" {
		t.Fatalf("expected f1 back at slot 1, got %+v", got)
	}
	if got := pairAt(restored, 1, 2, 1).B; got.Fighter.ID != "f2" {
		t.Fatalf("expected f2 back at slot 4, got %+v", got)
	}
	// Контейнеров не должно стать больше двух — undo не дублирует половины.
	if len(restored.Rounds[0].Halves) != 2 {
		t.Fatalf("expected exactly two halves after undo, got %d", len(restored.Rounds[0].Halves))
	}
}

// Пустой сброс сетки — no-op: undo не пишется. У сетки контейнеры есть
// всегда, поэтому «пулы есть» больше не признак непустого состава —
// признаком становится сам посев.
func TestResetLayout_Bracket_EmptySeedingIsNoop(t *testing.T) {
	ctx := context.Background()
	svc, _, fighters, _, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 4})

	if _, err := svc.ResetLayout(ctx, stage.ID); err != nil {
		t.Fatalf("reset of an empty bracket: %v", err)
	}
	b, err := svc.GetBracket(ctx, stage.ID)
	if err != nil {
		t.Fatalf("get bracket: %v", err)
	}
	if b.CanUndo {
		t.Fatalf("expected no undo written for a no-op reset of an empty bracket")
	}
}

// SetStatus с уже текущим статусом — не переход, и undo сброса он стирать
// не должен. Раньше repo.SetStatus звался безусловно, а SetStageStatus
// заодно обнуляет undo этапа: повторное «Зафиксировать» молча съедало
// возможность отменить сброс.
func TestSetStatus_NoopKeepsUndo(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1",
		domain.FighterRef{ID: "f1"},
		domain.FighterRef{ID: "f2"},
	)

	// Сетка: сброс посева.
	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 4})
	if _, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f1"); err != nil {
		t.Fatalf("seed slot 1: %v", err)
	}
	if _, err := svc.ResetLayout(ctx, stage.ID); err != nil {
		t.Fatalf("reset layout: %v", err)
	}
	if _, err := svc.SetStatus(ctx, stage.ID, domain.LayoutDraft); err != nil {
		t.Fatalf("no-op set status: %v", err)
	}
	b, err := svc.GetBracket(ctx, stage.ID)
	if err != nil {
		t.Fatalf("get bracket: %v", err)
	}
	if !b.CanUndo {
		t.Fatalf("expected the reset to stay undoable after a no-op SetStatus")
	}

	// Групповой этап: тот же инвариант.
	groupsStageID := stageIDFor(t, repo, "n1")
	if _, err := svc.CreatePool(ctx, groupsStageID); err != nil {
		t.Fatalf("create pool: %v", err)
	}
	if _, err := svc.ResetLayout(ctx, groupsStageID); err != nil {
		t.Fatalf("reset groups layout: %v", err)
	}
	if _, err := svc.SetStatus(ctx, groupsStageID, domain.LayoutDraft); err != nil {
		t.Fatalf("no-op set status (groups): %v", err)
	}
	layout, err := svc.GetLayout(ctx, groupsStageID)
	if err != nil {
		t.Fatalf("get layout: %v", err)
	}
	if !layout.CanUndo {
		t.Fatalf("expected the groups reset to stay undoable after a no-op SetStatus")
	}
}

// Самоисцеление уже сломанных данных: у сетки, потерявшей контейнеры
// (сброс до этого фикса), посев пересоздаёт недостающую половину.
func TestSeedBracketSlot_RecreatesMissingContainers(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1", domain.FighterRef{ID: "f1", Name: "Alice"})
	stage := createBracket(t, ctx, svc, "n1", domain.BracketConfig{Size: 4})

	// Эмулируем сломанное состояние: контейнеров первого круга нет.
	if err := repo.ResetLayout(ctx, stage.ID); err != nil {
		t.Fatalf("emulate broken stage: %v", err)
	}
	pools, err := repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		t.Fatalf("pools by stage: %v", err)
	}
	if len(pools) != 0 {
		t.Fatalf("precondition: expected no containers, got %+v", pools)
	}

	b, err := svc.SeedBracketSlot(ctx, stage.ID, 1, "f1")
	if err != nil {
		t.Fatalf("expected seeding to heal the missing container, got %v", err)
	}
	if pairAt(b, 1, 1, 1).A.Fighter.ID != "f1" {
		t.Fatalf("expected f1 at slot 1, got %+v", pairAt(b, 1, 1, 1).A)
	}
}
