//go:build integration

// Package integration — сквозные e2e-тесты модуля fighter на реальной
// PostgreSQL (testcontainers) через полный Connect-путь: proto-binary →
// интерсепторы → handler → service → repo → SQL → back. См. ADR 0010.
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
	"github.com/hema/server/modules/auth"
	"github.com/hema/server/modules/fighter"
	fighterrepo "github.com/hema/server/modules/fighter/repo"
	fighterservice "github.com/hema/server/modules/fighter/service"
	"github.com/hema/server/modules/nomination"
	"github.com/hema/server/modules/tournament"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
	"github.com/jackc/pgx/v5/pgxpool"
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
// nomination+fighter, собирает composition root и возвращает пул,
// Connect-клиенты и активный NominationProvider.
func setup(t *testing.T) (*pgxpool.Pool, hemav1connect.NominationAdminServiceClient, hemav1connect.FighterAdminServiceClient, hemav1connect.FighterPublicServiceClient) {
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
	tournament.Register(mux, tournament.Deps{Pool: pool}, baseOpts, adminOpts)
	activeTournaments := tournament.NewActiveTournamentIDProvider(pool)
	nomination.Register(mux, nomination.Deps{
		Pool:        pool,
		Tournaments: activeTournaments,
	}, baseOpts, adminOpts)

	fighterNominations := platform.NewFighterNominationProvider(pool, activeTournaments)
	fighter.Register(mux, fighter.Deps{
		Pool:        pool,
		Nominations: fighterNominations,
		Tournaments: activeTournaments,
	}, baseOpts, adminOpts)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	nomAdmin := hemav1connect.NewNominationAdminServiceClient(client, server.URL)
	fighterAdmin := hemav1connect.NewFighterAdminServiceClient(client, server.URL)
	fighterPublic := hemav1connect.NewFighterPublicServiceClient(client, server.URL)
	return pool, nomAdmin, fighterAdmin, fighterPublic
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
// всех модулей, включая fighter. Если миграции падают, setup валится здесь.
func TestIntegration_MigrationsApplied(t *testing.T) {
	setup(t)
}

func TestIntegration_CreateFighterAndPublicRoster(t *testing.T) {
	_, nomAdmin, fighterAdmin, fighterPublic := setup(t)
	ctx := context.Background()

	nomReq := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId: seedTournamentID,
		Title:        "Longsword Open (fighter e2e)",
	})
	nomReq.Header().Set("Authorization", adminBearer(t))
	nomResp, err := nomAdmin.CreateNomination(ctx, nomReq)
	if err != nil {
		t.Fatalf("CreateNomination: %v", err)
	}
	nominationID := nomResp.Msg.Nomination.Id

	createReq := connect.NewRequest(&hemav1.CreateFighterRequest{
		TournamentId:  seedTournamentID,
		Name:          "Ivan Petrov",
		Club:          "Club X",
		NominationIds: []string{nominationID},
	})
	createReq.Header().Set("Authorization", adminBearer(t))
	createResp, err := fighterAdmin.CreateFighter(ctx, createReq)
	if err != nil {
		t.Fatalf("CreateFighter: %v", err)
	}
	if createResp.Msg.Fighter.Name != "Ivan Petrov" {
		t.Fatalf("unexpected fighter: %+v", createResp.Msg.Fighter)
	}

	rosterResp, err := fighterPublic.ListNominationRoster(ctx, connect.NewRequest(&hemav1.ListNominationRosterRequest{
		NominationId: nominationID,
	}))
	if err != nil {
		t.Fatalf("ListNominationRoster: %v", err)
	}
	if len(rosterResp.Msg.Entries) != 1 {
		t.Fatalf("expected 1 roster entry, got %d", len(rosterResp.Msg.Entries))
	}
	entry := rosterResp.Msg.Entries[0]
	if entry.Name != "Ivan Petrov" || entry.Club != "Club X" || !entry.InRoster {
		t.Fatalf("unexpected roster entry: %+v", entry)
	}
}

// TestIntegration_DedupRace проверяет, что partial-unique индекс
// uq_fighters_origin_per_tournament держит гонку двух одновременных
// регистраций одного человека (origin_user_id) в разные номинации: должен
// получиться ровно один боец с двумя участиями (спека 0007, NFR-4).
func TestIntegration_DedupRace(t *testing.T) {
	pool, nomAdmin, _, _ := setup(t)
	ctx := context.Background()

	nomAResp := createNomination(t, ctx, nomAdmin, "Race Nomination A")
	nomBResp := createNomination(t, ctx, nomAdmin, "Race Nomination B")

	activeTournaments := tournament.NewActiveTournamentIDProvider(pool)
	nominations := platform.NewFighterNominationProvider(pool, activeTournaments)
	svc := fighterservice.New(fighterrepo.New(pool), nominations, activeTournaments)

	const originUserID = "00000000-0000-0000-0000-0000000000f1"

	var wg sync.WaitGroup
	errs := make([]error, 2)
	nomIDs := []string{nomAResp, nomBResp}
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := svc.RegisterFromApplication(ctx, fighterservice.RegistrationInput{
				TournamentID: seedTournamentID,
				NominationID: nomIDs[i],
				OriginUserID: originUserID,
				Name:         "Race Fighter",
				Club:         "Club Race",
			})
			errs[i] = err
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("RegisterFromApplication[%d]: %v", i, err)
		}
	}

	roster, err := svc.ListRoster(ctx, seedTournamentID)
	if err != nil {
		t.Fatalf("ListRoster: %v", err)
	}
	var raceFighters int
	var participations int
	for _, f := range roster {
		if f.Name == "Race Fighter" {
			raceFighters++
			participations = len(f.Participations)
		}
	}
	if raceFighters != 1 {
		t.Fatalf("expected exactly 1 fighter for the race origin, got %d", raceFighters)
	}
	if participations != 2 {
		t.Fatalf("expected 2 participations (both nominations), got %d", participations)
	}
}

func createNomination(t *testing.T, ctx context.Context, client hemav1connect.NominationAdminServiceClient, title string) string {
	t.Helper()
	req := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId: seedTournamentID,
		Title:        title,
	})
	req.Header().Set("Authorization", adminBearer(t))
	resp, err := client.CreateNomination(ctx, req)
	if err != nil {
		t.Fatalf("CreateNomination(%q): %v", title, err)
	}
	return resp.Msg.Nomination.Id
}
