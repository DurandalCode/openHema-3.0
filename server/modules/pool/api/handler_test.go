package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/pool/domain"
	"github.com/hema/server/modules/pool/service"
	"github.com/hema/server/modules/pool/testutil"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
)

const n1 = "11111111-1111-1111-1111-111111111111"

// setup поднимает реальный Connect-хендлер PoolAdminService с fake-репо и
// fake-провайдером активного ростера. Конфигурация повторяет прод-сетап:
// глобально Auth (валидация Bearer), на сервис — RequireAdmin. Тонкая
// обёртка над setupFull — для существующих (0009/0010) тестов, которым не
// нужен публичный клиент/fake-арены.
func setup(t *testing.T) (hemav1connect.PoolAdminServiceClient, *testutil.FakeRepo, *testutil.FakeActiveFightersProvider) {
	t.Helper()
	admin, _, repo, fighters, _, _, _, _ := setupFull(t)
	return admin, repo, fighters
}

// setupFull — как setup, но дополнительно монтирует PoolPublicService (без
// RequireAdmin, спека 0011) и возвращает публичный клиент, fake-провайдер
// арен, fake-провайдер номинаций (резолв имени номинации пула, FR-9) и
// fake-кондуктор боёв (спека 0013: ведение текущего боя на fake BoutConductor).
func setupFull(t *testing.T) (
	hemav1connect.PoolAdminServiceClient,
	hemav1connect.PoolPublicServiceClient,
	*testutil.FakeRepo,
	*testutil.FakeActiveFightersProvider,
	*testutil.FakeArenaProvider,
	*testutil.FakeNominationProvider,
	*testutil.FakeBoutConductor,
	*testutil.FakeLiveBus,
) {
	t.Helper()

	repo := testutil.NewFakeRepo()
	fighters := testutil.NewFakeActiveFightersProvider()
	bouts := testutil.NewFakeBoutConductor()
	arenas := testutil.NewFakeArenaProvider()
	nominations := testutil.NewFakeNominationProvider()
	liveBus := testutil.NewFakeLiveBus()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	svc := service.New(repo, fighters, bouts, arenas, nominations, liveBus)
	adminHandler := NewAdminHandler(svc)
	publicHandler := NewPublicHandler(svc)

	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.Auth(tokens)),
	}
	adminOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.RequireAdmin()),
	}

	adminPath, adminH := hemav1connect.NewPoolAdminServiceHandler(adminHandler, append(baseOpts, adminOpts...)...)
	publicPath, publicH := hemav1connect.NewPoolPublicServiceHandler(publicHandler, baseOpts...)

	mux := http.NewServeMux()
	mux.Handle(adminPath, adminH)
	mux.Handle(publicPath, publicH)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	adminClient := hemav1connect.NewPoolAdminServiceClient(client, server.URL)
	publicClient := hemav1connect.NewPoolPublicServiceClient(client, server.URL)
	return adminClient, publicClient, repo, fighters, arenas, nominations, bouts, liveBus
}

func adminBearer(t *testing.T) string {
	t.Helper()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	pair, err := tokens.Issue("00000000-0000-0000-0000-000000000aaa", "admin")
	if err != nil {
		t.Fatalf("issue admin token: %v", err)
	}
	return "Bearer " + pair.Access
}

func userBearer(t *testing.T) string {
	t.Helper()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	pair, err := tokens.Issue("user-id", "user")
	if err != nil {
		t.Fatalf("issue user token: %v", err)
	}
	return "Bearer " + pair.Access
}

func TestGetLayout_E2E(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1", Name: "A", Club: "X"})

	req := connect.NewRequest(&hemav1.GetLayoutRequest{NominationId: n1})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.GetLayout(context.Background(), req)
	if err != nil {
		t.Fatalf("GetLayout: %v", err)
	}
	if res.Msg.Layout.Status != hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_DRAFT {
		t.Errorf("Status = %v", res.Msg.Layout.Status)
	}
	if len(res.Msg.Layout.Unassigned) != 1 {
		t.Errorf("Unassigned len = %d, want 1", len(res.Msg.Layout.Unassigned))
	}
}

