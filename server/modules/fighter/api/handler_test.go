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
	admin    hemav1connect.FighterAdminServiceClient
	public   hemav1connect.FighterPublicServiceClient
	me       hemav1connect.FighterServiceClient
	noms     *testutil.FakeNominationProvider
	svc      *service.Service
	seeding  *testutil.FakeSeedingSink
	stage    *testutil.FakeStageRepointer
	bout     *testutil.FakeBoutRepointer
	accounts *testutil.FakeAccountDirectory
}

func setup(t *testing.T) clients {
	t.Helper()

	repo := testutil.NewFakeRepo()
	noms := testutil.NewFakeNominationProvider()
	noms.Set(nominationID, domain.NominationInfo{TournamentID: tournamentID})
	noms.Set(nomination2, domain.NominationInfo{TournamentID: tournamentID})
	tournaments := testutil.NewFakeActiveTournamentProvider(tournamentID)
	seeding := testutil.NewFakeSeedingSink()
	stage := testutil.NewFakeStageRepointer()
	bout := testutil.NewFakeBoutRepointer()
	accounts := testutil.NewFakeAccountDirectory()

	svc := service.New(repo, noms, tournaments, seeding, stage, bout, accounts)
	adminHandler := NewHandler(svc)
	publicHandler := NewPublicHandler(svc)
	meHandler := NewMeHandler(svc)

	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.Auth(tokens)),
	}
	adminOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.RequireAdmin()),
	}

	adminPath, adminH := hemav1connect.NewFighterAdminServiceHandler(adminHandler, append(baseOpts, adminOpts...)...)
	pubPath, pubH := hemav1connect.NewFighterPublicServiceHandler(publicHandler, baseOpts...)
	mePath, meH := hemav1connect.NewFighterServiceHandler(meHandler, baseOpts...)

	mux := http.NewServeMux()
	mux.Handle(adminPath, adminH)
	mux.Handle(pubPath, pubH)
	mux.Handle(mePath, meH)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	return clients{
		admin:    hemav1connect.NewFighterAdminServiceClient(client, server.URL),
		public:   hemav1connect.NewFighterPublicServiceClient(client, server.URL),
		me:       hemav1connect.NewFighterServiceClient(client, server.URL),
		noms:     noms,
		svc:      svc,
		seeding:  seeding,
		stage:    stage,
		bout:     bout,
		accounts: accounts,
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

	resp, err := c.admin.ListRoster(ctx, authedReq(t, &hemav1.ListRosterRequest{Limit: 100}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("ListRoster: %v", err)
	}
	if len(resp.Msg.Fighters) != 1 {
		t.Fatalf("expected 1 fighter in active tournament roster, got %d", len(resp.Msg.Fighters))
	}
}

func TestListRoster_FromApplication(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	_, err := c.svc.RegisterFromApplication(ctx, service.RegistrationInput{
		TournamentID: tournamentID,
		NominationID: nominationID,
		OriginUserID: "applicant-1",
		Name:         "From Application",
		Club:         "Club A",
	})
	if err != nil {
		t.Fatalf("RegisterFromApplication: %v", err)
	}

	_, err = c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId: tournamentID,
		Name:         "Manual Fighter",
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter: %v", err)
	}

	resp, err := c.admin.ListRoster(ctx, authedReq(t, &hemav1.ListRosterRequest{Limit: 100}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("ListRoster: %v", err)
	}
	if len(resp.Msg.Fighters) != 2 {
		t.Fatalf("expected 2 fighters, got %d", len(resp.Msg.Fighters))
	}

	var fromApp, manual *hemav1.Fighter
	for _, f := range resp.Msg.Fighters {
		switch f.Name {
		case "From Application":
			fromApp = f
		case "Manual Fighter":
			manual = f
		}
	}
	if fromApp == nil || manual == nil {
		t.Fatalf("expected both fighters in roster, got %+v", resp.Msg.Fighters)
	}
	if !fromApp.FromApplication {
		t.Fatalf("expected FromApplication=true for fighter registered from application")
	}
	if manual.FromApplication {
		t.Fatalf("expected FromApplication=false for manually created fighter")
	}
}

// TestListRoster_FilterPaginationAndStatusCounts проверяет маппинг новых
// полей ListRosterRequest/ListRosterResponse (спека 0041, T11): фильтр по
// клубу и поиск сужают fighters/total_count, status_counts считаются по
// ВСЕМ бойцам турнира независимо от фильтра/поиска (FR-4) и включают
// Status=StatusMerged — видимость ростера не меняется этим RPC: бойца,
// объединённого через MergeFighters, ListRoster без фильтра по статусу
// по-прежнему возвращает (тот же приём, что и до инкремента 0041).
func TestListRoster_FilterPaginationAndStatusCounts(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	active, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId: tournamentID,
		Name:         "Ivan Petrov",
		Club:         "Club A",
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter(active): %v", err)
	}
	_, err = c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId: tournamentID,
		Name:         "Petr Sidorov",
		Club:         "Club B",
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter(other): %v", err)
	}
	withdrawn, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId: tournamentID,
		Name:         "Oleg Withdrawn",
		Club:         "Club A",
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter(withdrawn): %v", err)
	}
	if _, err := c.admin.WithdrawFighter(ctx, authedReq(t, &hemav1.WithdrawFighterRequest{
		FighterId: withdrawn.Msg.Fighter.Id,
		Reason:    hemav1.WithdrawalReason_WITHDRAWAL_REASON_INJURY,
	}, adminUserID, "admin")); err != nil {
		t.Fatalf("WithdrawFighter: %v", err)
	}
	dupSource, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId: tournamentID,
		Name:         "Ivan Dup",
		Club:         "Club A",
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter(dupSource): %v", err)
	}
	if _, err := c.admin.MergeFighters(ctx, authedReq(t, &hemav1.MergeFightersRequest{
		SourceFighterId: dupSource.Msg.Fighter.Id,
		TargetFighterId: active.Msg.Fighter.Id,
	}, adminUserID, "admin")); err != nil {
		t.Fatalf("MergeFighters: %v", err)
	}

	t.Run("club filter narrows fighters and total_count, status_counts stay full", func(t *testing.T) {
		resp, err := c.admin.ListRoster(ctx, authedReq(t, &hemav1.ListRosterRequest{
			Clubs: []string{"Club A"},
			Limit: 100,
		}, adminUserID, "admin"))
		if err != nil {
			t.Fatalf("ListRoster: %v", err)
		}
		// Club A: active target, withdrawn fighter, and the merged dup
		// source (club is a snapshot — merge doesn't change it, and no
		// Statuses filter is set, so the merged record still matches).
		if len(resp.Msg.Fighters) != 3 || resp.Msg.TotalCount != 3 {
			t.Fatalf("expected 3 Club A fighters (active+withdrawn+merged), got %d fighters, total=%d",
				len(resp.Msg.Fighters), resp.Msg.TotalCount)
		}
		counts := map[hemav1.FighterStatus]int32{}
		for _, sc := range resp.Msg.StatusCounts {
			counts[sc.Status] = sc.Count
		}
		if counts[hemav1.FighterStatus_FIGHTER_STATUS_ACTIVE] != 2 {
			t.Fatalf("expected status_counts.active=2 (unaffected by club filter), got %+v", counts)
		}
		if counts[hemav1.FighterStatus_FIGHTER_STATUS_WITHDRAWN] != 1 {
			t.Fatalf("expected status_counts.withdrawn=1, got %+v", counts)
		}
		if counts[hemav1.FighterStatus_FIGHTER_STATUS_MERGED] != 1 {
			t.Fatalf("expected status_counts.merged=1, got %+v", counts)
		}
	})

	t.Run("search by name narrows to matching fighters", func(t *testing.T) {
		search := "petr"
		resp, err := c.admin.ListRoster(ctx, authedReq(t, &hemav1.ListRosterRequest{
			Search: &search,
			Limit:  100,
		}, adminUserID, "admin"))
		if err != nil {
			t.Fatalf("ListRoster: %v", err)
		}
		// "Ivan Petrov" + "Petr Sidorov".
		if resp.Msg.TotalCount != 2 {
			t.Fatalf("expected total_count=2 for search %q, got %d: %+v", search, resp.Msg.TotalCount, resp.Msg.Fighters)
		}
	})

	t.Run("default (no status filter) still returns merged fighter — visibility unchanged", func(t *testing.T) {
		resp, err := c.admin.ListRoster(ctx, authedReq(t, &hemav1.ListRosterRequest{Limit: 100}, adminUserID, "admin"))
		if err != nil {
			t.Fatalf("ListRoster: %v", err)
		}
		if resp.Msg.TotalCount != 4 {
			t.Fatalf("expected total_count=4 (incl. merged, unfiltered), got %d", resp.Msg.TotalCount)
		}
		var sawMerged bool
		for _, f := range resp.Msg.Fighters {
			if f.Status == hemav1.FighterStatus_FIGHTER_STATUS_MERGED {
				sawMerged = true
			}
		}
		if !sawMerged {
			t.Fatalf("expected merged fighter present in unfiltered roster, got %+v", resp.Msg.Fighters)
		}
	})

	t.Run("pagination: limit/offset slice total_count-consistent pages", func(t *testing.T) {
		page1, err := c.admin.ListRoster(ctx, authedReq(t, &hemav1.ListRosterRequest{
			Limit: 2, Offset: 0,
		}, adminUserID, "admin"))
		if err != nil {
			t.Fatalf("ListRoster page1: %v", err)
		}
		page2, err := c.admin.ListRoster(ctx, authedReq(t, &hemav1.ListRosterRequest{
			Limit: 2, Offset: 2,
		}, adminUserID, "admin"))
		if err != nil {
			t.Fatalf("ListRoster page2: %v", err)
		}
		if len(page1.Msg.Fighters) != 2 || len(page2.Msg.Fighters) != 2 {
			t.Fatalf("expected 2 fighters per page, got %d and %d", len(page1.Msg.Fighters), len(page2.Msg.Fighters))
		}
		if page1.Msg.TotalCount != 4 || page2.Msg.TotalCount != 4 {
			t.Fatalf("expected total_count=4 on every page, got %d and %d", page1.Msg.TotalCount, page2.Msg.TotalCount)
		}
	})
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

