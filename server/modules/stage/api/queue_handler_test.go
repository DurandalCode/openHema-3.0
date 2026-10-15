package api

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/modules/stage/domain"
)

// queueSetup — две готовых группы номинации n1 (P1, P2) и две активные арены.
func queueSetup(t *testing.T) (admin interface {
	EnqueuePool(context.Context, *connect.Request[hemav1.EnqueuePoolRequest]) (*connect.Response[hemav1.EnqueuePoolResponse], error)
	DequeuePool(context.Context, *connect.Request[hemav1.DequeuePoolRequest]) (*connect.Response[hemav1.DequeuePoolResponse], error)
	ReorderArenaQueue(context.Context, *connect.Request[hemav1.ReorderArenaQueueRequest]) (*connect.Response[hemav1.ReorderArenaQueueResponse], error)
	SeatNextPool(context.Context, *connect.Request[hemav1.SeatNextPoolRequest]) (*connect.Response[hemav1.SeatNextPoolResponse], error)
	GetPoolsForArena(context.Context, *connect.Request[hemav1.GetPoolsForArenaRequest]) (*connect.Response[hemav1.GetPoolsForArenaResponse], error)
}, p1, p2 string) {
	t.Helper()
	a, _, repo, fighters, arenas, _, _, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	p1 = repo.SeedPool(n1, 1, "f1")
	p2 = repo.SeedPool(n1, 2, "f2")
	repo.SeedStatus(n1, domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "arena-1", Name: "Ристалище 1", Active: true})
	arenas.Set(domain.ArenaRef{ID: "arena-2", Name: "Ристалище 2", Active: true})
	return a, p1, p2
}

func withAdmin[T any](t *testing.T, m *T) *connect.Request[T] {
	t.Helper()
	req := connect.NewRequest(m)
	req.Header().Set("Authorization", adminBearer(t))
	return req
}

func TestQueue_E2E_EnqueueReorderSeatNextDequeue(t *testing.T) {
	admin, p1, p2 := queueSetup(t)
	ctx := context.Background()

	if _, err := admin.EnqueuePool(ctx, withAdmin(t, &hemav1.EnqueuePoolRequest{PoolId: p1, ArenaId: "arena-1"})); err != nil {
		t.Fatalf("EnqueuePool p1: %v", err)
	}
	res, err := admin.EnqueuePool(ctx, withAdmin(t, &hemav1.EnqueuePoolRequest{PoolId: p2, ArenaId: "arena-1"}))
	if err != nil {
		t.Fatalf("EnqueuePool p2: %v", err)
	}
	q := res.Msg.Pools.Queued
	if len(q) != 2 || q[0].Id != p1 || q[1].Id != p2 {
		t.Fatalf("queued = %v, want [p1 p2]", q)
	}
	if q[1].QueuePosition != 2 || q[1].QueueArenaId != "arena-1" || q[1].QueueArenaName != "Ристалище 1" {
		t.Fatalf("queue fields not mapped: %+v", q[1])
	}
	if q[0].StageTitle != domain.DefaultStageTitle {
		t.Errorf("StageTitle = %q, want %q", q[0].StageTitle, domain.DefaultStageTitle)
	}

	rr, err := admin.ReorderArenaQueue(ctx, withAdmin(t, &hemav1.ReorderArenaQueueRequest{ArenaId: "arena-1", PoolIds: []string{p2, p1}}))
	if err != nil {
		t.Fatalf("ReorderArenaQueue: %v", err)
	}
	if got := rr.Msg.Pools.Queued; got[0].Id != p2 || got[1].Id != p1 {
		t.Fatalf("after reorder = %v", got)
	}

	sn, err := admin.SeatNextPool(ctx, withAdmin(t, &hemav1.SeatNextPoolRequest{ArenaId: "arena-1"}))
	if err != nil {
		t.Fatalf("SeatNextPool: %v", err)
	}
	if sn.Msg.Pools.Seated.GetId() != p2 || len(sn.Msg.Pools.Queued) != 1 || sn.Msg.Pools.Queued[0].Id != p1 {
		t.Fatalf("SeatNext result: seated=%v queued=%v", sn.Msg.Pools.Seated, sn.Msg.Pools.Queued)
	}

	dq, err := admin.DequeuePool(ctx, withAdmin(t, &hemav1.DequeuePoolRequest{PoolId: p1}))
	if err != nil {
		t.Fatalf("DequeuePool: %v", err)
	}
	if len(dq.Msg.Pools.Queued) != 0 {
		t.Fatalf("queue must be empty, got %v", dq.Msg.Pools.Queued)
	}
}

func TestQueue_E2E_ErrorCodes(t *testing.T) {
	admin, p1, _ := queueSetup(t)
	ctx := context.Background()

	_, err := admin.EnqueuePool(ctx, withAdmin(t, &hemav1.EnqueuePoolRequest{PoolId: p1, ArenaId: "missing"}))
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("unknown arena: %v", connect.CodeOf(err))
	}
	_, err = admin.EnqueuePool(ctx, withAdmin(t, &hemav1.EnqueuePoolRequest{PoolId: "nope", ArenaId: "arena-1"}))
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("unknown pool: %v", connect.CodeOf(err))
	}
	_, err = admin.EnqueuePool(ctx, withAdmin(t, &hemav1.EnqueuePoolRequest{PoolId: "", ArenaId: "arena-1"}))
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("empty pool id: %v", connect.CodeOf(err))
	}
	_, err = admin.SeatNextPool(ctx, withAdmin(t, &hemav1.SeatNextPoolRequest{ArenaId: "arena-1"}))
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("empty queue: %v", connect.CodeOf(err))
	}
	_, err = admin.DequeuePool(ctx, withAdmin(t, &hemav1.DequeuePoolRequest{PoolId: p1}))
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("dequeue not queued: %v", connect.CodeOf(err))
	}
	if _, err := admin.EnqueuePool(ctx, withAdmin(t, &hemav1.EnqueuePoolRequest{PoolId: p1, ArenaId: "arena-1"})); err != nil {
		t.Fatal(err)
	}
	_, err = admin.ReorderArenaQueue(ctx, withAdmin(t, &hemav1.ReorderArenaQueueRequest{ArenaId: "arena-1", PoolIds: []string{}}))
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("stale reorder: %v", connect.CodeOf(err))
	}
}

func TestQueue_E2E_NonAdminDenied(t *testing.T) {
	admin, p1, _ := queueSetup(t)
	req := connect.NewRequest(&hemav1.EnqueuePoolRequest{PoolId: p1, ArenaId: "arena-1"})
	req.Header().Set("Authorization", userBearer(t))
	_, err := admin.EnqueuePool(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected PermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestQueue_E2E_GetPoolsForArenaReturnsQueued(t *testing.T) {
	admin, p1, _ := queueSetup(t)
	ctx := context.Background()
	if _, err := admin.EnqueuePool(ctx, withAdmin(t, &hemav1.EnqueuePoolRequest{PoolId: p1, ArenaId: "arena-1"})); err != nil {
		t.Fatal(err)
	}
	got, err := admin.GetPoolsForArena(ctx, withAdmin(t, &hemav1.GetPoolsForArenaRequest{ArenaId: "arena-1"}))
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Msg.Queued) != 1 {
		t.Fatalf("GetPoolsForArena.queued = %v", got.Msg.Queued)
	}
}
