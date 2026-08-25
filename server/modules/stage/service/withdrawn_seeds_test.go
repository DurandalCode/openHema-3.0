// Тесты гейта на удаление номинации и памяти посева при возврате
// выведенного бойца (спека 0040, сценарии 1/2/3, T7): HasDistributedFighters
// (вход stage.PoolOccupancyAdapter), OnFighterWithdrawn/OnFighterReturned
// (вход stage.SeedingSinkAdapter) и RepointFighter (вход
// stage.RepointAdapter).
package service_test

import (
	"context"
	"testing"

	"github.com/hema/server/modules/stage/domain"
	"github.com/hema/server/modules/stage/testutil"
)

func membersOfStage(t *testing.T, repo *testutil.FakeRepo, stageID string) []domain.PoolMember {
	t.Helper()
	members, err := repo.MembersByStage(context.Background(), stageID)
	if err != nil {
		t.Fatalf("MembersByStage(%s): %v", stageID, err)
	}
	return members
}

func hasFighterInStage(t *testing.T, repo *testutil.FakeRepo, stageID, fighterID string) bool {
	t.Helper()
	for _, m := range membersOfStage(t, repo, stageID) {
		if m.FighterID == fighterID {
			return true
		}
	}
	return false
}

// canonicalStageID резолвит id канонического (авто-управляемого) этапа
// номинации — вызывать ПОСЛЕ хотя бы одного SeedPool/SeedStatus для этой
// номинации (StageByNomination — чтение без создания, found=false, пока
// строки нет).
func canonicalStageID(t *testing.T, repo *testutil.FakeRepo, nominationID string) string {
	t.Helper()
	st, found, err := repo.StageByNomination(context.Background(), nominationID)
	if err != nil {
		t.Fatalf("StageByNomination(%s): %v", nominationID, err)
	}
	if !found {
		t.Fatalf("StageByNomination(%s): not found", nominationID)
	}
	return st.ID
}

// ---------------------------------------------------------------------
// HasDistributedFighters — вход stage.PoolOccupancyAdapter (сценарий 1).
// ---------------------------------------------------------------------

func TestHasDistributedFighters(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()
	nomID := "nom-1"

	got, err := svc.HasDistributedFighters(ctx, nomID)
	if err != nil {
		t.Fatalf("HasDistributedFighters (empty): %v", err)
	}
	if got {
		t.Fatal("expected false for nomination with no pools")
	}

	repo.SeedPool(nomID, 1, "fighter-1")

	got, err = svc.HasDistributedFighters(ctx, nomID)
	if err != nil {
		t.Fatalf("HasDistributedFighters (occupied): %v", err)
	}
	if !got {
		t.Fatal("expected true once a fighter is distributed into a pool")
	}
}

// ---------------------------------------------------------------------
// OnFighterWithdrawn — переносит ТОЛЬКО draft-членства в память и удаляет
// их из pool_members; членства вне draft не трогает (сценарий 2, FR-4).
// ---------------------------------------------------------------------

func TestOnFighterWithdrawn_CapturesOnlyDraftMemberships(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()
	const fighterID = "fighter-1"
	const nomID = "nom-1"

	// Пул A: канонический (авто) этап номинации — draft по умолчанию.
	repo.SeedPool(nomID, 1, fighterID)
	draftStageID := canonicalStageID(t, repo, nomID)

	// Пул B: второй этап той же номинации, зафиксированный (ready) —
	// членство здесь посев уже зафиксирован, трогать нельзя (FR-6).
	readyStageID := repo.SeedStage(nomID, 1, "Финал", domain.StageTypeGroups)
	repo.SeedStageStatus(readyStageID, domain.LayoutReady)
	repo.SeedPoolInStage(readyStageID, 1, fighterID)

	if !hasFighterInStage(t, repo, draftStageID, fighterID) {
		t.Fatal("precondition: fighter should be seeded into the draft stage pool")
	}
	if !hasFighterInStage(t, repo, readyStageID, fighterID) {
		t.Fatal("precondition: fighter should be seeded into the ready stage pool")
	}

	if err := svc.OnFighterWithdrawn(ctx, fighterID); err != nil {
		t.Fatalf("OnFighterWithdrawn: %v", err)
	}

	if hasFighterInStage(t, repo, draftStageID, fighterID) {
		t.Error("draft membership should have been removed from pool_members")
	}
	if !hasFighterInStage(t, repo, readyStageID, fighterID) {
		t.Error("ready-stage membership must NOT be touched (FR-6, already committed)")
	}
	if got := repo.WithdrawnSeedCount(); got != 1 {
		t.Errorf("expected exactly 1 captured withdrawn seed (draft only), got %d", got)
	}
}

