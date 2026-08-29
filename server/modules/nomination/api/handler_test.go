package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/nomination/domain"
	"github.com/hema/server/modules/nomination/service"
	"github.com/hema/server/modules/nomination/testutil"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
)

const (
	adminUserID           = "00000000-0000-0000-0000-000000000aaa"
	activeTournamentID    = "11111111-1111-1111-1111-111111111111"
	nonActiveTournamentID = "22222222-2222-2222-2222-222222222222"
)

// setup поднимает реальные Connect-хендлеры с fake-репозиторием и
// fake-провайдером активного турнира. Конфигурация повторяет прод-сетап:
// глобально Auth (валидация Bearer), на admin-сервис — RequireAdmin.
// Occupancy-чекеры (спека 0040) фиксированы в false/false — гейт удаления не
// мешает тестам, не связанным с ним; см. setupWithOccupancy для гейт-тестов.
func setup(t *testing.T, nominations ...domain.Nomination) (hemav1connect.NominationServiceClient, hemav1connect.NominationAdminServiceClient, *testutil.FakeRepo) {
	t.Helper()
	pub, admin, repo, _, _ := setupWithOccupancy(t, false, false, nominations...)
	return pub, admin, repo
}

// setupWithOccupancy — как setup, но с явно заданными occupancy-чекерами
// (спека 0040, T4): для e2e-тестов гейта DeleteNomination.
func setupWithOccupancy(t *testing.T, hasDistributed, hasBouts bool, nominations ...domain.Nomination) (hemav1connect.NominationServiceClient, hemav1connect.NominationAdminServiceClient, *testutil.FakeRepo, *testutil.FakePoolOccupancyChecker, *testutil.FakeBoutOccupancyChecker) {
	t.Helper()

	repo := testutil.NewFakeRepoWithNominations(nominations...)
	provider := testutil.NewFakeActiveTournamentProvider(activeTournamentID)
	pools := testutil.NewFakePoolOccupancyChecker(hasDistributed)
	bouts := testutil.NewFakeBoutOccupancyChecker(hasBouts)
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	svc := service.New(repo, provider, pools, bouts)
	pubHandler := NewHandler(svc)
	adminHandler := NewAdminHandler(svc)

	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.Auth(tokens)),
	}
	adminOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.RequireAdmin()),
	}

	pubPath, pubH := hemav1connect.NewNominationServiceHandler(pubHandler, baseOpts...)
	adminPath, adminH := hemav1connect.NewNominationAdminServiceHandler(adminHandler, append(baseOpts, adminOpts...)...)

	mux := http.NewServeMux()
	mux.Handle(pubPath, pubH)
	mux.Handle(adminPath, adminH)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	pubClient := hemav1connect.NewNominationServiceClient(client, server.URL)
	adminClient := hemav1connect.NewNominationAdminServiceClient(client, server.URL)
	return pubClient, adminClient, repo, pools, bouts
}

func adminBearer(t *testing.T) string {
	t.Helper()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	pair, err := tokens.Issue(adminUserID, "admin", "")
	if err != nil {
		t.Fatalf("issue admin token: %v", err)
	}
	return "Bearer " + pair.Access
}

func userBearer(t *testing.T) string {
	t.Helper()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	pair, err := tokens.Issue("user-id", "user", "")
	if err != nil {
		t.Fatalf("issue user token: %v", err)
	}
	return "Bearer " + pair.Access
}

func seedNomination(id, title string, position int32) domain.Nomination {
	return domain.Nomination{
		ID:                 id,
		TournamentID:       activeTournamentID,
		Title:              title,
		Description:        "desc",
		FighterCapacity:    16,
		HasFighterCapacity: true,
		Metadata:           domain.Metadata{RulesURL: "https://example.com/rules"},
		Position:           position,
		Status:             domain.StatusOpen,
	}
}

// seedNominationWithState — как seedNomination, но с явным статусом/причиной
// закрытия/снапшотом раскладки (спека 0012).
func seedNominationWithState(id, title string, position int32, status domain.Status, reason domain.ClosedReason, hasDistributed bool) domain.Nomination {
	n := seedNomination(id, title, position)
	n.Status = status
	n.ClosedReason = reason
	n.HasDistributedFighters = hasDistributed
	return n
}

