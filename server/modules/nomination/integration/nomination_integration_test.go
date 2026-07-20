//go:build integration

// Package integration — сквозные e2e-тесты модуля nomination на реальной
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
	"github.com/jackc/pgx/v5/pgxpool"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/internal/testdb"
	"github.com/hema/server/modules/auth"
	"github.com/hema/server/modules/nomination"
	"github.com/hema/server/modules/tournament"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
)

const (
	adminUserID = "00000000-0000-0000-0000-000000000aaa"
	accessKey   = "integration-access-secret"
	refreshKey  = "integration-refresh-secret"
	// seedTournamentID — id активного турнира, засеянного миграцией модуля
	// tournament (см. modules/tournament/migrations/00001_init.sql).
	seedTournamentID = "00000000-0000-0000-0000-000000000001"
)

// setup поднимает PG (testdb.Postgres), применяет миграции auth+tournament+
// nomination, собирает composition root (реальный пул БД) и возвращает
// Connect-клиенты для публичного и admin-сервисов номинаций.
func setup(t *testing.T) (hemav1connect.NominationServiceClient, hemav1connect.NominationAdminServiceClient, *pgxpool.Pool) {
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
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	auth.Register(mux, auth.Deps{Pool: pool, Tokens: tokens}, baseOpts, adminOpts)
	tournament.Register(mux, tournament.Deps{Pool: pool}, baseOpts, adminOpts)
	nomination.Register(mux, nomination.Deps{
		Pool:        pool,
		Tournaments: tournament.NewActiveTournamentIDProvider(pool),
	}, baseOpts, adminOpts)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	pub := hemav1connect.NewNominationServiceClient(client, server.URL)
	admin := hemav1connect.NewNominationAdminServiceClient(client, server.URL)
	return pub, admin, pool
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

// TestIntegration_MigrationsApplied — косвенно: setup гоняет goose Up для
// auth, tournament и nomination. Если миграции падают, setup валится здесь.
func TestIntegration_MigrationsApplied(t *testing.T) {
	setup(t)
}

func TestIntegration_CreateAndListNominations(t *testing.T) {
	pub, admin, _ := setup(t)

	fc := int32(20)
	req := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId:    seedTournamentID,
		Title:           "Longsword Open",
		Description:     "e2e with real PG",
		FighterCapacity: &fc,
		Metadata:        &hemav1.NominationMetadata{RulesUrl: strPtr("https://example.com/rules")},
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.CreateNomination(context.Background(), req)
	if err != nil {
		t.Fatalf("CreateNomination: %v", err)
	}
	got := res.Msg.Nomination
	if got.Title != "Longsword Open" {
		t.Errorf("title = %q", got.Title)
	}
	if got.FighterCapacity == nil || *got.FighterCapacity != 20 {
		t.Errorf("fighter_capacity = %v", got.FighterCapacity)
	}
	if got.Metadata.GetRulesUrl() != "https://example.com/rules" {
		t.Errorf("metadata.rules_url round-trip = %q", got.Metadata.GetRulesUrl())
	}

	listRes, err := pub.ListNominations(context.Background(), connect.NewRequest(&hemav1.ListNominationsRequest{
		TournamentId: seedTournamentID,
	}))
	if err != nil {
		t.Fatalf("ListNominations: %v", err)
	}
	if len(listRes.Msg.Nominations) != 1 {
		t.Fatalf("nominations len = %d, want 1", len(listRes.Msg.Nominations))
	}
	if listRes.Msg.Nominations[0].Id != got.Id {
		t.Errorf("persisted id mismatch: %q vs %q", listRes.Msg.Nominations[0].Id, got.Id)
	}
}

func TestIntegration_ListNominations_NoTokenAllowed(t *testing.T) {
	pub, _, _ := setup(t)

	_, err := pub.ListNominations(context.Background(), connect.NewRequest(&hemav1.ListNominationsRequest{
		TournamentId: seedTournamentID,
	}))
	if err != nil {
		t.Errorf("public RPC without token should not fail, got %v", err)
	}
}

func TestIntegration_CreateNomination_DuplicateTitleUniqueIndex(t *testing.T) {
	_, admin, _ := setup(t)

	create := func(title string) error {
		req := connect.NewRequest(&hemav1.CreateNominationRequest{
			TournamentId: seedTournamentID,
			Title:        title,
		})
		req.Header().Set("Authorization", adminBearer(t))
		_, err := admin.CreateNomination(context.Background(), req)
		return err
	}

	if err := create("Сабля"); err != nil {
		t.Fatalf("first create: %v", err)
	}
	// Другой регистр — unique index на lower(title) должен отклонить.
	err := create("сабля")
	if connect.CodeOf(err) != connect.CodeAlreadyExists {
		t.Errorf("expected CodeAlreadyExists (unique index violation), got %v", connect.CodeOf(err))
	}
}

func TestIntegration_CreateNomination_NonActiveTournamentReturnsNotFound(t *testing.T) {
	_, admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId: "99999999-9999-9999-9999-999999999999",
		Title:        "T",
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.CreateNomination(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestIntegration_ReorderNominations_TransactionalAndPersisted(t *testing.T) {
	pub, admin, _ := setup(t)

	createNomination := func(title string) *hemav1.Nomination {
		req := connect.NewRequest(&hemav1.CreateNominationRequest{
			TournamentId: seedTournamentID,
			Title:        title,
		})
		req.Header().Set("Authorization", adminBearer(t))
		res, err := admin.CreateNomination(context.Background(), req)
		if err != nil {
			t.Fatalf("create %q: %v", title, err)
		}
		return res.Msg.Nomination
	}

	a := createNomination("A")
	b := createNomination("B")
	c := createNomination("C")

	req := connect.NewRequest(&hemav1.ReorderNominationsRequest{
		TournamentId: seedTournamentID,
		OrderedIds:   []string{c.Id, a.Id, b.Id},
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.ReorderNominations(context.Background(), req)
	if err != nil {
		t.Fatalf("ReorderNominations: %v", err)
	}
	if len(res.Msg.Nominations) != 3 {
		t.Fatalf("len = %d, want 3", len(res.Msg.Nominations))
	}
	if res.Msg.Nominations[0].Id != c.Id || res.Msg.Nominations[1].Id != a.Id || res.Msg.Nominations[2].Id != b.Id {
		t.Errorf("order mismatch: %+v", res.Msg.Nominations)
	}

	// Повторный List подтверждает, что порядок сохранён в БД, а не только в ответе.
	listRes, err := pub.ListNominations(context.Background(), connect.NewRequest(&hemav1.ListNominationsRequest{
		TournamentId: seedTournamentID,
	}))
	if err != nil {
		t.Fatalf("ListNominations after reorder: %v", err)
	}
	if listRes.Msg.Nominations[0].Id != c.Id || listRes.Msg.Nominations[1].Id != a.Id || listRes.Msg.Nominations[2].Id != b.Id {
		t.Errorf("persisted order mismatch: %+v", listRes.Msg.Nominations)
	}
}

func TestIntegration_UpdateNomination_HappyPathAndPersisted(t *testing.T) {
	pub, admin, _ := setup(t)

	createReq := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId: seedTournamentID,
		Title:        "Old Title",
	})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := admin.CreateNomination(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreateNomination: %v", err)
	}

	fc := int32(12)
	updateReq := connect.NewRequest(&hemav1.UpdateNominationRequest{
		Id:              created.Msg.Nomination.Id,
		Title:           "New Title",
		Description:     "New description",
		FighterCapacity: &fc,
	})
	updateReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.UpdateNomination(context.Background(), updateReq); err != nil {
		t.Fatalf("UpdateNomination: %v", err)
	}

	got, err := pub.GetNomination(context.Background(), connect.NewRequest(&hemav1.GetNominationRequest{
		Id: created.Msg.Nomination.Id,
	}))
	if err != nil {
		t.Fatalf("GetNomination: %v", err)
	}
	if got.Msg.Nomination.Title != "New Title" {
		t.Errorf("persisted title = %q", got.Msg.Nomination.Title)
	}
	if got.Msg.Nomination.FighterCapacity == nil || *got.Msg.Nomination.FighterCapacity != 12 {
		t.Errorf("persisted fighter_capacity = %v", got.Msg.Nomination.FighterCapacity)
	}
}

func TestIntegration_DeleteNomination_Persisted(t *testing.T) {
	pub, admin, _ := setup(t)

	createReq := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId: seedTournamentID,
		Title:        "To Delete",
	})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := admin.CreateNomination(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreateNomination: %v", err)
	}

	deleteReq := connect.NewRequest(&hemav1.DeleteNominationRequest{Id: created.Msg.Nomination.Id})
	deleteReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.DeleteNomination(context.Background(), deleteReq); err != nil {
		t.Fatalf("DeleteNomination: %v", err)
	}

	_, err = pub.GetNomination(context.Background(), connect.NewRequest(&hemav1.GetNominationRequest{
		Id: created.Msg.Nomination.Id,
	}))
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound after delete, got %v", connect.CodeOf(err))
	}
}

