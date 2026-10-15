//go:build integration

package integration

import (
	"context"
	"reflect"
	"testing"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
)

func arenaPools(t *testing.T, c clients, arenaID string) *hemav1.GetPoolsForArenaResponse {
	t.Helper()
	req := connect.NewRequest(&hemav1.GetPoolsForArenaRequest{ArenaId: arenaID})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.pool.GetPoolsForArena(context.Background(), req)
	if err != nil {
		t.Fatalf("GetPoolsForArena: %v", err)
	}
	return res.Msg
}

func queueIDs(t *testing.T, c clients, arenaID string) []string {
	t.Helper()
	out := []string{}
	for _, p := range arenaPools(t, c, arenaID).Queued {
		out = append(out, p.Id)
	}
	return out
}

func enqueue(t *testing.T, c clients, poolID, arenaID string) error {
	t.Helper()
	req := connect.NewRequest(&hemav1.EnqueuePoolRequest{PoolId: poolID, ArenaId: arenaID})
	req.Header().Set("Authorization", adminBearer(t))
	_, err := c.pool.EnqueuePool(context.Background(), req)
	return err
}

// Спека 0063: очередь на реальном PG — порядок, перенос между очередями с
// уплотнением позиций, переупорядочивание под DEFERRABLE UNIQUE,
// «Поставить следующий» и постановка из списка убирают пул из очереди.
func TestIntegration_ArenaQueue_OrderTransferReorderSeat(t *testing.T) {
	c, _ := setup(t)
	a1 := createArena(t, c, "Ристалище 1")
	a2 := createArena(t, c, "Ристалище 2")
	_, p1 := readyPoolWithOneFighter(t, c, "Лонгсорд")
	_, p2 := readyPoolWithOneFighter(t, c, "Рапира")
	_, p3 := readyPoolWithOneFighter(t, c, "Сабля")

	for _, p := range []string{p1, p2, p3} {
		if err := enqueue(t, c, p, a1); err != nil {
			t.Fatalf("enqueue %s: %v", p, err)
		}
	}
	if got, want := queueIDs(t, c, a1), []string{p1, p2, p3}; !reflect.DeepEqual(got, want) {
		t.Fatalf("a1 queue = %v, want %v", got, want)
	}

	// Перенос p2 в очередь a2: очередь a1 уплотняется до позиций 1..2.
	if err := enqueue(t, c, p2, a2); err != nil {
		t.Fatalf("transfer: %v", err)
	}
	q1 := arenaPools(t, c, a1).Queued
	if len(q1) != 2 || q1[0].Id != p1 || q1[1].Id != p3 || q1[0].QueuePosition != 1 || q1[1].QueuePosition != 2 {
		t.Fatalf("a1 queue after transfer = %+v", q1)
	}
	if got, want := queueIDs(t, c, a2), []string{p2}; !reflect.DeepEqual(got, want) {
		t.Fatalf("a2 queue = %v, want %v", got, want)
	}

	// Переупорядочивание: меняются позиции внутри транзакции (DEFERRABLE).
	rreq := connect.NewRequest(&hemav1.ReorderArenaQueueRequest{ArenaId: a1, PoolIds: []string{p3, p1}})
	rreq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.ReorderArenaQueue(context.Background(), rreq); err != nil {
		t.Fatalf("reorder: %v", err)
	}
	if got, want := queueIDs(t, c, a1), []string{p3, p1}; !reflect.DeepEqual(got, want) {
		t.Fatalf("a1 after reorder = %v, want %v", got, want)
	}

	// Устаревший набор → FailedPrecondition, очередь цела.
	stale := connect.NewRequest(&hemav1.ReorderArenaQueueRequest{ArenaId: a1, PoolIds: []string{p3}})
	stale.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.ReorderArenaQueue(context.Background(), stale); connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("stale reorder: got %v, want FailedPrecondition", err)
	}

	// «Поставить следующий»: p3 встаёт на a1 и уходит из очереди.
	nreq := connect.NewRequest(&hemav1.SeatNextPoolRequest{ArenaId: a1})
	nreq.Header().Set("Authorization", adminBearer(t))
	nres, err := c.pool.SeatNextPool(context.Background(), nreq)
	if err != nil {
		t.Fatalf("SeatNextPool: %v", err)
	}
	if nres.Msg.Pools.Seated.GetId() != p3 {
		t.Fatalf("seated = %v, want %s", nres.Msg.Pools.Seated, p3)
	}
	if got, want := queueIDs(t, c, a1), []string{p1}; !reflect.DeepEqual(got, want) {
		t.Fatalf("a1 queue after SeatNext = %v, want %v", got, want)
	}

	// Обычная постановка p1 на a2 убирает его из очереди a1; очередь пуста.
	sreq := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: p1, ArenaId: a2})
	sreq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.SeatPoolOnArena(context.Background(), sreq); err != nil {
		t.Fatalf("SeatPoolOnArena: %v", err)
	}
	if got := queueIDs(t, c, a1); len(got) != 0 {
		t.Fatalf("a1 queue must be empty, got %v", got)
	}
	// Стоящий пул в очередь не идёт.
	if err := enqueue(t, c, p1, a1); connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("enqueue seated: got %v, want FailedPrecondition", err)
	}
}