func TestOnFighterWithdrawn_NoDraftMembership_NoOp(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()
	const fighterID = "fighter-1"
	const nomID = "nom-1"

	readyStageID := repo.SeedStage(nomID, 0, "Группы", domain.StageTypeGroups)
	repo.SeedStageStatus(readyStageID, domain.LayoutReady)
	repo.SeedPoolInStage(readyStageID, 1, fighterID)

	if err := svc.OnFighterWithdrawn(ctx, fighterID); err != nil {
		t.Fatalf("OnFighterWithdrawn: %v", err)
	}

	if !hasFighterInStage(t, repo, readyStageID, fighterID) {
		t.Error("ready-stage membership must remain untouched")
	}
	if got := repo.WithdrawnSeedCount(); got != 0 {
		t.Errorf("expected no captured withdrawn seed, got %d", got)
	}
}

// ---------------------------------------------------------------------
// OnFighterReturned — восстанавливает при (draft + пул существует), иначе
// тихо освобождает память (сценарий 2, FR-5/FR-6).
// ---------------------------------------------------------------------

func TestOnFighterReturned_RestoresIntoSamePool_WhenStillDraft(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()
	const fighterID = "fighter-1"
	const nomID = "nom-1"

	repo.SeedPool(nomID, 1, fighterID)
	stageID := canonicalStageID(t, repo, nomID)

	if err := svc.OnFighterWithdrawn(ctx, fighterID); err != nil {
		t.Fatalf("OnFighterWithdrawn: %v", err)
	}
	if hasFighterInStage(t, repo, stageID, fighterID) {
		t.Fatal("precondition: fighter should have been removed by withdrawal")
	}

	if err := svc.OnFighterReturned(ctx, fighterID); err != nil {
		t.Fatalf("OnFighterReturned: %v", err)
	}

	if !hasFighterInStage(t, repo, stageID, fighterID) {
		t.Error("expected fighter restored into the same pool (AC-4)")
	}
	if got := repo.WithdrawnSeedCount(); got != 0 {
		t.Errorf("expected memory freed after restore, got %d entries", got)
	}
}

func TestOnFighterReturned_StageLeftDraft_SilentlyExpires(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()
	const fighterID = "fighter-1"
	const nomID = "nom-1"

	repo.SeedPool(nomID, 1, fighterID)
	stageID := canonicalStageID(t, repo, nomID)

	if err := svc.OnFighterWithdrawn(ctx, fighterID); err != nil {
		t.Fatalf("OnFighterWithdrawn: %v", err)
	}

	// Стадия ушла из draft к моменту возврата (AC-5).
	repo.SeedStatus(nomID, domain.LayoutReady)

	if err := svc.OnFighterReturned(ctx, fighterID); err != nil {
		t.Fatalf("OnFighterReturned: %v", err)
	}

	if hasFighterInStage(t, repo, stageID, fighterID) {
		t.Error("fighter must stay unassigned once the stage left draft (AC-5)")
	}
	if got := repo.WithdrawnSeedCount(); got != 0 {
		t.Errorf("expected memory freed (best-effort expiration), got %d entries", got)
	}
}

func TestOnFighterReturned_PoolDeleted_SilentlyExpires(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()
	const fighterID = "fighter-1"
	const nomID = "nom-1"

	poolID := repo.SeedPool(nomID, 1, fighterID)

	if err := svc.OnFighterWithdrawn(ctx, fighterID); err != nil {
		t.Fatalf("OnFighterWithdrawn: %v", err)
	}

	// Пул к моменту возврата удалён (AC-5, вторая ветка).
	if err := repo.DeletePool(ctx, poolID); err != nil {
		t.Fatalf("DeletePool: %v", err)
	}

	if err := svc.OnFighterReturned(ctx, fighterID); err != nil {
		t.Fatalf("OnFighterReturned: %v", err)
	}
	if got := repo.WithdrawnSeedCount(); got != 0 {
		t.Errorf("expected memory freed once the pool is gone, got %d entries", got)
	}
}

func TestOnFighterReturned_NothingCaptured_NoOp(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()

	// Боец, выведенный без распределения (уже был в «нераспределённых») —
	// не регрессия (FR-7): возврат не должен падать и не должен ничего
	// создавать.
	if err := svc.OnFighterReturned(ctx, "fighter-never-assigned"); err != nil {
		t.Fatalf("OnFighterReturned: %v", err)
	}
	if got := repo.WithdrawnSeedCount(); got != 0 {
		t.Errorf("expected no withdrawn seeds, got %d", got)
	}
}

// ---------------------------------------------------------------------
// RepointFighter — переносит pool_members и withdrawn_seeds от source к
// target; коллизия по uq_members_stage_fighter не репойнтится молча
// (сценарий 3).
// ---------------------------------------------------------------------

