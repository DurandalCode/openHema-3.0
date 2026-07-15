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
// глобально Auth (валидация Bearer), на сервис — RequireAdmin.
func setup(t *testing.T) (hemav1connect.PoolAdminServiceClient, *testutil.FakeRepo, *testutil.FakeActiveFightersProvider) {
	t.Helper()

	repo := testutil.NewFakeRepo()
	fighters := testutil.NewFakeActiveFightersProvider()
	bouts := testutil.NewFakeBoutGenerator()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	svc := service.New(repo, fighters, bouts)
	handler := NewAdminHandler(svc)

	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.Auth(tokens)),
	}
	adminOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.RequireAdmin()),
	}

	path, h := hemav1connect.NewPoolAdminServiceHandler(handler, append(baseOpts, adminOpts...)...)

	mux := http.NewServeMux()
	mux.Handle(path, h)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	adminClient := hemav1connect.NewPoolAdminServiceClient(client, server.URL)
	return adminClient, repo, fighters
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

	req := connect.NewRequest(&hemav1.SetLayoutStatusRequest{
		NominationId: n1, Status: hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_ACTIVE,
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.SetLayoutStatus(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}
