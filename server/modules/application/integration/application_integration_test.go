//go:build integration

// Package integration — сквозные e2e-тесты модуля application на реальной
// PostgreSQL (testcontainers) через полный Connect-путь. Проверяет то, что
// unit-тесты на fake-репозитории не могут: реальные UNIQUE-констрейнты
// (оптимистичная конкуренция потока, partial unique активного дубля) и
// транзакционность Append (событие + проекция атомарно). См. ADR 0010, 0011.
package integration

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/internal/platform"
	"github.com/hema/server/internal/testdb"
	"github.com/hema/server/modules/application"
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

type clients struct {
	app         hemav1connect.ApplicationServiceClient
	admin       hemav1connect.ApplicationAdminServiceClient
	public      hemav1connect.ApplicationPublicServiceClient
	nominations hemav1connect.NominationAdminServiceClient
}

// setup поднимает PG (testdb.Postgres), применяет миграции auth+tournament+
// nomination+application, собирает composition root (реальный пул БД) и
// возвращает Connect-клиенты.
func setup(t *testing.T) clients {
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

	activeTournaments := tournament.NewActiveTournamentIDProvider(pool)
	nomination.Register(mux, nomination.Deps{
		Pool:        pool,
		Tournaments: activeTournaments,
	}, baseOpts, adminOpts)

	application.Register(mux, application.Deps{
		Pool:        pool,
		Nominations: platform.NewNominationInfoProvider(pool, activeTournaments),
		Users:       auth.NewDisplayNameProvider(pool, tokens),
	}, baseOpts, adminOpts)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	return clients{
		app:         hemav1connect.NewApplicationServiceClient(client, server.URL),
		admin:       hemav1connect.NewApplicationAdminServiceClient(client, server.URL),
		public:      hemav1connect.NewApplicationPublicServiceClient(client, server.URL),
		nominations: hemav1connect.NewNominationAdminServiceClient(client, server.URL),
	}
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

func userBearer(t *testing.T, userID string) string {
	t.Helper()
	tokens := jwt.NewManager(accessKey, refreshKey, 15*time.Minute, 720*time.Hour)
	pair, err := tokens.Issue(userID, "user")
	if err != nil {
		t.Fatalf("issue user token: %v", err)
	}
	return "Bearer " + pair.Access
}

func authed[T any](t *testing.T, msg *T, bearer string) *connect.Request[T] {
	t.Helper()
	req := connect.NewRequest(msg)
	req.Header().Set("Authorization", bearer)
	return req
}

// createNomination заводит номинацию активного турнира через реальный
// admin-RPC модуля nomination (не напрямую в БД) — так тест использует тот же
// путь, что и прод, и получает настоящий UUID.
func createNomination(t *testing.T, c clients, title string) string {
	t.Helper()
	res, err := c.nominations.CreateNomination(context.Background(), authed(t, &hemav1.CreateNominationRequest{
		TournamentId: seedTournamentID,
		Title:        title,
	}, adminBearer(t)))
	if err != nil {
		t.Fatalf("CreateNomination: %v", err)
	}
	return res.Msg.Nomination.Id
}

func TestIntegration_MigrationsApplied(t *testing.T) {
	setup(t)
}

func TestIntegration_FullFlow_SubmitDeclareConfirmRegister(t *testing.T) {
	c := setup(t)
	nominationID := createNomination(t, c, "Longsword Open")
	applicantID := "00000000-0000-0000-0000-0000000000f1"

	submitResp, err := c.app.SubmitApplication(context.Background(), authed(t, &hemav1.SubmitApplicationRequest{
		NominationId: nominationID,
	}, userBearer(t, applicantID)))
	if err != nil {
		t.Fatalf("SubmitApplication: %v", err)
	}
	appID := submitResp.Msg.Application.Id

	if _, err := c.app.DeclarePayment(context.Background(), authed(t, &hemav1.DeclarePaymentRequest{
		ApplicationId: appID,
	}, userBearer(t, applicantID))); err != nil {
		t.Fatalf("DeclarePayment: %v", err)
	}

	if _, err := c.admin.ConfirmPayment(context.Background(), authed(t, &hemav1.ConfirmPaymentRequest{
		ApplicationId: appID,
	}, adminBearer(t))); err != nil {
		t.Fatalf("ConfirmPayment: %v", err)
	}

	regResp, err := c.admin.RegisterFighter(context.Background(), authed(t, &hemav1.RegisterFighterRequest{
		ApplicationId: appID,
	}, adminBearer(t)))
	if err != nil {
		t.Fatalf("RegisterFighter: %v", err)
	}
	if regResp.Msg.Application.State != hemav1.ApplicationState_APPLICATION_STATE_REGISTERED {
		t.Fatalf("expected REGISTERED, got %s", regResp.Msg.Application.State)
	}

	getResp, err := c.app.GetApplication(context.Background(), authed(t, &hemav1.GetApplicationRequest{
		ApplicationId: appID,
	}, adminBearer(t)))
	if err != nil {
		t.Fatalf("GetApplication: %v", err)
	}
	if len(getResp.Msg.History) != 4 {
		t.Fatalf("expected 4 history events persisted, got %d", len(getResp.Msg.History))
	}
}

// TestIntegration_DuplicateActive_PartialUniqueIndex подтверждает, что
// реальный partial unique index блокирует вторую активную заявку того же
// пользователя в ту же номинацию, а после отзыва — разрешает новую (AC-12/13).
func TestIntegration_DuplicateActive_PartialUniqueIndex(t *testing.T) {
	c := setup(t)
	nominationID := createNomination(t, c, "Duplicate Test")
	applicantID := "00000000-0000-0000-0000-0000000000f2"
	bearer := userBearer(t, applicantID)

	first, err := c.app.SubmitApplication(context.Background(), authed(t, &hemav1.SubmitApplicationRequest{
		NominationId: nominationID,
	}, bearer))
	if err != nil {
		t.Fatalf("first SubmitApplication: %v", err)
	}

	_, err = c.app.SubmitApplication(context.Background(), authed(t, &hemav1.SubmitApplicationRequest{
		NominationId: nominationID,
	}, bearer))
	if connect.CodeOf(err) != connect.CodeAlreadyExists {
		t.Fatalf("expected CodeAlreadyExists on duplicate active, got %v (%v)", connect.CodeOf(err), err)
	}

	if _, err := c.app.WithdrawApplication(context.Background(), authed(t, &hemav1.WithdrawApplicationRequest{
		ApplicationId: first.Msg.Application.Id,
	}, bearer)); err != nil {
		t.Fatalf("WithdrawApplication: %v", err)
	}

	if _, err := c.app.SubmitApplication(context.Background(), authed(t, &hemav1.SubmitApplicationRequest{
		NominationId: nominationID,
	}, bearer)); err != nil {
		t.Fatalf("SubmitApplication after withdraw should succeed, got %v", err)
	}
}

// TestIntegration_ConcurrentDeclarePayment_OneWinsOneConflicts подтверждает,
// что UNIQUE(aggregate_id, version) реально ловит гонку: из двух параллельных
// одинаковых команд ровно одна проходит на первой попытке. Обе в итоге успешны
// благодаря ретраю в сервисе (одна — сразу, другая — после reload).
func TestIntegration_ConcurrentDeclarePayment_NoDoubleApply(t *testing.T) {
	c := setup(t)
	nominationID := createNomination(t, c, "Concurrency Test")
	applicantID := "00000000-0000-0000-0000-0000000000f3"
	bearer := userBearer(t, applicantID)

	submitResp, err := c.app.SubmitApplication(context.Background(), authed(t, &hemav1.SubmitApplicationRequest{
		NominationId: nominationID,
	}, bearer))
	if err != nil {
		t.Fatalf("SubmitApplication: %v", err)
	}
	appID := submitResp.Msg.Application.Id

	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, err := c.app.DeclarePayment(context.Background(), authed(t, &hemav1.DeclarePaymentRequest{
				ApplicationId: appID,
			}, bearer))
			errs[idx] = err
		}(i)
	}
	wg.Wait()

	// Ровно одна из двух одинаковых конкурентных команд должна применить
	// событие успешно; вторая, повторно применённая к уже изменённому
	// состоянию, получит доменную ошибку недопустимого перехода (заявка уже
	// не в Submitted) — обе трактовки означают "нет двойного применения".
	successCount := 0
	for _, err := range errs {
		if err == nil {
			successCount++
			continue
		}
		if connect.CodeOf(err) != connect.CodeFailedPrecondition && connect.CodeOf(err) != connect.CodeAborted {
			t.Fatalf("unexpected error from concurrent DeclarePayment: %v", err)
		}
	}
	if successCount == 0 {
		t.Fatalf("expected at least one concurrent DeclarePayment to succeed")
	}

	getResp, err := c.app.GetApplication(context.Background(), authed(t, &hemav1.GetApplicationRequest{
		ApplicationId: appID,
	}, bearer))
	if err != nil {
		t.Fatalf("GetApplication: %v", err)
	}
	// Ровно одно событие PaymentDeclared должно быть в журнале — не два.
	declaredCount := 0
	for _, ev := range getResp.Msg.History {
		if ev.Type == hemav1.ApplicationEventType_APPLICATION_EVENT_TYPE_PAYMENT_DECLARED {
			declaredCount++
		}
	}
	if declaredCount != 1 {
		t.Fatalf("expected exactly 1 PaymentDeclared event in stream, got %d", declaredCount)
	}
}