func TestGetLayout_E2E_EmptyNominationIDReturnsInvalidArgument(t *testing.T) {
	admin, _, _ := setup(t)

	req := connect.NewRequest(&hemav1.GetLayoutRequest{NominationId: ""})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.GetLayout(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestGetLayout_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	admin, _, _ := setup(t)

	_, err := admin.GetLayout(context.Background(), connect.NewRequest(&hemav1.GetLayoutRequest{NominationId: n1}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestGetLayout_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	admin, _, _ := setup(t)

	req := connect.NewRequest(&hemav1.GetLayoutRequest{NominationId: n1})
	req.Header().Set("Authorization", userBearer(t))

	_, err := admin.GetLayout(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestCreatePool_E2E(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1)

	req := connect.NewRequest(&hemav1.CreatePoolRequest{NominationId: n1})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.CreatePool(context.Background(), req)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	if len(res.Msg.Layout.Pools) != 1 {
		t.Fatalf("Pools len = %d, want 1", len(res.Msg.Layout.Pools))
	}
	if res.Msg.Layout.Pools[0].Name != "Пул 1" {
		t.Errorf("Name = %q, want %q", res.Msg.Layout.Pools[0].Name, "Пул 1")
	}
	if res.Msg.Layout.Pools[0].Number != 1 {
		t.Errorf("Number = %d, want 1", res.Msg.Layout.Pools[0].Number)
	}
}

func TestCreatePool_E2E_ForbiddenInReadyReturnsFailedPrecondition(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1)
	repo.SeedStatus(n1, domain.LayoutReady)

	req := connect.NewRequest(&hemav1.CreatePoolRequest{NominationId: n1})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.CreatePool(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("expected CodeFailedPrecondition, got %v", connect.CodeOf(err))
	}
}

func TestDeletePool_E2E(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1, domain.FighterRef{ID: "b1"})
	poolID := repo.SeedPool(n1, 1, "b1")

	req := connect.NewRequest(&hemav1.DeletePoolRequest{PoolId: poolID})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.DeletePool(context.Background(), req)
	if err != nil {
		t.Fatalf("DeletePool: %v", err)
	}
	if len(res.Msg.Layout.Pools) != 0 {
		t.Errorf("Pools len = %d, want 0", len(res.Msg.Layout.Pools))
	}
	if len(res.Msg.Layout.Unassigned) != 1 {
		t.Errorf("Unassigned len = %d, want 1", len(res.Msg.Layout.Unassigned))
	}
}

func TestDeletePool_E2E_NotFound(t *testing.T) {
	admin, _, _ := setup(t)

	req := connect.NewRequest(&hemav1.DeletePoolRequest{PoolId: "does-not-exist"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.DeletePool(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestResetLayout_E2E(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1, domain.FighterRef{ID: "b1"})
	repo.SeedPool(n1, 1, "b1")

	req := connect.NewRequest(&hemav1.ResetLayoutRequest{NominationId: n1})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.ResetLayout(context.Background(), req)
	if err != nil {
		t.Fatalf("ResetLayout: %v", err)
	}
	if len(res.Msg.Layout.Pools) != 0 {
		t.Errorf("Pools len = %d, want 0", len(res.Msg.Layout.Pools))
	}
	// Инкремент 2026-07-14: reset создаёт undo (FR-4a/FR-7a).
	if !res.Msg.Layout.CanUndo {
		t.Errorf("expected CanUndo=true after reset")
	}
}

func TestUndo_E2E_UndoReset(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1, domain.FighterRef{ID: "b1"}, domain.FighterRef{ID: "b2"})
	repo.SeedPool(n1, 1, "b1")
	repo.SeedPool(n1, 2, "b2")

	resetReq := connect.NewRequest(&hemav1.ResetLayoutRequest{NominationId: n1})
	resetReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.ResetLayout(context.Background(), resetReq); err != nil {
		t.Fatalf("ResetLayout: %v", err)
	}

	req := connect.NewRequest(&hemav1.UndoRequest{NominationId: n1})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.Undo(context.Background(), req)
	if err != nil {
		t.Fatalf("Undo: %v", err)
	}
	if len(res.Msg.Layout.Pools) != 2 {
		t.Errorf("expected 2 pools restored after undo-reset, got %d", len(res.Msg.Layout.Pools))
	}
}

func TestAssignFighter_E2E(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1, domain.FighterRef{ID: "b1"})
	poolID := repo.SeedPool(n1, 1)

	req := connect.NewRequest(&hemav1.AssignFighterRequest{NominationId: n1, FighterId: "b1", PoolId: poolID})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.AssignFighter(context.Background(), req)
	if err != nil {
		t.Fatalf("AssignFighter: %v", err)
	}
	if len(res.Msg.Layout.Pools[0].Members) != 1 {
		t.Errorf("Members len = %d, want 1", len(res.Msg.Layout.Pools[0].Members))
	}
	if len(res.Msg.Layout.Unassigned) != 0 {
		t.Errorf("Unassigned len = %d, want 0", len(res.Msg.Layout.Unassigned))
	}
}

func TestUnassignFighter_E2E(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1, domain.FighterRef{ID: "b1"})
	repo.SeedPool(n1, 1, "b1")

	req := connect.NewRequest(&hemav1.UnassignFighterRequest{NominationId: n1, FighterId: "b1"})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.UnassignFighter(context.Background(), req)
	if err != nil {
		t.Fatalf("UnassignFighter: %v", err)
	}
	if len(res.Msg.Layout.Unassigned) != 1 {
		t.Errorf("Unassigned len = %d, want 1", len(res.Msg.Layout.Unassigned))
	}
}

func TestAutoDistribute_E2E(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1, domain.FighterRef{ID: "b1"})
	repo.SeedPool(n1, 1)

	req := connect.NewRequest(&hemav1.AutoDistributeRequest{NominationId: n1})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.AutoDistribute(context.Background(), req)
	if err != nil {
		t.Fatalf("AutoDistribute: %v", err)
	}
	if !res.Msg.Layout.CanUndo {
		t.Errorf("expected CanUndo = true")
	}
	if len(res.Msg.Layout.Unassigned) != 0 {
		t.Errorf("Unassigned len = %d, want 0", len(res.Msg.Layout.Unassigned))
	}
}

func TestAutoDistribute_E2E_NoPoolsReturnsFailedPrecondition(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1, domain.FighterRef{ID: "b1"})

	req := connect.NewRequest(&hemav1.AutoDistributeRequest{NominationId: n1})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.AutoDistribute(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("expected CodeFailedPrecondition, got %v", connect.CodeOf(err))
	}
}

func TestUndo_E2E(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1, domain.FighterRef{ID: "b1"})
	repo.SeedPool(n1, 1)

	autoReq := connect.NewRequest(&hemav1.AutoDistributeRequest{NominationId: n1})
	autoReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.AutoDistribute(context.Background(), autoReq); err != nil {
		t.Fatalf("AutoDistribute: %v", err)
	}

	req := connect.NewRequest(&hemav1.UndoRequest{NominationId: n1})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.Undo(context.Background(), req)
	if err != nil {
		t.Fatalf("Undo: %v", err)
	}
	if len(res.Msg.Layout.Unassigned) != 1 {
		t.Errorf("Unassigned len = %d, want 1", len(res.Msg.Layout.Unassigned))
	}
}

func TestUndo_E2E_NothingToUndoReturnsFailedPrecondition(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1)

	req := connect.NewRequest(&hemav1.UndoRequest{NominationId: n1})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.Undo(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("expected CodeFailedPrecondition, got %v", connect.CodeOf(err))
	}
}

func TestSetLayoutStatus_E2E(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1)

	req := connect.NewRequest(&hemav1.SetLayoutStatusRequest{
		NominationId: n1, Status: hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY,
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.SetLayoutStatus(context.Background(), req)
	if err != nil {
		t.Fatalf("SetLayoutStatus: %v", err)
	}
	if res.Msg.Layout.Status != hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY {
		t.Errorf("Status = %v", res.Msg.Layout.Status)
	}
}

func TestSetLayoutStatus_E2E_InvalidTargetReturnsInvalidArgument(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1)

	// active/finished убраны спекой 0011 (enum значения зарезервированы) —
	// UNSPECIFIED остаётся единственным «невалидным целевым статусом»,
	// доступным на проводе.
	req := connect.NewRequest(&hemav1.SetLayoutStatusRequest{
		NominationId: n1, Status: hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_UNSPECIFIED,
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.SetLayoutStatus(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

// ---------------------------------------------------------------------
// Спека 0011: постановка пула на арену + публичное чтение пулов.
// ---------------------------------------------------------------------

func TestSeatPoolOnArena_E2E(t *testing.T) {
	admin, _, repo, fighters, arenas, _, _, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool(n1, 1, "f1")
	repo.SeedStatus(n1, domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "arena-1", Name: "Ристалище 1", Active: true})

	req := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: poolID, ArenaId: "arena-1"})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.SeatPoolOnArena(context.Background(), req)
	if err != nil {
		t.Fatalf("SeatPoolOnArena: %v", err)
	}
	pool := res.Msg.Layout.Pools[0]
	if pool.Status != hemav1.PoolStatus_POOL_STATUS_PREPARING {
		t.Errorf("Status = %v, want PREPARING", pool.Status)
	}
	if pool.ArenaId != "arena-1" || pool.ArenaName != "Ристалище 1" {
		t.Errorf("ArenaId/ArenaName = %q/%q, want arena-1/Ристалище 1", pool.ArenaId, pool.ArenaName)
	}
}

func TestSeatPoolOnArena_E2E_NotReadyReturnsFailedPrecondition(t *testing.T) {
	admin, _, repo, fighters, arenas, _, _, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool(n1, 1, "f1") // status по умолчанию — draft
	arenas.Set(domain.ArenaRef{ID: "arena-1", Name: "R1", Active: true})

	req := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: poolID, ArenaId: "arena-1"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.SeatPoolOnArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("expected CodeFailedPrecondition, got %v", connect.CodeOf(err))
	}
}