// TestIntegration_CreateNomination_NoToken — ловит регрессию authentication:
// admin-RPC без токена должен отказать.
func TestIntegration_CreateNomination_NoToken(t *testing.T) {
	_, admin, _ := setup(t)

	_, err := admin.CreateNomination(context.Background(),
		connect.NewRequest(&hemav1.CreateNominationRequest{TournamentId: seedTournamentID, Title: "T"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated without token, got %v", connect.CodeOf(err))
	}
}

// TestIntegration_RegistrationStatus_CloseAndReopen — сквозной прогон
// CloseRegistration/ReopenRegistration через реальный Connect-путь + PG
// (спека 0012): проверяет, что миграция 00002_registration_status.sql
// применилась (новые колонки читаются/пишутся через sqlc), default-статус
// при создании — OPEN (AC-1), ручное закрытие/открытие работает end-to-end
// (AC-3/AC-4), а publichnoe чтение отдаёт статус без токена (AC-2).
func TestIntegration_RegistrationStatus_CloseAndReopen(t *testing.T) {
	pub, admin, _ := setup(t)

	createReq := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId: seedTournamentID,
		Title:        "Registration Status",
	})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := admin.CreateNomination(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreateNomination: %v", err)
	}
	if created.Msg.Nomination.Status != hemav1.NominationStatus_NOMINATION_STATUS_OPEN {
		t.Fatalf("default status = %v, want OPEN", created.Msg.Nomination.Status)
	}

	closeReq := connect.NewRequest(&hemav1.CloseRegistrationRequest{Id: created.Msg.Nomination.Id})
	closeReq.Header().Set("Authorization", adminBearer(t))
	closed, err := admin.CloseRegistration(context.Background(), closeReq)
	if err != nil {
		t.Fatalf("CloseRegistration: %v", err)
	}
	if closed.Msg.Nomination.Status != hemav1.NominationStatus_NOMINATION_STATUS_CLOSED {
		t.Fatalf("status after close = %v, want CLOSED", closed.Msg.Nomination.Status)
	}

	// Публичное чтение (без токена) отдаёт статус, персистентно из PG.
	got, err := pub.GetNomination(context.Background(), connect.NewRequest(&hemav1.GetNominationRequest{
		Id: created.Msg.Nomination.Id,
	}))
	if err != nil {
		t.Fatalf("GetNomination: %v", err)
	}
	if got.Msg.Nomination.Status != hemav1.NominationStatus_NOMINATION_STATUS_CLOSED {
		t.Fatalf("persisted status = %v, want CLOSED", got.Msg.Nomination.Status)
	}

	reopenReq := connect.NewRequest(&hemav1.ReopenRegistrationRequest{Id: created.Msg.Nomination.Id})
	reopenReq.Header().Set("Authorization", adminBearer(t))
	reopened, err := admin.ReopenRegistration(context.Background(), reopenReq)
	if err != nil {
		t.Fatalf("ReopenRegistration: %v", err)
	}
	if reopened.Msg.Nomination.Status != hemav1.NominationStatus_NOMINATION_STATUS_OPEN {
		t.Fatalf("status after reopen = %v, want OPEN", reopened.Msg.Nomination.Status)
	}
}

