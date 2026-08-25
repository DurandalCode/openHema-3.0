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

// tournament2 — второй турнир, используется только в тесте на изоляцию по
// tournament_id (T4): у regularUser нет бойца в нём.
const tournament2 = "00000000-0000-0000-0000-00000000c002"

type meClients struct {
	me   hemav1connect.FighterServiceClient
	svc  *service.Service
	noms *testutil.FakeNominationProvider
}

func setupMe(t *testing.T) meClients {
	t.Helper()

	repo := testutil.NewFakeRepo()
	noms := testutil.NewFakeNominationProvider()
	noms.Set(nominationID, domain.NominationInfo{TournamentID: tournamentID})
	tournaments := testutil.NewFakeActiveTournamentProvider(tournamentID)

	svc := service.New(repo, noms, tournaments, nil, nil, nil, nil)
	meHandler := NewMeHandler(svc)

	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.Auth(tokens)),
	}

	mePath, meH := hemav1connect.NewFighterServiceHandler(meHandler, baseOpts...)

	mux := http.NewServeMux()
	mux.Handle(mePath, meH)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	return meClients{
		me:   hemav1connect.NewFighterServiceClient(client, server.URL),
		svc:  svc,
		noms: noms,
	}
}

func TestGetMyFighter_HappyPath(t *testing.T) {
	c := setupMe(t)
	ctx := context.Background()

	created, err := c.svc.RegisterFromApplication(ctx, service.RegistrationInput{
		TournamentID: tournamentID, NominationID: nominationID, OriginUserID: regularUser,
		Name: "Ivan Petrov", Club: "Club X",
	})
	if err != nil {
		t.Fatalf("prepare fighter: %v", err)
	}

	resp, err := c.me.GetMyFighter(ctx, authedReq(t, &hemav1.GetMyFighterRequest{}, regularUser, "user"))
	if err != nil {
		t.Fatalf("GetMyFighter: %v", err)
	}
	f := resp.Msg.Fighter
	if f == nil {
		t.Fatal("expected fighter, got nil")
	}
	if f.Id != created.ID || f.Name != "Ivan Petrov" || f.Club != "Club X" {
		t.Fatalf("unexpected fighter: %+v", f)
	}
	if len(f.Participations) != 1 || f.Participations[0].NominationId != nominationID {
		t.Fatalf("expected participation %s, got %+v", nominationID, f.Participations)
	}
}

func TestGetMyFighter_NoFighter_EmptySuccess(t *testing.T) {
	c := setupMe(t)
	ctx := context.Background()

	resp, err := c.me.GetMyFighter(ctx, authedReq(t, &hemav1.GetMyFighterRequest{}, regularUser, "user"))
	if err != nil {
		t.Fatalf("expected success with empty fighter, got error: %v", err)
	}
	if resp.Msg.Fighter != nil {
		t.Fatalf("expected nil fighter, got %+v", resp.Msg.Fighter)
	}
}

func TestGetMyFighter_NoToken_Unauthenticated(t *testing.T) {
	c := setupMe(t)
	ctx := context.Background()

	_, err := c.me.GetMyFighter(ctx, connect.NewRequest(&hemav1.GetMyFighterRequest{}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Fatalf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

// TestGetMyFighter_TournamentIdDoesNotLeakOthers проверяет, что поле запроса
// tournament_id используется только как ключ поиска в паре с CallerID, а не
// как способ получить чужого бойца: у regularUser нет бойца в tournament2
// (там зарегистрирован другой пользователь), поэтому ответ пуст, а не
// чужой Fighter.
func TestGetMyFighter_TournamentIdDoesNotLeakOthers(t *testing.T) {
	c := setupMe(t)
	ctx := context.Background()

	c.noms.Set(nomination2, domain.NominationInfo{TournamentID: tournament2})
	_, err := c.svc.RegisterFromApplication(ctx, service.RegistrationInput{
		TournamentID: tournament2, NominationID: nomination2, OriginUserID: "another-user",
		Name: "Someone Else", Club: "Other Club",
	})
	if err != nil {
		t.Fatalf("prepare other fighter: %v", err)
	}

	req := authedReq(t, &hemav1.GetMyFighterRequest{}, regularUser, "user")
	req.Msg.TournamentId = strPtr(tournament2)

	resp, err := c.me.GetMyFighter(ctx, req)
	if err != nil {
		t.Fatalf("expected success with empty fighter, got error: %v", err)
	}
	if resp.Msg.Fighter != nil {
		t.Fatalf("expected nil fighter (not another user's), got %+v", resp.Msg.Fighter)
	}
}

func strPtr(s string) *string { return &s }
