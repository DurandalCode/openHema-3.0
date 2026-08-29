//go:build integration

// Package integration — сквозные e2e-тесты модуля fighter на реальной
// PostgreSQL (testcontainers) через полный Connect-путь: proto-binary →
// интерсепторы → handler → service → repo → SQL → back. См. ADR 0010.
package integration

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/internal/platform"
	"github.com/hema/server/internal/testdb"
	"github.com/hema/server/modules/auth"
	authmailer "github.com/hema/server/modules/auth/mailer"
	"github.com/hema/server/modules/fighter"
	fighterdomain "github.com/hema/server/modules/fighter/domain"
	fighterrepo "github.com/hema/server/modules/fighter/repo"
	fighterservice "github.com/hema/server/modules/fighter/service"
	"github.com/hema/server/modules/nomination"
	"github.com/hema/server/modules/tournament"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
	"github.com/hema/server/pkg/mail"
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

	// Мейлер и TTL email/сессий (спека 0042): Register теперь заводит
	// сессию и шлёт письмо подтверждения — без рабочего Mailer/TTL это
	// падало бы на CHECK-констрейнтах (expires_at > created_at при TTL=0)
	// либо паникой на nil-Mailer. Лог-адаптер, TTL — с запасом, тесты этого
	// модуля не проверяют содержимое письма.
	authSender := mail.NewLogger(slog.Default())
	authMailer := authmailer.New(authSender, 30*time.Minute, 30*time.Minute)
	auth.Register(mux, auth.Deps{
		Pool:             pool,
		Tokens:           tokens,
		Mailer:           authMailer,
		PublicAppURL:     "http://localhost:3000",
		PasswordResetTTL: 30 * time.Minute,
		EmailTokenTTL:    30 * time.Minute,
		SessionTTL:       720 * time.Hour,
	}, baseOpts, adminOpts)
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
	pair, err := tokens.Issue(adminUserID, "admin", "")
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
	svc := fighterservice.New(fighterrepo.New(pool), nominations, activeTournaments, nil, nil, nil, nil)

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

	roster, _, _, err := svc.ListRoster(ctx, seedTournamentID, fighterdomain.RosterFilter{Limit: 100})
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

