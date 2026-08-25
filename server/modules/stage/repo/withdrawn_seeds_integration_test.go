//go:build integration

// Package repo_test — репозиторные тесты памяти посева и гейта на удаление
// номинации (спека 0040, T6) на реальной PostgreSQL (testcontainers):
// partial-unique/PK-инварианты withdrawn_seeds и репойнт при слиянии
// дублей бойца важны именно на реальной БД, не на fake-репо (см. plan.md,
// «Тестирование»). Отдельный (внешний) test-пакет рядом с repo.go, а не
// modules/stage/integration — тот пакет тянет полный Connect-стек (в т.ч.
// modules/fighter), который в этом дереве может быть недособран другим
// параллельным треком (0040, T13-T17); эти тесты работают напрямую поверх
// stagerepo.New(pool), без полного Connect-пути и без других модулей —
// stage.pool_members/stage.withdrawn_seeds не имеют кросс-схемных FK на
// nomination/fighter (ADR 0002), достаточно синтетических UUID.
package repo_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/hema/server/internal/testdb"
	"github.com/hema/server/modules/stage/domain"
	stagerepo "github.com/hema/server/modules/stage/repo"
)

// ---------------------------------------------------------------------
// ExistsDistributedFighterForNomination (сценарий 1, гейт на удаление).
// ---------------------------------------------------------------------

func TestIntegration_ExistsDistributedFighterForNomination(t *testing.T) {
	pool := testdb.Postgres(t)
	r := stagerepo.New(pool)
	ctx := context.Background()
	nomID := uuid.NewString()

	got, err := r.ExistsDistributedFighterForNomination(ctx, nomID)
	if err != nil {
		t.Fatalf("ExistsDistributedFighterForNomination (empty): %v", err)
	}
	if got {
		t.Fatal("expected false before any pool/membership exists")
	}

	st, err := r.EnsureStage(ctx, nomID)
	if err != nil {
		t.Fatalf("EnsureStage: %v", err)
	}
	p, err := r.CreatePool(ctx, st.ID, 1)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}

	got, err = r.ExistsDistributedFighterForNomination(ctx, nomID)
	if err != nil {
		t.Fatalf("ExistsDistributedFighterForNomination (empty pool): %v", err)
	}
	if got {
		t.Fatal("expected false for an empty pool")
	}

	fighterID := uuid.NewString()
	if err := r.AssignFighter(ctx, st.ID, fighterID, p.ID, 0); err != nil {
		t.Fatalf("AssignFighter: %v", err)
	}

	got, err = r.ExistsDistributedFighterForNomination(ctx, nomID)
	if err != nil {
		t.Fatalf("ExistsDistributedFighterForNomination (occupied): %v", err)
	}
	if !got {
		t.Fatal("expected true once a fighter is distributed into a pool")
	}
}

// ---------------------------------------------------------------------
// CaptureWithdrawnSeed / RestoreWithdrawnSeed (сценарий 2, FR-4..FR-6).
// ---------------------------------------------------------------------

func TestIntegration_CaptureAndRestoreWithdrawnSeed_DraftPoolExists(t *testing.T) {
	pool := testdb.Postgres(t)
	r := stagerepo.New(pool)
	ctx := context.Background()
	nomID := uuid.NewString()
	fighterID := uuid.NewString()

	st, err := r.EnsureStage(ctx, nomID)
	if err != nil {
		t.Fatalf("EnsureStage: %v", err)
	}
	p, err := r.CreatePool(ctx, st.ID, 1)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	if err := r.AssignFighter(ctx, st.ID, fighterID, p.ID, 0); err != nil {
		t.Fatalf("AssignFighter: %v", err)
	}

	memberships, err := r.DraftMembershipsByFighter(ctx, fighterID)
	if err != nil {
		t.Fatalf("DraftMembershipsByFighter: %v", err)
	}
	if len(memberships) != 1 || memberships[0].StageID != st.ID || memberships[0].PoolID != p.ID || memberships[0].NominationID != nomID {
		t.Fatalf("unexpected draft memberships: %+v", memberships)
	}

	if err := r.CaptureWithdrawnSeed(ctx, fighterID, st.ID); err != nil {
		t.Fatalf("CaptureWithdrawnSeed: %v", err)
	}
	if hasMember(t, r, st.ID, fighterID) {
		t.Fatal("membership should have been moved out of pool_members")
	}

	if err := r.RestoreWithdrawnSeed(ctx, fighterID); err != nil {
		t.Fatalf("RestoreWithdrawnSeed: %v", err)
	}
	if !hasMemberInPool(t, r, st.ID, p.ID, fighterID) {
		t.Fatal("expected fighter restored into the same pool (AC-4)")
	}

	// Идемпотентность: withdrawn_seeds уже пуста, повторный вызов — no-op.
	if err := r.RestoreWithdrawnSeed(ctx, fighterID); err != nil {
		t.Fatalf("RestoreWithdrawnSeed (second, idempotent): %v", err)
	}
}