// TestToProtoFighterAdmin_IncludesLinkedAccountAndMergedFields и
// TestToProtoFighterPublic_ExcludesLinkedAccountAndMergedFields — регресс-
// тест границы ADR 0016 на уровне маппера (спека 0040): проверяют напрямую,
// что admin-маппер сериализует linked_account_id/linked_account_display_name/
// merged_into_id, а public/me-маппер — нет, независимо от того, как эти поля
// оказались заполнены в domain.Fighter (обогащение сервиса или нет). Это
// авторитетный тест границы — E2E-тесты ниже (FighterService) дополняют его
// сквозным путём.
func TestToProtoFighterAdmin_IncludesLinkedAccountAndMergedFields(t *testing.T) {
	f := domain.Fighter{
		ID:                       "f1",
		TournamentID:             tournamentID,
		Name:                     "Ivan",
		Status:                   domain.StatusMerged,
		LinkedAccountID:          "u1",
		LinkedAccountDisplayName: "Ivan Display Name",
		MergedIntoID:             "f2",
	}
	out := toProtoFighterAdmin(f)
	if out.LinkedAccountId != "u1" {
		t.Fatalf("expected linked_account_id=u1, got %q", out.LinkedAccountId)
	}
	if out.LinkedAccountDisplayName != "Ivan Display Name" {
		t.Fatalf("expected linked_account_display_name, got %q", out.LinkedAccountDisplayName)
	}
	if out.MergedIntoId != "f2" {
		t.Fatalf("expected merged_into_id=f2, got %q", out.MergedIntoId)
	}
	if out.Status != hemav1.FighterStatus_FIGHTER_STATUS_MERGED {
		t.Fatalf("expected FIGHTER_STATUS_MERGED, got %s", out.Status)
	}
}

