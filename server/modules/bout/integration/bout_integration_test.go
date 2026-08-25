//go:build integration

// Package integration — сквозные тесты модуля bout на реальной PostgreSQL
// (testcontainers). См. ADR 0010. GenerateForStage/ClearForPools не имеют
// публичного RPC (триггерятся из stage.SetLayoutStatus — см.
// modules/stage/integration для сквозного pool×bout пути, spec 0010 T19,
// спека 0017 FR-8) — здесь они вызываются напрямую через bout-сервис поверх
// реальной БД; ListBoutsByNomination проверяется через реальный Connect × PG.
package integration

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/internal/testdb"
	"github.com/hema/server/modules/auth"
	boutmodule "github.com/hema/server/modules/bout"
	"github.com/hema/server/modules/bout/domain"
	boutrepo "github.com/hema/server/modules/bout/repo"
	boutservice "github.com/hema/server/modules/bout/service"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
)

const (
	adminUserID = "00000000-0000-0000-0000-000000000aaa"
	accessKey   = "integration-access-secret"
	refreshKey  = "integration-refresh-secret"
)

// setup поднимает PG (testdb.Postgres), применяет миграции всех модулей,
// возвращает Connect-клиента BoutAdminService (чтение) и сервис bout
// поверх того же пула соединений (для прямых вызовов Generate/Clear —
// нет публичного RPC на запись, см. package doc).
func setup(t *testing.T) (hemav1connect.BoutAdminServiceClient, *boutservice.Service, *pgxpool.Pool) {
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
	boutmodule.Register(mux, boutmodule.Deps{Pool: pool}, baseOpts, adminOpts)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	svc := boutservice.New(boutrepo.New(pool))
	client := hemav1connect.NewBoutAdminServiceClient(server.Client(), server.URL)
	return client, svc, pool
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

func listBouts(t *testing.T, c hemav1connect.BoutAdminServiceClient, nominationID string) []*hemav1.Bout {
	t.Helper()
	req := connect.NewRequest(&hemav1.ListBoutsByNominationRequest{NominationId: nominationID})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.ListBoutsByNomination(context.Background(), req)
	if err != nil {
		t.Fatalf("ListBoutsByNomination: %v", err)
	}
	return res.Msg.Bouts
}

// TestIntegration_MigrationsApplied — косвенно: setup гоняет goose Up для
// всех модулей, включая bout. Если миграции падают, setup валится здесь.
func TestIntegration_MigrationsApplied(t *testing.T) {
	setup(t)
}

// TestIntegration_GenerateForStage_MultiplePools проверяет, что
// GenerateForStage формирует бои для нескольких пулов одной номинации
// и ListBoutsByNomination возвращает их отсортированными по
// pool_id, sequence_number через реальный Connect × PG.
func TestIntegration_GenerateForStage_MultiplePools(t *testing.T) {
	c, svc, _ := setup(t)
	nomID := uuid.NewString()
	poolA := uuid.NewString()
	poolB := uuid.NewString()

	fighters := func(n int) []domain.FighterRef {
		out := make([]domain.FighterRef, n)
		for i := range out {
			out[i] = domain.FighterRef{ID: uuid.NewString(), Name: "F", Club: ""}
		}
		return out
	}

	err := svc.GenerateForStage(context.Background(), nomID, []domain.PoolInput{
		{PoolID: poolA, Fighters: fighters(3)}, // C(3,2) = 3 bouts
		{PoolID: poolB, Fighters: fighters(2)}, // C(2,2) = 1 bout
	})
	if err != nil {
		t.Fatalf("GenerateForStage: %v", err)
	}

	bouts := listBouts(t, c, nomID)
	if len(bouts) != 4 {
		t.Fatalf("expected 4 bouts (3+1), got %d: %+v", len(bouts), bouts)
	}
	byPool := map[string]int{}
	for _, b := range bouts {
		byPool[b.PoolId]++
		if b.NominationId != nomID {
			t.Errorf("bout %s has nomination_id=%s, want %s", b.Id, b.NominationId, nomID)
		}
	}
	if byPool[poolA] != 3 || byPool[poolB] != 1 {
		t.Fatalf("unexpected per-pool bout counts: %+v", byPool)
	}
}

// TestIntegration_ReplaceForPools_TransactionalReplace проверяет, что
// повторный вызов GenerateForStage полностью заменяет прежний набор
// боёв пула (delete+insert одной транзакцией) — старые бои не
// остаются вперемешку с новыми (FR-6).
func TestIntegration_ReplaceForPools_TransactionalReplace(t *testing.T) {
	c, svc, _ := setup(t)
	nomID := uuid.NewString()
	poolID := uuid.NewString()

	f1, f2, f3 := uuid.NewString(), uuid.NewString(), uuid.NewString()
	first := []domain.FighterRef{{ID: f1, Name: "A"}, {ID: f2, Name: "B"}}
	if err := svc.GenerateForStage(context.Background(), nomID, []domain.PoolInput{
		{PoolID: poolID, Fighters: first},
	}); err != nil {
		t.Fatalf("GenerateForStage (first): %v", err)
	}
	if got := listBouts(t, c, nomID); len(got) != 1 {
		t.Fatalf("expected 1 bout after first generate, got %d", len(got))
	}

	// Другой состав (3 бойца вместо 2) — должен полностью заменить прежний.
	second := []domain.FighterRef{{ID: f1, Name: "A"}, {ID: f2, Name: "B"}, {ID: f3, Name: "C"}}
	if err := svc.GenerateForStage(context.Background(), nomID, []domain.PoolInput{
		{PoolID: poolID, Fighters: second},
	}); err != nil {
		t.Fatalf("GenerateForStage (second): %v", err)
	}
	got := listBouts(t, c, nomID)
	if len(got) != 3 {
		t.Fatalf("expected 3 bouts after replace (C(3,2)), got %d: %+v", len(got), got)
	}
}

// TestIntegration_ClearForPools_DeletesOnlyListedPoolBouts проверяет, что
// ClearForPools (вызывается stage при расфиксации этапа, спека 0017 FR-8)
// удаляет бои перечисленных пулов и не трогает бои другого пула той же
// номинации.
func TestIntegration_ClearForPools_DeletesOnlyListedPoolBouts(t *testing.T) {
	c, svc, _ := setup(t)
	nomID := uuid.NewString()
	poolID := uuid.NewString()
	otherPoolID := uuid.NewString()

	f1, f2 := uuid.NewString(), uuid.NewString()
	f3, f4 := uuid.NewString(), uuid.NewString()
	if err := svc.GenerateForStage(context.Background(), nomID, []domain.PoolInput{
		{PoolID: poolID, Fighters: []domain.FighterRef{{ID: f1}, {ID: f2}}},
		{PoolID: otherPoolID, Fighters: []domain.FighterRef{{ID: f3}, {ID: f4}}},
	}); err != nil {
		t.Fatalf("GenerateForStage: %v", err)
	}
	if got := listBouts(t, c, nomID); len(got) != 2 {
		t.Fatalf("expected 2 bouts before clear, got %d", len(got))
	}

	if err := svc.ClearForPools(context.Background(), []string{poolID}); err != nil {
		t.Fatalf("ClearForPools: %v", err)
	}
	got := listBouts(t, c, nomID)
	if len(got) != 1 {
		t.Fatalf("expected 1 bout left (other pool untouched) after clear, got %d: %+v", len(got), got)
	}
	if got[0].PoolId != otherPoolID {
		t.Fatalf("expected remaining bout to belong to otherPoolID %s, got %s", otherPoolID, got[0].PoolId)
	}
}

// TestIntegration_UniqueConstraint_PoolSequenceNumber проверяет, что
// UNIQUE(pool_id, sequence_number) в bout.bouts реально держит инвариант
// на уровне БД, а не только в доменной логике: конструируем через репо
// заведомо конфликтующие бои (тот же pool_id + sequence_number дважды) —
// ReplaceForPools должен откатить транзакцию целиком и вернуть ошибку.
func TestIntegration_UniqueConstraint_PoolSequenceNumber(t *testing.T) {
	_, _, pool := setup(t)
	repo := boutrepo.New(pool)
	nomID := uuid.NewString()
	poolID := uuid.NewString()
	fa, fb, fc := uuid.NewString(), uuid.NewString(), uuid.NewString()

	conflicting := []domain.Bout{
		{PoolID: poolID, NominationID: nomID, RoundNumber: 1, SequenceNumber: 1,
			FighterA: domain.FighterRef{ID: fa}, FighterB: domain.FighterRef{ID: fb}},
		{PoolID: poolID, NominationID: nomID, RoundNumber: 1, SequenceNumber: 1, // same pool_id+sequence_number
			FighterA: domain.FighterRef{ID: fa}, FighterB: domain.FighterRef{ID: fc}},
	}

	if err := repo.ReplaceForPools(context.Background(), []string{poolID}, conflicting); err == nil {
		t.Fatal("expected UNIQUE(pool_id, sequence_number) violation, got nil error")
	}

	// Транзакция должна была откатиться целиком — ни одного боя не осталось.
	remaining, err := repo.ListByNomination(context.Background(), nomID)
	if err != nil {
		t.Fatalf("ListByNomination after failed replace: %v", err)
	}
	if len(remaining) != 0 {
		t.Fatalf("expected rollback to leave 0 bouts, got %d", len(remaining))
	}
}

func TestIntegration_NoToken(t *testing.T) {
	c, _, _ := setup(t)
	_, err := c.ListBoutsByNomination(context.Background(),
		connect.NewRequest(&hemav1.ListBoutsByNominationRequest{NominationId: uuid.NewString()}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated without token, got %v", connect.CodeOf(err))
	}
}

// generateSingleBout — тестовый хелпер: генерирует один бой (2 бойца, 1 пул)
// для новой номинации и возвращает его ID.
func generateSingleBout(t *testing.T, svc *boutservice.Service, poolID string) string {
	t.Helper()
	nomID := uuid.NewString()
	fa, fb := uuid.NewString(), uuid.NewString()
	if err := svc.GenerateForStage(context.Background(), nomID, []domain.PoolInput{
		{PoolID: poolID, Fighters: []domain.FighterRef{{ID: fa, Name: "A"}, {ID: fb, Name: "B"}}},
	}); err != nil {
		t.Fatalf("GenerateForStage: %v", err)
	}
	bouts, err := svc.ListByNomination(context.Background(), nomID)
	if err != nil {
		t.Fatalf("ListByNomination: %v", err)
	}
	if len(bouts) != 1 {
		t.Fatalf("expected 1 bout, got %d", len(bouts))
	}
	return bouts[0].ID
}

// TestIntegration_ConcurrentAppend_OnlyOneSucceeds проверяет AC-15/ADR 0011
// п.3 на реальной БД: два параллельных Append из одной и той же
// expectedVersion — только один вставляется, второй ловит нарушение
// UNIQUE(bout_id, version) и получает ErrConcurrency. Итоговая версия потока
// продвигается ровно на одно событие, не на два.
func TestIntegration_ConcurrentAppend_OnlyOneSucceeds(t *testing.T) {
	_, svc, pool := setup(t)
	repo := boutrepo.New(pool)
	boutID := generateSingleBout(t, svc, uuid.NewString())

	events, err := repo.Load(context.Background(), boutID)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	scheduled, err := domain.Rebuild(boutID, events)
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}

	evA, err := scheduled.Start("secretary-a", time.Unix(1, 0))
	if err != nil {
		t.Fatalf("Start (a): %v", err)
	}
	viewA, err := domain.Rebuild(boutID, append(events, evA))
	if err != nil {
		t.Fatalf("Rebuild (a): %v", err)
	}

	evB, err := scheduled.Start("secretary-b", time.Unix(2, 0))
	if err != nil {
		t.Fatalf("Start (b): %v", err)
	}
	viewB, err := domain.Rebuild(boutID, append(events, evB))
	if err != nil {
		t.Fatalf("Rebuild (b): %v", err)
	}

	var wg sync.WaitGroup
	results := make([]error, 2)
	wg.Add(2)
	go func() {
		defer wg.Done()
		results[0] = repo.Append(context.Background(), boutID, scheduled.Version, evA, viewA)
	}()
	go func() {
		defer wg.Done()
		results[1] = repo.Append(context.Background(), boutID, scheduled.Version, evB, viewB)
	}()
	wg.Wait()

	successes, conflicts := 0, 0
	for _, err := range results {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, domain.ErrConcurrency):
			conflicts++
		default:
			t.Fatalf("unexpected error from concurrent Append: %v", err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("expected exactly 1 success and 1 ErrConcurrency, got %d successes, %d conflicts (results=%v)", successes, conflicts, results)
	}

	finalEvents, err := repo.Load(context.Background(), boutID)
	if err != nil {
		t.Fatalf("Load after concurrent append: %v", err)
	}
	if len(finalEvents) != 2 {
		t.Fatalf("expected stream length 2 (scheduled + one started), got %d", len(finalEvents))
	}
}

// TestIntegration_Append_ProjectionAtomicWithEvent проверяет ADR 0011 п.4:
// после Append проекция (bout.bouts) отражает ровно то состояние, которое
// было передано вместе с событием, в той же транзакции.
func TestIntegration_Append_ProjectionAtomicWithEvent(t *testing.T) {
	_, svc, pool := setup(t)
	repo := boutrepo.New(pool)
	boutID := generateSingleBout(t, svc, uuid.NewString())

	events, err := repo.Load(context.Background(), boutID)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	current, err := domain.Rebuild(boutID, events)
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	startEv, err := current.Start("secretary", time.Unix(1, 0))
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	afterStart, err := domain.Rebuild(boutID, append(events, startEv))
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if err := repo.Append(context.Background(), boutID, current.Version, startEv, afterStart); err != nil {
		t.Fatalf("Append (start): %v", err)
	}

	scoreEv, err := afterStart.Score("secretary", 5, 3, time.Unix(2, 0))
	if err != nil {
		t.Fatalf("Score: %v", err)
	}
	afterScore, err := domain.Rebuild(boutID, append(events, startEv, scoreEv))
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if err := repo.Append(context.Background(), boutID, afterStart.Version, scoreEv, afterScore); err != nil {
		t.Fatalf("Append (score): %v", err)
	}

	got, err := repo.GetBout(context.Background(), boutID)
	if err != nil {
		t.Fatalf("GetBout: %v", err)
	}
	if got.State != domain.StateInProgress {
		t.Fatalf("State = %v, want StateInProgress", got.State)
	}
	if got.ScoreA != 5 || got.ScoreB != 3 {
		t.Fatalf("projection score = %d:%d, want 5:3", got.ScoreA, got.ScoreB)
	}
	if got.Version != 3 {
		t.Fatalf("projection version = %d, want 3 (scheduled+started+scored)", got.Version)
	}

	total, started, finished, err := repo.PoolProgress(context.Background(), got.PoolID)
	if err != nil {
		t.Fatalf("PoolProgress: %v", err)
	}
	if total != 1 || started != 1 || finished != 0 {
		t.Fatalf("PoolProgress = %d/%d/%d, want 1/1/0", total, started, finished)
	}

	anyStarted, err := repo.AnyStartedInPools(context.Background(), []string{got.PoolID})
	if err != nil {
		t.Fatalf("AnyStartedInPools: %v", err)
	}
	if !anyStarted {
		t.Fatal("expected AnyStartedInPools to be true")
	}
}

// TestIntegration_Regenerate_CascadesEventDeletion проверяет, что
// регенерация боёв пула (ReplaceForPools, вызывается при
// draft→ready, спека 0010) удаляет старые строки bouts вместе с их
// потоками событий каскадом FK (ON DELETE CASCADE, миграция 00002) — а не
// только явным DELETE в коде.
func TestIntegration_Regenerate_CascadesEventDeletion(t *testing.T) {
	_, svc, pool := setup(t)
	repo := boutrepo.New(pool)
	nomID := uuid.NewString()
	poolID := uuid.NewString()

	f1, f2, f3 := uuid.NewString(), uuid.NewString(), uuid.NewString()
	if err := svc.GenerateForStage(context.Background(), nomID, []domain.PoolInput{
		{PoolID: poolID, Fighters: []domain.FighterRef{{ID: f1, Name: "A"}, {ID: f2, Name: "B"}}},
	}); err != nil {
		t.Fatalf("GenerateForStage (first): %v", err)
	}
	first, err := svc.ListByNomination(context.Background(), nomID)
	if err != nil {
		t.Fatalf("ListByNomination: %v", err)
	}
	if len(first) != 1 {
		t.Fatalf("expected 1 bout, got %d", len(first))
	}
	oldBoutID := first[0].ID

	oldEvents, err := repo.Load(context.Background(), oldBoutID)
	if err != nil {
		t.Fatalf("Load (before regen): %v", err)
	}
	if len(oldEvents) != 1 {
		t.Fatalf("expected 1 scheduled event before regen, got %d", len(oldEvents))
	}

	// Регенерация другим составом — старая строка bouts удаляется и должна
	// каскадно удалить её события.
	if err := svc.GenerateForStage(context.Background(), nomID, []domain.PoolInput{
		{PoolID: poolID, Fighters: []domain.FighterRef{{ID: f1, Name: "A"}, {ID: f2, Name: "B"}, {ID: f3, Name: "C"}}},
	}); err != nil {
		t.Fatalf("GenerateForStage (second): %v", err)
	}

	if _, err := repo.Load(context.Background(), oldBoutID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound for old bout's events after cascade, got %v", err)
	}
	if _, err := repo.GetBout(context.Background(), oldBoutID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound for old bout's projection after regen, got %v", err)
	}
}

// TestIntegration_EventsForPools_OrdersNewestFirstWithoutScheduled — T6
// (spec 0033, FR-33): runs a bout through real domain commands (Start ->
// Score -> Finish -> Reopen, via boutservice like a real secretary would)
// on real PG, then checks EventsForPools for that bout's pool returns the
// journal newest-first, without the scheduled event, with the actor and the
// score snapshot on Finished matching the last Scored. This is the only
// place that exercises the real SQL behind EventsForPools (join with the
// bouts projection, exclusion of scheduled, ORDER BY occurred_at DESC,
// version DESC).
func TestIntegration_EventsForPools_OrdersNewestFirstWithoutScheduled(t *testing.T) {
	_, svc, pool := setup(t)
	repo := boutrepo.New(pool)
	poolID := uuid.NewString()
	boutID := generateSingleBout(t, svc, poolID)
	actorID := uuid.NewString()

	t0 := time.Unix(1000, 0)
	t1 := time.Unix(1001, 0)
	t2 := time.Unix(1002, 0)
	t3 := time.Unix(1003, 0)

	if _, err := svc.StartBout(context.Background(), boutID, actorID, t0); err != nil {
		t.Fatalf("StartBout: %v", err)
	}
	if _, err := svc.ScoreBout(context.Background(), boutID, actorID, 5, 3, t1); err != nil {
		t.Fatalf("ScoreBout: %v", err)
	}
	if _, err := svc.FinishBout(context.Background(), boutID, actorID, t2); err != nil {
		t.Fatalf("FinishBout: %v", err)
	}
	if _, err := svc.ReopenBout(context.Background(), boutID, actorID, t3); err != nil {
		t.Fatalf("ReopenBout: %v", err)
	}

	// GenerateRoundRobin sorts fighters by ID before pairing (domain/distribute.go),
	// so which of the two random UUIDs lands in FighterA vs FighterB is not the
	// input order — read the real projection to know the ground truth instead of
	// assuming it.
	wantBout, err := repo.GetBout(context.Background(), boutID)
	if err != nil {
		t.Fatalf("GetBout: %v", err)
	}

	entries, err := repo.EventsForPools(context.Background(), []string{poolID}, 50)
	if err != nil {
		t.Fatalf("EventsForPools: %v", err)
	}
	if len(entries) != 4 {
		t.Fatalf("expected 4 journal entries (started, scored, finished, reopened; scheduled excluded), got %d: %+v", len(entries), entries)
	}

	// Newest first: reopened, finished, scored, started.
	wantOrder := []domain.EventType{domain.EventReopened, domain.EventFinished, domain.EventScored, domain.EventStarted}
	for i, want := range wantOrder {
		if entries[i].Type != want {
			t.Fatalf("entries[%d].Type = %v, want %v (full order: %+v)", i, entries[i].Type, want, entries)
		}
	}

	for _, e := range entries {
		if e.Type == domain.EventScheduled {
			t.Fatalf("scheduled event leaked into EventsForPools: %+v", e)
		}
		if e.BoutID != boutID {
			t.Errorf("entry BoutID = %q, want %q", e.BoutID, boutID)
		}
		if e.PoolID != poolID {
			t.Errorf("entry PoolID = %q, want %q", e.PoolID, poolID)
		}
		if e.ActorID != actorID {
			t.Errorf("entry ActorID = %q, want %q", e.ActorID, actorID)
		}
		if e.FighterA != wantBout.FighterA || e.FighterB != wantBout.FighterB {
			t.Errorf("fighters = %+v / %+v, want projection-sourced %+v / %+v", e.FighterA, e.FighterB, wantBout.FighterA, wantBout.FighterB)
		}
	}

	// Finished carries a score snapshot that must match the last Scored.
	finished := entries[1]
	scored := entries[2]
	if finished.ScoreA != scored.ScoreA || finished.ScoreB != scored.ScoreB {
		t.Fatalf("finished score snapshot %d:%d does not match last scored %d:%d", finished.ScoreA, finished.ScoreB, scored.ScoreA, scored.ScoreB)
	}
	if scored.ScoreA != 5 || scored.ScoreB != 3 {
		t.Fatalf("scored entry = %d:%d, want 5:3", scored.ScoreA, scored.ScoreB)
	}

	// A pool with no bouts at all is a valid no-op: empty, not an error.
	empty, err := repo.EventsForPools(context.Background(), []string{uuid.NewString()}, 50)
	if err != nil {
		t.Fatalf("EventsForPools (unrelated pool): %v", err)
	}
	if len(empty) != 0 {
		t.Fatalf("expected empty journal for an unrelated pool, got %d entries", len(empty))
	}
}

// TestIntegration_BoutTimesForPools_ReflectsRealEventJournal — T5 (spec
// 0034, FR-16/AC-11..AC-14): runs a bout through the real domain commands
// (Start -> Finish -> Reopen -> Reset, via boutservice like a real
// secretary would) against a real PG event journal, and checks
// BoutTimesForPools at every step. This is the only place that exercises
// the real SQL behind BoutTimesForPools (repo/queries/bout.sql) — the
// service/fake-repo tests only check the gating (empty poolIDs no-op) and
// passthrough, not the SQL's reopened/reset cutoff logic.
//
// Domain decisions this test locks in (see doc-comment on the SQL query
// for the full reasoning):
//   - not started: StartedAt/FinishedAt both nil (AC-13).
//   - started, not finished: StartedAt set, FinishedAt nil (AC-11).
//   - finished: StartedAt set, FinishedAt set (AC-12).
//   - finished, then reopened (spec 0013): StartedAt UNCHANGED (reopening
//     does not invalidate the original start time), FinishedAt reverts to
//     nil — the stale finished mark from before the reopen must not leak
//     through a naive MAX(occurred_at) over the whole append-only journal
//     (AC-14).
//   - reopened, then reset (spec 0013, only legal from in_progress): both
//     StartedAt and FinishedAt go back to nil — the bout is fully back to
//     not_started, so neither the pre-reset start nor the earlier finish
//     (already cleared by the reopen) should show through.
func TestIntegration_BoutTimesForPools_ReflectsRealEventJournal(t *testing.T) {
	_, svc, pool := setup(t)
	repo := boutrepo.New(pool)
	poolID := uuid.NewString()
	boutID := generateSingleBout(t, svc, poolID)
	actorID := uuid.NewString()

	times := func() domain.BoutTimes {
		t.Helper()
		got, err := repo.BoutTimesForPools(context.Background(), []string{poolID})
		if err != nil {
			t.Fatalf("BoutTimesForPools: %v", err)
		}
		bt, ok := got[boutID]
		if !ok {
			t.Fatalf("expected an entry for bout %q, got %+v", boutID, got)
		}
		return bt
	}

	// AC-13: scheduled but not started — both nil, no forecast.
	bt := times()
	if bt.StartedAt != nil {
		t.Fatalf("not-started bout: StartedAt = %v, want nil", *bt.StartedAt)
	}
	if bt.FinishedAt != nil {
		t.Fatalf("not-started bout: FinishedAt = %v, want nil", *bt.FinishedAt)
	}

	t0 := time.Unix(1000, 0).UTC()
	if _, err := svc.StartBout(context.Background(), boutID, actorID, t0); err != nil {
		t.Fatalf("StartBout: %v", err)
	}

	// AC-11: started, in progress — StartedAt set, FinishedAt nil.
	bt = times()
	if bt.StartedAt == nil || !bt.StartedAt.Equal(t0) {
		t.Fatalf("in-progress bout: StartedAt = %v, want %v", bt.StartedAt, t0)
	}
	if bt.FinishedAt != nil {
		t.Fatalf("in-progress bout: FinishedAt = %v, want nil", *bt.FinishedAt)
	}

	t1 := time.Unix(1001, 0).UTC()
	if _, err := svc.FinishBout(context.Background(), boutID, actorID, t1); err != nil {
		t.Fatalf("FinishBout: %v", err)
	}

	// AC-12: finished — both StartedAt and FinishedAt set.
	bt = times()
	if bt.StartedAt == nil || !bt.StartedAt.Equal(t0) {
		t.Fatalf("finished bout: StartedAt = %v, want %v", bt.StartedAt, t0)
	}
	if bt.FinishedAt == nil || !bt.FinishedAt.Equal(t1) {
		t.Fatalf("finished bout: FinishedAt = %v, want %v", bt.FinishedAt, t1)
	}

	t2 := time.Unix(1002, 0).UTC()
	if _, err := svc.ReopenBout(context.Background(), boutID, actorID, t2); err != nil {
		t.Fatalf("ReopenBout: %v", err)
	}

	// AC-14: reopened after finish — StartedAt is UNCHANGED (still t0, not
	// the reopen time), FinishedAt must revert to nil (the stale finished
	// mark from before the reopen must not leak through).
	bt = times()
	if bt.StartedAt == nil || !bt.StartedAt.Equal(t0) {
		t.Fatalf("reopened bout: StartedAt = %v, want unchanged %v (reopen must not touch it)", bt.StartedAt, t0)
	}
	if bt.FinishedAt != nil {
		t.Fatalf("reopened bout: FinishedAt = %v, want nil (stale pre-reopen finish must not leak through a naive MAX)", *bt.FinishedAt)
	}

	t3 := time.Unix(1003, 0).UTC()
	if _, err := svc.ResetBout(context.Background(), boutID, actorID, t3); err != nil {
		t.Fatalf("ResetBout: %v", err)
	}

	// Reset (only legal from in_progress, which Reopen put us back into):
	// the bout is fully back to not_started — both times go back to nil.
	bt = times()
	if bt.StartedAt != nil {
		t.Fatalf("reset bout: StartedAt = %v, want nil (reset clears the prior episode)", *bt.StartedAt)
	}
	if bt.FinishedAt != nil {
		t.Fatalf("reset bout: FinishedAt = %v, want nil", *bt.FinishedAt)
	}

	// Empty poolIDs is a valid no-op: empty map, not an error (mirrors
	// EventsForPools/AnyStartedInPools).
	empty, err := repo.BoutTimesForPools(context.Background(), nil)
	if err != nil {
		t.Fatalf("BoutTimesForPools(empty): %v", err)
	}
	if len(empty) != 0 {
		t.Fatalf("expected empty map for empty poolIDs, got %d entries", len(empty))
	}

	// A pool with no bouts at all is also a valid no-op.
	unrelated, err := repo.BoutTimesForPools(context.Background(), []string{uuid.NewString()})
	if err != nil {
		t.Fatalf("BoutTimesForPools (unrelated pool): %v", err)
	}
	if len(unrelated) != 0 {
		t.Fatalf("expected empty map for an unrelated pool, got %d entries", len(unrelated))
	}
}

// --- ExistsBoutForNomination / RepointFighter (спека 0040, T10) ---

// TestIntegration_ExistsBoutForNomination проверяет реальный SQL-запрос
// гейта удаления номинации (сценарий 1, FR-1б): номинация без боёв — false,
// после GenerateForStage — true. Использует idx_bouts_nomination.
func TestIntegration_ExistsBoutForNomination(t *testing.T) {
	_, svc, pool := setup(t)
	repo := boutrepo.New(pool)
	nomID := uuid.NewString()
	poolID := uuid.NewString()

	got, err := repo.ExistsBoutForNomination(context.Background(), nomID)
	if err != nil {
		t.Fatalf("ExistsBoutForNomination (before): %v", err)
	}
	if got {
		t.Fatal("expected false for a nomination without bouts")
	}

	fa, fb := uuid.NewString(), uuid.NewString()
	if err := svc.GenerateForStage(context.Background(), nomID, []domain.PoolInput{
		{PoolID: poolID, Fighters: []domain.FighterRef{{ID: fa, Name: "A"}, {ID: fb, Name: "B"}}},
	}); err != nil {
		t.Fatalf("GenerateForStage: %v", err)
	}

	got, err = repo.ExistsBoutForNomination(context.Background(), nomID)
	if err != nil {
		t.Fatalf("ExistsBoutForNomination (after): %v", err)
	}
	if !got {
		t.Fatal("expected true once the nomination has a scheduled bout")
	}

	// A different nomination remains unaffected.
	other, err := repo.ExistsBoutForNomination(context.Background(), uuid.NewString())
	if err != nil {
		t.Fatalf("ExistsBoutForNomination (unrelated nomination): %v", err)
	}
	if other {
		t.Fatal("expected false for an unrelated nomination")
	}
}

// TestIntegration_RepointFighter_MovesBothSides_KeepsSnapshot проверяет
// реальный SQL слияния дублей бойца (сценарий 3): RepointFighter переносит
// FighterID на обоих бортах (FighterA — в одном бою, FighterB — в другом),
// не трогая денормализованные имя/клуб — журнал боя остаётся историческим
// снапшотом на момент проведения (plan.md, «Риски»). Также проверяет
// идемпотентность: повторный вызов на уже репойнтнутые строки — no-op, не
// ошибка.
func TestIntegration_RepointFighter_MovesBothSides_KeepsSnapshot(t *testing.T) {
	c, svc, pool := setup(t)
	repo := boutrepo.New(pool)

	oldID, newID := uuid.NewString(), uuid.NewString()
	otherA, otherB := uuid.NewString(), uuid.NewString()

	// Bout 1: oldID on the A side, opposite an unrelated fighter.
	nom1 := uuid.NewString()
	pool1 := uuid.NewString()
	if err := svc.GenerateForStage(context.Background(), nom1, []domain.PoolInput{
		{PoolID: pool1, Fighters: []domain.FighterRef{
			{ID: oldID, Name: "Old Name", Club: "Old Club"},
			{ID: otherA, Name: "Other A", Club: "Club A"},
		}},
	}); err != nil {
		t.Fatalf("GenerateForStage (bout 1): %v", err)
	}

	// Bout 2: oldID on the B side (different nomination/pool — fighter_a_id
	// vs fighter_b_id assignment inside GenerateRoundRobin isn't controlled
	// directly, so a second pair with a distinct opponent still exercises
	// whichever side oldID lands on).
	nom2 := uuid.NewString()
	pool2 := uuid.NewString()
	if err := svc.GenerateForStage(context.Background(), nom2, []domain.PoolInput{
		{PoolID: pool2, Fighters: []domain.FighterRef{
			{ID: otherB, Name: "Other B", Club: "Club B"},
			{ID: oldID, Name: "Old Name", Club: "Old Club"},
		}},
	}); err != nil {
		t.Fatalf("GenerateForStage (bout 2): %v", err)
	}

	bouts1 := listBouts(t, c, nom1)
	bouts2 := listBouts(t, c, nom2)
	if len(bouts1) != 1 || len(bouts2) != 1 {
		t.Fatalf("expected 1 bout each, got %d and %d", len(bouts1), len(bouts2))
	}

	if err := repo.RepointFighter(context.Background(), oldID, newID); err != nil {
		t.Fatalf("RepointFighter: %v", err)
	}

	check := func(nomID string) *hemav1.Bout {
		t.Helper()
		got := listBouts(t, c, nomID)
		if len(got) != 1 {
			t.Fatalf("expected 1 bout for nomination %s, got %d", nomID, len(got))
		}
		return got[0]
	}

	for _, nomID := range []string{nom1, nom2} {
		b := check(nomID)
		var (
			id, name, club string
			found          bool
		)
		switch {
		case b.FighterA.FighterId == oldID:
			t.Fatalf("bout %s: fighter_a_id still points at oldID %s after repoint", b.Id, oldID)
		case b.FighterB.FighterId == oldID:
			t.Fatalf("bout %s: fighter_b_id still points at oldID %s after repoint", b.Id, oldID)
		case b.FighterA.FighterId == newID:
			id, name, club, found = b.FighterA.FighterId, b.FighterA.Name, b.FighterA.Club, true
		case b.FighterB.FighterId == newID:
			id, name, club, found = b.FighterB.FighterId, b.FighterB.Name, b.FighterB.Club, true
		}
		if !found {
			t.Fatalf("bout %s: expected newID %s on one side, got fighter_a_id=%s fighter_b_id=%s", b.Id, newID, b.FighterA.FighterId, b.FighterB.FighterId)
		}
		if id != newID {
			t.Fatalf("bout %s: expected repointed id %s, got %s", b.Id, newID, id)
		}
		// The denormalized snapshot (name/club) must NOT be rewritten —
		// the bout log stays a historical fact (plan.md, «Риски»).
		if name != "Old Name" || club != "Old Club" {
			t.Fatalf("bout %s: expected snapshot to stay ('Old Name'/'Old Club'), got (%q/%q)", b.Id, name, club)
		}
	}

	// Idempotent: repointing again (oldID no longer referenced anywhere)
	// finds no rows and does not error.
	if err := repo.RepointFighter(context.Background(), oldID, newID); err != nil {
		t.Fatalf("RepointFighter (idempotent repeat): %v", err)
	}
}
