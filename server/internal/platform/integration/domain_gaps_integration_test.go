//go:build integration

// Package integration — сквозные e2e-тесты composition root'а (спека 0040,
// T31): реальная кросс-модульная связка nomination↔stage↔bout↔fighter через
// живой PostgreSQL (testcontainers) и полный Connect-путь, а не через fake-
// адаптеры юнит-тестов отдельных треков. Проверяет ровно то, что в plan.md
// названо «best-effort кросс-модульные side-effects» — что реальные
// адаптеры, собранные platform.go (NewStageCrossModuleAdapters,
// NewBoutCrossModuleAdapters), действительно работают вместе, а не только
// каждый порознь со своим fake-партнёром. См. ADR 0010.
package integration

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/internal/platform"
	"github.com/hema/server/internal/testdb"
	boutmodule "github.com/hema/server/modules/bout"
	"github.com/hema/server/modules/fighter"
	"github.com/hema/server/modules/nomination"
	stagemodule "github.com/hema/server/modules/stage"
	"github.com/hema/server/modules/tournament"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
	"github.com/hema/server/pkg/livebus"
)

const (
	adminUserID      = "00000000-0000-0000-0000-000000000aaa"
	accessKey        = "domain-gaps-integration-access-secret"
	refreshKey       = "domain-gaps-integration-refresh-secret"
	seedTournamentID = "00000000-0000-0000-0000-000000000001"
)

type clients struct {
	nom     hemav1connect.NominationAdminServiceClient
	stage   hemav1connect.StageAdminServiceClient
	bout    hemav1connect.BoutAdminServiceClient
	fighter hemav1connect.FighterAdminServiceClient
}

// setup поднимает PG (testdb.Postgres), применяет миграции всех модулей и
// собирает ТУ ЖЕ композицию, что и composition root (platform.go): реальные
// адаптеры platform.NewStageCrossModuleAdapters/NewBoutCrossModuleAdapters
// в nomination.Deps.Pools/Bouts и fighter.Deps.Seeding/Stage/Bout —
// единственная разница с platform.New в том, что токены/пул тестовые, а не
// из env/cfg.
func setup(t *testing.T) clients {
	t.Helper()
	pool := testdb.Postgres(t)

	tokens := jwt.NewManager(accessKey, refreshKey, 15*time.Minute, 720*time.Hour)
	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.Auth(tokens)),
	}
	adminOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.RequireAdmin()),
	}

	mux := http.NewServeMux()

	tournament.Register(mux, tournament.Deps{Pool: pool}, baseOpts, adminOpts)
	activeTournaments := tournament.NewActiveTournamentIDProvider(pool)

	poolOccupancy, seedingSink, stageRepointer := platform.NewStageCrossModuleAdapters(pool)
	boutOccupancy, boutRepointer := platform.NewBoutCrossModuleAdapters(pool)

	nomination.Register(mux, nomination.Deps{
		Pool:        pool,
		Tournaments: activeTournaments,
		Pools:       poolOccupancy,
		Bouts:       boutOccupancy,
	}, baseOpts, adminOpts)

	fighterNominations := platform.NewFighterNominationProvider(pool, activeTournaments)
	fighter.Register(mux, fighter.Deps{
		Pool:        pool,
		Nominations: fighterNominations,
		Tournaments: activeTournaments,
		Seeding:     seedingSink,
		Stage:       stageRepointer,
		Bout:        boutRepointer,
	}, baseOpts, adminOpts)

	boutmodule.Register(mux, boutmodule.Deps{Pool: pool}, baseOpts, adminOpts)

	stagemodule.Register(mux, stagemodule.Deps{
		Pool:        pool,
		Fighters:    platform.NewStageActiveFightersProvider(pool),
		Bouts:       platform.NewStageBoutConductor(pool),
		Nominations: platform.NewStageNominationProvider(pool, activeTournaments),
		LiveBus:     platform.NewStageLiveBus(livebus.New()),
	}, baseOpts, adminOpts)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	httpClient := server.Client()
	return clients{
		nom:     hemav1connect.NewNominationAdminServiceClient(httpClient, server.URL),
		stage:   hemav1connect.NewStageAdminServiceClient(httpClient, server.URL),
		bout:    hemav1connect.NewBoutAdminServiceClient(httpClient, server.URL),
		fighter: hemav1connect.NewFighterAdminServiceClient(httpClient, server.URL),
	}
}