// TestIntegration_RegistrationStatus_ClosedReasonConstraint — констрейнт
// chk_nominations_closed_reason_presence должен реально блокировать
// рассинхрон status/closed_reason на уровне PG, не только в Go (спека 0012,
// plan.md T21): status='open' с непустым closed_reason, и наоборот.
func TestIntegration_RegistrationStatus_ClosedReasonConstraint(t *testing.T) {
	_, admin, pool := setup(t)

	createReq := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId: seedTournamentID,
		Title:        "Constraint Check",
	})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := admin.CreateNomination(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreateNomination: %v", err)
	}

	ctx := context.Background()

	// open (по умолчанию) + непустой closed_reason — нарушение.
	_, err = pool.Exec(ctx,
		`UPDATE nomination.nominations SET closed_reason = 'manual' WHERE id = $1`,
		created.Msg.Nomination.Id)
	if err == nil {
		t.Error("expected constraint violation: status=open with non-null closed_reason")
	}

	// closed + closed_reason IS NULL — тоже нарушение.
	_, err = pool.Exec(ctx,
		`UPDATE nomination.nominations SET status = 'closed', closed_reason = NULL WHERE id = $1`,
		created.Msg.Nomination.Id)
	if err == nil {
		t.Error("expected constraint violation: status=closed with null closed_reason")
	}

	// closed_reason вне допустимого набора значений — тоже нарушение.
	_, err = pool.Exec(ctx,
		`UPDATE nomination.nominations SET status = 'closed', closed_reason = 'bogus' WHERE id = $1`,
		created.Msg.Nomination.Id)
	if err == nil {
		t.Error("expected constraint violation: closed_reason not in ('manual','drawing')")
	}

	// Согласованная пара — проходит.
	_, err = pool.Exec(ctx,
		`UPDATE nomination.nominations SET status = 'closed', closed_reason = 'manual' WHERE id = $1`,
		created.Msg.Nomination.Id)
	if err != nil {
		t.Errorf("consistent (closed, manual) pair should be accepted: %v", err)
	}
}

func strPtr(s string) *string { return &s }
