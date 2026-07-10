package domain_test

import (
	"errors"
	"testing"
	"time"

	"github.com/hema/server/modules/application/domain"
)

const (
	applicantID  = "user-applicant"
	otherUserID  = "user-other"
	nominationID = "nomination-1"
	tournamentID = "tournament-1"
)

func mustSubmit(t *testing.T) domain.Application {
	t.Helper()
	ev, err := domain.Submit(nominationID, tournamentID, applicantID, time.Unix(1000, 0))
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	app, err := domain.Rebuild("app-1", []domain.Event{ev})
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	return app
}

func TestSubmit_ProducesFirstEvent(t *testing.T) {
	ev, err := domain.Submit(nominationID, tournamentID, applicantID, time.Unix(1000, 0))
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if ev.Type != domain.EventSubmitted {
		t.Fatalf("expected EventSubmitted, got %s", ev.Type)
	}
	if ev.Sequence != 1 {
		t.Fatalf("expected sequence 1, got %d", ev.Sequence)
	}
	if ev.ActorID != applicantID {
		t.Fatalf("expected actor %s, got %s", applicantID, ev.ActorID)
	}
}

func TestSubmit_InvalidInput(t *testing.T) {
	cases := []struct {
		name         string
		nominationID string
		tournamentID string
		applicantID  string
	}{
		{"empty nomination", "", tournamentID, applicantID},
		{"empty tournament", nominationID, "", applicantID},
		{"empty applicant", nominationID, tournamentID, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := domain.Submit(tc.nominationID, tc.tournamentID, tc.applicantID, time.Now())
			if !errors.Is(err, domain.ErrInvalidTransition) {
				t.Fatalf("expected ErrInvalidTransition, got %v", err)
			}
		})
	}
}

func TestRebuild_EmptyStream(t *testing.T) {
	_, err := domain.Rebuild("app-1", nil)
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestRebuild_FullHappyPath(t *testing.T) {
	submitted, err := domain.Submit(nominationID, tournamentID, applicantID, time.Unix(1000, 0))
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	events := []domain.Event{submitted}

	app, err := domain.Rebuild("app-1", events)
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if app.State != domain.StateSubmitted {
		t.Fatalf("expected StateSubmitted, got %s", app.State)
	}
	if app.NominationID != nominationID || app.TournamentID != tournamentID || app.ApplicantUserID != applicantID {
		t.Fatalf("unexpected identity fields: %+v", app)
	}

	ev, err := app.DeclarePayment(applicantID, time.Unix(1001, 0))
	if err != nil {
		t.Fatalf("DeclarePayment: %v", err)
	}
	events = append(events, ev)
	app, err = domain.Rebuild("app-1", events)
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if app.State != domain.StateAwaitingPaymentConfirmation {
		t.Fatalf("expected AwaitingPaymentConfirmation, got %s", app.State)
	}

	ev, err = app.ConfirmPayment("admin-1", time.Unix(1002, 0))
	if err != nil {
		t.Fatalf("ConfirmPayment: %v", err)
	}
	events = append(events, ev)
	app, err = domain.Rebuild("app-1", events)
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if app.State != domain.StatePaid {
		t.Fatalf("expected StatePaid, got %s", app.State)
	}

	ev, err = app.Register("admin-1", time.Unix(1003, 0))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	events = append(events, ev)
	app, err = domain.Rebuild("app-1", events)
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if app.State != domain.StateRegistered {
		t.Fatalf("expected StateRegistered, got %s", app.State)
	}
	if app.Version != 4 {
		t.Fatalf("expected version 4, got %d", app.Version)
	}
	if !app.State.IsTerminal() {
		t.Fatalf("expected Registered to be terminal")
	}
}

func TestDeclarePayment_WrongActorForbidden(t *testing.T) {
	app := mustSubmit(t)
	_, err := app.DeclarePayment(otherUserID, time.Now())
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected ErrForbidden, got %v", err)
	}
}

