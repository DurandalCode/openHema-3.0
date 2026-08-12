//go:build integration

// Package integration — сквозные e2e-тесты модуля stage на реальной
// PostgreSQL (testcontainers) через полный Connect-путь: proto-binary →
// интерсепторы → handler → service → repo → SQL → back. См. ADR 0010.
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
	"github.com/hema/server/modules/arena"
	"github.com/hema/server/modules/auth"
	boutmodule "github.com/hema/server/modules/bout"
	"github.com/hema/server/modules/fighter"
	"github.com/hema/server/modules/nomination"
	stagemodule "github.com/hema/server/modules/stage"
	"github.com/hema/server/modules/tournament"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
	"github.com/hema/server/pkg/livebus"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	adminUserID      = "00000000-0000-0000-0000-000000000aaa"
	accessKey        = "integration-access-secret"
	refreshKey       = "integration-refresh-secret"
	seedTournamentID = "00000000-0000-0000-0000-000000000001"
)

type clients struct {
	pool       hemav1connect.StageAdminServiceClient
	poolPublic hemav1connect.StagePublicServiceClient
	fighter    hemav1connect.FighterAdminServiceClient
	nom        hemav1connect.NominationAdminServiceClient
	// nomPublic — публичный NominationService (спека 0021, T22): читает
	// статус номинации (ACTIVE/FINISHED, выведенный из статусов этапов) без
	// admin-токена, тем же путём, что и гость.
	nomPublic hemav1connect.NominationServiceClient
	bout      hemav1connect.BoutAdminServiceClient
	arena     hemav1connect.ArenaAdminServiceClient
}

// setup поднимает PG (testdb.Postgres), применяет миграции всех модулей,
// собирает composition root (реальный пул БД) и возвращает Connect-клиентов
// nomination/fighter/stage admin-сервисов.
func setup(t *testing.T) (clients, *pgxpool.Pool) {
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

	auth.Register(mux, auth.Deps{Pool: pool, Tokens: tokens}, baseOpts, adminOpts)
	tournament.Register(mux, tournament.Deps{Pool: pool}, baseOpts, adminOpts)
	activeTournaments := tournament.NewActiveTournamentIDProvider(pool)
	nomination.Register(mux, nomination.Deps{Pool: pool, Tournaments: activeTournaments}, baseOpts, adminOpts)
	fighterNominations := platform.NewFighterNominationProvider(pool, activeTournaments)
	fighter.Register(mux, fighter.Deps{
		Pool:        pool,
		Nominations: fighterNominations,
		Tournaments: activeTournaments,
	}, baseOpts, adminOpts)

	boutmodule.Register(mux, boutmodule.Deps{Pool: pool}, baseOpts, adminOpts)

	arena.Register(mux, arena.Deps{
		Pool:        pool,
		Tournaments: activeTournaments,
	}, baseOpts, adminOpts)

	stagemodule.Register(mux, stagemodule.Deps{
		Pool:        pool,
		Fighters:    platform.NewStageActiveFightersProvider(pool),
		Bouts:       platform.NewStageBoutConductor(pool),                            // real adapter, not fake (spec 0010/0013)
		Arenas:      platform.NewStageArenaProvider(pool, activeTournaments),         // real adapter, spec 0011
		Nominations: platform.NewStageNominationProvider(pool, activeTournaments),   // real adapter, FR-9 (имя номинации пула)
		LiveBus:     platform.NewStageLiveBus(livebus.New()),                        // real adapter, spec 0014
	}, baseOpts, adminOpts)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	httpClient := server.Client()
	return clients{
		pool:       hemav1connect.NewStageAdminServiceClient(httpClient, server.URL),
		poolPublic: hemav1connect.NewStagePublicServiceClient(httpClient, server.URL),
		fighter:    hemav1connect.NewFighterAdminServiceClient(httpClient, server.URL),
		nom:        hemav1connect.NewNominationAdminServiceClient(httpClient, server.URL),
		nomPublic:  hemav1connect.NewNominationServiceClient(httpClient, server.URL),
		bout:       hemav1connect.NewBoutAdminServiceClient(httpClient, server.URL),
		arena:      hemav1connect.NewArenaAdminServiceClient(httpClient, server.URL),
	}, pool
}

// stageIDFor резолвит id канонического (группового) этапа номинации через
// реальный ListStages (спека 0018, FR-18: материализует групповой этап,
// как и на реальном админском пути) — используется вместо адресации RPC
// раскладки по nominationID напрямую, которая была до 0018.
func stageIDFor(t *testing.T, c clients, nominationID string) string {
	t.Helper()
	req := connect.NewRequest(&hemav1.ListStagesRequest{NominationId: nominationID})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.pool.ListStages(context.Background(), req)
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

func adminBearer(t *testing.T) string {
	t.Helper()
	tokens := jwt.NewManager(accessKey, refreshKey, 15*time.Minute, 720*time.Hour)
	pair, err := tokens.Issue(adminUserID, "admin")
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

func createFighter(t *testing.T, c clients, nominationID, name, club string) string {
	t.Helper()
	req := connect.NewRequest(&hemav1.CreateFighterRequest{
		TournamentId:  seedTournamentID,
		Name:          name,
		Club:          club,
		NominationIds: []string{nominationID},
	})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.fighter.CreateFighter(context.Background(), req)
	if err != nil {
		t.Fatalf("CreateFighter(%s): %v", name, err)
	}
	return res.Msg.Fighter.Id
}

// TestIntegration_MigrationsApplied — косвенно: setup гоняет goose Up для
// всех модулей, включая stage. Если миграции падают, setup валится здесь.
func TestIntegration_MigrationsApplied(t *testing.T) {
	setup(t)
}

func TestIntegration_CreateAssignDistributeGet(t *testing.T) {
	c, _ := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "Клуб А")
	f2 := createFighter(t, c, nomID, "Пётр", "Клуб Б")

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageIDFor(t, c, nomID)})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	if len(created.Msg.Layout.Pools) != 1 || created.Msg.Layout.Pools[0].Name != "Пул 1" {
		t.Fatalf("unexpected layout after create: %+v", created.Msg.Layout)
	}
	poolID := created.Msg.Layout.Pools[0].Id

	assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{
		StageId: stageIDFor(t, c, nomID), FighterId: f1, PoolId: poolID,
	})
	assignReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.AssignFighter(context.Background(), assignReq); err != nil {
		t.Fatalf("AssignFighter: %v", err)
	}

	distReq := connect.NewRequest(&hemav1.AutoDistributeRequest{StageId: stageIDFor(t, c, nomID)})
	distReq.Header().Set("Authorization", adminBearer(t))
	dist, err := c.pool.AutoDistribute(context.Background(), distReq)
	if err != nil {
		t.Fatalf("AutoDistribute: %v", err)
	}
	if len(dist.Msg.Layout.Unassigned) != 0 {
		t.Fatalf("expected all fighters distributed, got %d unassigned", len(dist.Msg.Layout.Unassigned))
	}

	getReq := connect.NewRequest(&hemav1.GetLayoutRequest{StageId: stageIDFor(t, c, nomID)})
	getReq.Header().Set("Authorization", adminBearer(t))
	got, err := c.pool.GetLayout(context.Background(), getReq)
	if err != nil {
		t.Fatalf("GetLayout: %v", err)
	}
	if len(got.Msg.Layout.Pools) != 1 || len(got.Msg.Layout.Pools[0].Members) != 2 {
		t.Fatalf("persisted layout mismatch: %+v", got.Msg.Layout)
	}
	memberIDs := map[string]bool{}
	for _, m := range got.Msg.Layout.Pools[0].Members {
		memberIDs[m.FighterId] = true
	}
	if !memberIDs[f1] || !memberIDs[f2] {
		t.Fatalf("expected both fighters in pool, got %+v", got.Msg.Layout.Pools[0].Members)
	}
}