func TestIntegration_RestoreWithdrawnSeed_StageLeftDraft_ExpiresWithoutRestoring(t *testing.T) {
	pool := testdb.Postgres(t)
	r := stagerepo.New(pool)
	ctx := context.Background()
	nomID := uuid.NewString()
	fighterID := uuid.NewString()

	st, err := r.EnsureStage(ctx, nomID)
	if err != nil {
		t.Fatalf("EnsureStage: %v", err)
	}
	p, err := r.CreatePool(ctx, st.ID, 1)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	if err := r.AssignFighter(ctx, st.ID, fighterID, p.ID, 0); err != nil {
		t.Fatalf("AssignFighter: %v", err)
	}
	if err := r.CaptureWithdrawnSeed(ctx, fighterID, st.ID); err != nil {
		t.Fatalf("CaptureWithdrawnSeed: %v", err)
	}

	// Стадия ушла из draft к моменту возврата (AC-5).
	if err := r.SetStatus(ctx, st.ID, domain.LayoutReady); err != nil {
		t.Fatalf("SetStatus: %v", err)
	}

	if err := r.RestoreWithdrawnSeed(ctx, fighterID); err != nil {
		t.Fatalf("RestoreWithdrawnSeed: %v", err)
	}
	if hasMemberInPool(t, r, st.ID, p.ID, fighterID) {
		t.Fatal("fighter must NOT be restored once the stage left draft (AC-5)")
	}

	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM stage.withdrawn_seeds WHERE fighter_id = $1`, uuid.MustParse(fighterID)).Scan(&count); err != nil {
		t.Fatalf("count withdrawn_seeds: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected withdrawn_seeds row freed (best-effort expiration), got %d", count)
	}
}

func TestIntegration_RestoreWithdrawnSeed_PoolDeleted_ExpiresWithoutRestoring(t *testing.T) {
	pool := testdb.Postgres(t)
	r := stagerepo.New(pool)
	ctx := context.Background()
	nomID := uuid.NewString()
	fighterID := uuid.NewString()

	st, err := r.EnsureStage(ctx, nomID)
	if err != nil {
		t.Fatalf("EnsureStage: %v", err)
	}
	p, err := r.CreatePool(ctx, st.ID, 1)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	if err := r.AssignFighter(ctx, st.ID, fighterID, p.ID, 0); err != nil {
		t.Fatalf("AssignFighter: %v", err)
	}
	if err := r.CaptureWithdrawnSeed(ctx, fighterID, st.ID); err != nil {
		t.Fatalf("CaptureWithdrawnSeed: %v", err)
	}

	// Пул к моменту возврата удалён (AC-5, вторая ветка). withdrawn_seeds
	// не имеет FK на stage.pools (ADR 0002-стиль внутри одной схемы, см.
	// migrations/00005) — строка НЕ каскадится, restore должен сам
	// обнаружить отсутствие пула и освободить память.
	if err := r.DeletePool(ctx, p.ID); err != nil {
		t.Fatalf("DeletePool: %v", err)
	}

	var beforeCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM stage.withdrawn_seeds WHERE fighter_id = $1`, uuid.MustParse(fighterID)).Scan(&beforeCount); err != nil {
		t.Fatalf("count withdrawn_seeds (before restore): %v", err)
	}
	if beforeCount != 1 {
		t.Fatalf("expected withdrawn_seeds row to survive pool deletion (no FK), got %d", beforeCount)
	}

	if err := r.RestoreWithdrawnSeed(ctx, fighterID); err != nil {
		t.Fatalf("RestoreWithdrawnSeed: %v", err)
	}

	var afterCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM stage.withdrawn_seeds WHERE fighter_id = $1`, uuid.MustParse(fighterID)).Scan(&afterCount); err != nil {
		t.Fatalf("count withdrawn_seeds (after restore): %v", err)
	}
	if afterCount != 0 {
		t.Fatalf("expected withdrawn_seeds row freed once the pool is gone, got %d", afterCount)
	}
}

// ---------------------------------------------------------------------
// RepointFighter / RepointWithdrawnSeed (сценарий 3, слияние дублей).
// ---------------------------------------------------------------------

func TestIntegration_RepointFighter_MovesMembership_NoCollision(t *testing.T) {
	pool := testdb.Postgres(t)
	r := stagerepo.New(pool)
	ctx := context.Background()
	nomID := uuid.NewString()
	source, target := uuid.NewString(), uuid.NewString()

	st, err := r.EnsureStage(ctx, nomID)
	if err != nil {
		t.Fatalf("EnsureStage: %v", err)
	}
	p, err := r.CreatePool(ctx, st.ID, 1)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	if err := r.AssignFighter(ctx, st.ID, source, p.ID, 0); err != nil {
		t.Fatalf("AssignFighter: %v", err)
	}

	if err := r.RepointFighter(ctx, source, target); err != nil {
		t.Fatalf("RepointFighter: %v", err)
	}

	if hasMember(t, r, st.ID, source) {
		t.Error("source membership should have been repointed away")
	}
	if !hasMemberInPool(t, r, st.ID, p.ID, target) {
		t.Error("target should now hold the membership")
	}
}

// TestIntegration_RepointFighter_CollisionKeepsSourceRow проверяет, что
// коллизия по uq_members_stage_fighter (target уже сидит в той же
// стадии) не репойнтится молча — source-строка остаётся за source, данные
// не теряются (plan.md, «Репойнт при слиянии»).
func TestIntegration_RepointFighter_CollisionKeepsSourceRow(t *testing.T) {
	pool := testdb.Postgres(t)
	r := stagerepo.New(pool)
	ctx := context.Background()
	nomID := uuid.NewString()
	source, target := uuid.NewString(), uuid.NewString()

	st, err := r.EnsureStage(ctx, nomID)
	if err != nil {
		t.Fatalf("EnsureStage: %v", err)
	}
	p1, err := r.CreatePool(ctx, st.ID, 1)
	if err != nil {
		t.Fatalf("CreatePool 1: %v", err)
	}
	p2, err := r.CreatePool(ctx, st.ID, 2)
	if err != nil {
		t.Fatalf("CreatePool 2: %v", err)
	}
	if err := r.AssignFighter(ctx, st.ID, source, p1.ID, 0); err != nil {
		t.Fatalf("AssignFighter(source): %v", err)
	}
	if err := r.AssignFighter(ctx, st.ID, target, p2.ID, 0); err != nil {
		t.Fatalf("AssignFighter(target): %v", err)
	}

	if err := r.RepointFighter(ctx, source, target); err != nil {
		t.Fatalf("RepointFighter: %v", err)
	}

	if !hasMemberInPool(t, r, st.ID, p1.ID, source) {
		t.Error("source membership must remain in its own pool when target already occupies the stage")
	}
	if !hasMemberInPool(t, r, st.ID, p2.ID, target) {
		t.Error("target's own membership must remain untouched")
	}
}

func TestIntegration_RepointWithdrawnSeed_MovesMemory_NoCollision(t *testing.T) {
	pool := testdb.Postgres(t)
	r := stagerepo.New(pool)
	ctx := context.Background()
	nomID := uuid.NewString()
	source, target := uuid.NewString(), uuid.NewString()

	st, err := r.EnsureStage(ctx, nomID)
	if err != nil {
		t.Fatalf("EnsureStage: %v", err)
	}
	p, err := r.CreatePool(ctx, st.ID, 1)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	if err := r.AssignFighter(ctx, st.ID, source, p.ID, 0); err != nil {
		t.Fatalf("AssignFighter: %v", err)
	}
	if err := r.CaptureWithdrawnSeed(ctx, source, st.ID); err != nil {
		t.Fatalf("CaptureWithdrawnSeed: %v", err)
	}

	if err := r.RepointWithdrawnSeed(ctx, source, target); err != nil {
		t.Fatalf("RepointWithdrawnSeed: %v", err)
	}

	// Память перешла к target: его возврат восстанавливает членство,
	// возврат source — no-op.
	if err := r.RestoreWithdrawnSeed(ctx, target); err != nil {
		t.Fatalf("RestoreWithdrawnSeed(target): %v", err)
	}
	if !hasMemberInPool(t, r, st.ID, p.ID, target) {
		t.Error("target should have been restored from the repointed withdrawn seed")
	}

	if err := r.RestoreWithdrawnSeed(ctx, source); err != nil {
		t.Fatalf("RestoreWithdrawnSeed(source): %v", err)
	}
	if hasMember(t, r, st.ID, source) {
		t.Error("source must not restore anything — its memory was repointed away")
	}
}

// TestIntegration_RepointWithdrawnSeed_CollisionKeepsSourceRow проверяет
// коллизию по PK withdrawn_seeds (fighter_id, nomination_id): если у
// target уже есть запомненный посев той же номинации, строка source не
// репойнтится молча.
func TestIntegration_RepointWithdrawnSeed_CollisionKeepsSourceRow(t *testing.T) {
	pool := testdb.Postgres(t)
	r := stagerepo.New(pool)
	ctx := context.Background()
	nomID := uuid.NewString()
	source, target := uuid.NewString(), uuid.NewString()

	st, err := r.EnsureStage(ctx, nomID)
	if err != nil {
		t.Fatalf("EnsureStage: %v", err)
	}
	p1, err := r.CreatePool(ctx, st.ID, 1)
	if err != nil {
		t.Fatalf("CreatePool 1: %v", err)
	}
	p2, err := r.CreatePool(ctx, st.ID, 2)
	if err != nil {
		t.Fatalf("CreatePool 2: %v", err)
	}
	if err := r.AssignFighter(ctx, st.ID, source, p1.ID, 0); err != nil {
		t.Fatalf("AssignFighter(source): %v", err)
	}
	if err := r.AssignFighter(ctx, st.ID, target, p2.ID, 0); err != nil {
		t.Fatalf("AssignFighter(target): %v", err)
	}
	if err := r.CaptureWithdrawnSeed(ctx, source, st.ID); err != nil {
		t.Fatalf("CaptureWithdrawnSeed(source): %v", err)
	}
	if err := r.CaptureWithdrawnSeed(ctx, target, st.ID); err != nil {
		t.Fatalf("CaptureWithdrawnSeed(target): %v", err)
	}

	if err := r.RepointWithdrawnSeed(ctx, source, target); err != nil {
		t.Fatalf("RepointWithdrawnSeed: %v", err)
	}

	// Обе записи должны были остаться при своих владельцах — коллизия по
	// PK (fighter_id, nomination_id) не разрешена молча.
	if err := r.RestoreWithdrawnSeed(ctx, source); err != nil {
		t.Fatalf("RestoreWithdrawnSeed(source): %v", err)
	}
	if !hasMemberInPool(t, r, st.ID, p1.ID, source) {
		t.Error("source should still restore its own withdrawn seed (not repointed away)")
	}

	if err := r.RestoreWithdrawnSeed(ctx, target); err != nil {
		t.Fatalf("RestoreWithdrawnSeed(target): %v", err)
	}
	if !hasMemberInPool(t, r, st.ID, p2.ID, target) {
		t.Error("target should restore its own withdrawn seed, untouched by the collision")
	}
}

// ---------------------------------------------------------------------
// Хелперы.
// ---------------------------------------------------------------------

func hasMember(t *testing.T, r *stagerepo.Repo, stageID, fighterID string) bool {
	t.Helper()
	members, err := r.MembersByStage(context.Background(), stageID)
	if err != nil {
		t.Fatalf("MembersByStage(%s): %v", stageID, err)
	}
	for _, m := range members {
		if m.FighterID == fighterID {
			return true
		}
	}
	return false
}

func hasMemberInPool(t *testing.T, r *stagerepo.Repo, stageID, poolID, fighterID string) bool {
	t.Helper()
	members, err := r.MembersByStage(context.Background(), stageID)
	if err != nil {
		t.Fatalf("MembersByStage(%s): %v", stageID, err)
	}
	for _, m := range members {
		if m.FighterID == fighterID && m.PoolID == poolID {
			return true
		}
	}
	return false
}