func TestSeatPoolOnArena_E2E_ArenaNotAvailableReturnsFailedPrecondition(t *testing.T) {
	admin, _, repo, fighters, _, _, _, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool(n1, 1, "f1")
	repo.SeedStatus(n1, domain.LayoutReady)

	req := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: poolID, ArenaId: "missing-arena"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.SeatPoolOnArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("expected CodeFailedPrecondition, got %v", connect.CodeOf(err))
	}
}

func TestSeatPoolOnArena_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: "p1", ArenaId: "a1"})
	_, err := admin.SeatPoolOnArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestSeatPoolOnArena_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: "p1", ArenaId: "a1"})
	req.Header().Set("Authorization", userBearer(t))
	_, err := admin.SeatPoolOnArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestUnseatPool_E2E(t *testing.T) {
	admin, _, repo, fighters, arenas, _, _, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool(n1, 1, "f1")
	repo.SeedStatus(n1, domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "arena-1", Name: "R1", Active: true})

	seatReq := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: poolID, ArenaId: "arena-1"})
	seatReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.SeatPoolOnArena(context.Background(), seatReq); err != nil {
		t.Fatalf("SeatPoolOnArena: %v", err)
	}

	req := connect.NewRequest(&hemav1.UnseatPoolRequest{PoolId: poolID})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.UnseatPool(context.Background(), req)
	if err != nil {
		t.Fatalf("UnseatPool: %v", err)
	}
	pool := res.Msg.Layout.Pools[0]
	if pool.ArenaId != "" || pool.Status != hemav1.PoolStatus_POOL_STATUS_READY {
		t.Errorf("expected pool freed (ready, no arena), got status=%v arena=%q", pool.Status, pool.ArenaId)
	}
}

func TestGetPoolsForArena_E2E(t *testing.T) {
	admin, _, repo, fighters, arenas, _, _, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	p1 := repo.SeedPool(n1, 1, "f1")
	p2 := repo.SeedPool(n1, 2, "f2")
	repo.SeedStatus(n1, domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "arena-1", Name: "R1", Active: true})

	seatReq := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: p1, ArenaId: "arena-1"})
	seatReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.SeatPoolOnArena(context.Background(), seatReq); err != nil {
		t.Fatalf("SeatPoolOnArena: %v", err)
	}

	req := connect.NewRequest(&hemav1.GetPoolsForArenaRequest{ArenaId: "arena-1"})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.GetPoolsForArena(context.Background(), req)
	if err != nil {
		t.Fatalf("GetPoolsForArena: %v", err)
	}
	if res.Msg.Seated == nil || res.Msg.Seated.Id != p1 {
		t.Fatalf("expected seated pool %s, got %v", p1, res.Msg.Seated)
	}
	if len(res.Msg.Available) != 1 || res.Msg.Available[0].Id != p2 {
		t.Fatalf("expected available pool %s, got %v", p2, res.Msg.Available)
	}
}

func TestListPublicPools_E2E_ReadyShowsPools(t *testing.T) {
	_, public, repo, fighters, _, _, _, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1", Name: "A", Club: "X"})
	repo.SeedPool(n1, 1, "f1")
	repo.SeedStatus(n1, domain.LayoutReady)

	// Публичный запрос — без Authorization: PoolPublicService смонтирован
	// под baseOpts (без RequireAdmin), доступен без авторизации (AC-15).
	req := connect.NewRequest(&hemav1.ListPublicPoolsRequest{NominationId: n1})
	res, err := public.ListPublicPools(context.Background(), req)
	if err != nil {
		t.Fatalf("ListPublicPools: %v", err)
	}
	if len(res.Msg.Pools) != 1 {
		t.Fatalf("expected 1 pool, got %d", len(res.Msg.Pools))
	}
	if len(res.Msg.Pools[0].Members) != 1 || res.Msg.Pools[0].Members[0].Name != "A" {
		t.Errorf("expected member A, got %v", res.Msg.Pools[0].Members)
	}
}

// AC-14: пока раскладка draft, публичный список пуст (не ошибка).
func TestListPublicPools_E2E_DraftReturnsEmpty(t *testing.T) {
	_, public, repo, fighters, _, _, _, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"})
	repo.SeedPool(n1, 1, "f1") // статус по умолчанию — draft

	req := connect.NewRequest(&hemav1.ListPublicPoolsRequest{NominationId: n1})
	res, err := public.ListPublicPools(context.Background(), req)
	if err != nil {
		t.Fatalf("ListPublicPools: %v", err)
	}
	if len(res.Msg.Pools) != 0 {
		t.Errorf("expected empty pools while draft, got %d", len(res.Msg.Pools))
	}
}

// Pool.NominationName резолвится сервисом и доходит до proto-ответа
// (FR-9: экран арены показывает пулы из разных номинаций — без имени они
// неразличимы). Проверяем на GetPoolsForArena: и seated, и available несут
// адресов NominationName.
func TestGetPoolsForArena_E2E_NominationNameInResponse(t *testing.T) {
	admin, _, repo, fighters, arenas, nominations, _, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"})
	fighters.Set("nom-sable", domain.FighterRef{ID: "f2"})
	p1 := repo.SeedPool(n1, 1, "f1")
	_ = repo.SeedPool("nom-sable", 1, "f2")
	repo.SeedStatus(n1, domain.LayoutReady)
	repo.SeedStatus("nom-sable", domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "arena-1", Name: "R1", Active: true})
	nominations.Set(domain.NominationRef{ID: n1, Title: "Длинный меч"})
	nominations.Set(domain.NominationRef{ID: "nom-sable", Title: "Сабля"})

	seatReq := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: p1, ArenaId: "arena-1"})
	seatReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.SeatPoolOnArena(context.Background(), seatReq); err != nil {
		t.Fatalf("SeatPoolOnArena: %v", err)
	}

	req := connect.NewRequest(&hemav1.GetPoolsForArenaRequest{ArenaId: "arena-1"})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.GetPoolsForArena(context.Background(), req)
	if err != nil {
		t.Fatalf("GetPoolsForArena: %v", err)
	}
	if res.Msg.Seated == nil || res.Msg.Seated.NominationName != "Длинный меч" {
		got := "<nil>"
		if res.Msg.Seated != nil {
			got = res.Msg.Seated.NominationName
		}
		t.Errorf("seated.NominationName = %q, want Длинный меч", got)
	}
	if len(res.Msg.Available) != 1 || res.Msg.Available[0].NominationName != "Сабля" {
		got := "<missing>"
		if len(res.Msg.Available) == 1 {
			got = res.Msg.Available[0].NominationName
		}
		t.Errorf("available.NominationName = %q, want Сабля", got)
	}
}

// ---------------------------------------------------------------------
// Спека 0013: доска ведения текущего боя (GetBoutBoard + мутации).
// ---------------------------------------------------------------------