func TestToProtoFighterPublic_ExcludesLinkedAccountAndMergedFields(t *testing.T) {
	f := domain.Fighter{
		ID:                       "f1",
		TournamentID:             tournamentID,
		Name:                     "Ivan",
		Status:                   domain.StatusMerged,
		LinkedAccountID:          "u1",
		LinkedAccountDisplayName: "Ivan Display Name",
		MergedIntoID:             "f2",
	}
	out := toProtoFighterPublic(f)
	if out.LinkedAccountId != "" {
		t.Fatalf("ADR 0016 violation: expected empty linked_account_id in public/me mapper, got %q", out.LinkedAccountId)
	}
	if out.LinkedAccountDisplayName != "" {
		t.Fatalf("ADR 0016 violation: expected empty linked_account_display_name in public/me mapper, got %q", out.LinkedAccountDisplayName)
	}
	if out.MergedIntoId != "" {
		t.Fatalf("ADR 0016 violation: expected empty merged_into_id in public/me mapper, got %q", out.MergedIntoId)
	}
}

// TestGetMyFighter_ADR0016_NoLinkedAccountFields — сквозной регресс-тест
// через реальный FighterService (спека 0040): даже если бы обогащение
// когда-нибудь расширили на MyFighter, ответ не должен содержать
// linked_account_*/merged_into_id — MeHandler обязан использовать
// toProtoFighterPublic, не toProtoFighterAdmin.
func TestGetMyFighter_ADR0016_NoLinkedAccountFields(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	c.accounts.Set(regularUser, "Regular User Display Name")
	_, err := c.svc.RegisterFromApplication(ctx, service.RegistrationInput{
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
	if f.LinkedAccountId != "" || f.LinkedAccountDisplayName != "" || f.MergedIntoId != "" {
		t.Fatalf("ADR 0016 violation: expected no linked account/merge fields in FighterService response, got %+v", f)
	}
}

func TestFindFighterByAccount_E2E(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	c.accounts.Set("applicant-1", "Applicant Display Name")
	created, err := c.svc.RegisterFromApplication(ctx, service.RegistrationInput{
		TournamentID: tournamentID,
		NominationID: nominationID,
		OriginUserID: "applicant-1",
		Name:         "Ivan Petrov",
		Club:         "Club X",
	})
	if err != nil {
		t.Fatalf("RegisterFromApplication: %v", err)
	}

	resp, err := c.admin.FindFighterByAccount(ctx, authedReq(t, &hemav1.FindFighterByAccountRequest{
		UserId: "applicant-1",
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("FindFighterByAccount: %v", err)
	}
	if resp.Msg.Fighter == nil {
		t.Fatal("expected fighter, got nil")
	}
	if resp.Msg.Fighter.Id != created.ID {
		t.Fatalf("expected fighter %s, got %s", created.ID, resp.Msg.Fighter.Id)
	}
	if resp.Msg.Fighter.LinkedAccountId != "applicant-1" {
		t.Fatalf("expected linked_account_id=applicant-1, got %q", resp.Msg.Fighter.LinkedAccountId)
	}
	if resp.Msg.Fighter.LinkedAccountDisplayName != "Applicant Display Name" {
		t.Fatalf("expected linked_account_display_name, got %q", resp.Msg.Fighter.LinkedAccountDisplayName)
	}
}

func TestFindFighterByAccount_NotFound_EmptySuccess(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	resp, err := c.admin.FindFighterByAccount(ctx, authedReq(t, &hemav1.FindFighterByAccountRequest{
		UserId: "unknown-user",
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("expected success with empty fighter, got error: %v", err)
	}
	if resp.Msg.Fighter != nil {
		t.Fatalf("expected nil fighter, got %+v", resp.Msg.Fighter)
	}
}

func TestFindFighterByAccount_RegularUserForbidden(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	_, err := c.admin.FindFighterByAccount(ctx, authedReq(t, &hemav1.FindFighterByAccountRequest{
		UserId: "applicant-1",
	}, regularUser, "user"))
	if err == nil {
		t.Fatal("expected error")
	}
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Fatalf("expected PermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestMergeFighters_E2E(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	source, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId:  tournamentID,
		Name:          "Ivan Dup",
		Club:          "Club A",
		NominationIds: []string{nominationID},
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter(source): %v", err)
	}
	target, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId:  tournamentID,
		Name:          "Ivan Petrov",
		Club:          "Club B",
		NominationIds: []string{nomination2},
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter(target): %v", err)
	}

	mergeResp, err := c.admin.MergeFighters(ctx, authedReq(t, &hemav1.MergeFightersRequest{
		SourceFighterId: source.Msg.Fighter.Id,
		TargetFighterId: target.Msg.Fighter.Id,
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("MergeFighters: %v", err)
	}
	if mergeResp.Msg.Fighter.Id != target.Msg.Fighter.Id {
		t.Fatalf("expected merged response to be target %s, got %s", target.Msg.Fighter.Id, mergeResp.Msg.Fighter.Id)
	}
	if len(mergeResp.Msg.Fighter.Participations) != 2 {
		t.Fatalf("expected target to hold both nominations after merge, got %+v", mergeResp.Msg.Fighter.Participations)
	}

	sourceAfter, err := c.admin.GetFighter(ctx, authedReq(t, &hemav1.GetFighterRequest{
		FighterId: source.Msg.Fighter.Id,
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("GetFighter(source): %v", err)
	}
	if sourceAfter.Msg.Fighter.Status != hemav1.FighterStatus_FIGHTER_STATUS_MERGED {
		t.Fatalf("expected source status=merged, got %s", sourceAfter.Msg.Fighter.Status)
	}
	if sourceAfter.Msg.Fighter.MergedIntoId != target.Msg.Fighter.Id {
		t.Fatalf("expected source.merged_into_id=%s, got %q", target.Msg.Fighter.Id, sourceAfter.Msg.Fighter.MergedIntoId)
	}
}

func TestMergeFighters_SameFighter_InvalidArgument(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	created, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId: tournamentID,
		Name:         "Ivan",
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter: %v", err)
	}

	_, err = c.admin.MergeFighters(ctx, authedReq(t, &hemav1.MergeFightersRequest{
		SourceFighterId: created.Msg.Fighter.Id,
		TargetFighterId: created.Msg.Fighter.Id,
	}, adminUserID, "admin"))
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Fatalf("expected InvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestMergeFighters_AlreadyMerged_FailedPrecondition(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	source, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId: tournamentID,
		Name:         "Ivan Dup",
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter(source): %v", err)
	}
	target, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId: tournamentID,
		Name:         "Ivan Petrov",
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter(target): %v", err)
	}
	other, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId: tournamentID,
		Name:         "Third Guy",
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter(other): %v", err)
	}

	if _, err := c.admin.MergeFighters(ctx, authedReq(t, &hemav1.MergeFightersRequest{
		SourceFighterId: source.Msg.Fighter.Id,
		TargetFighterId: target.Msg.Fighter.Id,
	}, adminUserID, "admin")); err != nil {
		t.Fatalf("first MergeFighters: %v", err)
	}

	_, err = c.admin.MergeFighters(ctx, authedReq(t, &hemav1.MergeFightersRequest{
		SourceFighterId: source.Msg.Fighter.Id,
		TargetFighterId: other.Msg.Fighter.Id,
	}, adminUserID, "admin"))
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("expected FailedPrecondition, got %v", connect.CodeOf(err))
	}
}

func TestMergeFighters_RegularUserForbidden(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	source, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId: tournamentID,
		Name:         "Ivan Dup",
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter(source): %v", err)
	}
	target, err := c.admin.CreateFighter(ctx, authedReq(t, &hemav1.CreateFighterRequest{
		TournamentId: tournamentID,
		Name:         "Ivan Petrov",
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("CreateFighter(target): %v", err)
	}

	_, err = c.admin.MergeFighters(ctx, authedReq(t, &hemav1.MergeFightersRequest{
		SourceFighterId: source.Msg.Fighter.Id,
		TargetFighterId: target.Msg.Fighter.Id,
	}, regularUser, "user"))
	if err == nil {
		t.Fatal("expected error")
	}
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Fatalf("expected PermissionDenied, got %v", connect.CodeOf(err))
	}
}

// TestListRoster_IncludesLinkedAccount_AdminOnly — сквозной регресс-тест
// границы ADR 0016 (спека 0040, FR-8): admin-ростер видит привязанную
// учётку, публичный состав номинации (структурно RosterEntry) не может её
// нести вовсе.
func TestListRoster_IncludesLinkedAccount_AdminOnly(t *testing.T) {
	c := setup(t)
	ctx := context.Background()

	c.accounts.Set("applicant-1", "Applicant Display Name")
	_, err := c.svc.RegisterFromApplication(ctx, service.RegistrationInput{
		TournamentID: tournamentID,
		NominationID: nominationID,
		OriginUserID: "applicant-1",
		Name:         "Ivan Petrov",
		Club:         "Club X",
	})
	if err != nil {
		t.Fatalf("RegisterFromApplication: %v", err)
	}

	resp, err := c.admin.ListRoster(ctx, authedReq(t, &hemav1.ListRosterRequest{Limit: 100}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("ListRoster: %v", err)
	}
	if len(resp.Msg.Fighters) != 1 {
		t.Fatalf("expected 1 fighter, got %d", len(resp.Msg.Fighters))
	}
	if resp.Msg.Fighters[0].LinkedAccountId != "applicant-1" {
		t.Fatalf("expected linked_account_id=applicant-1 in admin roster, got %q", resp.Msg.Fighters[0].LinkedAccountId)
	}
}
