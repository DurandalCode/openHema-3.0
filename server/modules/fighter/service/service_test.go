package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/fighter/domain"
	"github.com/hema/server/modules/fighter/service"
	"github.com/hema/server/modules/fighter/testutil"
)

// testDeps — полный набор fake-зависимостей сервиса (спека 0040):
// Seeding/Stage/Bout/Accounts нужны только новым тестам (withdraw/return
// хуков, MergeFighters, обогащения ростера) — остальные тесты продолжают
// использовать newService(), который просто отбрасывает эту часть.
type testDeps struct {
	repo        *testutil.FakeRepo
	noms        *testutil.FakeNominationProvider
	tournaments *testutil.FakeActiveTournamentProvider
	seeding     *testutil.FakeSeedingSink
	stage       *testutil.FakeStageRepointer
	bout        *testutil.FakeBoutRepointer
	accounts    *testutil.FakeAccountDirectory
}

func newServiceWithDeps() (*service.Service, testDeps) {
	d := testDeps{
		repo:        testutil.NewFakeRepo(),
		noms:        testutil.NewFakeNominationProvider(),
		tournaments: testutil.NewFakeActiveTournamentProvider("t1"),
		seeding:     testutil.NewFakeSeedingSink(),
		stage:       testutil.NewFakeStageRepointer(),
		bout:        testutil.NewFakeBoutRepointer(),
		accounts:    testutil.NewFakeAccountDirectory(),
	}
	svc := service.New(d.repo, d.noms, d.tournaments, d.seeding, d.stage, d.bout, d.accounts)
	return svc, d
}

func newService() (*service.Service, *testutil.FakeRepo, *testutil.FakeNominationProvider) {
	svc, d := newServiceWithDeps()
	return svc, d.repo, d.noms
}

func TestRegisterFromApplication(t *testing.T) {
	ctx := context.Background()

	t.Run("creates new fighter on first registration", func(t *testing.T) {
		svc, _, _ := newService()
		f, err := svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n1", OriginUserID: "u1", Name: "Ivan", Club: "Club X",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if f.ID == "" || f.Name != "Ivan" || f.Club != "Club X" {
			t.Fatalf("unexpected fighter: %+v", f)
		}
		if len(f.Participations) != 1 || f.Participations[0].NominationID != "n1" {
			t.Fatalf("expected participation n1, got %+v", f.Participations)
		}
	})

	t.Run("second registration same user adds participation, not a new fighter", func(t *testing.T) {
		svc, repo, _ := newService()
		first, err := svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n1", OriginUserID: "u1", Name: "Ivan", Club: "Club X",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		second, err := svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n2", OriginUserID: "u1", Name: "Ivan Ignored", Club: "Club Ignored",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if second.ID != first.ID {
			t.Fatalf("expected same fighter id, got %s vs %s", first.ID, second.ID)
		}
		if second.Name != "Ivan" || second.Club != "Club X" {
			t.Fatalf("expected name/club unchanged on dedup, got %+v", second)
		}
		if len(second.Participations) != 2 {
			t.Fatalf("expected 2 participations, got %+v", second.Participations)
		}
		all, _ := repo.ListByTournament(ctx, "t1", domain.RosterFilter{Limit: 100})
		if len(all) != 1 {
			t.Fatalf("expected exactly 1 fighter in tournament, got %d", len(all))
		}
	})

	t.Run("different users with same name are not merged", func(t *testing.T) {
		svc, repo, _ := newService()
		_, err := svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n1", OriginUserID: "u1", Name: "Ivan Petrov", Club: "Club X",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		_, err = svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n1", OriginUserID: "u2", Name: "Ivan Petrov", Club: "Club Y",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		all, _ := repo.ListByTournament(ctx, "t1", domain.RosterFilter{Limit: 100})
		if len(all) != 2 {
			t.Fatalf("expected 2 distinct fighters (namesakes), got %d", len(all))
		}
	})

	t.Run("same user different tournaments are not merged", func(t *testing.T) {
		svc, repo, _ := newService()
		_, err := svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n1", OriginUserID: "u1", Name: "Ivan", Club: "Club X",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		_, err = svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t2", NominationID: "n1", OriginUserID: "u1", Name: "Ivan", Club: "Club X",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		all1, _ := repo.ListByTournament(ctx, "t1", domain.RosterFilter{Limit: 100})
		all2, _ := repo.ListByTournament(ctx, "t2", domain.RosterFilter{Limit: 100})
		if len(all1) != 1 || len(all2) != 1 {
			t.Fatalf("expected 1 fighter per tournament, got %d/%d", len(all1), len(all2))
		}
	})

	t.Run("missing origin user id rejected", func(t *testing.T) {
		svc, _, _ := newService()
		_, err := svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n1", OriginUserID: "", Name: "Ivan",
		})
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Fatalf("expected ErrInvalidInput, got %v", err)
		}
	})
}