// TestIntegration_UniqueFighterPerNomination_MoveNotDuplicate проверяет, что
// UNIQUE(nomination_id, fighter_id) в stage.pool_members держит инвариант
// FR-1: перемещение бойца между пулами не оставляет его в двух местах.
func TestIntegration_UniqueFighterPerNomination_MoveNotDuplicate(t *testing.T) {
	c, _ := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "")

	newPool := func() string {
		req := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageIDFor(t, c, nomID)})
		req.Header().Set("Authorization", adminBearer(t))
		res, err := c.pool.CreatePool(context.Background(), req)
		if err != nil {
			t.Fatalf("CreatePool: %v", err)
		}
		return res.Msg.Layout.Pools[len(res.Msg.Layout.Pools)-1].Id
	}
	p1 := newPool()
	p2 := newPool()

	assign := func(poolID string) *hemav1.PoolLayout {
		req := connect.NewRequest(&hemav1.AssignFighterRequest{StageId: stageIDFor(t, c, nomID), FighterId: f1, PoolId: poolID})
		req.Header().Set("Authorization", adminBearer(t))
		res, err := c.pool.AssignFighter(context.Background(), req)
		if err != nil {
			t.Fatalf("AssignFighter: %v", err)
		}
		return res.Msg.Layout
	}

	assign(p1)
	layout := assign(p2) // move p1 -> p2

	total := 0
	for _, p := range layout.Pools {
		total += len(p.Members)
	}
	if total != 1 {
		t.Fatalf("expected fighter present exactly once across pools, got %d (layout=%+v)", total, layout)
	}
}

// TestIntegration_DeletePool_CascadesMembers проверяет, что удаление пула
// каскадом убирает членства (FK ON DELETE CASCADE), бойцы возвращаются в
// нераспределённые.
func TestIntegration_DeletePool_CascadesMembers(t *testing.T) {
	c, _ := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "")

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageIDFor(t, c, nomID)})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	poolID := created.Msg.Layout.Pools[0].Id

	assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{StageId: stageIDFor(t, c, nomID), FighterId: f1, PoolId: poolID})
	assignReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.AssignFighter(context.Background(), assignReq); err != nil {
		t.Fatalf("AssignFighter: %v", err)
	}

	delReq := connect.NewRequest(&hemav1.DeletePoolRequest{PoolId: poolID})
	delReq.Header().Set("Authorization", adminBearer(t))
	del, err := c.pool.DeletePool(context.Background(), delReq)
	if err != nil {
		t.Fatalf("DeletePool: %v", err)
	}
	if len(del.Msg.Layout.Pools) != 0 {
		t.Fatalf("expected pool removed, got %+v", del.Msg.Layout.Pools)
	}
	if len(del.Msg.Layout.Unassigned) != 1 {
		t.Fatalf("expected fighter back in unassigned, got %+v", del.Msg.Layout.Unassigned)
	}

	// Undo восстанавливает пул с прежним членом (снапшот, не FK-каскад).
	undoReq := connect.NewRequest(&hemav1.UndoRequest{StageId: stageIDFor(t, c, nomID)})
	undoReq.Header().Set("Authorization", adminBearer(t))
	undo, err := c.pool.Undo(context.Background(), undoReq)
	if err != nil {
		t.Fatalf("Undo: %v", err)
	}
	if len(undo.Msg.Layout.Pools) != 1 || len(undo.Msg.Layout.Pools[0].Members) != 1 {
		t.Fatalf("expected pool restored with 1 member, got %+v", undo.Msg.Layout)
	}
}