// TestIntegration_RosterRepo_FilterPaginationIncludeNoClub — сквозной
// регресс-тест серверного поиска/фильтра/постраничности ростера (спека
// 0041, T10) на реальном PostgreSQL, напрямую через repo.Repo (не через
// Connect/internal/platform — composition root сейчас собирает ВСЕ модули
// вместе, а трек-соседи application/stage этой же фичи 0041 ещё не
// обновили свои handler.go под уже смержённый в базу volume proto, из-за
// чего internal/platform как единый пакет не компилируется до их мержа;
// repo-уровневый тест не зависит от этого и проверяет ровно то, что
// принадлежит этому треку — SQL модуля fighter): JOIN/EXISTS по активному
// участию в номинации, клуб (`= ANY` + `include_no_club` отдельным
// условием ИЛИ), ILIKE-поиск по имени/клубу без учёта регистра,
// status_counts/total_count независимы от фильтра, LIMIT/OFFSET.
// Юнит-покрытие тех же измерений — service/service_test.go (fake-репо);
// этот тест проверяет, что реальный SQL (cardinality/ANY/EXISTS/ILIKE)
// ведёт себя так же. Номинации — произвольные UUID без FK (participations
// не ссылается на схему nomination, ADR 0002), нужен только сам модуль
// fighter.
func TestIntegration_RosterRepo_FilterPaginationIncludeNoClub(t *testing.T) {
	pool := testdb.Postgres(t)
	ctx := context.Background()
	repo := fighterrepo.New(pool)

	tournamentID := uuid.NewString()
	nomA := uuid.NewString()
	nomB := uuid.NewString()

	create := func(name, club string, nominationIDs []string) fighterdomain.Fighter {
		t.Helper()
		f, err := fighterdomain.NewManual(tournamentID, name, club, nominationIDs)
		if err != nil {
			t.Fatalf("NewManual(%q): %v", name, err)
		}
		created, err := repo.Create(ctx, f)
		if err != nil {
			t.Fatalf("Create(%q): %v", name, err)
		}
		return created
	}

	alphaA := create("Ivan Alpha", "Alpha Club", []string{nomA})
	betaB := create("Petr Beta", "Beta Club", []string{nomB})
	noClub := create("Anna Noclub", "", []string{nomA})

	withdrawn, err := repo.GetByID(ctx, betaB.ID)
	if err != nil {
		t.Fatalf("GetByID(betaB): %v", err)
	}
	if err := withdrawn.Withdraw(fighterdomain.ReasonInjury); err != nil {
		t.Fatalf("Withdraw(betaB): %v", err)
	}
	if _, err := repo.Update(ctx, withdrawn); err != nil {
		t.Fatalf("Update(betaB): %v", err)
	}

	t.Run("filters by active nomination participation via EXISTS", func(t *testing.T) {
		filter := fighterdomain.RosterFilter{NominationIDs: []string{nomA}, Limit: 100}
		items, err := repo.ListByTournament(ctx, tournamentID, filter)
		if err != nil {
			t.Fatalf("ListByTournament: %v", err)
		}
		total, err := repo.CountRoster(ctx, tournamentID, filter)
		if err != nil {
			t.Fatalf("CountRoster: %v", err)
		}
		if total != 2 || len(items) != 2 {
			t.Fatalf("expected 2 fighters with active participation in nomA, got %d items, total=%d", len(items), total)
		}
		for _, f := range items {
			if f.ID != alphaA.ID && f.ID != noClub.ID {
				t.Fatalf("unexpected fighter in nomA filter: %+v", f)
			}
		}
	})

	t.Run("club filter plus include_no_club combines with OR", func(t *testing.T) {
		filter := fighterdomain.RosterFilter{Clubs: []string{"Beta Club"}, IncludeNoClub: true, Limit: 100}
		items, err := repo.ListByTournament(ctx, tournamentID, filter)
		if err != nil {
			t.Fatalf("ListByTournament: %v", err)
		}
		total, err := repo.CountRoster(ctx, tournamentID, filter)
		if err != nil {
			t.Fatalf("CountRoster: %v", err)
		}
		if total != 2 {
			t.Fatalf("expected 2 fighters (Beta Club + no club), got %d: %+v", total, items)
		}
		var gotBeta, gotNoClub bool
		for _, f := range items {
			if f.ID == betaB.ID {
				gotBeta = true
			}
			if f.ID == noClub.ID {
				gotNoClub = true
			}
		}
		if !gotBeta || !gotNoClub {
			t.Fatalf("expected both Beta Club and no-club fighters, got %+v", items)
		}
	})

	t.Run("club filter without include_no_club excludes no-club fighters", func(t *testing.T) {
		filter := fighterdomain.RosterFilter{Clubs: []string{"Alpha Club"}, Limit: 100}
		items, err := repo.ListByTournament(ctx, tournamentID, filter)
		if err != nil {
			t.Fatalf("ListByTournament: %v", err)
		}
		if len(items) != 1 || items[0].ID != alphaA.ID {
			t.Fatalf("expected only Alpha Club fighter, got %+v", items)
		}
	})

	t.Run("search matches name or club case-insensitively", func(t *testing.T) {
		search := "BETA"
		filter := fighterdomain.RosterFilter{Search: &search, Limit: 100}
		items, err := repo.ListByTournament(ctx, tournamentID, filter)
		if err != nil {
			t.Fatalf("ListByTournament: %v", err)
		}
		if len(items) != 1 || items[0].ID != betaB.ID {
			t.Fatalf("expected only Petr Beta (club match, case-insensitive), got %+v", items)
		}
	})

	t.Run("status_counts and total_count independent of filter", func(t *testing.T) {
		filter := fighterdomain.RosterFilter{Clubs: []string{"Alpha Club"}, Limit: 100}
		total, err := repo.CountRoster(ctx, tournamentID, filter)
		if err != nil {
			t.Fatalf("CountRoster: %v", err)
		}
		if total != 1 {
			t.Fatalf("expected filtered total_count=1, got %d", total)
		}
		counts, err := repo.CountRosterByStatus(ctx, tournamentID)
		if err != nil {
			t.Fatalf("CountRosterByStatus: %v", err)
		}
		if counts[fighterdomain.StatusActive] != 2 {
			t.Fatalf("expected status_counts.active=2 across the whole tournament, got %+v", counts)
		}
		if counts[fighterdomain.StatusWithdrawn] != 1 {
			t.Fatalf("expected status_counts.withdrawn=1 across the whole tournament, got %+v", counts)
		}
	})

	t.Run("pagination via limit/offset", func(t *testing.T) {
		page1, err := repo.ListByTournament(ctx, tournamentID, fighterdomain.RosterFilter{Limit: 2, Offset: 0})
		if err != nil {
			t.Fatalf("ListByTournament page1: %v", err)
		}
		page2, err := repo.ListByTournament(ctx, tournamentID, fighterdomain.RosterFilter{Limit: 2, Offset: 2})
		if err != nil {
			t.Fatalf("ListByTournament page2: %v", err)
		}
		if len(page1) != 2 || len(page2) != 1 {
			t.Fatalf("expected pages of 2 and 1 (3 fighters total), got %d and %d", len(page1), len(page2))
		}
		total, err := repo.CountRoster(ctx, tournamentID, fighterdomain.RosterFilter{})
		if err != nil {
			t.Fatalf("CountRoster: %v", err)
		}
		if total != 3 {
			t.Fatalf("expected total_count=3, got %d", total)
		}
		seen := map[string]bool{}
		for _, f := range append(page1, page2...) {
			if seen[f.ID] {
				t.Fatalf("fighter %s appears on both pages", f.ID)
			}
			seen[f.ID] = true
		}
	})
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
