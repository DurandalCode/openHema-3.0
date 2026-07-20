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
	"github.com/hema/server/modules/bout/domain"
	"github.com/hema/server/modules/bout/service"
	"github.com/hema/server/modules/bout/testutil"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
)

const n1 = "11111111-1111-1111-1111-111111111111"

// setup поднимает реальный Connect-хендлер BoutAdminService с fake-репо.
// Конфигурация повторяет прод-сетап: глобально Auth (валидация Bearer), на
// сервис — RequireAdmin (FR-8). Тонкая обёртка над setupFull — для
// существующих (0010) тестов, которым не нужен публичный клиент.
func setup(t *testing.T) (hemav1connect.BoutAdminServiceClient, *testutil.FakeRepo) {
	t.Helper()
	admin, _, repo := setupFull(t)
	return admin, repo
}

// setupFull — как setup, но дополнительно монтирует BoutPublicService (без
// RequireAdmin, спека 0011, FR-11) и возвращает публичный клиент.
func setupFull(t *testing.T) (hemav1connect.BoutAdminServiceClient, hemav1connect.BoutPublicServiceClient, *testutil.FakeRepo) {
	t.Helper()

	repo := testutil.NewFakeRepo()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	svc := service.New(repo)
	handler := NewAdminHandler(svc)

	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.Auth(tokens)),
	}
	adminOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.RequireAdmin()),
	}

	adminPath, adminH := hemav1connect.NewBoutAdminServiceHandler(handler, append(baseOpts, adminOpts...)...)
	publicPath, publicH := hemav1connect.NewBoutPublicServiceHandler(handler, baseOpts...)

	mux := http.NewServeMux()
	mux.Handle(adminPath, adminH)
	mux.Handle(publicPath, publicH)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	adminClient := hemav1connect.NewBoutAdminServiceClient(client, server.URL)
	publicClient := hemav1connect.NewBoutPublicServiceClient(client, server.URL)
	return adminClient, publicClient, repo
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

func TestListBoutsByNomination_E2E_SortedByPoolThenSequence(t *testing.T) {
	admin, repo := setup(t)
	repo.SeedBouts(n1,
		domain.Bout{
			ID: "b3", PoolID: "p2", NominationID: n1, RoundNumber: 1, SequenceNumber: 1,
			FighterA: domain.FighterRef{ID: "c", Name: "Carol", Club: "Z"},
			FighterB: domain.FighterRef{ID: "d", Name: "Dave", Club: "Z"},
		},
		domain.Bout{
			ID: "b2", PoolID: "p1", NominationID: n1, RoundNumber: 1, SequenceNumber: 2,
			FighterA: domain.FighterRef{ID: "a", Name: "Alice", Club: "X"},
			FighterB: domain.FighterRef{ID: "b", Name: "Bob", Club: "Y"},
		},
		domain.Bout{
			ID: "b1", PoolID: "p1", NominationID: n1, RoundNumber: 1, SequenceNumber: 1,
			FighterA: domain.FighterRef{ID: "a", Name: "Alice", Club: "X"},
			FighterB: domain.FighterRef{ID: "e", Name: "Eve", Club: "X"},
		},
	)

	req := connect.NewRequest(&hemav1.ListBoutsByNominationRequest{NominationId: n1})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.ListBoutsByNomination(context.Background(), req)
	if err != nil {
		t.Fatalf("ListBoutsByNomination: %v", err)
	}
	if len(res.Msg.Bouts) != 3 {
		t.Fatalf("Bouts len = %d, want 3", len(res.Msg.Bouts))
	}
	// p1/seq1, p1/seq2, p2/seq1
	if res.Msg.Bouts[0].Id != "b1" || res.Msg.Bouts[1].Id != "b2" || res.Msg.Bouts[2].Id != "b3" {
		t.Fatalf("unexpected order: %v", res.Msg.Bouts)
	}
	first := res.Msg.Bouts[0]
	if first.PoolId != "p1" || first.NominationId != n1 || first.RoundNumber != 1 || first.SequenceNumber != 1 {
		t.Errorf("unexpected bout fields: %+v", first)
	}
	if first.FighterA.FighterId != "a" || first.FighterA.Name != "Alice" || first.FighterA.Club != "X" {
		t.Errorf("unexpected FighterA: %+v", first.FighterA)
	}
	if first.FighterB.FighterId != "e" {
		t.Errorf("unexpected FighterB: %+v", first.FighterB)
	}
}

func TestListBoutsByNomination_E2E_EmptyNominationIDReturnsInvalidArgument(t *testing.T) {
	admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.ListBoutsByNominationRequest{NominationId: ""})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.ListBoutsByNomination(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestListBoutsByNomination_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	admin, _ := setup(t)

	_, err := admin.ListBoutsByNomination(context.Background(), connect.NewRequest(&hemav1.ListBoutsByNominationRequest{NominationId: n1}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestListBoutsByNomination_E2E_NonAdminReturnsPermissionDenied(t *testing.T) {
	admin, _ := setup(t)

	req := connect.NewRequest(&hemav1.ListBoutsByNominationRequest{NominationId: n1})
	req.Header().Set("Authorization", userBearer(t))

	_, err := admin.ListBoutsByNomination(context.Background(), req)
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

// Спека 0011, FR-11: BoutPublicService — тот же набор боёв, доступен без
// авторизации (AC-15), в отличие от BoutAdminService.
func TestListPublicBoutsByNomination_E2E_AvailableWithoutAuth(t *testing.T) {
	_, public, repo := setupFull(t)
	repo.SeedBouts(n1,
		domain.Bout{
			ID: "b1", PoolID: "p1", NominationID: n1, RoundNumber: 1, SequenceNumber: 1,
			FighterA: domain.FighterRef{ID: "a", Name: "Alice", Club: "X"},
			FighterB: domain.FighterRef{ID: "e", Name: "Eve", Club: "X"},
		},
	)

	// Без Authorization: PoolPublicService смонтирован под baseOpts (без
	// RequireAdmin) и в allowlist глобального Auth-интерсептора.
	req := connect.NewRequest(&hemav1.ListPublicBoutsByNominationRequest{NominationId: n1})
	res, err := public.ListPublicBoutsByNomination(context.Background(), req)
	if err != nil {
		t.Fatalf("ListPublicBoutsByNomination: %v", err)
	}
	if len(res.Msg.Bouts) != 1 || res.Msg.Bouts[0].Id != "b1" {
		t.Fatalf("expected bout b1, got %v", res.Msg.Bouts)
	}
}

func TestListPublicBoutsByNomination_E2E_EmptyNominationIDReturnsInvalidArgument(t *testing.T) {
	_, public, _ := setupFull(t)

	req := connect.NewRequest(&hemav1.ListPublicBoutsByNominationRequest{NominationId: ""})
	_, err := public.ListPublicBoutsByNomination(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}
