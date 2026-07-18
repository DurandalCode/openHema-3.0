//go:build integration

// Package integration — сквозные e2e-тесты модуля pool на реальной
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
	poolmodule "github.com/hema/server/modules/pool"
	"github.com/hema/server/modules/tournament"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	adminUserID      = "00000000-0000-0000-0000-000000000aaa"
	accessKey        = "integration-access-secret"
	refreshKey       = "integration-refresh-secret"
	seedTournamentID = "00000000-0000-0000-0000-000000000001"
)

type clients struct {
	pool    hemav1connect.PoolAdminServiceClient
	fighter hemav1connect.FighterAdminServiceClient
	nom     hemav1connect.NominationAdminServiceClient
	bout    hemav1connect.BoutAdminServiceClient
	arena   hemav1connect.ArenaAdminServiceClient
}

// setup поднимает PG (testdb.Postgres), применяет миграции всех модулей,
// собирает composition root (реальный пул БД) и возвращает Connect-клиентов
// nomination/fighter/pool admin-сервисов.
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

	poolmodule.Register(mux, poolmodule.Deps{
		Pool:        pool,
		Fighters:    platform.NewPoolActiveFightersProvider(pool),
		Bouts:       platform.NewPoolBoutGenerator(pool),                             // real adapter, not fake (spec 0010, T19)
		Arenas:      platform.NewPoolArenaProvider(pool, activeTournaments),         // real adapter, spec 0011
		Nominations: platform.NewPoolNominationProvider(pool, activeTournaments),   // real adapter, FR-9 (имя номинации пула)
	}, baseOpts, adminOpts)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	httpClient := server.Client()
	return clients{
		pool:    hemav1connect.NewPoolAdminServiceClient(httpClient, server.URL),
		fighter: hemav1connect.NewFighterAdminServiceClient(httpClient, server.URL),
		nom:     hemav1connect.NewNominationAdminServiceClient(httpClient, server.URL),
		bout:    hemav1connect.NewBoutAdminServiceClient(httpClient, server.URL),
		arena:   hemav1connect.NewArenaAdminServiceClient(httpClient, server.URL),
	}, pool
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
// всех модулей, включая pool. Если миграции падают, setup валится здесь.
func TestIntegration_MigrationsApplied(t *testing.T) {
	setup(t)
}

func TestIntegration_CreateAssignDistributeGet(t *testing.T) {
	c, _ := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "Клуб А")
	f2 := createFighter(t, c, nomID, "Пётр", "Клуб Б")

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{NominationId: nomID})
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
		NominationId: nomID, FighterId: f1, PoolId: poolID,
	})
	assignReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.AssignFighter(context.Background(), assignReq); err != nil {
		t.Fatalf("AssignFighter: %v", err)
	}

	distReq := connect.NewRequest(&hemav1.AutoDistributeRequest{NominationId: nomID})
	distReq.Header().Set("Authorization", adminBearer(t))
	dist, err := c.pool.AutoDistribute(context.Background(), distReq)
	if err != nil {
		t.Fatalf("AutoDistribute: %v", err)
	}
	if len(dist.Msg.Layout.Unassigned) != 0 {
		t.Fatalf("expected all fighters distributed, got %d unassigned", len(dist.Msg.Layout.Unassigned))
	}

	getReq := connect.NewRequest(&hemav1.GetLayoutRequest{NominationId: nomID})
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
// UNIQUE(nomination_id, fighter_id) в pool.pool_members держит инвариант
// FR-1: перемещение бойца между пулами не оставляет его в двух местах.
func TestIntegration_UniqueFighterPerNomination_MoveNotDuplicate(t *testing.T) {
	c, _ := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "")

	newPool := func() string {
		req := connect.NewRequest(&hemav1.CreatePoolRequest{NominationId: nomID})
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
		req := connect.NewRequest(&hemav1.AssignFighterRequest{NominationId: nomID, FighterId: f1, PoolId: poolID})
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

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{NominationId: nomID})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	poolID := created.Msg.Layout.Pools[0].Id

	assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{NominationId: nomID, FighterId: f1, PoolId: poolID})
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
	undoReq := connect.NewRequest(&hemav1.UndoRequest{NominationId: nomID})
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

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{NominationId: nomID})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	pool1ID := created.Msg.Layout.Pools[0].Id

	assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{NominationId: nomID, FighterId: f1, PoolId: pool1ID})
	assignReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.AssignFighter(context.Background(), assignReq); err != nil {
		t.Fatalf("AssignFighter: %v", err)
	}

	// Создаём второй пул и кладём туда второго бойца.
	createReq2 := connect.NewRequest(&hemav1.CreatePoolRequest{NominationId: nomID})
	createReq2.Header().Set("Authorization", adminBearer(t))
	created2, err := c.pool.CreatePool(context.Background(), createReq2)
	if err != nil {
		t.Fatalf("CreatePool 2: %v", err)
	}
	pool2ID := created2.Msg.Layout.Pools[0].Id
	assignReq2 := connect.NewRequest(&hemav1.AssignFighterRequest{NominationId: nomID, FighterId: f2, PoolId: pool2ID})
	assignReq2.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.AssignFighter(context.Background(), assignReq2); err != nil {
		t.Fatalf("AssignFighter 2: %v", err)
	}

	// Сбрасываем раскладку — все пулы удаляются, undo доступен.
	resetReq := connect.NewRequest(&hemav1.ResetLayoutRequest{NominationId: nomID})
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
	undoReq := connect.NewRequest(&hemav1.UndoRequest{NominationId: nomID})
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
		connect.NewRequest(&hemav1.GetLayoutRequest{NominationId: seedTournamentID}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated without token, got %v", connect.CodeOf(err))
	}
}

// ── pool × bout — сквозной путь через internal/platform-адаптер, не через
// fake (spec 0010, T19). Единственное место, реально проверяющее связку
// pool.SetLayoutStatus → PoolBoutGenerator → bout-схема через живой PG. ──

func setLayoutStatus(t *testing.T, c clients, nominationID string, status hemav1.PoolLayoutStatus) *hemav1.PoolLayout {
	t.Helper()
	req := connect.NewRequest(&hemav1.SetLayoutStatusRequest{NominationId: nominationID, Status: status})
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
// живой PoolBoutGenerator, не fake) — round-robin по каждому пулу.
func TestIntegration_SetLayoutStatusReady_GeneratesBouts(t *testing.T) {
	c, _ := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "")
	f2 := createFighter(t, c, nomID, "Пётр", "")
	f3 := createFighter(t, c, nomID, "Сидор", "")

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{NominationId: nomID})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	poolID := created.Msg.Layout.Pools[0].Id

	for _, fid := range []string{f1, f2, f3} {
		assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{NominationId: nomID, FighterId: fid, PoolId: poolID})
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

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{NominationId: nomID})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	poolID := created.Msg.Layout.Pools[0].Id
	for _, fid := range []string{f1, f2} {
		assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{NominationId: nomID, FighterId: fid, PoolId: poolID})
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

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{NominationId: nomID})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	poolID := created.Msg.Layout.Pools[0].Id

	assign := func(fid string) {
		req := connect.NewRequest(&hemav1.AssignFighterRequest{NominationId: nomID, FighterId: fid, PoolId: poolID})
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

	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{NominationId: nomID})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	poolID = created.Msg.Layout.Pools[0].Id

	assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{NominationId: nomID, FighterId: fID, PoolId: poolID})
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