func TestListNominations_E2E(t *testing.T) {
	pub, _, _ := setup(t,
		seedNomination("n1", "Лонгсворд", 0),
		seedNomination("n2", "Сабля", 1),
	)

	res, err := pub.ListNominations(context.Background(), connect.NewRequest(&hemav1.ListNominationsRequest{
		TournamentId: activeTournamentID,
	}))
	if err != nil {
		t.Fatalf("ListNominations: %v", err)
	}
	if len(res.Msg.Nominations) != 2 {
		t.Fatalf("len = %d, want 2", len(res.Msg.Nominations))
	}
	if res.Msg.Nominations[0].Title != "Лонгсворд" || res.Msg.Nominations[1].Title != "Сабля" {
		t.Errorf("order mismatch: %+v", res.Msg.Nominations)
	}
}

func TestListNominations_E2E_NoTokenAllowed(t *testing.T) {
	pub, _, _ := setup(t)

	_, err := pub.ListNominations(context.Background(), connect.NewRequest(&hemav1.ListNominationsRequest{
		TournamentId: activeTournamentID,
	}))
	if err != nil {
		t.Errorf("public RPC should not require token, got %v", err)
	}
}

func TestListNominations_E2E_NonActiveTournamentReturnsNotFound(t *testing.T) {
	pub, _, _ := setup(t)

	_, err := pub.ListNominations(context.Background(), connect.NewRequest(&hemav1.ListNominationsRequest{
		TournamentId: nonActiveTournamentID,
	}))
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestGetNomination_E2E(t *testing.T) {
	pub, _, _ := setup(t, seedNomination("n1", "Лонгсворд", 0))

	res, err := pub.GetNomination(context.Background(), connect.NewRequest(&hemav1.GetNominationRequest{Id: "n1"}))
	if err != nil {
		t.Fatalf("GetNomination: %v", err)
	}
	if res.Msg.Nomination.Title != "Лонгсворд" {
		t.Errorf("Title = %q", res.Msg.Nomination.Title)
	}
	if res.Msg.Nomination.FighterCapacity == nil || *res.Msg.Nomination.FighterCapacity != 16 {
		t.Errorf("FighterCapacity = %v", res.Msg.Nomination.FighterCapacity)
	}
	if res.Msg.Nomination.Metadata == nil || res.Msg.Nomination.Metadata.GetRulesUrl() != "https://example.com/rules" {
		t.Errorf("Metadata = %+v", res.Msg.Nomination.Metadata)
	}
}

func TestGetNomination_E2E_NotFound(t *testing.T) {
	pub, _, _ := setup(t)

	_, err := pub.GetNomination(context.Background(), connect.NewRequest(&hemav1.GetNominationRequest{Id: "does-not-exist"}))
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestCreateNomination_E2E(t *testing.T) {
	_, admin, _ := setup(t)

	fc := int32(24)
	req := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId:    activeTournamentID,
		Title:           "Меч-баклер",
		Description:     "Категория меч-баклер",
		FighterCapacity: &fc,
		Metadata:        &hemav1.NominationMetadata{RulesUrl: strPtr("https://example.com/rules")},
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.CreateNomination(context.Background(), req)
	if err != nil {
		t.Fatalf("CreateNomination: %v", err)
	}
	got := res.Msg.Nomination
	if got.Title != "Меч-баклер" {
		t.Errorf("Title = %q", got.Title)
	}
	if got.TournamentId != activeTournamentID {
		t.Errorf("TournamentId = %q", got.TournamentId)
	}
	if got.FighterCapacity == nil || *got.FighterCapacity != 24 {
		t.Errorf("FighterCapacity = %v", got.FighterCapacity)
	}
	if got.Metadata.GetRulesUrl() != "https://example.com/rules" {
		t.Errorf("Metadata.RulesUrl = %q", got.Metadata.GetRulesUrl())
	}
	if got.CreatedAt == nil || got.UpdatedAt == nil {
		t.Errorf("timestamps not set: %+v", got)
	}
}

func TestCreateNomination_E2E_EmptyTitleReturnsInvalidArgument(t *testing.T) {
	_, admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId: activeTournamentID,
		Title:        "   ",
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.CreateNomination(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestCreateNomination_E2E_NegativeCapacityReturnsInvalidArgument(t *testing.T) {
	_, admin, _ := setup(t)

	fc := int32(-1)
	req := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId:    activeTournamentID,
		Title:           "T",
		FighterCapacity: &fc,
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.CreateNomination(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestCreateNomination_E2E_MissingTournamentIDReturnsInvalidArgument(t *testing.T) {
	_, admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.CreateNominationRequest{Title: "T"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.CreateNomination(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestCreateNomination_E2E_NonActiveTournamentReturnsNotFound(t *testing.T) {
	_, admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId: nonActiveTournamentID,
		Title:        "T",
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.CreateNomination(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestCreateNomination_E2E_DuplicateTitleReturnsAlreadyExists(t *testing.T) {
	_, admin, _ := setup(t, seedNomination("n1", "Сабля", 0))

	req := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId: activeTournamentID,
		Title:        "сабля",
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.CreateNomination(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeAlreadyExists {
		t.Errorf("expected CodeAlreadyExists, got %v", connect.CodeOf(err))
	}
}

func TestCreateNomination_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	_, admin, _ := setup(t)

	_, err := admin.CreateNomination(context.Background(),
		connect.NewRequest(&hemav1.CreateNominationRequest{TournamentId: activeTournamentID, Title: "T"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestCreateNomination_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	_, admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.CreateNominationRequest{TournamentId: activeTournamentID, Title: "T"})
	req.Header().Set("Authorization", userBearer(t))

	_, err := admin.CreateNomination(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestUpdateNomination_E2E(t *testing.T) {
	_, admin, _ := setup(t, seedNomination("n1", "Old", 0))

	fc := int32(10)
	req := connect.NewRequest(&hemav1.UpdateNominationRequest{
		Id:              "n1",
		Title:           "New",
		Description:     "Updated",
		FighterCapacity: &fc,
		Metadata:        &hemav1.NominationMetadata{RulesUrl: strPtr("https://example.com/new")},
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.UpdateNomination(context.Background(), req)
	if err != nil {
		t.Fatalf("UpdateNomination: %v", err)
	}
	if res.Msg.Nomination.Title != "New" || res.Msg.Nomination.Description != "Updated" {
		t.Errorf("got = %+v", res.Msg.Nomination)
	}
	if res.Msg.Nomination.FighterCapacity == nil || *res.Msg.Nomination.FighterCapacity != 10 {
		t.Errorf("FighterCapacity = %v", res.Msg.Nomination.FighterCapacity)
	}
}

func TestUpdateNomination_E2E_NotFound(t *testing.T) {
	_, admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.UpdateNominationRequest{Id: "does-not-exist", Title: "T"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.UpdateNomination(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestUpdateNomination_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	_, admin, _ := setup(t, seedNomination("n1", "Old", 0))

	_, err := admin.UpdateNomination(context.Background(),
		connect.NewRequest(&hemav1.UpdateNominationRequest{Id: "n1", Title: "T"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestDeleteNomination_E2E(t *testing.T) {
	pub, admin, _ := setup(t, seedNomination("n1", "T", 0))

	req := connect.NewRequest(&hemav1.DeleteNominationRequest{Id: "n1"})
	req.Header().Set("Authorization", adminBearer(t))

	if _, err := admin.DeleteNomination(context.Background(), req); err != nil {
		t.Fatalf("DeleteNomination: %v", err)
	}

	_, err := pub.GetNomination(context.Background(), connect.NewRequest(&hemav1.GetNominationRequest{Id: "n1"}))
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound after delete, got %v", connect.CodeOf(err))
	}
}

func TestDeleteNomination_E2E_NotFound(t *testing.T) {
	_, admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.DeleteNominationRequest{Id: "does-not-exist"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.DeleteNomination(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestDeleteNomination_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	_, admin, _ := setup(t, seedNomination("n1", "T", 0))

	_, err := admin.DeleteNomination(context.Background(),
		connect.NewRequest(&hemav1.DeleteNominationRequest{Id: "n1"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestReorderNominations_E2E(t *testing.T) {
	pub, admin, _ := setup(t,
		seedNomination("n1", "A", 0),
		seedNomination("n2", "B", 1),
		seedNomination("n3", "C", 2),
	)

	req := connect.NewRequest(&hemav1.ReorderNominationsRequest{
		TournamentId: activeTournamentID,
		OrderedIds:   []string{"n3", "n1", "n2"},
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.ReorderNominations(context.Background(), req)
	if err != nil {
		t.Fatalf("ReorderNominations: %v", err)
	}
	if len(res.Msg.Nominations) != 3 {
		t.Fatalf("len = %d, want 3", len(res.Msg.Nominations))
	}
	if res.Msg.Nominations[0].Id != "n3" || res.Msg.Nominations[1].Id != "n1" || res.Msg.Nominations[2].Id != "n2" {
		t.Errorf("order mismatch: %+v", res.Msg.Nominations)
	}

	listRes, err := pub.ListNominations(context.Background(), connect.NewRequest(&hemav1.ListNominationsRequest{
		TournamentId: activeTournamentID,
	}))
	if err != nil {
		t.Fatalf("ListNominations after reorder: %v", err)
	}
	if listRes.Msg.Nominations[0].Id != "n3" {
		t.Errorf("persisted order mismatch: %+v", listRes.Msg.Nominations)
	}
}

func TestReorderNominations_E2E_WrongLengthReturnsInvalidArgument(t *testing.T) {
	_, admin, _ := setup(t,
		seedNomination("n1", "A", 0),
		seedNomination("n2", "B", 1),
	)

	req := connect.NewRequest(&hemav1.ReorderNominationsRequest{
		TournamentId: activeTournamentID,
		OrderedIds:   []string{"n1"},
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.ReorderNominations(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestReorderNominations_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	_, admin, _ := setup(t, seedNomination("n1", "A", 0))

	_, err := admin.ReorderNominations(context.Background(),
		connect.NewRequest(&hemav1.ReorderNominationsRequest{TournamentId: activeTournamentID, OrderedIds: []string{"n1"}}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

// --- Спека 0012: статусная модель номинации ---

func TestGetNomination_E2E_StatusOpen_NoToken(t *testing.T) {
	pub, _, _ := setup(t, seedNomination("n1", "T", 0))

	res, err := pub.GetNomination(context.Background(), connect.NewRequest(&hemav1.GetNominationRequest{Id: "n1"}))
	if err != nil {
		t.Fatalf("GetNomination: %v", err)
	}
	if res.Msg.Nomination.Status != hemav1.NominationStatus_NOMINATION_STATUS_OPEN {
		t.Errorf("Status = %v, want OPEN (AC-2)", res.Msg.Nomination.Status)
	}
}

func TestListNominations_E2E_StatusClosed_NoToken(t *testing.T) {
	pub, _, _ := setup(t,
		seedNominationWithState("n1", "A", 0, domain.StatusClosed, domain.ClosedReasonManual, false),
	)

	res, err := pub.ListNominations(context.Background(), connect.NewRequest(&hemav1.ListNominationsRequest{
		TournamentId: activeTournamentID,
	}))
	if err != nil {
		t.Fatalf("ListNominations: %v", err)
	}
	if len(res.Msg.Nominations) != 1 {
		t.Fatalf("len = %d, want 1", len(res.Msg.Nominations))
	}
	if res.Msg.Nominations[0].Status != hemav1.NominationStatus_NOMINATION_STATUS_CLOSED {
		t.Errorf("Status = %v, want CLOSED (AC-2)", res.Msg.Nominations[0].Status)
	}
}

func TestCloseRegistration_E2E(t *testing.T) {
	pub, admin, _ := setup(t, seedNomination("n1", "T", 0))

	req := connect.NewRequest(&hemav1.CloseRegistrationRequest{Id: "n1"})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.CloseRegistration(context.Background(), req)
	if err != nil {
		t.Fatalf("CloseRegistration: %v", err)
	}
	if res.Msg.Nomination.Status != hemav1.NominationStatus_NOMINATION_STATUS_CLOSED {
		t.Errorf("Status = %v, want CLOSED (AC-3)", res.Msg.Nomination.Status)
	}

	got, err := pub.GetNomination(context.Background(), connect.NewRequest(&hemav1.GetNominationRequest{Id: "n1"}))
	if err != nil {
		t.Fatalf("GetNomination: %v", err)
	}
	if got.Msg.Nomination.Status != hemav1.NominationStatus_NOMINATION_STATUS_CLOSED {
		t.Errorf("persisted status = %v, want CLOSED", got.Msg.Nomination.Status)
	}
}

func TestCloseRegistration_E2E_NotFound(t *testing.T) {
	_, admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.CloseRegistrationRequest{Id: "does-not-exist"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.CloseRegistration(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestCloseRegistration_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	_, admin, _ := setup(t, seedNomination("n1", "T", 0))

	_, err := admin.CloseRegistration(context.Background(),
		connect.NewRequest(&hemav1.CloseRegistrationRequest{Id: "n1"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestCloseRegistration_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	_, admin, _ := setup(t, seedNomination("n1", "T", 0))

	req := connect.NewRequest(&hemav1.CloseRegistrationRequest{Id: "n1"})
	req.Header().Set("Authorization", userBearer(t))

	_, err := admin.CloseRegistration(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestReopenRegistration_E2E(t *testing.T) {
	pub, admin, _ := setup(t, seedNominationWithState("n1", "T", 0, domain.StatusClosed, domain.ClosedReasonManual, false))

	req := connect.NewRequest(&hemav1.ReopenRegistrationRequest{Id: "n1"})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.ReopenRegistration(context.Background(), req)
	if err != nil {
		t.Fatalf("ReopenRegistration: %v", err)
	}
	if res.Msg.Nomination.Status != hemav1.NominationStatus_NOMINATION_STATUS_OPEN {
		t.Errorf("Status = %v, want OPEN (AC-4)", res.Msg.Nomination.Status)
	}

	got, err := pub.GetNomination(context.Background(), connect.NewRequest(&hemav1.GetNominationRequest{Id: "n1"}))
	if err != nil {
		t.Fatalf("GetNomination: %v", err)
	}
	if got.Msg.Nomination.Status != hemav1.NominationStatus_NOMINATION_STATUS_OPEN {
		t.Errorf("persisted status = %v, want OPEN", got.Msg.Nomination.Status)
	}
}

// AC-9: закрыто от раскладки — ReopenRegistration -> FailedPrecondition.
func TestReopenRegistration_E2E_ClosedByDrawingReturnsFailedPrecondition(t *testing.T) {
	_, admin, _ := setup(t, seedNominationWithState("n1", "T", 0, domain.StatusClosed, domain.ClosedReasonDrawing, true))

	req := connect.NewRequest(&hemav1.ReopenRegistrationRequest{Id: "n1"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.ReopenRegistration(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("expected CodeFailedPrecondition, got %v", connect.CodeOf(err))
	}
}

// AC-16: закрыто вручную, но раскладка всё же началась (has_distributed) —
// ReopenRegistration всё равно заблокирован, несмотря на причину "manual".
func TestReopenRegistration_E2E_ManualButDistributedReturnsFailedPrecondition(t *testing.T) {
	_, admin, _ := setup(t, seedNominationWithState("n1", "T", 0, domain.StatusClosed, domain.ClosedReasonManual, true))

	req := connect.NewRequest(&hemav1.ReopenRegistrationRequest{Id: "n1"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.ReopenRegistration(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("expected CodeFailedPrecondition, got %v", connect.CodeOf(err))
	}
}

func TestReopenRegistration_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	_, admin, _ := setup(t, seedNominationWithState("n1", "T", 0, domain.StatusClosed, domain.ClosedReasonManual, false))

	_, err := admin.ReopenRegistration(context.Background(),
		connect.NewRequest(&hemav1.ReopenRegistrationRequest{Id: "n1"}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestReopenRegistration_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	_, admin, _ := setup(t, seedNominationWithState("n1", "T", 0, domain.StatusClosed, domain.ClosedReasonManual, false))

	req := connect.NewRequest(&hemav1.ReopenRegistrationRequest{Id: "n1"})
	req.Header().Set("Authorization", userBearer(t))

	_, err := admin.ReopenRegistration(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

// --- Спека 0021: исполнительная ось вытесняет публичный статус ---

func TestGetNomination_E2E_ExecutionActive_OverridesStatusOpen(t *testing.T) {
	n := seedNomination("n1", "T", 0)
	n.Execution = domain.ExecutionActive
	pub, _, _ := setup(t, n)

	res, err := pub.GetNomination(context.Background(), connect.NewRequest(&hemav1.GetNominationRequest{Id: "n1"}))
	if err != nil {
		t.Fatalf("GetNomination: %v", err)
	}
	if res.Msg.Nomination.Status != hemav1.NominationStatus_NOMINATION_STATUS_ACTIVE {
		t.Errorf("Status = %v, want ACTIVE even though registration Status is open", res.Msg.Nomination.Status)
	}
}

func TestListNominations_E2E_ExecutionFinished_OverridesStatusClosed(t *testing.T) {
	n := seedNominationWithState("n1", "A", 0, domain.StatusClosed, domain.ClosedReasonManual, false)
	n.Execution = domain.ExecutionFinished
	pub, _, _ := setup(t, n)

	res, err := pub.ListNominations(context.Background(), connect.NewRequest(&hemav1.ListNominationsRequest{
		TournamentId: activeTournamentID,
	}))
	if err != nil {
		t.Fatalf("ListNominations: %v", err)
	}
	if len(res.Msg.Nominations) != 1 {
		t.Fatalf("len = %d, want 1", len(res.Msg.Nominations))
	}
	if res.Msg.Nominations[0].Status != hemav1.NominationStatus_NOMINATION_STATUS_FINISHED {
		t.Errorf("Status = %v, want FINISHED even though registration Status is closed", res.Msg.Nominations[0].Status)
	}
}

// --- Спека 0040: гейт на удаление номинации (сценарий 1, FR-1/FR-2/FR-3) ---

// AC-1: в номинации есть распределённый в пул боец — DeleteNomination
// отказывает с CodeFailedPrecondition.
func TestDeleteNomination_E2E_HasDistributedFighters_FailedPrecondition(t *testing.T) {
	_, admin, _, _, _ := setupWithOccupancy(t, true, false, seedNomination("n1", "T", 0))

	req := connect.NewRequest(&hemav1.DeleteNominationRequest{Id: "n1"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.DeleteNomination(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("expected CodeFailedPrecondition, got %v", connect.CodeOf(err))
	}
	if !strings.Contains(err.Error(), "distributed") {
		t.Errorf("error text should be distinguishable (has distributed fighters), got %q", err.Error())
	}
}

// AC-2: в номинации есть поставленный (или завершённый) бой —
// DeleteNomination отказывает с CodeFailedPrecondition, даже без
// распределённых бойцов.
func TestDeleteNomination_E2E_HasBouts_FailedPrecondition(t *testing.T) {
	_, admin, _, _, _ := setupWithOccupancy(t, false, true, seedNomination("n1", "T", 0))

	req := connect.NewRequest(&hemav1.DeleteNominationRequest{Id: "n1"})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.DeleteNomination(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("expected CodeFailedPrecondition, got %v", connect.CodeOf(err))
	}
	if !strings.Contains(err.Error(), "bouts") {
		t.Errorf("error text should be distinguishable (has bouts), got %q", err.Error())
	}
}

// FR-2: отказ должен быть различим для вызывающего — тексты двух причин
// отказа не совпадают (клиент должен суметь показать конкретную причину).
func TestDeleteNomination_E2E_DistinctReasons_DifferentText(t *testing.T) {
	_, admin1, _, _, _ := setupWithOccupancy(t, true, false, seedNomination("n1", "T", 0))
	req1 := connect.NewRequest(&hemav1.DeleteNominationRequest{Id: "n1"})
	req1.Header().Set("Authorization", adminBearer(t))
	_, err1 := admin1.DeleteNomination(context.Background(), req1)

	_, admin2, _, _, _ := setupWithOccupancy(t, false, true, seedNomination("n2", "T", 0))
	req2 := connect.NewRequest(&hemav1.DeleteNominationRequest{Id: "n2"})
	req2.Header().Set("Authorization", adminBearer(t))
	_, err2 := admin2.DeleteNomination(context.Background(), req2)

	if err1 == nil || err2 == nil {
		t.Fatalf("expected both deletes to be blocked, got err1=%v err2=%v", err1, err2)
	}
	if err1.Error() == err2.Error() {
		t.Errorf("expected distinguishable error text (FR-2), got same text for both reasons: %q", err1.Error())
	}
}

// AC-3: ни распределённых бойцов, ни боёв нет — DeleteNomination проходит
// как и сегодня.
func TestDeleteNomination_E2E_NoOccupancy_HappyPath(t *testing.T) {
	pub, admin, _, _, _ := setupWithOccupancy(t, false, false, seedNomination("n1", "T", 0))

	req := connect.NewRequest(&hemav1.DeleteNominationRequest{Id: "n1"})
	req.Header().Set("Authorization", adminBearer(t))

	if _, err := admin.DeleteNomination(context.Background(), req); err != nil {
		t.Fatalf("DeleteNomination: %v", err)
	}

	_, err := pub.GetNomination(context.Background(), connect.NewRequest(&hemav1.GetNominationRequest{Id: "n1"}))
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound after delete, got %v", connect.CodeOf(err))
	}
}

func strPtr(s string) *string { return &s }
