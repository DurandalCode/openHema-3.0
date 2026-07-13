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
	"github.com/hema/server/modules/fighter/domain"
	"github.com/hema/server/modules/fighter/service"
	"github.com/hema/server/modules/fighter/testutil"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
)

const (
	adminUserID  = "00000000-0000-0000-0000-0000000000ad"
	regularUser  = "00000000-0000-0000-0000-0000000000u1"
	tournamentID = "00000000-0000-0000-0000-00000000c001"
	nominationID = "00000000-0000-0000-0000-00000000b001"
	nomination2  = "00000000-0000-0000-0000-00000000b002"
)

type clients struct {
	admin  hemav1connect.FighterAdminServiceClient
	public hemav1connect.FighterPublicServiceClient
	noms   *testutil.FakeNominationProvider
}

func setup(t *testing.T) clients {
	t.Helper()

	repo := testutil.NewFakeRepo()
	noms := testutil.NewFakeNominationProvider()
	noms.Set(nominationID, domain.NominationInfo{TournamentID: tournamentID})
	noms.Set(nomination2, domain.NominationInfo{TournamentID: tournamentID})
	tournaments := testutil.NewFakeActiveTournamentProvider(tournamentID)

	svc := service.New(repo, noms, tournaments)
	adminHandler := NewHandler(svc)
	publicHandler := NewPublicHandler(svc)

	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.Auth(tokens)),
	}
	adminOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.RequireAdmin()),
	}

	adminPath, adminH := hemav1connect.NewFighterAdminServiceHandler(adminHandler, append(baseOpts, adminOpts...)...)
	pubPath, pubH := hemav1connect.NewFighterPublicServiceHandler(publicHandler, baseOpts...)

	mux := http.NewServeMux()
	mux.Handle(adminPath, adminH)
	mux.Handle(pubPath, pubH)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	return clients{
		admin:  hemav1connect.NewFighterAdminServiceClient(client, server.URL),
		public: hemav1connect.NewFighterPublicServiceClient(client, server.URL),
		noms:   noms,
	}
}

func bearer(t *testing.T, userID, role string) string {
	t.Helper()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	pair, err := tokens.Issue(userID, role)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	return "Bearer " + pair.Access
}

func authedReq[T any](t *testing.T, msg *T, userID, role string) *connect.Request[T] {
	t.Helper()
	req := connect.NewRequest(msg)
	req.Header().Set("Authorization", bearer(t, userID, role))
	return req
}

func TestCreateFighter_HappyPath(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	resp, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId:  tournamentID,
		Name:          "Ivan Petrov",
		Club:          "Club X",
		NominationIds: []string{nominationID, nomination2},
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter: %v", err)
	}
	f := resp.Msg.Fighter
	if f.Name != "Ivan Petrov" || f.Club != "Club X" {
		t.Fatalf("unexpected fighter: %+v", f)
	}
	if f.Status != hemav1.FighterStatus_FIGHTER_STATUS_ACTIVE {
		t.Fatalf("expected active status, got %s", f.Status)
	}
	if len(f.Participations) != 2 {
		t.Fatalf("expected 2 participations, got %d", len(f.Participations))
	}
}

func TestCreateFighter_UnknownNomination_NotFound(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	_, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId:  tournamentID,
		Name:          "Ivan",
		NominationIds: []string{"missing"},
	}, adminUserID, "admin"))
	if err == nil {
		t.Fatal("expected error")
	}
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Fatalf("expected NotFound, got %v", connect.CodeOf(err))
	}
}