// seedBoardPool сажает пул с двумя боями (b1, b2, оба не начаты) на арену —
// общий сетап для e2e-тестов ведения.
func seedBoardPool(t *testing.T, repo *testutil.FakeRepo, bouts *testutil.FakeBoutConductor, arenaID string) string {
	t.Helper()
	poolID := repo.SeedPool(n1, 1, "f1", "f2")
	repo.SeedStatus(n1, domain.LayoutReady)
	if arenaID != "" {
		if err := repo.SeatPool(context.Background(), poolID, arenaID); err != nil {
			t.Fatalf("seat pool: %v", err)
		}
	}
	bouts.SeedBout(poolID, domain.BoutRef{
		ID: "b1", SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"},
		State: domain.BoutStateNotStarted,
	})
	bouts.SeedBout(poolID, domain.BoutRef{
		ID: "b2", SequenceNumber: 2,
		FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"},
		State: domain.BoutStateNotStarted,
	})
	return poolID
}

func TestGetBoutBoard_E2E(t *testing.T) {
	admin, _, repo, fighters, _, _, bouts, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := seedBoardPool(t, repo, bouts, "arena-1")

	req := connect.NewRequest(&hemav1.GetBoutBoardRequest{ArenaId: "arena-1"})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.GetBoutBoard(context.Background(), req)
	if err != nil {
		t.Fatalf("GetBoutBoard: %v", err)
	}
	if res.Msg.Board.Pool == nil || res.Msg.Board.Pool.Id != poolID {
		t.Fatalf("expected board.pool = %s, got %v", poolID, res.Msg.Board.Pool)
	}
	if len(res.Msg.Board.Bouts) != 2 || res.Msg.Board.Bouts[0].Id != "b1" {
		t.Fatalf("expected 2 bouts starting with b1, got %v", res.Msg.Board.Bouts)
	}
	if res.Msg.Board.CurrentBoutId != "b1" {
		t.Errorf("CurrentBoutId = %q, want b1", res.Msg.Board.CurrentBoutId)
	}
}

func TestGetBoutBoard_E2E_EmptyWhenArenaFree(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.GetBoutBoardRequest{ArenaId: "arena-1"})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.GetBoutBoard(context.Background(), req)
	if err != nil {
		t.Fatalf("GetBoutBoard: %v", err)
	}
	if res.Msg.Board.Pool != nil || len(res.Msg.Board.Bouts) != 0 {
		t.Errorf("expected empty board, got %v", res.Msg.Board)
	}
}

// Happy path: начать → счёт → завершить — авто-продвижение на b2 (AC-5).
func TestStartScoreFinishCurrentBout_E2E(t *testing.T) {
	admin, _, repo, fighters, _, _, bouts, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := seedBoardPool(t, repo, bouts, "arena-1")

	startReq := connect.NewRequest(&hemav1.StartCurrentBoutRequest{PoolId: poolID})
	startReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.StartCurrentBout(context.Background(), startReq); err != nil {
		t.Fatalf("StartCurrentBout: %v", err)
	}

	scoreReq := connect.NewRequest(&hemav1.ScoreCurrentBoutRequest{PoolId: poolID, ScoreA: 5, ScoreB: 3})
	scoreReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.ScoreCurrentBout(context.Background(), scoreReq); err != nil {
		t.Fatalf("ScoreCurrentBout: %v", err)
	}

	finishReq := connect.NewRequest(&hemav1.FinishCurrentBoutRequest{PoolId: poolID})
	finishReq.Header().Set("Authorization", adminBearer(t))
	res, err := admin.FinishCurrentBout(context.Background(), finishReq)
	if err != nil {
		t.Fatalf("FinishCurrentBout: %v", err)
	}
	if res.Msg.Board.CurrentBoutId != "b2" {
		t.Errorf("CurrentBoutId = %q, want b2 (auto-advance, AC-5)", res.Msg.Board.CurrentBoutId)
	}
	if len(bouts.StartCalls) != 1 || bouts.StartCalls[0].BoutID != "b1" || bouts.StartCalls[0].ActorID == "" {
		t.Errorf("unexpected StartCalls: %+v", bouts.StartCalls)
	}
	if len(bouts.ScoreCalls) != 1 || bouts.ScoreCalls[0].ScoreA != 5 || bouts.ScoreCalls[0].ScoreB != 3 {
		t.Errorf("unexpected ScoreCalls: %+v", bouts.ScoreCalls)
	}
	if len(bouts.FinishCalls) != 1 || bouts.FinishCalls[0].BoutID != "b1" {
		t.Errorf("unexpected FinishCalls: %+v", bouts.FinishCalls)
	}
}

// AC-6: циркуляция — назначить текущим любой бой пула, включая завершённый.
func TestSetCurrentBout_E2E(t *testing.T) {
	admin, _, repo, fighters, _, _, bouts, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := seedBoardPool(t, repo, bouts, "arena-1")

	req := connect.NewRequest(&hemav1.SetCurrentBoutRequest{PoolId: poolID, BoutId: "b2"})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.SetCurrentBout(context.Background(), req)
	if err != nil {
		t.Fatalf("SetCurrentBout: %v", err)
	}
	if res.Msg.Board.CurrentBoutId != "b2" {
		t.Errorf("CurrentBoutId = %q, want b2", res.Msg.Board.CurrentBoutId)
	}
}

// Переоткрыть завершённый (AC-7) и сбросить начатый (AC-8) бой.
func TestReopenResetCurrentBout_E2E(t *testing.T) {
	admin, _, repo, fighters, _, _, bouts, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := seedBoardPool(t, repo, bouts, "arena-1")
	bouts.SeedBout(poolID, domain.BoutRef{ID: "b1", SequenceNumber: 1, State: domain.BoutStateFinished, ScoreA: 5, ScoreB: 3})
	if err := repo.SetCurrentBout(context.Background(), poolID, "b1"); err != nil {
		t.Fatalf("seed current: %v", err)
	}

	reopenReq := connect.NewRequest(&hemav1.ReopenCurrentBoutRequest{PoolId: poolID})
	reopenReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.ReopenCurrentBout(context.Background(), reopenReq); err != nil {
		t.Fatalf("ReopenCurrentBout: %v", err)
	}
	if len(bouts.ReopenCalls) != 1 || bouts.ReopenCalls[0].BoutID != "b1" {
		t.Errorf("unexpected ReopenCalls: %+v", bouts.ReopenCalls)
	}

	resetReq := connect.NewRequest(&hemav1.ResetCurrentBoutRequest{PoolId: poolID})
	resetReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.ResetCurrentBout(context.Background(), resetReq); err != nil {
		t.Fatalf("ResetCurrentBout: %v", err)
	}
	if len(bouts.ResetCalls) != 1 || bouts.ResetCalls[0].BoutID != "b1" {
		t.Errorf("unexpected ResetCalls: %+v", bouts.ResetCalls)
	}
}