// TestIntegration_UndoReset_RestoresAllPools проверяет, что сброс раскладки
// записывает undo-снапшот всех пулов с членствами, а undo восстанавливает
// все пулы с теми же номерами и бойцами (AC-13a4, инкремент 2026-07-14).
func TestIntegration_UndoReset_RestoresAllPools(t *testing.T) {
	c, _ := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "Клуб А")
	f2 := createFighter(t, c, nomID, "Пётр", "Клуб Б")

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageIDFor(t, c, nomID)})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	pool1ID := created.Msg.Layout.Pools[0].Id

	assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{StageId: stageIDFor(t, c, nomID), FighterId: f1, PoolId: pool1ID})
	assignReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.AssignFighter(context.Background(), assignReq); err != nil {
		t.Fatalf("AssignFighter: %v", err)
	}

	// Создаём второй пул и кладём туда второго бойца.
	createReq2 := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageIDFor(t, c, nomID)})
	createReq2.Header().Set("Authorization", adminBearer(t))
	created2, err := c.pool.CreatePool(context.Background(), createReq2)
	if err != nil {
		t.Fatalf("CreatePool 2: %v", err)
	}
	pool2ID := created2.Msg.Layout.Pools[0].Id
	assignReq2 := connect.NewRequest(&hemav1.AssignFighterRequest{StageId: stageIDFor(t, c, nomID), FighterId: f2, PoolId: pool2ID})
	assignReq2.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.AssignFighter(context.Background(), assignReq2); err != nil {
		t.Fatalf("AssignFighter 2: %v", err)
	}

	// Сбрасываем раскладку — все пулы удаляются, undo доступен.
	resetReq := connect.NewRequest(&hemav1.ResetLayoutRequest{StageId: stageIDFor(t, c, nomID)})
	resetReq.Header().Set("Authorization", adminBearer(t))
	reset, err := c.pool.ResetLayout(context.Background(), resetReq)
	if err != nil {
		t.Fatalf("ResetLayout: %v", err)
	}
	if len(reset.Msg.Layout.Pools) != 0 {
		t.Fatalf("expected all pools removed after reset, got %d", len(reset.Msg.Layout.Pools))
	}
	if !reset.Msg.Layout.CanUndo {
		t.Fatalf("expected CanUndo=true after reset")
	}

	// Undo — восстанавливает все пулы с теми же номерами и бойцами.
	undoReq := connect.NewRequest(&hemav1.UndoRequest{StageId: stageIDFor(t, c, nomID)})
	undoReq.Header().Set("Authorization", adminBearer(t))
	undo, err := c.pool.Undo(context.Background(), undoReq)
	if err != nil {
		t.Fatalf("Undo: %v", err)
	}
	if len(undo.Msg.Layout.Pools) != 2 {
		t.Fatalf("expected 2 pools restored after undo-reset, got %d", len(undo.Msg.Layout.Pools))
	}
	// Проверяем, что все бойцы снова распределены.
	totalMembers := 0
	for _, p := range undo.Msg.Layout.Pools {
		totalMembers += len(p.Members)
	}
	if totalMembers != 2 {
		t.Fatalf("expected 2 members total across restored pools, got %d", totalMembers)
	}
	if len(undo.Msg.Layout.Unassigned) != 0 {
		t.Fatalf("expected 0 unassigned after undo-reset, got %d", len(undo.Msg.Layout.Unassigned))
	}
}

func TestIntegration_NoToken(t *testing.T) {
	c, _ := setup(t)

	_, err := c.pool.GetLayout(context.Background(),
		connect.NewRequest(&hemav1.GetLayoutRequest{StageId: seedTournamentID}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated without token, got %v", connect.CodeOf(err))
	}
}

// ── stage × bout — сквозной путь через internal/platform-адаптер, не через
// fake (spec 0010, T19). Единственное место, реально проверяющее связку
// stage.SetLayoutStatus → StageBoutGenerator → bout-схема через живой PG. ──

func setLayoutStatus(t *testing.T, c clients, nominationID string, status hemav1.PoolLayoutStatus) *hemav1.PoolLayout {
	t.Helper()
	req := connect.NewRequest(&hemav1.SetLayoutStatusRequest{StageId: stageIDFor(t, c, nominationID), Status: status})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.pool.SetLayoutStatus(context.Background(), req)
	if err != nil {
		t.Fatalf("SetLayoutStatus(%v): %v", status, err)
	}
	return res.Msg.Layout
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

// TestIntegration_SetLayoutStatusReady_GeneratesBouts проверяет, что
// перевод раскладки в ready реально формирует бои в схеме bout (через
// живой StageBoutGenerator, не fake) — round-robin по каждому пулу.
func TestIntegration_SetLayoutStatusReady_GeneratesBouts(t *testing.T) {
	c, _ := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "")
	f2 := createFighter(t, c, nomID, "Пётр", "")
	f3 := createFighter(t, c, nomID, "Сидор", "")

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageIDFor(t, c, nomID)})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	poolID := created.Msg.Layout.Pools[0].Id

	for _, fid := range []string{f1, f2, f3} {
		assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{StageId: stageIDFor(t, c, nomID), FighterId: fid, PoolId: poolID})
		assignReq.Header().Set("Authorization", adminBearer(t))
		if _, err := c.pool.AssignFighter(context.Background(), assignReq); err != nil {
			t.Fatalf("AssignFighter(%s): %v", fid, err)
		}
	}

	// До ready — боёв нет.
	if got := listBoutsForNomination(t, c, nomID); len(got) != 0 {
		t.Fatalf("expected 0 bouts before ready, got %d", len(got))
	}

	layout := setLayoutStatus(t, c, nomID, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY)
	if layout.Status != hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY {
		t.Fatalf("expected layout status READY, got %v", layout.Status)
	}

	bouts := listBoutsForNomination(t, c, nomID)
	if len(bouts) != 3 { // C(3,2)
		t.Fatalf("expected 3 bouts (round-robin of 3 fighters), got %d: %+v", len(bouts), bouts)
	}
	for _, b := range bouts {
		if b.PoolId != poolID {
			t.Errorf("bout %s has pool_id=%s, want %s", b.Id, b.PoolId, poolID)
		}
	}
}

// TestIntegration_SetLayoutStatusDraft_ClearsBouts проверяет, что возврат
// раскладки в draft удаляет все ранее сформированные бои номинации (FR-5).
func TestIntegration_SetLayoutStatusDraft_ClearsBouts(t *testing.T) {
	c, _ := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "")
	f2 := createFighter(t, c, nomID, "Пётр", "")

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageIDFor(t, c, nomID)})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	poolID := created.Msg.Layout.Pools[0].Id
	for _, fid := range []string{f1, f2} {
		assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{StageId: stageIDFor(t, c, nomID), FighterId: fid, PoolId: poolID})
		assignReq.Header().Set("Authorization", adminBearer(t))
		if _, err := c.pool.AssignFighter(context.Background(), assignReq); err != nil {
			t.Fatalf("AssignFighter(%s): %v", fid, err)
		}
	}

	setLayoutStatus(t, c, nomID, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY)
	if got := listBoutsForNomination(t, c, nomID); len(got) != 1 {
		t.Fatalf("expected 1 bout after ready, got %d", len(got))
	}

	layout := setLayoutStatus(t, c, nomID, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_DRAFT)
	if layout.Status != hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_DRAFT {
		t.Fatalf("expected layout status DRAFT, got %v", layout.Status)
	}
	if got := listBoutsForNomination(t, c, nomID); len(got) != 0 {
		t.Fatalf("expected 0 bouts after draft, got %d: %+v", len(got), got)
	}
}

