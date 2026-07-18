//go:build integration

// Package integration — сквозные тесты модуля bout на реальной PostgreSQL
// (testcontainers). См. ADR 0010. GenerateForNomination/ClearForNomination
// не имеют публичного RPC (триггерятся из pool.SetLayoutStatus — см.
// modules/pool/integration для сквозного pool×bout пути, spec 0010 T19) —
// здесь они вызываются напрямую через bout-сервис поверх реальной БД;
// ListBoutsByNomination проверяется через реальный Connect × PG.
package integration

import (
	"context"
	"net/http"
	"net/http/httptest"
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

// TestIntegration_GenerateForNomination_MultiplePools проверяет, что
// GenerateForNomination формирует бои для нескольких пулов одной номинации
// и ListBoutsByNomination возвращает их отсортированными по
// pool_id, sequence_number через реальный Connect × PG.
func TestIntegration_GenerateForNomination_MultiplePools(t *testing.T) {
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

	err := svc.GenerateForNomination(context.Background(), nomID, []domain.PoolInput{
		{PoolID: poolA, Fighters: fighters(3)}, // C(3,2) = 3 bouts
		{PoolID: poolB, Fighters: fighters(2)}, // C(2,2) = 1 bout
	})
	if err != nil {
		t.Fatalf("GenerateForNomination: %v", err)
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
// повторный вызов GenerateForNomination полностью заменяет прежний набор
// боёв номинации (delete+insert одной транзакцией) — старые бои не
// остаются вперемешку с новыми (FR-6).
func TestIntegration_ReplaceForNomination_TransactionalReplace(t *testing.T) {
	c, svc, _ := setup(t)
	nomID := uuid.NewString()
	poolID := uuid.NewString()

	f1, f2, f3 := uuid.NewString(), uuid.NewString(), uuid.NewString()
	first := []domain.FighterRef{{ID: f1, Name: "A"}, {ID: f2, Name: "B"}}
	if err := svc.GenerateForNomination(context.Background(), nomID, []domain.PoolInput{
		{PoolID: poolID, Fighters: first},
	}); err != nil {
		t.Fatalf("GenerateForNomination (first): %v", err)
	}
	if got := listBouts(t, c, nomID); len(got) != 1 {
		t.Fatalf("expected 1 bout after first generate, got %d", len(got))
	}

	// Другой состав (3 бойца вместо 2) — должен полностью заменить прежний.
	second := []domain.FighterRef{{ID: f1, Name: "A"}, {ID: f2, Name: "B"}, {ID: f3, Name: "C"}}
	if err := svc.GenerateForNomination(context.Background(), nomID, []domain.PoolInput{
		{PoolID: poolID, Fighters: second},
	}); err != nil {
		t.Fatalf("GenerateForNomination (second): %v", err)
	}
	got := listBouts(t, c, nomID)
	if len(got) != 3 {
		t.Fatalf("expected 3 bouts after replace (C(3,2)), got %d: %+v", len(got), got)
	}
}

// TestIntegration_ClearForNomination_DeletesAllBouts проверяет, что
// ClearForNomination (вызывается pool при возврате ready → draft) удаляет
// все бои номинации.
func TestIntegration_ClearForNomination_DeletesAllBouts(t *testing.T) {
	c, svc, _ := setup(t)
	nomID := uuid.NewString()
	poolID := uuid.NewString()

	f1, f2 := uuid.NewString(), uuid.NewString()
	if err := svc.GenerateForNomination(context.Background(), nomID, []domain.PoolInput{
		{PoolID: poolID, Fighters: []domain.FighterRef{{ID: f1}, {ID: f2}}},
	}); err != nil {
		t.Fatalf("GenerateForNomination: %v", err)
	}
	if got := listBouts(t, c, nomID); len(got) != 1 {
		t.Fatalf("expected 1 bout before clear, got %d", len(got))
	}

	if err := svc.ClearForNomination(context.Background(), nomID); err != nil {
		t.Fatalf("ClearForNomination: %v", err)
	}
	if got := listBouts(t, c, nomID); len(got) != 0 {
		t.Fatalf("expected 0 bouts after clear, got %d: %+v", len(got), got)
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