// AC-13: ведение отклонено (FailedPrecondition), если пул не на арене.
func TestStartCurrentBout_E2E_NotSeatedReturnsFailedPrecondition(t *testing.T) {
	admin, _, repo, fighters, _, _, bouts, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := seedBoardPool(t, repo, bouts, "") // не поставлен на арену

	req := connect.NewRequest(&hemav1.StartCurrentBoutRequest{PoolId: poolID})
	req.Header().Set("Authorization", adminBearer(t))
	_, err := admin.StartCurrentBout(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("expected CodeFailedPrecondition, got %v", connect.CodeOf(err))
	}
}

// AC-14: права — без токена/не-admin ведение недоступно (проверяем одним
// репрезентативным новым RPC — интерсепторы общие для всех методов сервиса).
func TestStartCurrentBout_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.StartCurrentBoutRequest{PoolId: "p1"})
	_, err := admin.StartCurrentBout(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestStartCurrentBout_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.StartCurrentBoutRequest{PoolId: "p1"})
	req.Header().Set("Authorization", userBearer(t))
	_, err := admin.StartCurrentBout(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

// ---------------------------------------------------------------------
// Спека 0014: публичный живой снапшот номинации — GetNominationLive
// (unary) и WatchNominationLive (server-streaming). Смонтированы на
// PoolPublicService (без RequireAdmin, как ListPublicPools) — публичный
// доступ подтверждаем отсутствием заголовка Authorization в вызовах ниже.
// ---------------------------------------------------------------------

func TestGetNominationLive_E2E_ReadyShowsPoolsAndBouts(t *testing.T) {
	_, public, repo, fighters, _, _, bouts, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1", Name: "A", Club: "X"}, domain.FighterRef{ID: "f2", Name: "B", Club: "Y"})
	poolID := seedBoardPool(t, repo, bouts, "arena-1")

	req := connect.NewRequest(&hemav1.GetNominationLiveRequest{NominationId: n1})
	res, err := public.GetNominationLive(context.Background(), req)
	if err != nil {
		t.Fatalf("GetNominationLive: %v", err)
	}
	snap := res.Msg.Snapshot
	if snap.NominationId != n1 {
		t.Fatalf("NominationId = %q, want %q", snap.NominationId, n1)
	}
	if len(snap.Pools) != 1 {
		t.Fatalf("expected 1 pool, got %d", len(snap.Pools))
	}
	lp := snap.Pools[0]
	if lp.Pool.Id != poolID {
		t.Fatalf("Pool.Id = %q, want %q", lp.Pool.Id, poolID)
	}
	if len(lp.Pool.Members) != 2 {
		t.Fatalf("Pool.Members len = %d, want 2", len(lp.Pool.Members))
	}
	if len(lp.Bouts) != 2 {
		t.Fatalf("Bouts len = %d, want 2", len(lp.Bouts))
	}
	if lp.CurrentBoutId != "b1" {
		t.Fatalf("CurrentBoutId = %q, want b1", lp.CurrentBoutId)
	}
}

// FR-12: пока раскладка draft, пулы пусты (не ошибка).
func TestGetNominationLive_E2E_DraftReturnsEmptyPools(t *testing.T) {
	_, public, repo, fighters, _, _, _, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"})
	repo.SeedPool(n1, 1, "f1") // статус по умолчанию — draft

	req := connect.NewRequest(&hemav1.GetNominationLiveRequest{NominationId: n1})
	res, err := public.GetNominationLive(context.Background(), req)
	if err != nil {
		t.Fatalf("GetNominationLive: %v", err)
	}
	if len(res.Msg.Snapshot.Pools) != 0 {
		t.Errorf("expected empty pools while draft, got %d", len(res.Msg.Snapshot.Pools))
	}
}

func TestGetNominationLive_E2E_EmptyNominationIDReturnsInvalidArgument(t *testing.T) {
	_, public, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.GetNominationLiveRequest{NominationId: ""})
	_, err := public.GetNominationLive(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

// waitForSubscriberCount — ждёт (с коротким поллингом), пока
// FakeLiveBus.SubscriberCount(nominationID) не станет равным want, до
// таймаута. Нужен, чтобы синхронизировать тест с моментом, когда
// server-side горутина WatchNominationLive реально подписалась/отписалась
// (гонка HTTP/2-стрима — без этого Publish, посланный слишком рано,
// потерялся бы: FakeLiveBus доставляет только текущим подписчикам).
func waitForSubscriberCount(t *testing.T, bus *testutil.FakeLiveBus, nominationID string, want int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if bus.SubscriberCount(nominationID) == want {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for SubscriberCount(%q) == %d, got %d", nominationID, want, bus.SubscriberCount(nominationID))
}

// WatchNominationLive: первый кадр — текущий снапшот; после конкурентной
// мутации (симулированной прямой публикацией через тот же FakeLiveBus,
// который стоит за сервисом этого тестового сервера) — второй кадр с
// обновлённым снапшотом; после отмены контекста запроса стрим завершается
// штатно и подписчик отписывается (без утечки горутины на сервере).
func TestWatchNominationLive_E2E_StreamsSnapshotOnChange(t *testing.T) {
	_, public, repo, fighters, arenas, _, bouts, liveBus := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := seedBoardPool(t, repo, bouts, "")
	arenas.Set(domain.ArenaRef{ID: "arena-1", Name: "R1", Active: true})
	if err := repo.SeatPool(context.Background(), poolID, "arena-1"); err != nil {
		t.Fatalf("seat pool: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	req := connect.NewRequest(&hemav1.WatchNominationLiveRequest{NominationId: n1})
	stream, err := public.WatchNominationLive(ctx, req)
	if err != nil {
		t.Fatalf("WatchNominationLive: %v", err)
	}

	if !stream.Receive() {
		t.Fatalf("expected first frame, got err: %v", stream.Err())
	}
	first := stream.Msg().Snapshot
	if len(first.Pools) != 1 || first.Pools[0].Bouts[0].State != hemav1.BoutState_BOUT_STATE_NOT_STARTED {
		t.Fatalf("unexpected first frame: %+v", first)
	}

	// Синхронизируемся с подпиской сервера, затем публикуем напрямую через
	// FakeLiveBus (эмулирует конкурентную мутацию поверх открытого стрима,
	// спека 0014 FR-6/FR-8) — тот же экземпляр шины стоит за сервисом,
	// который отвечает этому тестовому серверу.
	waitForSubscriberCount(t, liveBus, n1, 1)
	bouts.SeedBout(poolID, domain.BoutRef{
		ID: "b1", SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"},
		State: domain.BoutStateInProgress,
	})
	liveBus.PublishNominationChanged(n1)

	if !stream.Receive() {
		t.Fatalf("expected second frame, got err: %v", stream.Err())
	}
	second := stream.Msg().Snapshot
	if len(second.Pools) != 1 || second.Pools[0].Bouts[0].State != hemav1.BoutState_BOUT_STATE_IN_PROGRESS {
		t.Fatalf("unexpected second frame (expected updated bout state): %+v", second)
	}

	cancel()
	for stream.Receive() {
		// drain until the stream ends (client-side cancellation).
	}
	if err := stream.Err(); err != nil && connect.CodeOf(err) != connect.CodeCanceled {
		t.Fatalf("unexpected terminal error after cancel: %v", err)
	}
	waitForSubscriberCount(t, liveBus, n1, 0)
}

func TestWatchNominationLive_E2E_EmptyNominationIDReturnsInvalidArgument(t *testing.T) {
	_, public, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.WatchNominationLiveRequest{NominationId: ""})
	stream, err := public.WatchNominationLive(context.Background(), req)
	if err != nil {
		t.Fatalf("WatchNominationLive: %v", err)
	}
	if stream.Receive() {
		t.Fatalf("expected no frames, got: %+v", stream.Msg())
	}
	if connect.CodeOf(stream.Err()) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(stream.Err()))
	}
}

// ---------------------------------------------------------------------
// Спека 0015: живой канал табло арены (недоменный таймер, ADR 0013 — сервер
// как реле). Синхронизация со стримом сервера идёт через первый кадр
// (snapshot): handler делает JoinArenaBoard синхронно ДО первого Send, так
// что к моменту, когда stream.Receive() на клиенте вернул первый кадр,
// участник гарантированно уже в комнате арены — в отличие от
// WatchNominationLive (спека 0014) здесь не нужен отдельный
// waitForSubscriberCount: мутации, которые должны увидеть подписчики
// (StartCurrentBout/ControlArenaTimer/...), идут через реальный RPC-путь
// сервиса (не напрямую в шину теста), поэтому happens-before гарантирован
// самим порядком вызовов в тесте.
// ---------------------------------------------------------------------

func TestWatchArenaBoard_E2E_FirstFrameIsSnapshotOnConnect(t *testing.T) {
	admin, _, repo, fighters, arenas, _, bouts, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := seedBoardPool(t, repo, bouts, "arena-1")
	arenas.SetDefaultDuration("arena-1", 120)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	req := connect.NewRequest(&hemav1.WatchArenaBoardRequest{ArenaId: "arena-1", Role: hemav1.ScoreboardRole_SCOREBOARD_ROLE_SCOREBOARD})
	req.Header().Set("Authorization", adminBearer(t))
	stream, err := admin.WatchArenaBoard(ctx, req)
	if err != nil {
		t.Fatalf("WatchArenaBoard: %v", err)
	}

	if !stream.Receive() {
		t.Fatalf("expected first frame, got err: %v", stream.Err())
	}
	snap := stream.Msg().GetSnapshot()
	if snap == nil {
		t.Fatalf("expected snapshot event, got %+v", stream.Msg())
	}
	if snap.Board.Pool == nil || snap.Board.Pool.Id != poolID {
		t.Fatalf("Board.Pool = %v, want id %s", snap.Board.Pool, poolID)
	}
	if snap.DefaultDurationSeconds != 120 {
		t.Errorf("DefaultDurationSeconds = %d, want 120", snap.DefaultDurationSeconds)
	}
	if snap.Timer.Status != hemav1.TimerStatus_TIMER_STATUS_STOPPED || snap.Timer.RemainingCs != 12000 {
		t.Errorf("Timer = %+v, want synthetic stopped/12000", snap.Timer)
	}
	if snap.Room.ThisOrdinal != 1 || !snap.Room.ThisIsSource || snap.Room.ScoreboardCount != 1 {
		t.Errorf("Room = %+v, want ordinal 1 + source + count 1", snap.Room)
	}
}

// Регрессия: WatchArenaBoard — первый в проекте admin-only server-streaming
// RPC. connect.UnaryInterceptorFunc (старая форма Auth/RequireAdmin) не
// оборачивает WrapStreamingHandler — без явной реализации оба этих теста
// падали бы (стрим открывался и отдавал снапшот без токена/без роли admin).
// pkg/connectutil.Auth/RequireAdmin теперь полноценный connect.Interceptor
// (см. auth_interceptor.go) — эти тесты подтверждают, что streaming-путь
// тоже защищён, не только unary.
func TestWatchArenaBoard_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	admin, _, _ := setup(t)

	req := connect.NewRequest(&hemav1.WatchArenaBoardRequest{ArenaId: "arena-1", Role: hemav1.ScoreboardRole_SCOREBOARD_ROLE_SCOREBOARD})
	stream, err := admin.WatchArenaBoard(context.Background(), req)
	if err != nil {
		t.Fatalf("WatchArenaBoard: %v", err)
	}
	if stream.Receive() {
		t.Fatalf("expected no frames, got: %+v", stream.Msg())
	}
	if connect.CodeOf(stream.Err()) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(stream.Err()))
	}
}