func TestCreateFighter_RegularUserForbidden(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	_, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId: tournamentID,
		Name:         "Ivan",
	}, regularUser, "user"))
	if err == nil {
		t.Fatal("expected error")
	}
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Fatalf("expected PermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestWithdrawAndReturnFighter_E2E(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	created, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId:  tournamentID,
		Name:          "Ivan",
		NominationIds: []string{nominationID},
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter: %v", err)
	}
	fighterID := created.Msg.Fighter.Id

	withdrawn, err := c.admin.WithdrawFighter(ctx, authedReq(t, &hemav1.WithdrawFighterRequest{
		FighterId: fighterID,
		Reason:    hemav1.WithdrawalReason_WITHDRAWAL_REASON_INJURY,
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("WithdrawFighter: %v", err)
	}
	if withdrawn.Msg.Fighter.Status != hemav1.FighterStatus_FIGHTER_STATUS_WITHDRAWN {
		t.Fatalf("expected withdrawn status, got %s", withdrawn.Msg.Fighter.Status)
	}
	if withdrawn.Msg.Fighter.WithdrawalReason != hemav1.WithdrawalReason_WITHDRAWAL_REASON_INJURY {
		t.Fatalf("expected injury reason, got %s", withdrawn.Msg.Fighter.WithdrawalReason)
	}

	// Public roster shows the withdrawn fighter, but not in_roster.
	rosterResp, err := c.public.ListNominationRoster(ctx, connect.NewRequest(&hemav1.ListNominationRosterRequest{
		NominationId: nominationID,
	}))
	if err != nil {
		t.Fatalf("ListNominationRoster: %v", err)
	}
	if len(rosterResp.Msg.Entries) != 1 {
		t.Fatalf("expected withdrawn fighter still listed, got %d entries", len(rosterResp.Msg.Entries))
	}
	if rosterResp.Msg.Entries[0].InRoster {
		t.Fatalf("expected in_roster=false for withdrawn fighter")
	}

	// Double withdraw is rejected with FailedPrecondition.
	_, err = c.admin.WithdrawFighter(ctx, authedReq(t, &hemav1.WithdrawFighterRequest{
		FighterId: fighterID,
		Reason:    hemav1.WithdrawalReason_WITHDRAWAL_REASON_BAN,
	}, adminUserID, "admin"))
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("expected FailedPrecondition, got %v", connect.CodeOf(err))
	}

	returned, err := c.admin.ReturnFighter(ctx, authedReq(t, &hemav1.ReturnFighterRequest{
		FighterId: fighterID,
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("ReturnFighter: %v", err)
	}
	if returned.Msg.Fighter.Status != hemav1.FighterStatus_FIGHTER_STATUS_ACTIVE {
		t.Fatalf("expected active after return, got %s", returned.Msg.Fighter.Status)
	}
}

func TestMoveFighter_E2E(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	created, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId:  tournamentID,
		Name:          "Ivan",
		NominationIds: []string{nominationID},
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter: %v", err)
	}
	fighterID := created.Msg.Fighter.Id

	moved, err := c.admin.MoveFighter(ctx, authedReq(t, &hemav1.MoveFighterRequest{
		FighterId:        fighterID,
		FromNominationId: nominationID,
		ToNominationId:   nomination2,
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("MoveFighter: %v", err)
	}
	var n1Status, n2Status hemav1.ParticipationStatus
	for _, p := range moved.Msg.Fighter.Participations {
		switch p.NominationId {
		case nominationID:
			n1Status = p.Status
		case nomination2:
			n2Status = p.Status
		}
	}
	if n1Status != hemav1.ParticipationStatus_PARTICIPATION_STATUS_REMOVED {
		t.Fatalf("expected n1 removed, got %s", n1Status)
	}
	if n2Status != hemav1.ParticipationStatus_PARTICIPATION_STATUS_ACTIVE {
		t.Fatalf("expected n2 active, got %s", n2Status)
	}
}

func TestListRoster_ResolvesActiveTournament(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	_, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId: tournamentID,
		Name:         "Ivan",
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter: %v", err)
	}

	resp, err := c.admin.ListRoster(ctx, authedReq(t, &hemav1.ListRosterRequest{}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("ListRoster: %v", err)
	}
	if len(resp.Msg.Fighters) != 1 {
		t.Fatalf("expected 1 fighter in active tournament roster, got %d", len(resp.Msg.Fighters))
	}
}

func TestListNominationRoster_Public_NoAuthRequired(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	_, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId:  tournamentID,
		Name:          "Ivan",
		Club:          "Club X",
		NominationIds: []string{nominationID},
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter: %v", err)
	}

	resp, err := c.public.ListNominationRoster(ctx, connect.NewRequest(&hemav1.ListNominationRosterRequest{
		NominationId: nominationID,
	}))
	if err != nil {
		t.Fatalf("ListNominationRoster: %v", err)
	}
	if len(resp.Msg.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(resp.Msg.Entries))
	}
	if resp.Msg.Entries[0].Club != "Club X" {
		t.Fatalf("expected club in public entry, got %q", resp.Msg.Entries[0].Club)
	}
	if !resp.Msg.Entries[0].InRoster {
		t.Fatalf("expected in_roster=true for active fighter")
	}
}