// TestIntegration_ReadyAgain_RegeneratesForChangedComposition проверяет
// AC-6: после возврата в draft и правки состава пула повторный ready
// формирует новый набор боёв по актуальному составу, не по старому.
func TestIntegration_ReadyAgain_RegeneratesForChangedComposition(t *testing.T) {
	c, _ := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "")
	f2 := createFighter(t, c, nomID, "Пётр", "")
	f3 := createFighter(t, c, nomID, "Сидор", "")

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageIDFor(t, c, nomID)})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	poolID := created.Msg.Layout.Pools[0].Id

	assign := func(fid string) {
		req := connect.NewRequest(&hemav1.AssignFighterRequest{StageId: stageIDFor(t, c, nomID), FighterId: fid, PoolId: poolID})
		req.Header().Set("Authorization", adminBearer(t))
		if _, err := c.pool.AssignFighter(context.Background(), req); err != nil {
			t.Fatalf("AssignFighter(%s): %v", fid, err)
		}
	}
	assign(f1)
	assign(f2)

	setLayoutStatus(t, c, nomID, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY)
	if got := listBoutsForNomination(t, c, nomID); len(got) != 1 { // C(2,2)
		t.Fatalf("expected 1 bout for 2 fighters, got %d", len(got))
	}

	setLayoutStatus(t, c, nomID, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_DRAFT)
	assign(f3) // состав пула изменился: теперь 3 бойца

	setLayoutStatus(t, c, nomID, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY)
	bouts := listBoutsForNomination(t, c, nomID)
	if len(bouts) != 3 { // C(3,2), не старый C(2,2)
		t.Fatalf("expected 3 bouts after regenerate with 3 fighters, got %d: %+v", len(bouts), bouts)
	}
}

func createArena(t *testing.T, c clients, name string) string {
	t.Helper()
	req := connect.NewRequest(&hemav1.CreateArenaRequest{
		TournamentId: seedTournamentID,
		Name:         name,
	})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.arena.CreateArena(context.Background(), req)
	if err != nil {
		t.Fatalf("CreateArena(%s): %v", name, err)
	}
	return res.Msg.Arena.Id
}

// readyPoolWithOneFighter создаёт номинацию (с уникальным title — заголовок
// номинации уникален в пределах турнира) с одним пулом, одним бойцом в нём и
// фиксирует раскладку (ready) — минимальный «готовый» пул для постановки на
// арену.
func readyPoolWithOneFighter(t *testing.T, c clients, nominationTitle string) (nominationID, poolID string) {
	t.Helper()
	req := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId: seedTournamentID,
		Title:        nominationTitle,
	})
	req.Header().Set("Authorization", adminBearer(t))
	nomRes, err := c.nom.CreateNomination(context.Background(), req)
	if err != nil {
		t.Fatalf("CreateNomination(%s): %v", nominationTitle, err)
	}
	nomID := nomRes.Msg.Nomination.Id
	fID := createFighter(t, c, nomID, "Иван", "")

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageIDFor(t, c, nomID)})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	poolID = created.Msg.Layout.Pools[0].Id

	assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{StageId: stageIDFor(t, c, nomID), FighterId: fID, PoolId: poolID})
	assignReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.AssignFighter(context.Background(), assignReq); err != nil {
		t.Fatalf("AssignFighter: %v", err)
	}

	setLayoutStatus(t, c, nomID, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY)
	return nomID, poolID
}

// TestIntegration_SeatPoolOnArena_UniqueIndexBlocksSecondPool проверяет
// инвариант «одна арена ↔ один пул за раз» (спека 0011, FR-6, NFR-4) на
// уровне данных: partial unique index uq_pools_arena. Два готовых пула
// пытаются встать на одну и ту же арену — второй запрос отклоняется, первый
// пул остаётся на площадке.
func TestIntegration_SeatPoolOnArena_UniqueIndexBlocksSecondPool(t *testing.T) {
	c, _ := setup(t)
	arenaID := createArena(t, c, "Ристалище 1")

	_, pool1 := readyPoolWithOneFighter(t, c, "Лонгсорд")
	_, pool2 := readyPoolWithOneFighter(t, c, "Меч-баклер")

	seat := func(poolID string) error {
		req := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: poolID, ArenaId: arenaID})
		req.Header().Set("Authorization", adminBearer(t))
		_, err := c.pool.SeatPoolOnArena(context.Background(), req)
		return err
	}

	if err := seat(pool1); err != nil {
		t.Fatalf("SeatPoolOnArena(pool1): %v", err)
	}
	err := seat(pool2)
	if err == nil {
		t.Fatal("expected SeatPoolOnArena(pool2) to fail: arena already occupied by pool1")
	}
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("expected FailedPrecondition, got %v: %v", connect.CodeOf(err), err)
	}

	getReq := connect.NewRequest(&hemav1.GetPoolsForArenaRequest{ArenaId: arenaID})
	getReq.Header().Set("Authorization", adminBearer(t))
	got, err := c.pool.GetPoolsForArena(context.Background(), getReq)
	if err != nil {
		t.Fatalf("GetPoolsForArena: %v", err)
	}
	if got.Msg.Seated == nil || got.Msg.Seated.Id != pool1 {
		t.Fatalf("expected pool1 (%s) still seated on arena, got %+v", pool1, got.Msg.Seated)
	}
}