func TestWatchArenaBoard_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	admin, _, _ := setup(t)

	req := connect.NewRequest(&hemav1.WatchArenaBoardRequest{ArenaId: "arena-1", Role: hemav1.ScoreboardRole_SCOREBOARD_ROLE_SCOREBOARD})
	req.Header().Set("Authorization", userBearer(t))
	stream, err := admin.WatchArenaBoard(context.Background(), req)
	if err != nil {
		t.Fatalf("WatchArenaBoard: %v", err)
	}
	if stream.Receive() {
		t.Fatalf("expected no frames, got: %+v", stream.Msg())
	}
	if connect.CodeOf(stream.Err()) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(stream.Err()))
	}
}

// ControlArenaTimer от панели ретранслируется единственному подключённому
// табло (источнику) через её WatchArenaBoard-поток (спека 0015, FR-7).
func TestWatchArenaBoard_E2E_ControlArenaTimerRelaysCommandToSource(t *testing.T) {
	admin, _, _, _, arenas, _, _, _ := setupFull(t)
	arenas.SetDefaultDuration("arena-1", 90)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	scoreboardReq := connect.NewRequest(&hemav1.WatchArenaBoardRequest{ArenaId: "arena-1", Role: hemav1.ScoreboardRole_SCOREBOARD_ROLE_SCOREBOARD})
	scoreboardReq.Header().Set("Authorization", adminBearer(t))
	scoreboardStream, err := admin.WatchArenaBoard(ctx, scoreboardReq)
	if err != nil {
		t.Fatalf("WatchArenaBoard(scoreboard): %v", err)
	}
	if !scoreboardStream.Receive() {
		t.Fatalf("expected first frame (scoreboard), got err: %v", scoreboardStream.Err())
	}

	controlReq := connect.NewRequest(&hemav1.ControlArenaTimerRequest{
		ArenaId: "arena-1",
		Command: &hemav1.TimerCommand{Kind: hemav1.TimerCommandKind_TIMER_COMMAND_KIND_START},
	})
	controlReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.ControlArenaTimer(context.Background(), controlReq); err != nil {
		t.Fatalf("ControlArenaTimer: %v", err)
	}

	if !scoreboardStream.Receive() {
		t.Fatalf("expected command frame, got err: %v", scoreboardStream.Err())
	}
	cmd := scoreboardStream.Msg().GetCommand()
	if cmd == nil {
		t.Fatalf("expected command event, got %+v", scoreboardStream.Msg())
	}
	if cmd.Kind != hemav1.TimerCommandKind_TIMER_COMMAND_KIND_START {
		t.Errorf("Kind = %v, want START", cmd.Kind)
	}
}

