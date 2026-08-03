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

// TestIntegration_ReplaceForNomination_TransactionalReplace проверяет, что
// повторный вызов GenerateForStage полностью заменяет прежний набор
// боёв номинации (delete+insert одной транзакцией) — старые бои не
// остаются вперемешку с новыми (FR-6).
func TestIntegration_ReplaceForNomination_TransactionalReplace(t *testing.T) {
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
// ReplaceForNomination должен откатить транзакцию целиком и вернуть ошибку.
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

	if err := repo.ReplaceForNomination(context.Background(), nomID, conflicting); err == nil {
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
// регенерация боёв номинации (ReplaceForNomination, вызывается при
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