// TestIntegration_ConductBout_FullLifecycle прогоняет ведение боя через
// реальный путь pool×bout (спека 0013): постановка на арену, старт боя,
// счёт, завершение с авто-продвижением текущего боя (AC-5), пересчёт
// статуса пула из живого PoolBoutConductor (preparing→active→finished,
// AC-9/AC-10), снятие с арены с сохранением результата (AC-11) и гейт
// расфиксации раскладки при наличии проведённых боёв (AC-12).
func TestIntegration_ConductBout_FullLifecycle(t *testing.T) {
	c, _ := setup(t)
	arenaID := createArena(t, c, "Ристалище 1")

	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "")
	f2 := createFighter(t, c, nomID, "Пётр", "")

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageIDFor(t, c, nomID)})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	poolID := created.Msg.Layout.Pools[0].Id
	for _, fid := range []string{f1, f2} {
		assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{StageId: stageIDFor(t, c, nomID), FighterId: fid, PoolId: poolID})
		assignReq.Header().Set("Authorization", adminBearer(t))
		if _, err := c.pool.AssignFighter(context.Background(), assignReq); err != nil {
			t.Fatalf("AssignFighter(%s): %v", fid, err)
		}
	}
	setLayoutStatus(t, c, nomID, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY)

	seatReq := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: poolID, ArenaId: arenaID})
	seatReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.SeatPoolOnArena(context.Background(), seatReq); err != nil {
		t.Fatalf("SeatPoolOnArena: %v", err)
	}

	board := func() *hemav1.BoutBoard {
		req := connect.NewRequest(&hemav1.GetBoutBoardRequest{ArenaId: arenaID})
		req.Header().Set("Authorization", adminBearer(t))
		res, err := c.pool.GetBoutBoard(context.Background(), req)
		if err != nil {
			t.Fatalf("GetBoutBoard: %v", err)
		}
		return res.Msg.Board
	}

	b := board()
	if b == nil || b.Pool == nil || len(b.Bouts) != 1 {
		t.Fatalf("expected a board with 1 bout for 2 fighters, got %+v", b)
	}
	if b.Pool.Status != hemav1.PoolStatus_POOL_STATUS_PREPARING {
		t.Fatalf("expected PREPARING before any bout starts, got %v", b.Pool.Status)
	}
	boutID := b.CurrentBoutId
	if boutID == "" {
		t.Fatal("expected a current bout to be auto-selected")
	}

	startReq := connect.NewRequest(&hemav1.StartCurrentBoutRequest{PoolId: poolID})
	startReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.StartCurrentBout(context.Background(), startReq); err != nil {
		t.Fatalf("StartCurrentBout: %v", err)
	}
	if b := board(); b.Pool.Status != hemav1.PoolStatus_POOL_STATUS_ACTIVE {
		t.Fatalf("expected ACTIVE after starting the only bout, got %v", b.Pool.Status)
	}

	scoreReq := connect.NewRequest(&hemav1.ScoreCurrentBoutRequest{PoolId: poolID, ScoreA: 5, ScoreB: 3})
	scoreReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.ScoreCurrentBout(context.Background(), scoreReq); err != nil {
		t.Fatalf("ScoreCurrentBout: %v", err)
	}

	finishReq := connect.NewRequest(&hemav1.FinishCurrentBoutRequest{PoolId: poolID})
	finishReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.FinishCurrentBout(context.Background(), finishReq); err != nil {
		t.Fatalf("FinishCurrentBout: %v", err)
	}

	final := board()
	if final.Pool.Status != hemav1.PoolStatus_POOL_STATUS_FINISHED {
		t.Fatalf("expected FINISHED once the only bout is finished, got %v", final.Pool.Status)
	}
	if final.CurrentBoutId != "" {
		t.Fatalf("expected no current bout left to advance to, got %q", final.CurrentBoutId)
	}
	if len(final.Bouts) != 1 || final.Bouts[0].Id != boutID ||
		final.Bouts[0].State != hemav1.BoutState_BOUT_STATE_FINISHED ||
		final.Bouts[0].ScoreA != 5 || final.Bouts[0].ScoreB != 3 {
		t.Fatalf("expected the finished bout to keep its score, got %+v", final.Bouts)
	}

	// AC-11: снятие пула с результатами — результаты сохраняются.
	unseatReq := connect.NewRequest(&hemav1.UnseatPoolRequest{PoolId: poolID})
	unseatReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.UnseatPool(context.Background(), unseatReq); err != nil {
		t.Fatalf("UnseatPool: %v", err)
	}
	getLayoutReq := connect.NewRequest(&hemav1.GetLayoutRequest{StageId: stageIDFor(t, c, nomID)})
	getLayoutReq.Header().Set("Authorization", adminBearer(t))
	layoutRes, err := c.pool.GetLayout(context.Background(), getLayoutReq)
	if err != nil {
		t.Fatalf("GetLayout: %v", err)
	}
	if layoutRes.Msg.Layout.Pools[0].Status != hemav1.PoolStatus_POOL_STATUS_FINISHED {
		t.Fatalf("expected pool to stay FINISHED after unseat, got %v", layoutRes.Msg.Layout.Pools[0].Status)
	}
	if layoutRes.Msg.Layout.Pools[0].ArenaId != "" {
		t.Fatalf("expected arena_id cleared after unseat, got %q", layoutRes.Msg.Layout.Pools[0].ArenaId)
	}

	// AC-12: раскладку с проведённым боем нельзя вернуть в draft, даже
	// после снятия пула с арены (результаты защищены).
	draftReq := connect.NewRequest(&hemav1.SetLayoutStatusRequest{StageId: stageIDFor(t, c, nomID), Status: hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_DRAFT})
	draftReq.Header().Set("Authorization", adminBearer(t))
	_, err = c.pool.SetLayoutStatus(context.Background(), draftReq)
	if err == nil {
		t.Fatal("expected SetLayoutStatus(draft) to fail: nomination has a finished bout")
	}
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("expected FailedPrecondition, got %v: %v", connect.CodeOf(err), err)
	}
}