// PublishTimerFrame от табло ретранслируется всем подписчикам комнаты
// (табло и панели) новым snapshot-событием (спека 0015, ADR 0013).
func TestWatchArenaBoard_E2E_PublishTimerFrameBroadcastsSnapshot(t *testing.T) {
	admin, _, _, _, arenas, _, _, _ := setupFull(t)
	arenas.SetDefaultDuration("arena-1", 90)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	panelReq := connect.NewRequest(&hemav1.WatchArenaBoardRequest{ArenaId: "arena-1", Role: hemav1.ScoreboardRole_SCOREBOARD_ROLE_PANEL})
	panelReq.Header().Set("Authorization", adminBearer(t))
	panelStream, err := admin.WatchArenaBoard(ctx, panelReq)
	if err != nil {
		t.Fatalf("WatchArenaBoard(panel): %v", err)
	}
	if !panelStream.Receive() {
		t.Fatalf("expected first frame (panel), got err: %v", panelStream.Err())
	}

	publishReq := connect.NewRequest(&hemav1.PublishTimerFrameRequest{
		ArenaId: "arena-1",
		Frame:   &hemav1.TimerFrame{Status: hemav1.TimerStatus_TIMER_STATUS_RUNNING, RemainingCs: 4500, DefaultCs: 9000},
	})
	publishReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.PublishTimerFrame(context.Background(), publishReq); err != nil {
		t.Fatalf("PublishTimerFrame: %v", err)
	}

	if !panelStream.Receive() {
		t.Fatalf("expected updated snapshot, got err: %v", panelStream.Err())
	}
	snap := panelStream.Msg().GetSnapshot()
	if snap == nil {
		t.Fatalf("expected snapshot event, got %+v", panelStream.Msg())
	}
	if snap.Timer.Status != hemav1.TimerStatus_TIMER_STATUS_RUNNING || snap.Timer.RemainingCs != 4500 {
		t.Errorf("Timer = %+v, want running/4500", snap.Timer)
	}
	if snap.Room.ThisOrdinal != 0 || snap.Room.ThisIsSource {
		t.Errorf("Room = %+v, want panel ordinal 0, not source", snap.Room)
	}
}

// Мутация доски существующим RPC (StartCurrentBout) шлёт подписчику
// WatchArenaBoard обновлённый snapshot (спека 0015, T11 сигнал рядом с
// liveBus.PublishNominationChanged).
func TestWatchArenaBoard_E2E_BoardMutationStreamsUpdatedSnapshot(t *testing.T) {
	admin, _, repo, fighters, arenas, _, bouts, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := seedBoardPool(t, repo, bouts, "arena-1")
	arenas.SetDefaultDuration("arena-1", 90)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	req := connect.NewRequest(&hemav1.WatchArenaBoardRequest{ArenaId: "arena-1", Role: hemav1.ScoreboardRole_SCOREBOARD_ROLE_SCOREBOARD})
	req.Header().Set("Authorization", adminBearer(t))
	stream, err := admin.WatchArenaBoard(ctx, req)
	if err != nil {
		t.Fatalf("WatchArenaBoard: %v", err)
	}
	if !stream.Receive() {
		t.Fatalf("expected first frame, got err: %v", stream.Err())
	}
	if stream.Msg().GetSnapshot().Board.Bouts[0].State != hemav1.BoutState_BOUT_STATE_NOT_STARTED {
		t.Fatalf("unexpected first frame: %+v", stream.Msg())
	}

	startReq := connect.NewRequest(&hemav1.StartCurrentBoutRequest{PoolId: poolID})
	startReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.StartCurrentBout(context.Background(), startReq); err != nil {
		t.Fatalf("StartCurrentBout: %v", err)
	}

	if !stream.Receive() {
		t.Fatalf("expected updated snapshot, got err: %v", stream.Err())
	}
	snap := stream.Msg().GetSnapshot()
	if snap == nil || snap.Board.Bouts[0].State != hemav1.BoutState_BOUT_STATE_IN_PROGRESS {
		t.Fatalf("unexpected second frame (expected updated bout state): %+v", stream.Msg())
	}
}

// SetScoreboardSides шлёт snapshot-событие с sides_swapped всем подписчикам
// комнаты (спека 0015, FR-6).
func TestWatchArenaBoard_E2E_SetScoreboardSidesStreamsSnapshot(t *testing.T) {
	admin, _, _, _, arenas, _, _, _ := setupFull(t)
	arenas.SetDefaultDuration("arena-1", 90)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	req := connect.NewRequest(&hemav1.WatchArenaBoardRequest{ArenaId: "arena-1", Role: hemav1.ScoreboardRole_SCOREBOARD_ROLE_SCOREBOARD})
	req.Header().Set("Authorization", adminBearer(t))
	stream, err := admin.WatchArenaBoard(ctx, req)
	if err != nil {
		t.Fatalf("WatchArenaBoard: %v", err)
	}
	if !stream.Receive() {
		t.Fatalf("expected first frame, got err: %v", stream.Err())
	}

	swapReq := connect.NewRequest(&hemav1.SetScoreboardSidesRequest{ArenaId: "arena-1", Swapped: true})
	swapReq.Header().Set("Authorization", adminBearer(t))
	swapRes, err := admin.SetScoreboardSides(context.Background(), swapReq)
	if err != nil {
		t.Fatalf("SetScoreboardSides: %v", err)
	}
	if !swapRes.Msg.Snapshot.Room.SidesSwapped {
		t.Errorf("unary response Room.SidesSwapped = false, want true")
	}

	if !stream.Receive() {
		t.Fatalf("expected updated snapshot, got err: %v", stream.Err())
	}
	snap := stream.Msg().GetSnapshot()
	if snap == nil || !snap.Room.SidesSwapped {
		t.Fatalf("expected snapshot with SidesSwapped=true, got %+v", stream.Msg())
	}
}