// FR-12: откат раскладки блокируется пулом в очереди; после снятия из
// очереди проходит. Удаление пула каскадом чистит очередь.
func TestIntegration_ArenaQueue_BlocksRollbackToDraft(t *testing.T) {
	c, _ := setup(t)
	a1 := createArena(t, c, "Ристалище 1")
	nomID, p1 := readyPoolWithOneFighter(t, c, "Лонгсорд")

	if err := enqueue(t, c, p1, a1); err != nil {
		t.Fatal(err)
	}
	req := connect.NewRequest(&hemav1.SetLayoutStatusRequest{
		StageId: stageIDFor(t, c, nomID),
		Status:  hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_DRAFT,
	})
	req.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.SetLayoutStatus(context.Background(), req); connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("rollback while queued: got %v, want FailedPrecondition", err)
	}

	dq := connect.NewRequest(&hemav1.DequeuePoolRequest{PoolId: p1})
	dq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.DequeuePool(context.Background(), dq); err != nil {
		t.Fatalf("dequeue: %v", err)
	}
	setLayoutStatus(t, c, nomID, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_DRAFT)
}

// Инвариант данных: позиция в пределах арены уникальна (DEFERRABLE UNIQUE
// проверяется на COMMIT) и пул стоит не более чем в одной очереди (PK).
func TestIntegration_ArenaQueue_DataInvariants(t *testing.T) {
	c, pgPool := setup(t)
	a1 := createArena(t, c, "Ристалище 1")
	_, p1 := readyPoolWithOneFighter(t, c, "Лонгсорд")
	_, p2 := readyPoolWithOneFighter(t, c, "Рапира")
	if err := enqueue(t, c, p1, a1); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if _, err := pgPool.Exec(ctx,
		`INSERT INTO stage.arena_queue (pool_id, arena_id, position) VALUES ($1, $2, 1)`, p2, a1); err == nil {
		t.Fatal("duplicate (arena_id, position) must be rejected")
	}
	if _, err := pgPool.Exec(ctx,
		`INSERT INTO stage.arena_queue (pool_id, arena_id, position) VALUES ($1, $2, 2)`, p1, a1); err == nil {
		t.Fatal("a pool in two queue slots must be rejected (PK pool_id)")
	}
	// Каскад: удаление пула чистит очередь.
	if _, err := pgPool.Exec(ctx, `DELETE FROM stage.pools WHERE id = $1`, p1); err != nil {
		t.Fatalf("delete pool: %v", err)
	}
	if got := queueIDs(t, c, a1); len(got) != 0 {
		t.Fatalf("queue must be empty after pool delete, got %v", got)
	}
}