func TestRepointFighter_MovesMembershipWhenNoCollision(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()
	const source, target = "fighter-source", "fighter-target"
	const nomID = "nom-1"

	repo.SeedPool(nomID, 1, source)
	stageID := canonicalStageID(t, repo, nomID)

	if err := svc.RepointFighter(ctx, source, target); err != nil {
		t.Fatalf("RepointFighter: %v", err)
	}

	if hasFighterInStage(t, repo, stageID, source) {
		t.Error("source membership should have been repointed away")
	}
	if !hasFighterInStage(t, repo, stageID, target) {
		t.Error("target should now hold the membership")
	}
}

func TestRepointFighter_CollisionNotRepointedSilently(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()
	const source, target = "fighter-source", "fighter-target"
	const nomID = "nom-1"

	repo.SeedPool(nomID, 1, source)
	repo.SeedPool(nomID, 2, target)
	stageID := canonicalStageID(t, repo, nomID)

	if err := svc.RepointFighter(ctx, source, target); err != nil {
		t.Fatalf("RepointFighter: %v", err)
	}

	// target уже сидел в этой стадии (в другом пуле) — коллизия по
	// uq_members_stage_fighter: source-строка остаётся за source, данные не
	// теряются, но и не репойнтятся молча.
	if !hasFighterInStage(t, repo, stageID, source) {
		t.Error("source membership must remain when target already occupies the same stage")
	}
	if !hasFighterInStage(t, repo, stageID, target) {
		t.Error("target's own membership must remain untouched")
	}
}

func TestRepointFighter_MovesWithdrawnSeedWhenNoCollision(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()
	const source, target = "fighter-source", "fighter-target"
	const nomID = "nom-1"

	poolID := repo.SeedPool(nomID, 1, source)
	stageID := canonicalStageID(t, repo, nomID)
	repo.SeedWithdrawnSeed(source, nomID, stageID, poolID)
	// Членства в pool_members уже нет (как после реального
	// CaptureWithdrawnSeed) — иначе InsertMember при восстановлении
	// столкнётся с уже существующей строкой.
	if err := repo.UnassignFighter(ctx, stageID, source); err != nil {
		t.Fatalf("UnassignFighter: %v", err)
	}

	if err := svc.RepointFighter(ctx, source, target); err != nil {
		t.Fatalf("RepointFighter: %v", err)
	}

	// Память должна была перейти к target: возврат target восстанавливает
	// его в пул, возврат source — no-op.
	if err := svc.OnFighterReturned(ctx, target); err != nil {
		t.Fatalf("OnFighterReturned(target): %v", err)
	}
	if !hasFighterInStage(t, repo, stageID, target) {
		t.Error("target should have been restored from the repointed withdrawn seed")
	}

	if err := svc.OnFighterReturned(ctx, source); err != nil {
		t.Fatalf("OnFighterReturned(source): %v", err)
	}
	if hasFighterInStage(t, repo, stageID, source) {
		t.Error("source must not restore anything — its memory was repointed away")
	}
}

func TestRepointFighter_WithdrawnSeedCollisionNotRepointedSilently(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()
	const source, target = "fighter-source", "fighter-target"
	const nomID = "nom-1"

	sourcePoolID := repo.SeedPool(nomID, 1, source)
	targetPoolID := repo.SeedPool(nomID, 2, target)
	stageID := canonicalStageID(t, repo, nomID)
	repo.SeedWithdrawnSeed(source, nomID, stageID, sourcePoolID)
	repo.SeedWithdrawnSeed(target, nomID, stageID, targetPoolID)
	if err := repo.UnassignFighter(ctx, stageID, source); err != nil {
		t.Fatalf("UnassignFighter(source): %v", err)
	}
	if err := repo.UnassignFighter(ctx, stageID, target); err != nil {
		t.Fatalf("UnassignFighter(target): %v", err)
	}

	if err := svc.RepointFighter(ctx, source, target); err != nil {
		t.Fatalf("RepointFighter: %v", err)
	}

	// target уже имел запомненный посев той же номинации — коллизия по PK
	// (fighter_id, nomination_id): source-строка остаётся за source.
	if err := svc.OnFighterReturned(ctx, source); err != nil {
		t.Fatalf("OnFighterReturned(source): %v", err)
	}
	if !hasFighterInStage(t, repo, stageID, source) {
		t.Error("source should still restore its own withdrawn seed (not repointed away)")
	}

	if err := svc.OnFighterReturned(ctx, target); err != nil {
		t.Fatalf("OnFighterReturned(target): %v", err)
	}
	if !hasFighterInStage(t, repo, stageID, target) {
		t.Error("target should restore its own withdrawn seed, untouched by the collision")
	}
}