// RevealCurrentBout развязывает оглашение результата (FinishCurrentBout) и
// переход к следующему бою на табло (спека 0015, UX-уточнение): чисто
// отображенческий сигнал, широковещательно доходит до ВСЕХ подключённых
// табло (не только источника, в отличие от команд таймера).
func TestWatchArenaBoard_E2E_RevealCurrentBoutBroadcastsToAllScoreboards(t *testing.T) {
	admin, _, _, _, arenas, _, _, _ := setupFull(t)
	arenas.SetDefaultDuration("arena-1", 90)

	ctx1, cancel1 := context.WithCancel(context.Background())
	defer cancel1()
	ctx2, cancel2 := context.WithCancel(context.Background())
	defer cancel2()

	req1 := connect.NewRequest(&hemav1.WatchArenaBoardRequest{ArenaId: "arena-1", Role: hemav1.ScoreboardRole_SCOREBOARD_ROLE_SCOREBOARD})
	req1.Header().Set("Authorization", adminBearer(t))
	stream1, err := admin.WatchArenaBoard(ctx1, req1)
	if err != nil {
		t.Fatalf("WatchArenaBoard (table 1): %v", err)
	}
	if !stream1.Receive() {
		t.Fatalf("expected first frame (table 1), got err: %v", stream1.Err())
	}
	if got := stream1.Msg().GetSnapshot().Room.RevealGeneration; got != 0 {
		t.Fatalf("initial RevealGeneration = %d, want 0", got)
	}

	req2 := connect.NewRequest(&hemav1.WatchArenaBoardRequest{ArenaId: "arena-1", Role: hemav1.ScoreboardRole_SCOREBOARD_ROLE_SCOREBOARD})
	req2.Header().Set("Authorization", adminBearer(t))
	stream2, err := admin.WatchArenaBoard(ctx2, req2)
	if err != nil {
		t.Fatalf("WatchArenaBoard (table 2): %v", err)
	}
	if !stream2.Receive() {
		t.Fatalf("expected first frame (table 2), got err: %v", stream2.Err())
	}

	revealReq := connect.NewRequest(&hemav1.RevealCurrentBoutRequest{ArenaId: "arena-1"})
	revealReq.Header().Set("Authorization", adminBearer(t))
	revealRes, err := admin.RevealCurrentBout(context.Background(), revealReq)
	if err != nil {
		t.Fatalf("RevealCurrentBout: %v", err)
	}
	if got := revealRes.Msg.Snapshot.Room.RevealGeneration; got != 1 {
		t.Errorf("unary response RevealGeneration = %d, want 1", got)
	}

	if !stream1.Receive() {
		t.Fatalf("expected updated snapshot (table 1), got err: %v", stream1.Err())
	}
	if got := stream1.Msg().GetSnapshot().Room.RevealGeneration; got != 1 {
		t.Errorf("table 1 RevealGeneration = %d, want 1", got)
	}
	if !stream2.Receive() {
		t.Fatalf("expected updated snapshot (table 2 — broadcast, not just source), got err: %v", stream2.Err())
	}
	if got := stream2.Msg().GetSnapshot().Room.RevealGeneration; got != 1 {
		t.Errorf("table 2 RevealGeneration = %d, want 1 (must reach non-source tables too)", got)
	}
}

func TestRevealCurrentBout_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)

	_, err := admin.RevealCurrentBout(context.Background(), connect.NewRequest(&hemav1.RevealCurrentBoutRequest{ArenaId: "arena-1"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestRevealCurrentBout_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.RevealCurrentBoutRequest{ArenaId: "arena-1"})
	req.Header().Set("Authorization", userBearer(t))
	_, err := admin.RevealCurrentBout(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

// Отмена контекста клиента завершает стрим штатно, без утечки/зависания
// сервера (как WatchNominationLive, спека 0014 — тот же паттерн).
func TestWatchArenaBoard_E2E_ContextCancelDoesNotHang(t *testing.T) {
	admin, _, _, _, arenas, _, _, _ := setupFull(t)
	arenas.SetDefaultDuration("arena-1", 90)

	ctx, cancel := context.WithCancel(context.Background())

	req := connect.NewRequest(&hemav1.WatchArenaBoardRequest{ArenaId: "arena-1", Role: hemav1.ScoreboardRole_SCOREBOARD_ROLE_SCOREBOARD})
	req.Header().Set("Authorization", adminBearer(t))
	stream, err := admin.WatchArenaBoard(ctx, req)
	if err != nil {
		t.Fatalf("WatchArenaBoard: %v", err)
	}
	if !stream.Receive() {
		t.Fatalf("expected first frame, got err: %v", stream.Err())
	}

	cancel()
	done := make(chan struct{})
	go func() {
		for stream.Receive() {
			// drain until the stream ends (client-side cancellation).
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatalf("stream did not terminate within 2s after context cancel (server hang?)")
	}
	if err := stream.Err(); err != nil && connect.CodeOf(err) != connect.CodeCanceled {
		t.Fatalf("unexpected terminal error after cancel: %v", err)
	}
}

func TestWatchArenaBoard_E2E_EmptyArenaIDReturnsInvalidArgument(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.WatchArenaBoardRequest{ArenaId: "", Role: hemav1.ScoreboardRole_SCOREBOARD_ROLE_SCOREBOARD})
	req.Header().Set("Authorization", adminBearer(t))
	stream, err := admin.WatchArenaBoard(context.Background(), req)
	if err != nil {
		t.Fatalf("WatchArenaBoard: %v", err)
	}
	if stream.Receive() {
		t.Fatalf("expected no frames, got: %+v", stream.Msg())
	}
	if connect.CodeOf(stream.Err()) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(stream.Err()))
	}
}

// ВАЖНО (найдено при написании этого инкремента, спека 0015 T12): у
// WatchArenaBoard НЕТ тестов «без токена → Unauthenticated» /
// «не-admin → PermissionDenied», в отличие от остальных RPC этого файла.
// Причина — не логика этого хендлера, а инфраструктурный пробел вне скоупа
// модуля pool: connectutil.Auth/RequireAdmin (server/pkg/connectutil/
// auth_interceptor.go) объявлены как connect.UnaryInterceptorFunc, а у
// этого типа WrapStreamingHandler — намеренный no-op в самом connect-go
// (connectrpc.com/connect/interceptor.go: «UnaryInterceptorFunc ... has no
// effect on streaming RPCs»). WatchArenaBoard — первый в проекте admin-only
// STREAMING RPC (WatchNominationLive, спека 0014, тоже streaming, но
// намеренно публичный — пробел был невидим). Проверено вручную (unary
// RPC — PublishTimerFrame и остальные — защищены штатно): запрос
// WatchArenaBoard без Authorization ИЛИ с не-admin токеном сейчас проходит
// и отдаёт обычный snapshot вместо Unauthenticated/PermissionDenied — FR-1
// («Admin-only») спеки 0015 фактически не соблюдается для этого RPC.
// Фикс требует правки server/pkg/connectutil (сделать Auth/RequireAdmin
// полноценным connect.Interceptor с реальным WrapStreamingHandler,
// либо завести отдельный streaming-aware интерсептор) — вне разрешённого
// для этого трека scope (только server/modules/pool/**). Флагируется
// координатору отдельно; тест-заглушки «протекающего» поведения намеренно
// не пишутся, чтобы не зафиксировать баг как ожидаемое поведение.

func TestPublishTimerFrame_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.PublishTimerFrameRequest{ArenaId: "arena-1", Frame: &hemav1.TimerFrame{}})
	_, err := admin.PublishTimerFrame(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestPublishTimerFrame_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	admin, _, _, _, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.PublishTimerFrameRequest{ArenaId: "arena-1", Frame: &hemav1.TimerFrame{}})
	req.Header().Set("Authorization", userBearer(t))
	_, err := admin.PublishTimerFrame(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}
