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
	admin, _, repo, fighters, _ := setupFull(t)
	return admin, repo, fighters
}

// setupFull — как setup, но дополнительно монтирует PoolPublicService (без
// RequireAdmin, спека 0011) и возвращает публичный клиент и
// fake-провайдер арен.
func setupFull(t *testing.T) (
	hemav1connect.PoolAdminServiceClient,
	hemav1connect.PoolPublicServiceClient,
	*testutil.FakeRepo,
	*testutil.FakeActiveFightersProvider,
	*testutil.FakeArenaProvider,
) {
	t.Helper()

	repo := testutil.NewFakeRepo()
	fighters := testutil.NewFakeActiveFightersProvider()
	bouts := testutil.NewFakeBoutGenerator()
	arenas := testutil.NewFakeArenaProvider()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	svc := service.New(repo, fighters, bouts, arenas)
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
	return adminClient, publicClient, repo, fighters, arenas
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
	admin, _, repo, fighters, arenas := setupFull(t)
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
	admin, _, repo, fighters, arenas := setupFull(t)
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
	admin, _, repo, fighters, _ := setupFull(t)
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
	admin, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: "p1", ArenaId: "a1"})
	_, err := admin.SeatPoolOnArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestSeatPoolOnArena_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	admin, _, _, _, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: "p1", ArenaId: "a1"})
	req.Header().Set("Authorization", userBearer(t))
	_, err := admin.SeatPoolOnArena(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestUnseatPool_E2E(t *testing.T) {
	admin, _, repo, fighters, arenas := setupFull(t)
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
	admin, _, repo, fighters, arenas := setupFull(t)
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
	_, public, repo, fighters, _ := setupFull(t)
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
	_, public, repo, fighters, _ := setupFull(t)
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