func adminBearer(t *testing.T) string {
	t.Helper()
	tokens := jwt.NewManager(accessKey, refreshKey, 15*time.Minute, 720*time.Hour)
	pair, err := tokens.Issue(adminUserID, "admin", "")
	if err != nil {
		t.Fatalf("issue admin token: %v", err)
	}
	return "Bearer " + pair.Access
}

func createNomination(t *testing.T, c clients) string {
	t.Helper()
	req := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId: seedTournamentID,
		Title:        "Лонгсорд",
	})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.nom.CreateNomination(context.Background(), req)
	if err != nil {
		t.Fatalf("CreateNomination: %v", err)
	}
	return res.Msg.Nomination.Id
}

func createFighter(t *testing.T, c clients, nominationID, name string) string {
	t.Helper()
	req := connect.NewRequest(&hemav1.CreateFighterRequest{
		TournamentId:  seedTournamentID,
		Name:          name,
		NominationIds: []string{nominationID},
	})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.fighter.CreateFighter(context.Background(), req)
	if err != nil {
		t.Fatalf("CreateFighter(%s): %v", name, err)
	}
	return res.Msg.Fighter.Id
}

func stageIDFor(t *testing.T, c clients, nominationID string) string {
	t.Helper()
	req := connect.NewRequest(&hemav1.ListStagesRequest{NominationId: nominationID})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.stage.ListStages(context.Background(), req)
	if err != nil {
		t.Fatalf("ListStages(%q): %v", nominationID, err)
	}
	for _, s := range res.Msg.Stages {
		if s.Type == hemav1.StageType_STAGE_TYPE_GROUPS {
			return s.Id
		}
	}
	t.Fatalf("no groups stage found for nomination %q", nominationID)
	return ""
}

func createPool(t *testing.T, c clients, stageID string) string {
	t.Helper()
	req := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageID})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.stage.CreatePool(context.Background(), req)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	return res.Msg.Layout.Pools[len(res.Msg.Layout.Pools)-1].Id
}

func assignFighter(t *testing.T, c clients, stageID, fighterID, poolID string) *hemav1.PoolLayout {
	t.Helper()
	req := connect.NewRequest(&hemav1.AssignFighterRequest{StageId: stageID, FighterId: fighterID, PoolId: poolID})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.stage.AssignFighter(context.Background(), req)
	if err != nil {
		t.Fatalf("AssignFighter: %v", err)
	}
	return res.Msg.Layout
}

func getLayout(t *testing.T, c clients, stageID string) *hemav1.PoolLayout {
	t.Helper()
	req := connect.NewRequest(&hemav1.GetLayoutRequest{StageId: stageID})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.stage.GetLayout(context.Background(), req)
	if err != nil {
		t.Fatalf("GetLayout: %v", err)
	}
	return res.Msg.Layout
}

func deleteNomination(t *testing.T, c clients, nominationID string) error {
	t.Helper()
	req := connect.NewRequest(&hemav1.DeleteNominationRequest{Id: nominationID})
	req.Header().Set("Authorization", adminBearer(t))
	_, err := c.nom.DeleteNomination(context.Background(), req)
	return err
}

func withdrawFighter(t *testing.T, c clients, fighterID string) {
	t.Helper()
	req := connect.NewRequest(&hemav1.WithdrawFighterRequest{
		FighterId: fighterID,
		Reason:    hemav1.WithdrawalReason_WITHDRAWAL_REASON_INJURY,
	})
	req.Header().Set("Authorization", adminBearer(t))
	if _, err := c.fighter.WithdrawFighter(context.Background(), req); err != nil {
		t.Fatalf("WithdrawFighter(%s): %v", fighterID, err)
	}
}

func returnFighter(t *testing.T, c clients, fighterID string) {
	t.Helper()
	req := connect.NewRequest(&hemav1.ReturnFighterRequest{FighterId: fighterID})
	req.Header().Set("Authorization", adminBearer(t))
	if _, err := c.fighter.ReturnFighter(context.Background(), req); err != nil {
		t.Fatalf("ReturnFighter(%s): %v", fighterID, err)
	}
}

// poolOfFighter возвращает id пула, в котором находится боец, или "" если
// он в Unassigned (либо отсутствует в раскладке вовсе).
func poolOfFighter(layout *hemav1.PoolLayout, fighterID string) string {
	for _, p := range layout.Pools {
		for _, m := range p.Members {
			if m.FighterId == fighterID {
				return p.Id
			}
		}
	}
	return ""
}

