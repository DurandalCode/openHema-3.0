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
// сервис — RequireAdmin (FR-8).
func setup(t *testing.T) (hemav1connect.BoutAdminServiceClient, *testutil.FakeRepo) {
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

	path, h := hemav1connect.NewBoutAdminServiceHandler(handler, append(baseOpts, adminOpts...)...)

	mux := http.NewServeMux()
	mux.Handle(path, h)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	adminClient := hemav1connect.NewBoutAdminServiceClient(client, server.URL)
	return adminClient, repo
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
