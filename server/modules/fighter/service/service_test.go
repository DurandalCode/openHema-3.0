package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/fighter/domain"
	"github.com/hema/server/modules/fighter/service"
	"github.com/hema/server/modules/fighter/testutil"
)

func newService() (*service.Service, *testutil.FakeRepo, *testutil.FakeNominationProvider) {
	repo := testutil.NewFakeRepo()
	noms := testutil.NewFakeNominationProvider()
	tournaments := testutil.NewFakeActiveTournamentProvider("t1")
	return service.New(repo, noms, tournaments), repo, noms
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
		all, _ := repo.ListByTournament(ctx, "t1")
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
		all, _ := repo.ListByTournament(ctx, "t1")
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
		all1, _ := repo.ListByTournament(ctx, "t1")
		all2, _ := repo.ListByTournament(ctx, "t2")
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

		roster, err := svc.ListRoster(ctx, "t1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(roster) != 2 {
			t.Fatalf("expected 2 fighters in t1 roster, got %d", len(roster))
		}
	})

	t.Run("empty tournament id resolves to active tournament", func(t *testing.T) {
		svc, _, _ := newService() // active tournament is "t1"
		_, _ = svc.CreateManual(ctx, "t1", "Ivan", "Club X", nil)

		roster, err := svc.ListRoster(ctx, "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(roster) != 1 {
			t.Fatalf("expected 1 fighter resolved via active tournament, got %d", len(roster))
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