func isUnassigned(layout *hemav1.PoolLayout, fighterID string) bool {
	for _, f := range layout.Unassigned {
		if f.FighterId == fighterID {
			return true
		}
	}
	return false
}

// ── Сценарий 1 (спека 0040): гейт на удаление номинации, реальные
// stage/bout адаптеры (не fake) ─────────────────────────────────────────

// TestIntegration_DeleteNominationGate_DistributedFighters_BlockedThenAllowed
// проверяет AC-1/AC-3/AC-13: распределённый в пул боец блокирует удаление
// (реальный PoolOccupancyAdapter), после снятия распределения удаление
// проходит.
func TestIntegration_DeleteNominationGate_DistributedFighters_BlockedThenAllowed(t *testing.T) {
	c := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван")
	stageID := stageIDFor(t, c, nomID)
	poolID := createPool(t, c, stageID)
	assignFighter(t, c, stageID, f1, poolID)

	err := deleteNomination(t, c, nomID)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("expected FailedPrecondition with distributed fighter, got %v", err)
	}

	// AC-13: вручную снять распределение и сбросить посев.
	unassignReq := connect.NewRequest(&hemav1.UnassignFighterRequest{StageId: stageID, FighterId: f1})
	unassignReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.stage.UnassignFighter(context.Background(), unassignReq); err != nil {
		t.Fatalf("UnassignFighter: %v", err)
	}

	if err := deleteNomination(t, c, nomID); err != nil {
		t.Fatalf("expected delete to succeed after unassign, got %v", err)
	}
}

// TestIntegration_DeleteNominationGate_Bouts_Blocked проверяет AC-2: у
// номинации с поставленным боем (реальный BoutOccupancyAdapter) удаление
// отклонено.
func TestIntegration_DeleteNominationGate_Bouts_Blocked(t *testing.T) {
	c := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван")
	f2 := createFighter(t, c, nomID, "Пётр")
	stageID := stageIDFor(t, c, nomID)
	poolID := createPool(t, c, stageID)
	assignFighter(t, c, stageID, f1, poolID)
	assignFighter(t, c, stageID, f2, poolID)

	readyReq := connect.NewRequest(&hemav1.SetLayoutStatusRequest{
		StageId: stageID, Status: hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY,
	})
	readyReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.stage.SetLayoutStatus(context.Background(), readyReq); err != nil {
		t.Fatalf("SetLayoutStatus(ready): %v", err)
	}

	err := deleteNomination(t, c, nomID)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("expected FailedPrecondition with bouts, got %v", err)
	}
}

// ── Сценарий 2 (спека 0040): восстановление посева при возврате бойца,
// реальный stage-адаптер ────────────────────────────────────────────────

// TestIntegration_WithdrawReturn_DraftStage_RestoresSamePool проверяет
// AC-4: боец, выведенный из пула draft-стадии, при возврате оказывается в
// том же пуле — реальный SeedingSinkAdapter/RepointAdapter, не fake.
func TestIntegration_WithdrawReturn_DraftStage_RestoresSamePool(t *testing.T) {
	c := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван")
	stageID := stageIDFor(t, c, nomID)
	poolID := createPool(t, c, stageID)
	assignFighter(t, c, stageID, f1, poolID)

	withdrawFighter(t, c, f1)
	returnFighter(t, c, f1)

	layout := getLayout(t, c, stageID)
	if got := poolOfFighter(layout, f1); got != poolID {
		t.Fatalf("expected fighter restored to pool %q, got %q (layout=%+v)", poolID, got, layout)
	}
	if isUnassigned(layout, f1) {
		t.Fatalf("fighter should not be unassigned after restore: %+v", layout)
	}
}