// TestIntegration_GetNominationLive_ReflectsConductedBout прогоняет тот же
// сценарий ведения боя, что и TestIntegration_ConductBout_FullLifecycle
// (спека 0013), но проверяет публичный живой снапшот (спека 0014,
// StagePublicService.GetNominationLive) через реальный Connect × реальный
// PG: draft ⇒ пустой снапшот (FR-12); после постановки на арену и
// проведения боя — снапшот несёт состояние/счёт/исход боя и исполнительный
// статус/площадку пула, без токена (публичный сервис).
func TestIntegration_GetNominationLive_ReflectsConductedBout(t *testing.T) {
	c, _ := setup(t)
	arenaID := createArena(t, c, "Ристалище 1")

	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "")
	f2 := createFighter(t, c, nomID, "Пётр", "")

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageIDFor(t, c, nomID)})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	poolID := created.Msg.Layout.Pools[0].Id
	for _, fid := range []string{f1, f2} {
		assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{StageId: stageIDFor(t, c, nomID), FighterId: fid, PoolId: poolID})
		assignReq.Header().Set("Authorization", adminBearer(t))
		if _, err := c.pool.AssignFighter(context.Background(), assignReq); err != nil {
			t.Fatalf("AssignFighter(%s): %v", fid, err)
		}
	}

	// draft: живой снапшот пуст (FR-12), как и ListPublicPools.
	live := func() *hemav1.NominationLiveSnapshot {
		req := connect.NewRequest(&hemav1.GetNominationLiveRequest{NominationId: nomID})
		res, err := c.poolPublic.GetNominationLive(context.Background(), req)
		if err != nil {
			t.Fatalf("GetNominationLive: %v", err)
		}
		return res.Msg.Snapshot
	}
	if got := live(); len(got.Pools) != 0 {
		t.Fatalf("expected empty live snapshot while draft, got %d pools", len(got.Pools))
	}

	setLayoutStatus(t, c, nomID, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY)

	seatReq := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: poolID, ArenaId: arenaID})
	seatReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.SeatPoolOnArena(context.Background(), seatReq); err != nil {
		t.Fatalf("SeatPoolOnArena: %v", err)
	}

	snap := live()
	if len(snap.Pools) != 1 {
		t.Fatalf("expected 1 live pool after seating, got %d", len(snap.Pools))
	}
	lp := snap.Pools[0]
	if lp.Pool.Status != hemav1.PoolStatus_POOL_STATUS_PREPARING || lp.Pool.ArenaId != arenaID {
		t.Fatalf("expected PREPARING pool seated on %s, got status=%v arena=%q", arenaID, lp.Pool.Status, lp.Pool.ArenaId)
	}
	if len(lp.Bouts) != 1 || lp.Bouts[0].State != hemav1.BoutState_BOUT_STATE_NOT_STARTED {
		t.Fatalf("expected 1 not-started bout in live snapshot, got %+v", lp.Bouts)
	}
	boutID := lp.CurrentBoutId
	if boutID == "" {
		t.Fatal("expected a current bout in the live snapshot")
	}

	startReq := connect.NewRequest(&hemav1.StartCurrentBoutRequest{PoolId: poolID})
	startReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.StartCurrentBout(context.Background(), startReq); err != nil {
		t.Fatalf("StartCurrentBout: %v", err)
	}
	scoreReq := connect.NewRequest(&hemav1.ScoreCurrentBoutRequest{PoolId: poolID, ScoreA: 5, ScoreB: 3})
	scoreReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.ScoreCurrentBout(context.Background(), scoreReq); err != nil {
		t.Fatalf("ScoreCurrentBout: %v", err)
	}

	// Пока бой идёт: живой снапшот несёт актуальный счёт и статус пула ACTIVE.
	mid := live().Pools[0]
	if mid.Pool.Status != hemav1.PoolStatus_POOL_STATUS_ACTIVE {
		t.Fatalf("expected ACTIVE while bout in progress, got %v", mid.Pool.Status)
	}
	if mid.Bouts[0].State != hemav1.BoutState_BOUT_STATE_IN_PROGRESS || mid.Bouts[0].ScoreA != 5 || mid.Bouts[0].ScoreB != 3 {
		t.Fatalf("expected in-progress bout with live score 5:3, got %+v", mid.Bouts[0])
	}

	finishReq := connect.NewRequest(&hemav1.FinishCurrentBoutRequest{PoolId: poolID})
	finishReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.FinishCurrentBout(context.Background(), finishReq); err != nil {
		t.Fatalf("FinishCurrentBout: %v", err)
	}

	final := live().Pools[0]
	if final.Pool.Status != hemav1.PoolStatus_POOL_STATUS_FINISHED {
		t.Fatalf("expected FINISHED pool once its only bout is finished, got %v", final.Pool.Status)
	}
	if final.CurrentBoutId != "" {
		t.Fatalf("expected no current bout left, got %q", final.CurrentBoutId)
	}
	if len(final.Bouts) != 1 || final.Bouts[0].Id != boutID ||
		final.Bouts[0].State != hemav1.BoutState_BOUT_STATE_FINISHED ||
		final.Bouts[0].ScoreA != 5 || final.Bouts[0].ScoreB != 3 {
		t.Fatalf("expected the finished bout to keep score 5:3 in the live snapshot, got %+v", final.Bouts)
	}
}

// ── Спека 0017: этапные инварианты на уровне БД (uq_members_stage_fighter,
// uq_pools_stage_number, каскад stage → pools → members). Второй этап нигде
// не создаётся через интерфейс в этом инкременте (FR-12) — заводится прямой
// вставкой в stage.stages поверх реального пула соединений (Postgres из
// testdb.Postgres, тот же, что использует composition root). ──

// insertStage вставляет второй этап номинации напрямую в БД — единственный
// способ получить состояние «у номинации два этапа» без RPC (спека 0017,
// «Вне скоупа»: создание этапов через интерфейс — план 0020).
func insertStage(t *testing.T, pool *pgxpool.Pool, nominationID string, position int, title string) string {
	t.Helper()
	var stageID string
	err := pool.QueryRow(context.Background(),
		`INSERT INTO stage.stages (nomination_id, position, title, type, status)
		 VALUES ($1, $2, $3, 'groups', 'ready') RETURNING id`,
		nominationID, position, title,
	).Scan(&stageID)
	if err != nil {
		t.Fatalf("insert stage: %v", err)
	}
	return stageID
}

// insertPoolInStage вставляет пул с заданным number в указанный этап.
func insertPoolInStage(t *testing.T, pool *pgxpool.Pool, stageID, nominationID string, number int) string {
	t.Helper()
	var poolID string
	err := pool.QueryRow(context.Background(),
		`INSERT INTO stage.pools (stage_id, nomination_id, number) VALUES ($1, $2, $3) RETURNING id`,
		stageID, nominationID, number,
	).Scan(&poolID)
	if err != nil {
		t.Fatalf("insert pool in stage: %v", err)
	}
	return poolID
}

// insertMember вставляет членство бойца в пуле; возвращает ошибку без
// t.Fatalf — вызывающий сам решает, ожидается ли она (проверка уникальности).
func insertMember(pool *pgxpool.Pool, poolID, stageID, nominationID, fighterID string) error {
	_, err := pool.Exec(context.Background(),
		`INSERT INTO stage.pool_members (pool_id, stage_id, nomination_id, fighter_id)
		 VALUES ($1, $2, $3, $4)`,
		poolID, stageID, nominationID, fighterID,
	)
	return err
}