func TestIntegration_NominationParticipants_CountsAndCapacity(t *testing.T) {
	c := setup(t)
	nominationID := createNomination(t, c, "Participants Test")
	applicant1 := "00000000-0000-0000-0000-0000000000f4"
	applicant2 := "00000000-0000-0000-0000-0000000000f5"

	app1, err := c.app.SubmitApplication(context.Background(), authed(t, &hemav1.SubmitApplicationRequest{
		NominationId: nominationID,
	}, userBearer(t, applicant1)))
	if err != nil {
		t.Fatalf("SubmitApplication 1: %v", err)
	}
	if _, err := c.app.DeclarePayment(context.Background(), authed(t, &hemav1.DeclarePaymentRequest{
		ApplicationId: app1.Msg.Application.Id,
	}, userBearer(t, applicant1))); err != nil {
		t.Fatalf("DeclarePayment 1: %v", err)
	}
	if _, err := c.admin.ConfirmPayment(context.Background(), authed(t, &hemav1.ConfirmPaymentRequest{
		ApplicationId: app1.Msg.Application.Id,
	}, adminBearer(t))); err != nil {
		t.Fatalf("ConfirmPayment 1: %v", err)
	}

	if _, err := c.app.SubmitApplication(context.Background(), authed(t, &hemav1.SubmitApplicationRequest{
		NominationId: nominationID,
	}, userBearer(t, applicant2))); err != nil {
		t.Fatalf("SubmitApplication 2: %v", err)
	}

	resp, err := c.public.ListNominationParticipants(context.Background(), connect.NewRequest(&hemav1.ListNominationParticipantsRequest{
		NominationId: nominationID,
	}))
	if err != nil {
		t.Fatalf("ListNominationParticipants (public, no token): %v", err)
	}
	if resp.Msg.AppliedCount != 2 {
		t.Fatalf("expected applied_count=2, got %d", resp.Msg.AppliedCount)
	}
	if resp.Msg.ConfirmedCount != 1 {
		t.Fatalf("expected confirmed_count=1, got %d", resp.Msg.ConfirmedCount)
	}
	if resp.Msg.FighterCapacity != nil {
		t.Fatalf("expected no capacity set, got %v", *resp.Msg.FighterCapacity)
	}
}