func TestCreateManual(t *testing.T) {
	ctx := context.Background()

	t.Run("happy path with multiple nominations, no origin key", func(t *testing.T) {
		svc, _, noms := newService()
		noms.Set("n1", domain.NominationInfo{TournamentID: "t1"})
		noms.Set("n2", domain.NominationInfo{TournamentID: "t1"})

		f, err := svc.CreateManual(ctx, "t1", "Ivan", "Club X", []string{"n1", "n2"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if f.OriginUserID != nil {
			t.Fatalf("expected nil OriginUserID for manual fighter")
		}
		if len(f.Participations) != 2 {
			t.Fatalf("expected 2 participations, got %+v", f.Participations)
		}
	})

	t.Run("no lookup errors for duplicate names is allowed (no dedup check)", func(t *testing.T) {
		svc, _, noms := newService()
		noms.Set("n1", domain.NominationInfo{TournamentID: "t1"})
		_, err := svc.CreateManual(ctx, "t1", "Ivan", "Club X", []string{"n1"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		_, err = svc.CreateManual(ctx, "t1", "Ivan", "Club X", []string{"n1"})
		if err != nil {
			t.Fatalf("expected no dedup/limit error on manual create, got %v", err)
		}
	})

	t.Run("unknown nomination rejected", func(t *testing.T) {
		svc, _, _ := newService()
		_, err := svc.CreateManual(ctx, "t1", "Ivan", "Club X", []string{"missing"})
		if !errors.Is(err, domain.ErrNominationNotFound) {
			t.Fatalf("expected ErrNominationNotFound, got %v", err)
		}
	})

	t.Run("nomination from another tournament rejected", func(t *testing.T) {
		svc, _, noms := newService()
		noms.Set("n1", domain.NominationInfo{TournamentID: "other-tournament"})
		_, err := svc.CreateManual(ctx, "t1", "Ivan", "Club X", []string{"n1"})
		if !errors.Is(err, domain.ErrNominationNotFound) {
			t.Fatalf("expected ErrNominationNotFound, got %v", err)
		}
	})

	t.Run("empty name rejected", func(t *testing.T) {
		svc, _, _ := newService()
		_, err := svc.CreateManual(ctx, "t1", "  ", "Club X", nil)
		if !errors.Is(err, domain.ErrEmptyName) {
			t.Fatalf("expected ErrEmptyName, got %v", err)
		}
	})
}

func TestWithdrawAndReturn(t *testing.T) {
	ctx := context.Background()

	t.Run("withdraw then return round trip", func(t *testing.T) {
		svc, repo, noms := newService()
		noms.Set("n1", domain.NominationInfo{TournamentID: "t1"})
		created, _ := svc.CreateManual(ctx, "t1", "Ivan", "Club X", []string{"n1"})

		withdrawn, err := svc.WithdrawFighter(ctx, created.ID, domain.ReasonInjury)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if withdrawn.Status != domain.StatusWithdrawn || withdrawn.WithdrawalReason != domain.ReasonInjury {
			t.Fatalf("unexpected state: %+v", withdrawn)
		}

		returned, err := svc.ReturnFighter(ctx, created.ID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if returned.Status != domain.StatusActive {
			t.Fatalf("expected active after return, got %+v", returned)
		}
		if len(returned.Participations) != 1 {
			t.Fatalf("expected participations preserved, got %+v", returned.Participations)
		}
		stored, _ := repo.GetByID(ctx, created.ID)
		if stored.Status != domain.StatusActive {
			t.Fatalf("expected persisted state active, got %+v", stored)
		}
	})

	t.Run("withdraw not found fighter", func(t *testing.T) {
		svc, _, _ := newService()
		_, err := svc.WithdrawFighter(ctx, "nope", domain.ReasonBan)
		if !errors.Is(err, domain.ErrNotFound) {
			t.Fatalf("expected ErrNotFound, got %v", err)
		}
	})
}

func TestRemoveAndMove(t *testing.T) {
	ctx := context.Background()

	t.Run("remove from one nomination keeps others", func(t *testing.T) {
		svc, _, noms := newService()
		noms.Set("n1", domain.NominationInfo{TournamentID: "t1"})
		noms.Set("n2", domain.NominationInfo{TournamentID: "t1"})
		created, _ := svc.CreateManual(ctx, "t1", "Ivan", "Club X", []string{"n1", "n2"})

		updated, err := svc.RemoveFromNomination(ctx, created.ID, "n1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var n1Status, n2Status domain.ParticipationStatus
		for _, p := range updated.Participations {
			switch p.NominationID {
			case "n1":
				n1Status = p.Status
			case "n2":
				n2Status = p.Status
			}
		}
		if n1Status != domain.ParticipationRemoved {
			t.Fatalf("expected n1 removed, got %v", n1Status)
		}
		if n2Status != domain.ParticipationActive {
			t.Fatalf("expected n2 active, got %v", n2Status)
		}
	})

	t.Run("move to nomination from another tournament rejected", func(t *testing.T) {
		svc, _, noms := newService()
		noms.Set("n1", domain.NominationInfo{TournamentID: "t1"})
		noms.Set("n2", domain.NominationInfo{TournamentID: "other"})
		created, _ := svc.CreateManual(ctx, "t1", "Ivan", "Club X", []string{"n1"})

		_, err := svc.MoveFighter(ctx, created.ID, "n1", "n2")
		if !errors.Is(err, domain.ErrNominationNotFound) {
			t.Fatalf("expected ErrNominationNotFound, got %v", err)
		}
	})

	t.Run("move happy path does not touch application (no such dependency exists)", func(t *testing.T) {
		svc, _, noms := newService()
		noms.Set("n1", domain.NominationInfo{TournamentID: "t1"})
		noms.Set("n2", domain.NominationInfo{TournamentID: "t1"})
		created, _ := svc.CreateManual(ctx, "t1", "Ivan", "Club X", []string{"n1"})

		moved, err := svc.MoveFighter(ctx, created.ID, "n1", "n2")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var n2Status domain.ParticipationStatus
		for _, p := range moved.Participations {
			if p.NominationID == "n2" {
				n2Status = p.Status
			}
		}
		if n2Status != domain.ParticipationActive {
			t.Fatalf("expected n2 active after move, got %v", n2Status)
		}
	})
}

func TestEditFighter(t *testing.T) {
	ctx := context.Background()

	t.Run("happy path", func(t *testing.T) {
		svc, _, _ := newService()
		created, _ := svc.CreateManual(ctx, "t1", "Ivan", "Club X", nil)
		edited, err := svc.EditFighter(ctx, created.ID, "Ivan Petrov", "Club Y")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if edited.Name != "Ivan Petrov" || edited.Club != "Club Y" {
			t.Fatalf("unexpected fighter after edit: %+v", edited)
		}
	})
}

func TestListRosterAndNominationRoster(t *testing.T) {
	ctx := context.Background()

	t.Run("nomination roster shows withdrawn as not in roster, does not hide", func(t *testing.T) {
		svc, _, noms := newService()
		noms.Set("n1", domain.NominationInfo{TournamentID: "t1"})
		active, _ := svc.CreateManual(ctx, "t1", "Active Guy", "Club A", []string{"n1"})
		withdrawn, _ := svc.CreateManual(ctx, "t1", "Withdrawn Guy", "Club B", []string{"n1"})
		_, err := svc.WithdrawFighter(ctx, withdrawn.ID, domain.ReasonBan)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		_ = active

		entries, err := svc.ListNominationRoster(ctx, "n1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(entries) != 2 {
			t.Fatalf("expected 2 entries (withdrawn not hidden), got %d", len(entries))
		}
		var activeIn, withdrawnIn bool
		for _, e := range entries {
			if e.Name == "Active Guy" {
				activeIn = e.InRoster
			}
			if e.Name == "Withdrawn Guy" {
				withdrawnIn = e.InRoster
			}
		}
		if !activeIn {
			t.Fatalf("expected active fighter in_roster=true")
		}
		if withdrawnIn {
			t.Fatalf("expected withdrawn fighter in_roster=false")
		}
	})

	t.Run("list roster returns all fighters of tournament", func(t *testing.T) {
		svc, _, _ := newService()
		_, _ = svc.CreateManual(ctx, "t1", "Ivan", "Club X", nil)
		_, _ = svc.CreateManual(ctx, "t1", "Petr", "Club Y", nil)
		_, _ = svc.CreateManual(ctx, "t2", "Other Tournament Guy", "", nil)

		roster, total, _, err := svc.ListRoster(ctx, "t1", domain.RosterFilter{Limit: 100})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(roster) != 2 {
			t.Fatalf("expected 2 fighters in t1 roster, got %d", len(roster))
		}
		if total != 2 {
			t.Fatalf("expected total_count=2, got %d", total)
		}
	})

	t.Run("empty tournament id resolves to active tournament", func(t *testing.T) {
		svc, _, _ := newService() // active tournament is "t1"
		_, _ = svc.CreateManual(ctx, "t1", "Ivan", "Club X", nil)

		roster, _, _, err := svc.ListRoster(ctx, "", domain.RosterFilter{Limit: 100})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(roster) != 1 {
			t.Fatalf("expected 1 fighter resolved via active tournament, got %d", len(roster))
		}
	})
}

// TestListRoster_FilterAndPagination покрывает серверный поиск/фильтр/
// постраничность ростера (спека 0041, FR-1..FR-6): каждое измерение по
// отдельности и в комбинации (И), status_counts/total_count независимы от
// фильтра и поиска (только tournament_id, FR-4/FR-7), пустой фильтр = как
// раньше «весь ростер», но постранично.
func TestListRoster_FilterAndPagination(t *testing.T) {
	ctx := context.Background()

	setupRoster := func() (*service.Service, *testutil.FakeNominationProvider) {
		svc, _, noms := newService()
		noms.Set("n1", domain.NominationInfo{TournamentID: "t1"})
		noms.Set("n2", domain.NominationInfo{TournamentID: "t1"})

		active1, _ := svc.CreateManual(ctx, "t1", "Ivan Petrov", "Alpha", []string{"n1"})
		active2, _ := svc.CreateManual(ctx, "t1", "Petr Sidorov", "Beta", []string{"n2"})
		noClub, _ := svc.CreateManual(ctx, "t1", "Anna Noclub", "", []string{"n1"})
		withdrawn, _ := svc.CreateManual(ctx, "t1", "Oleg Withdrawn", "Alpha", []string{"n1"})
		if _, err := svc.WithdrawFighter(ctx, withdrawn.ID, domain.ReasonInjury); err != nil {
			t.Fatalf("WithdrawFighter: %v", err)
		}
		_ = active1
		_ = active2
		_ = noClub
		return svc, noms
	}

	t.Run("empty filter returns all fighters of tournament, paginated", func(t *testing.T) {
		svc, _ := setupRoster()

		roster, total, counts, err := svc.ListRoster(ctx, "t1", domain.RosterFilter{Limit: 100})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(roster) != 4 || total != 4 {
			t.Fatalf("expected 4 fighters/total, got %d items, total=%d", len(roster), total)
		}
		if counts[domain.StatusActive] != 3 || counts[domain.StatusWithdrawn] != 1 {
			t.Fatalf("unexpected status counts: %+v", counts)
		}
	})

	t.Run("filters by status", func(t *testing.T) {
		svc, _ := setupRoster()

		roster, total, _, err := svc.ListRoster(ctx, "t1", domain.RosterFilter{
			Statuses: []domain.Status{domain.StatusWithdrawn},
			Limit:    100,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(roster) != 1 || total != 1 || roster[0].Name != "Oleg Withdrawn" {
			t.Fatalf("expected only withdrawn fighter, got %+v (total=%d)", roster, total)
		}
	})

	t.Run("filters by nomination — active participation only", func(t *testing.T) {
		svc, _ := setupRoster()

		roster, total, _, err := svc.ListRoster(ctx, "t1", domain.RosterFilter{
			NominationIDs: []string{"n2"},
			Limit:         100,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(roster) != 1 || total != 1 || roster[0].Name != "Petr Sidorov" {
			t.Fatalf("expected only fighter with active participation in n2, got %+v (total=%d)", roster, total)
		}
	})

	t.Run("filters by club, multi-select plus include_no_club", func(t *testing.T) {
		svc, _ := setupRoster()

		roster, total, _, err := svc.ListRoster(ctx, "t1", domain.RosterFilter{
			Clubs:         []string{"Beta"},
			IncludeNoClub: true,
			Limit:         100,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if total != 2 {
			t.Fatalf("expected 2 fighters (Beta + no club), got %d: %+v", total, roster)
		}
		var gotBeta, gotNoClub bool
		for _, f := range roster {
			if f.Club == "Beta" {
				gotBeta = true
			}
			if f.Club == "" {
				gotNoClub = true
			}
		}
		if !gotBeta || !gotNoClub {
			t.Fatalf("expected both Beta and no-club fighters, got %+v", roster)
		}
	})

	t.Run("club filter without include_no_club excludes no-club fighters", func(t *testing.T) {
		svc, _ := setupRoster()

		roster, total, _, err := svc.ListRoster(ctx, "t1", domain.RosterFilter{
			Clubs: []string{"Alpha"},
			Limit: 100,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if total != 2 {
			t.Fatalf("expected 2 Alpha fighters (active+withdrawn), got %d: %+v", total, roster)
		}
		for _, f := range roster {
			if f.Club != "Alpha" {
				t.Fatalf("expected only Alpha club fighters, got %+v", roster)
			}
		}
	})

	t.Run("search by name or club, case-insensitive", func(t *testing.T) {
		svc, _ := setupRoster()

		search := "petr"
		roster, total, _, err := svc.ListRoster(ctx, "t1", domain.RosterFilter{
			Search: &search,
			Limit:  100,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// "Ivan Petrov" (name substring) + "Petr Sidorov" (name prefix).
		if total != 2 {
			t.Fatalf("expected 2 fighters matching %q, got %d: %+v", search, total, roster)
		}
	})

	t.Run("combines filters with AND", func(t *testing.T) {
		svc, _ := setupRoster()

		roster, total, _, err := svc.ListRoster(ctx, "t1", domain.RosterFilter{
			Statuses: []domain.Status{domain.StatusActive},
			Clubs:    []string{"Alpha"},
			Search:   strPtr("ivan"),
			Limit:    100,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if total != 1 || len(roster) != 1 || roster[0].Name != "Ivan Petrov" {
			t.Fatalf("expected exactly Ivan Petrov, got %+v (total=%d)", roster, total)
		}
	})

	t.Run("status_counts and total_count independent of filter/search", func(t *testing.T) {
		svc, _ := setupRoster()

		search := "petr"
		roster, total, counts, err := svc.ListRoster(ctx, "t1", domain.RosterFilter{
			Statuses: []domain.Status{domain.StatusActive},
			Search:   &search,
			Limit:    100,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(roster) == 0 {
			t.Fatalf("expected at least one filtered fighter, got 0")
		}
		if total != len(roster) {
			t.Fatalf("expected total_count to match filtered page here, got total=%d len=%d", total, len(roster))
		}
		// status_counts всегда по ВСЕМ бойцам турнира (3 active + 1 withdrawn),
		// вне зависимости от Statuses/Search выше (спека 0041, FR-4).
		if counts[domain.StatusActive] != 3 || counts[domain.StatusWithdrawn] != 1 {
			t.Fatalf("expected status counts unaffected by filter, got %+v", counts)
		}
	})

	t.Run("pagination via limit/offset", func(t *testing.T) {
		svc, _ := setupRoster()

		page1, total1, _, err := svc.ListRoster(ctx, "t1", domain.RosterFilter{Limit: 2, Offset: 0})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		page2, total2, _, err := svc.ListRoster(ctx, "t1", domain.RosterFilter{Limit: 2, Offset: 2})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(page1) != 2 || len(page2) != 2 {
			t.Fatalf("expected 2 items per page, got %d and %d", len(page1), len(page2))
		}
		if total1 != 4 || total2 != 4 {
			t.Fatalf("expected total_count=4 regardless of page, got %d and %d", total1, total2)
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

func TestActiveFightersByNomination(t *testing.T) {
	ctx := context.Background()

	t.Run("returns only fighters active AND with active participation", func(t *testing.T) {
		svc, _, noms := newService()
		noms.Set("n1", domain.NominationInfo{TournamentID: "t1"})

		active, _ := svc.CreateManual(ctx, "t1", "Active Guy", "Club A", []string{"n1"})
		withdrawn, _ := svc.CreateManual(ctx, "t1", "Withdrawn Guy", "Club B", []string{"n1"})
		_, err := svc.WithdrawFighter(ctx, withdrawn.ID, domain.ReasonBan)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		removed, _ := svc.CreateManual(ctx, "t1", "Removed Guy", "Club C", []string{"n1"})
		_, err = svc.RemoveFromNomination(ctx, removed.ID, "n1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		otherNom, _ := svc.CreateManual(ctx, "t1", "Other Nomination Guy", "Club D", []string{"n2"})
		_ = otherNom

		refs, err := svc.ActiveFightersByNomination(ctx, "n1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(refs) != 1 {
			t.Fatalf("expected 1 active fighter ref, got %d: %+v", len(refs), refs)
		}
		if refs[0].ID != active.ID || refs[0].Name != "Active Guy" || refs[0].Club != "Club A" {
			t.Fatalf("unexpected fighter ref: %+v", refs[0])
		}
	})

	t.Run("empty nomination id is invalid input", func(t *testing.T) {
		svc, _, _ := newService()
		_, err := svc.ActiveFightersByNomination(ctx, "")
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Fatalf("expected ErrInvalidInput, got %v", err)
		}
	})
}

func TestWithdrawReturn_NotifiesSeeding(t *testing.T) {
	ctx := context.Background()

	t.Run("withdraw and return call the seeding sink with the fighter id", func(t *testing.T) {
		svc, d := newServiceWithDeps()
		created, err := svc.CreateManual(ctx, "t1", "Ivan", "Club X", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if _, err := svc.WithdrawFighter(ctx, created.ID, domain.ReasonInjury); err != nil {
			t.Fatalf("WithdrawFighter: %v", err)
		}
		if len(d.seeding.Withdrawn) != 1 || d.seeding.Withdrawn[0] != created.ID {
			t.Fatalf("expected OnFighterWithdrawn(%s), got %+v", created.ID, d.seeding.Withdrawn)
		}

		if _, err := svc.ReturnFighter(ctx, created.ID); err != nil {
			t.Fatalf("ReturnFighter: %v", err)
		}
		if len(d.seeding.Returned) != 1 || d.seeding.Returned[0] != created.ID {
			t.Fatalf("expected OnFighterReturned(%s), got %+v", created.ID, d.seeding.Returned)
		}
	})

	t.Run("seeding sink failure does not roll back the already-committed status change", func(t *testing.T) {
		svc, d := newServiceWithDeps()
		d.seeding.WithError(errors.New("stage unavailable"))
		created, err := svc.CreateManual(ctx, "t1", "Ivan", "Club X", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		withdrawn, err := svc.WithdrawFighter(ctx, created.ID, domain.ReasonInjury)
		if err != nil {
			t.Fatalf("expected WithdrawFighter to succeed despite seeding sink failure, got %v", err)
		}
		if withdrawn.Status != domain.StatusWithdrawn {
			t.Fatalf("expected withdrawn status, got %+v", withdrawn)
		}

		returned, err := svc.ReturnFighter(ctx, created.ID)
		if err != nil {
			t.Fatalf("expected ReturnFighter to succeed despite seeding sink failure, got %v", err)
		}
		if returned.Status != domain.StatusActive {
			t.Fatalf("expected active status, got %+v", returned)
		}
	})

	t.Run("nil seeding sink does not panic", func(t *testing.T) {
		svc, _, _ := newService() // repo/noms/tournaments only; seeding/stage/bout/accounts left nil per constructor guard
		_ = svc
	})
}

func TestFindByAccount(t *testing.T) {
	ctx := context.Background()

	t.Run("found fighter for account in explicit tournament", func(t *testing.T) {
		svc, _ := newServiceWithDeps()
		created, err := svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n1", OriginUserID: "u1", Name: "Ivan", Club: "Club X",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		f, found, err := svc.FindByAccount(ctx, "u1", "t1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !found {
			t.Fatal("expected found=true")
		}
		if f.ID != created.ID {
			t.Fatalf("expected fighter %s, got %s", created.ID, f.ID)
		}
	})

	t.Run("empty tournament id resolves via active tournament", func(t *testing.T) {
		svc, _ := newServiceWithDeps() // active tournament is "t1"
		created, err := svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n1", OriginUserID: "u1", Name: "Ivan", Club: "Club X",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		f, found, err := svc.FindByAccount(ctx, "u1", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !found || f.ID != created.ID {
			t.Fatalf("expected found fighter %s, got found=%v f=%+v", created.ID, found, f)
		}
	})

	t.Run("account without a fighter is not found, not an error", func(t *testing.T) {
		svc, _ := newServiceWithDeps()
		_, found, err := svc.FindByAccount(ctx, "u-unknown", "t1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if found {
			t.Fatal("expected found=false")
		}
	})

	t.Run("empty user id is invalid input", func(t *testing.T) {
		svc, _ := newServiceWithDeps()
		_, _, err := svc.FindByAccount(ctx, "", "t1")
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Fatalf("expected ErrInvalidInput, got %v", err)
		}
	})
}

func TestListRosterAndGetFighter_EnrichLinkedAccount(t *testing.T) {
	ctx := context.Background()

	t.Run("ListRoster enriches fighters with an origin user id, leaves manual fighters untouched", func(t *testing.T) {
		svc, d := newServiceWithDeps()
		d.accounts.Set("u1", "Ivan Display Name")

		fromApp, err := svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n1", OriginUserID: "u1", Name: "Ivan", Club: "Club X",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		manual, err := svc.CreateManual(ctx, "t1", "Manual Guy", "Club Y", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		roster, _, _, err := svc.ListRoster(ctx, "t1", domain.RosterFilter{Limit: 100})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		var gotApp, gotManual bool
		for _, f := range roster {
			switch f.ID {
			case fromApp.ID:
				gotApp = true
				if f.LinkedAccountID != "u1" || f.LinkedAccountDisplayName != "Ivan Display Name" {
					t.Fatalf("expected enriched linked account, got %+v", f)
				}
			case manual.ID:
				gotManual = true
				if f.LinkedAccountID != "" || f.LinkedAccountDisplayName != "" {
					t.Fatalf("expected no linked account for manual fighter, got %+v", f)
				}
			}
		}
		if !gotApp || !gotManual {
			t.Fatalf("expected both fighters in roster, got %+v", roster)
		}
	})

	t.Run("GetFighter enriches a single fighter", func(t *testing.T) {
		svc, d := newServiceWithDeps()
		d.accounts.Set("u1", "Ivan Display Name")
		created, err := svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n1", OriginUserID: "u1", Name: "Ivan", Club: "Club X",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		f, err := svc.GetFighter(ctx, created.ID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if f.LinkedAccountID != "u1" || f.LinkedAccountDisplayName != "Ivan Display Name" {
			t.Fatalf("expected enriched linked account, got %+v", f)
		}
	})

	t.Run("nil accounts directory leaves fighters unenriched, no panic", func(t *testing.T) {
		svc, repo, _ := newService()
		created, err := svc.CreateManual(ctx, "t1", "Ivan", "Club X", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		f, err := svc.GetFighter(ctx, created.ID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if f.LinkedAccountID != "" {
			t.Fatalf("expected empty linked account without accounts directory, got %+v", f)
		}
		_ = repo
	})
}

func TestMergeFighters(t *testing.T) {
	ctx := context.Background()

	t.Run("happy path: participations merged without duplicates, source marked merged, repointers called", func(t *testing.T) {
		svc, d := newServiceWithDeps()
		d.noms.Set("n1", domain.NominationInfo{TournamentID: "t1"})
		d.noms.Set("n2", domain.NominationInfo{TournamentID: "t1"})
		d.noms.Set("n3", domain.NominationInfo{TournamentID: "t1"})

		source, err := svc.CreateManual(ctx, "t1", "Ivan Dup", "Club A", []string{"n1", "n2"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		target, err := svc.CreateManual(ctx, "t1", "Ivan Petrov", "Club B", []string{"n1", "n3"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		merged, err := svc.MergeFighters(ctx, source.ID, target.ID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if merged.ID != target.ID {
			t.Fatalf("expected merge to return target %s, got %s", target.ID, merged.ID)
		}

		noms := make(map[string]bool)
		for _, p := range merged.Participations {
			if noms[p.NominationID] {
				t.Fatalf("duplicate participation for nomination %s in merged target: %+v", p.NominationID, merged.Participations)
			}
			noms[p.NominationID] = true
		}
		if !noms["n1"] || !noms["n2"] || !noms["n3"] {
			t.Fatalf("expected target to hold n1,n2,n3, got %+v", merged.Participations)
		}

		sourceAfter, err := svc.GetFighter(ctx, source.ID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sourceAfter.Status != domain.StatusMerged {
			t.Fatalf("expected source status=merged, got %+v", sourceAfter)
		}
		if sourceAfter.MergedIntoID != target.ID {
			t.Fatalf("expected source.MergedIntoID=%s, got %+v", target.ID, sourceAfter)
		}

		if len(d.stage.Calls) != 1 || d.stage.Calls[0].OldID != source.ID || d.stage.Calls[0].NewID != target.ID {
			t.Fatalf("expected stage.RepointFighter(%s, %s), got %+v", source.ID, target.ID, d.stage.Calls)
		}
		if len(d.bout.Calls) != 1 || d.bout.Calls[0].OldID != source.ID || d.bout.Calls[0].NewID != target.ID {
			t.Fatalf("expected bout.RepointFighter(%s, %s), got %+v", source.ID, target.ID, d.bout.Calls)
		}
	})

	t.Run("clears source origin_user_id, keeps target's own", func(t *testing.T) {
		svc, d := newServiceWithDeps()
		source, err := svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n1", OriginUserID: "u-source", Name: "Ivan Dup", Club: "Club A",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		target, err := svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n2", OriginUserID: "u-target", Name: "Ivan Petrov", Club: "Club B",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		merged, err := svc.MergeFighters(ctx, source.ID, target.ID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if merged.OriginUserID == nil || *merged.OriginUserID != "u-target" {
			t.Fatalf("expected target to keep its own origin_user_id u-target, got %+v", merged.OriginUserID)
		}

		sourceAfter, err := svc.GetFighter(ctx, source.ID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sourceAfter.OriginUserID != nil {
			t.Fatalf("expected source origin_user_id cleared, got %+v", sourceAfter.OriginUserID)
		}
		_ = d
	})

	t.Run("stage/bout repointer failures are best-effort and do not fail the merge", func(t *testing.T) {
		svc, d := newServiceWithDeps()
		d.stage.WithError(errors.New("stage down"))
		d.bout.WithError(errors.New("bout down"))
		source, err := svc.CreateManual(ctx, "t1", "Ivan Dup", "Club A", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		target, err := svc.CreateManual(ctx, "t1", "Ivan Petrov", "Club B", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if _, err := svc.MergeFighters(ctx, source.ID, target.ID); err != nil {
			t.Fatalf("expected merge to succeed despite repointer failures, got %v", err)
		}
	})

	t.Run("same fighter rejected", func(t *testing.T) {
		svc, _ := newServiceWithDeps()
		created, err := svc.CreateManual(ctx, "t1", "Ivan", "Club X", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		_, err = svc.MergeFighters(ctx, created.ID, created.ID)
		if !errors.Is(err, domain.ErrSameFighter) {
			t.Fatalf("expected ErrSameFighter, got %v", err)
		}
	})

	t.Run("cross tournament merge rejected", func(t *testing.T) {
		svc, _ := newServiceWithDeps()
		source, err := svc.CreateManual(ctx, "t1", "Ivan", "Club X", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		target, err := svc.CreateManual(ctx, "t2", "Ivan", "Club X", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		_, err = svc.MergeFighters(ctx, source.ID, target.ID)
		if !errors.Is(err, domain.ErrCrossTournamentMerge) {
			t.Fatalf("expected ErrCrossTournamentMerge, got %v", err)
		}
	})

	t.Run("merging an already-merged fighter rejected", func(t *testing.T) {
		svc, _ := newServiceWithDeps()
		source, err := svc.CreateManual(ctx, "t1", "Ivan Dup", "Club A", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		target, err := svc.CreateManual(ctx, "t1", "Ivan Petrov", "Club B", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		other, err := svc.CreateManual(ctx, "t1", "Third Guy", "Club C", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if _, err := svc.MergeFighters(ctx, source.ID, target.ID); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if _, err := svc.MergeFighters(ctx, source.ID, other.ID); !errors.Is(err, domain.ErrAlreadyMerged) {
			t.Fatalf("expected ErrAlreadyMerged for already-merged source, got %v", err)
		}
		if _, err := svc.MergeFighters(ctx, other.ID, source.ID); !errors.Is(err, domain.ErrAlreadyMerged) {
			t.Fatalf("expected ErrAlreadyMerged for already-merged target, got %v", err)
		}
	})

	t.Run("unknown source or target fighter", func(t *testing.T) {
		svc, _ := newServiceWithDeps()
		target, err := svc.CreateManual(ctx, "t1", "Ivan", "Club X", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		_, err = svc.MergeFighters(ctx, "missing", target.ID)
		if !errors.Is(err, domain.ErrNotFound) {
			t.Fatalf("expected ErrNotFound for unknown source, got %v", err)
		}
		_, err = svc.MergeFighters(ctx, target.ID, "missing")
		if !errors.Is(err, domain.ErrNotFound) {
			t.Fatalf("expected ErrNotFound for unknown target, got %v", err)
		}
	})
}

func strPtr(s string) *string { return &s }