// TestIntegration_SecondStage_SameFighterAllowed_SecondPoolInStageBlocked
// проверяет этапный (не номинационный) инвариант членства (спека 0017,
// FR-7): uq_members_stage_fighter разрешает того же бойца в пуле ВТОРОГО
// этапа той же номинации (это и есть будущий переход групп → плейофф — не
// нарушение), но по-прежнему запрещает второй пул ВНУТРИ одного этапа.
func TestIntegration_SecondStage_SameFighterAllowed_SecondPoolInStageBlocked(t *testing.T) {
	c, pool := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "")

	// Этап 1 (канонический) — через RPC, боец уже в нём.
	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageIDFor(t, c, nomID)})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	stage1PoolID := created.Msg.Layout.Pools[0].Id
	assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{StageId: stageIDFor(t, c, nomID), FighterId: f1, PoolId: stage1PoolID})
	assignReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.AssignFighter(context.Background(), assignReq); err != nil {
		t.Fatalf("AssignFighter (stage 1): %v", err)
	}

	// Этап 2 — заведён напрямую в БД (FR-12).
	stage2ID := insertStage(t, pool, nomID, 1, "Плейофф (заглушка для теста)")
	stage2PoolA := insertPoolInStage(t, pool, stage2ID, nomID, 1)

	// Тот же боец в пуле ДРУГОГО этапа — допустимо (FR-7).
	if err := insertMember(pool, stage2PoolA, stage2ID, nomID, f1); err != nil {
		t.Fatalf("expected same fighter allowed in a different stage's pool, got error: %v", err)
	}

	// Тот же боец во ВТОРОМ пуле ТОГО ЖЕ этапа — запрещено
	// (uq_members_stage_fighter, инвариант не ослаблен).
	stage2PoolB := insertPoolInStage(t, pool, stage2ID, nomID, 2)
	if err := insertMember(pool, stage2PoolB, stage2ID, nomID, f1); err == nil {
		t.Fatalf("expected uq_members_stage_fighter to block a second pool within the same stage")
	}
}

// TestIntegration_SecondStage_SamePoolNumberAllowed проверяет, что
// uq_pools_stage_number разрешает одинаковые номера пулов в разных этапах
// одной номинации (спека 0017: нумерация — по этапу, не по номинации).
func TestIntegration_SecondStage_SamePoolNumberAllowed(t *testing.T) {
	c, pool := setup(t)
	nomID := createNomination(t, c)

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageIDFor(t, c, nomID)})
	createReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.CreatePool(context.Background(), createReq); err != nil {
		t.Fatalf("CreatePool (stage 1): %v", err)
	}
	// Пул номер 1 уже существует в этапе 1 (генерируется системой, спека
	// 0009). Заводим второй этап с пулом того же номера 1 — не должно
	// конфликтовать (уникальность — (stage_id, number), не
	// (nomination_id, number)).
	stage2ID := insertStage(t, pool, nomID, 1, "Плейофф (заглушка для теста)")
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO stage.pools (stage_id, nomination_id, number) VALUES ($1, $2, 1)`,
		stage2ID, nomID,
	); err != nil {
		t.Fatalf("expected pool number 1 allowed in a second stage, got error: %v", err)
	}
}

// TestIntegration_DeleteStage_CascadesPoolsAndMembers проверяет каскад
// FK stage.pools.stage_id / stage.pool_members.pool_id → ON DELETE CASCADE:
// удаление строки этапа сносит его пулы и членства (спека 0017, миграция
// 00001_init.sql).
func TestIntegration_DeleteStage_CascadesPoolsAndMembers(t *testing.T) {
	c, pool := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Пётр", "")

	stageID := insertStage(t, pool, nomID, 1, "Этап на удаление")
	poolID := insertPoolInStage(t, pool, stageID, nomID, 1)
	if err := insertMember(pool, poolID, stageID, nomID, f1); err != nil {
		t.Fatalf("insert member: %v", err)
	}

	if _, err := pool.Exec(context.Background(), `DELETE FROM stage.stages WHERE id = $1`, stageID); err != nil {
		t.Fatalf("delete stage: %v", err)
	}

	var poolCount, memberCount int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM stage.pools WHERE stage_id = $1`, stageID,
	).Scan(&poolCount); err != nil {
		t.Fatalf("count pools: %v", err)
	}
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM stage.pool_members WHERE stage_id = $1`, stageID,
	).Scan(&memberCount); err != nil {
		t.Fatalf("count members: %v", err)
	}
	if poolCount != 0 || memberCount != 0 {
		t.Fatalf("expected cascade delete of pools and members, got pools=%d members=%d", poolCount, memberCount)
	}
}

// ── Спека 0018: миграция 00002_bracket.sql — этап-сетка на живом PG. ──

// TestIntegration_ChkStagesBracket_RejectsGroupsWithSize проверяет
// chk_stages_bracket (миграция 00002): групповой этап с ненулевым
// bracket_size — нарушение констрейнта на уровне данных, не только
// сервисной валидации.
func TestIntegration_ChkStagesBracket_RejectsGroupsWithSize(t *testing.T) {
	c, pool := setup(t)
	nomID := createNomination(t, c)

	_, err := pool.Exec(context.Background(),
		`INSERT INTO stage.stages (nomination_id, position, title, type, status, bracket_size)
		 VALUES ($1, 1, 'Невалидный групповой', 'groups', 'draft', 4)`,
		nomID,
	)
	if err == nil {
		t.Fatal("expected chk_stages_bracket to reject a groups stage with bracket_size != 0")
	}

	// А корректная сетка (тип bracket, допустимый размер) — проходит.
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO stage.stages (nomination_id, position, title, type, status, bracket_size)
		 VALUES ($1, 1, 'Плейофф', 'bracket', 'draft', 8)`,
		nomID,
	); err != nil {
		t.Fatalf("expected a valid bracket stage to be accepted, got error: %v", err)
	}
}