// TestIntegration_WithdrawReturn_StageLeftDraft_EndsUnassigned проверяет
// AC-5: боец выведен, пока стадия ещё draft (посев запоминается), но к
// моменту возврата стадия уже ready — автоматическое восстановление не
// удаётся, боец оказывается в нераспределённых.
func TestIntegration_WithdrawReturn_StageLeftDraft_EndsUnassigned(t *testing.T) {
	c := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван")
	f2 := createFighter(t, c, nomID, "Пётр")
	stageID := stageIDFor(t, c, nomID)
	poolID := createPool(t, c, stageID)
	assignFighter(t, c, stageID, f1, poolID)
	assignFighter(t, c, stageID, f2, poolID)

	withdrawFighter(t, c, f1)

	// Стадия уходит из draft, пока боец выведен (посев уже запомнен).
	readyReq := connect.NewRequest(&hemav1.SetLayoutStatusRequest{
		StageId: stageID, Status: hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY,
	})
	readyReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.stage.SetLayoutStatus(context.Background(), readyReq); err != nil {
		t.Fatalf("SetLayoutStatus(ready): %v", err)
	}

	returnFighter(t, c, f1)

	layout := getLayout(t, c, stageID)
	if !isUnassigned(layout, f1) {
		t.Fatalf("expected fighter unassigned after stage left draft, got layout=%+v", layout)
	}
}

// ── Сценарий 3 (спека 0040): слияние дублей бойца, реальный репойнт в
// stage и bout ──────────────────────────────────────────────────────────

// TestIntegration_MergeFighters_RepointsStageAndBout проверяет AC-12 с
// реальным репойнтом: участие source в пуле (stage.pool_members) и боях
// (bout.bouts) переносится на target после слияния.
func TestIntegration_MergeFighters_RepointsStageAndBout(t *testing.T) {
	c := setup(t)
	nomID := createNomination(t, c)
	source := createFighter(t, c, nomID, "Иван (дубль)")
	target := createFighter(t, c, nomID, "Иван")
	third := createFighter(t, c, nomID, "Пётр")

	stageID := stageIDFor(t, c, nomID)
	poolID := createPool(t, c, stageID)
	assignFighter(t, c, stageID, source, poolID)
	assignFighter(t, c, stageID, third, poolID)

	readyReq := connect.NewRequest(&hemav1.SetLayoutStatusRequest{
		StageId: stageID, Status: hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY,
	})
	readyReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.stage.SetLayoutStatus(context.Background(), readyReq); err != nil {
		t.Fatalf("SetLayoutStatus(ready): %v", err)
	}

	boutsBefore := listBoutsForNomination(t, c, nomID)
	if len(boutsBefore) == 0 {
		t.Fatalf("expected at least one bout generated for source/third pair")
	}
	sourceHasBout := false
	for _, b := range boutsBefore {
		if b.FighterA.FighterId == source || b.FighterB.FighterId == source {
			sourceHasBout = true
		}
	}
	if !sourceHasBout {
		t.Fatalf("expected source fighter to appear in at least one generated bout")
	}

	mergeReq := connect.NewRequest(&hemav1.MergeFightersRequest{
		SourceFighterId: source, TargetFighterId: target,
	})
	mergeReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.fighter.MergeFighters(context.Background(), mergeReq); err != nil {
		t.Fatalf("MergeFighters: %v", err)
	}

	// stage: target теперь в пуле, source — нет (репойнт pool_members).
	layout := getLayout(t, c, stageID)
	poolAfter := layout.Pools[0]
	targetInPool, sourceInPool := false, false
	for _, m := range poolAfter.Members {
		if m.FighterId == target {
			targetInPool = true
		}
		if m.FighterId == source {
			sourceInPool = true
		}
	}
	if !targetInPool {
		t.Fatalf("expected target fighter repointed into pool, layout=%+v", layout)
	}
	if sourceInPool {
		t.Fatalf("expected source fighter no longer in pool after merge, layout=%+v", layout)
	}

	// bout: бои, где раньше был source, теперь ссылаются на target.
	boutsAfter := listBoutsForNomination(t, c, nomID)
	for _, b := range boutsAfter {
		if b.FighterA.FighterId == source || b.FighterB.FighterId == source {
			t.Fatalf("expected no bout referencing source fighter after merge: %+v", b)
		}
	}
	targetHasBout := false
	for _, b := range boutsAfter {
		if b.FighterA.FighterId == target || b.FighterB.FighterId == target {
			targetHasBout = true
		}
	}
	if !targetHasBout {
		t.Fatalf("expected target fighter repointed into the bout previously referencing source: %+v", boutsAfter)
	}
}

func listBoutsForNomination(t *testing.T, c clients, nominationID string) []*hemav1.Bout {
	t.Helper()
	req := connect.NewRequest(&hemav1.ListBoutsByNominationRequest{NominationId: nominationID})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.bout.ListBoutsByNomination(context.Background(), req)
	if err != nil {
		t.Fatalf("ListBoutsByNomination: %v", err)
	}
	return res.Msg.Bouts
}