func TestDeclarePayment_InvalidFromWrongState(t *testing.T) {
	app := mustSubmit(t)
	app.State = domain.StatePaid
	_, err := app.DeclarePayment(applicantID, time.Now())
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("expected ErrInvalidTransition, got %v", err)
	}
}

func TestConfirmPayment_InvalidFromSubmitted(t *testing.T) {
	app := mustSubmit(t)
	_, err := app.ConfirmPayment("admin-1", time.Now())
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("expected ErrInvalidTransition, got %v", err)
	}
}

func TestRegister_InvalidFromSubmitted(t *testing.T) {
	app := mustSubmit(t)
	_, err := app.Register("admin-1", time.Now())
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("expected ErrInvalidTransition, got %v", err)
	}
}

func TestRegister_ValidFromPaid(t *testing.T) {
	app := mustSubmit(t)
	app.State = domain.StatePaid
	ev, err := app.Register("admin-1", time.Now())
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if ev.Type != domain.EventFighterRegistered {
		t.Fatalf("expected EventFighterRegistered, got %s", ev.Type)
	}
}

func TestWithdraw_FromAnyActiveState(t *testing.T) {
	states := []domain.State{
		domain.StateSubmitted,
		domain.StateAwaitingPaymentConfirmation,
		domain.StatePaid,
	}
	for _, st := range states {
		t.Run(string(st), func(t *testing.T) {
			app := mustSubmit(t)
			app.State = st
			ev, err := app.Withdraw(applicantID, time.Now())
			if err != nil {
				t.Fatalf("Withdraw from %s: %v", st, err)
			}
			if ev.Type != domain.EventWithdrawn {
				t.Fatalf("expected EventWithdrawn, got %s", ev.Type)
			}
		})
	}
}

func TestWithdraw_WrongActorForbidden(t *testing.T) {
	app := mustSubmit(t)
	_, err := app.Withdraw(otherUserID, time.Now())
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected ErrForbidden, got %v", err)
	}
}

func TestWithdraw_FromTerminalInvalid(t *testing.T) {
	for _, st := range []domain.State{domain.StateRegistered, domain.StateWithdrawn} {
		t.Run(string(st), func(t *testing.T) {
			app := mustSubmit(t)
			app.State = st
			_, err := app.Withdraw(applicantID, time.Now())
			if !errors.Is(err, domain.ErrInvalidTransition) {
				t.Fatalf("expected ErrInvalidTransition, got %v", err)
			}
		})
	}
}

func TestActionOnTerminal_AllRejected(t *testing.T) {
	for _, st := range []domain.State{domain.StateRegistered, domain.StateWithdrawn} {
		app := mustSubmit(t)
		app.State = st

		if _, err := app.DeclarePayment(applicantID, time.Now()); !errors.Is(err, domain.ErrInvalidTransition) {
			t.Fatalf("state %s: DeclarePayment expected ErrInvalidTransition, got %v", st, err)
		}
		if _, err := app.ConfirmPayment("admin-1", time.Now()); !errors.Is(err, domain.ErrInvalidTransition) {
			t.Fatalf("state %s: ConfirmPayment expected ErrInvalidTransition, got %v", st, err)
		}
		if _, err := app.Register("admin-1", time.Now()); !errors.Is(err, domain.ErrInvalidTransition) {
			t.Fatalf("state %s: Register expected ErrInvalidTransition, got %v", st, err)
		}
	}
}

func TestState_IsTerminalIsActive(t *testing.T) {
	terminal := []domain.State{domain.StateRegistered, domain.StateWithdrawn}
	active := []domain.State{domain.StateSubmitted, domain.StateAwaitingPaymentConfirmation, domain.StatePaid}

	for _, st := range terminal {
		if !st.IsTerminal() {
			t.Fatalf("expected %s to be terminal", st)
		}
		if st.IsActive() {
			t.Fatalf("expected %s to not be active", st)
		}
	}
	for _, st := range active {
		if st.IsTerminal() {
			t.Fatalf("expected %s to not be terminal", st)
		}
		if !st.IsActive() {
			t.Fatalf("expected %s to be active", st)
		}
	}
}