// TestIntegration_UqMembersPoolSlot_BlocksDuplicateSlot проверяет
// uq_members_pool_slot (миграция 00002): два бойца не могут занимать один
// и тот же слот одного контейнера на уровне данных.
func TestIntegration_UqMembersPoolSlot_BlocksDuplicateSlot(t *testing.T) {
	c, pool := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "")
	f2 := createFighter(t, c, nomID, "Пётр", "")

	var stageID string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO stage.stages (nomination_id, position, title, type, status, bracket_size)
		 VALUES ($1, 1, 'Плейофф', 'bracket', 'draft', 4) RETURNING id`,
		nomID,
	).Scan(&stageID); err != nil {
		t.Fatalf("insert bracket stage: %v", err)
	}
	var containerID string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO stage.pools (stage_id, nomination_id, number) VALUES ($1, $2, 1) RETURNING id`,
		stageID, nomID,
	).Scan(&containerID); err != nil {
		t.Fatalf("insert container: %v", err)
	}

	if _, err := pool.Exec(context.Background(),
		`INSERT INTO stage.pool_members (pool_id, stage_id, nomination_id, fighter_id, slot) VALUES ($1, $2, $3, $4, 1)`,
		containerID, stageID, nomID, f1,
	); err != nil {
		t.Fatalf("insert first member at slot 1: %v", err)
	}
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO stage.pool_members (pool_id, stage_id, nomination_id, fighter_id, slot) VALUES ($1, $2, $3, $4, 1)`,
		containerID, stageID, nomID, f2,
	); err == nil {
		t.Fatal("expected uq_members_pool_slot to reject a second fighter at the same slot")
	}
}

// bracketAdminHelpers группирует вызовы новых RPC сетки через реальный
// Connect × реальный PG (спека 0018, T19).
func createBracketStage(t *testing.T, c clients, nomID, title string, size int32, thirdPlace bool) *hemav1.Stage {
	t.Helper()
	req := connect.NewRequest(&hemav1.CreateStageRequest{
		NominationId: nomID, Type: hemav1.StageType_STAGE_TYPE_BRACKET, Title: title,
		Bracket: &hemav1.BracketConfig{Size: size, ThirdPlace: thirdPlace},
	})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.pool.CreateStage(context.Background(), req)
	if err != nil {
		t.Fatalf("CreateStage: %v", err)
	}
	return res.Msg.Created
}

func seedBracketSlot(t *testing.T, c clients, stageID string, slot int32, fighterID string) *hemav1.Bracket {
	t.Helper()
	req := connect.NewRequest(&hemav1.SeedBracketSlotRequest{StageId: stageID, Slot: slot, FighterId: fighterID})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.pool.SeedBracketSlot(context.Background(), req)
	if err != nil {
		t.Fatalf("SeedBracketSlot(slot=%d): %v", slot, err)
	}
	return res.Msg.Bracket
}

func setBracketStatus(t *testing.T, c clients, stageID string, status hemav1.PoolLayoutStatus) *hemav1.PoolLayout {
	t.Helper()
	req := connect.NewRequest(&hemav1.SetLayoutStatusRequest{StageId: stageID, Status: status})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.pool.SetLayoutStatus(context.Background(), req)
	if err != nil {
		t.Fatalf("SetLayoutStatus(%v): %v", status, err)
	}
	return res.Msg.Layout
}

// TestIntegration_DeleteStage_CascadesBracketContainersAndMembers прогоняет
// удаление этапа-сетки через реальный CreateStage/DeleteStage (FR-3):
// контейнеры первого круга и посев уходят каскадом FK (та же миграция
// 00001, что и для групп — 00002 её не меняет).
func TestIntegration_DeleteStage_CascadesBracketContainersAndMembers(t *testing.T) {
	c, pool := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "")

	stage := createBracketStage(t, c, nomID, "Плейофф", 4, false)
	seedBracketSlot(t, c, stage.Id, 1, f1)

	delReq := connect.NewRequest(&hemav1.DeleteStageRequest{StageId: stage.Id})
	delReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.DeleteStage(context.Background(), delReq); err != nil {
		t.Fatalf("DeleteStage: %v", err)
	}

	var poolCount, memberCount, stageCount int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM stage.pools WHERE stage_id = $1`, stage.Id,
	).Scan(&poolCount); err != nil {
		t.Fatalf("count pools: %v", err)
	}
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM stage.pool_members WHERE stage_id = $1`, stage.Id,
	).Scan(&memberCount); err != nil {
		t.Fatalf("count members: %v", err)
	}
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM stage.stages WHERE id = $1`, stage.Id,
	).Scan(&stageCount); err != nil {
		t.Fatalf("count stages: %v", err)
	}
	if poolCount != 0 || memberCount != 0 || stageCount != 0 {
		t.Fatalf("expected cascade delete of stage/containers/members, got stages=%d pools=%d members=%d", stageCount, poolCount, memberCount)
	}
}

// TestIntegration_BracketSeeding_SurvivesLockAndUnlock проверяет посев на
// реальном PG через полный цикл фиксации: draft → ready материализует бой
// круга 1 и создаёт контейнер финала; ready → draft удаляет контейнер
// финала и его бой, но посев первого круга остаётся нетронутым (спека
// 0018, FR-10, план «service/bracket.go»).
func TestIntegration_BracketSeeding_SurvivesLockAndUnlock(t *testing.T) {
	c, pool := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "")
	f2 := createFighter(t, c, nomID, "Пётр", "")

	stage := createBracketStage(t, c, nomID, "Плейофф", 4, false)
	seedBracketSlot(t, c, stage.Id, 1, f1)
	seedBracketSlot(t, c, stage.Id, 2, f2)

	countContainers := func() int {
		var n int
		if err := pool.QueryRow(context.Background(),
			`SELECT count(*) FROM stage.pools WHERE stage_id = $1`, stage.Id,
		).Scan(&n); err != nil {
			t.Fatalf("count containers: %v", err)
		}
		return n
	}
	if got := countContainers(); got != 2 {
		t.Fatalf("expected 2 first-round containers before lock, got %d", got)
	}

	setBracketStatus(t, c, stage.Id, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY)
	if got := countContainers(); got != 3 { // round1 x2 + final
		t.Fatalf("expected 3 containers after lock, got %d", got)
	}

	getReq := connect.NewRequest(&hemav1.GetBracketRequest{StageId: stage.Id})
	getReq.Header().Set("Authorization", adminBearer(t))
	got, err := c.pool.GetBracket(context.Background(), getReq)
	if err != nil {
		t.Fatalf("GetBracket: %v", err)
	}
	pair := got.Msg.Bracket.Rounds[0].Halves[0].Pairs[0]
	if pair.SlotA.Fighter.FighterId != f1 || pair.SlotB.Fighter.FighterId != f2 {
		t.Fatalf("expected the seeded pair f1 vs f2, got %+v", pair)
	}
	if pair.Bout == nil {
		t.Fatalf("expected the first-round pair to be materialized as a bout, got %+v", pair)
	}

	setBracketStatus(t, c, stage.Id, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_DRAFT)
	if got := countContainers(); got != 2 {
		t.Fatalf("expected round >= 2 containers removed after unlock, got %d", got)
	}

	getReq2 := connect.NewRequest(&hemav1.GetBracketRequest{StageId: stage.Id})
	getReq2.Header().Set("Authorization", adminBearer(t))
	got2, err := c.pool.GetBracket(context.Background(), getReq2)
	if err != nil {
		t.Fatalf("GetBracket after unlock: %v", err)
	}
	pair2 := got2.Msg.Bracket.Rounds[0].Halves[0].Pairs[0]
	if pair2.SlotA.Fighter.FighterId != f1 || pair2.SlotB.Fighter.FighterId != f2 {
		t.Fatalf("expected the seed to survive unlock, got %+v", pair2)
	}
	if pair2.Bout != nil {
		t.Fatalf("expected the round1 bout to be cleared on unlock, got %+v", pair2)
	}
}
