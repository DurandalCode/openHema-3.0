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
	adminID      = "user-admin"
	nominationID = "nomination-1"
	tournamentID = "tournament-1"
)

func mustSubmit(t *testing.T) domain.Application {
	t.Helper()
	return mustSubmitWithDetails(t, "", false)
}

func mustSubmitWithDetails(t *testing.T, club string, needsEquipment bool) domain.Application {
	t.Helper()
	ev, err := domain.Submit(nominationID, tournamentID, applicantID, club, needsEquipment, time.Unix(1000, 0))
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
	ev, err := domain.Submit(nominationID, tournamentID, applicantID, "Sokol", true, time.Unix(1000, 0))
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
	if ev.Payload.Club != "Sokol" || !ev.Payload.NeedsEquipment {
		t.Fatalf("expected club/needs_equipment in payload, got %+v", ev.Payload)
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
			_, err := domain.Submit(tc.nominationID, tc.tournamentID, tc.applicantID, "", false, time.Now())
			if !errors.Is(err, domain.ErrInvalidTransition) {
				t.Fatalf("expected ErrInvalidTransition, got %v", err)
			}
		})
	}
}

// AC-1/AC-2: club/needs_equipment зафиксированы фактом подачи и видны после
// свёртки.
func TestRebuild_SubmittedCarriesClubAndEquipment(t *testing.T) {
	app := mustSubmitWithDetails(t, "Sokol", true)
	if app.Club != "Sokol" {
		t.Fatalf("expected club Sokol, got %q", app.Club)
	}
	if !app.NeedsEquipment {
		t.Fatalf("expected needs_equipment true")
	}

	empty := mustSubmitWithDetails(t, "", false)
	if empty.Club != "" || empty.NeedsEquipment {
		t.Fatalf("expected empty club and needs_equipment=false by default, got %+v", empty)
	}
}

func TestRebuild_EmptyStream(t *testing.T) {
	_, err := domain.Rebuild("app-1", nil)
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestRebuild_FullHappyPath(t *testing.T) {
	submitted, err := domain.Submit(nominationID, tournamentID, applicantID, "Sokol", true, time.Unix(1000, 0))
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

// AC-3: правка деталей (клуб/экипировка) фиксируется как ApplicationAmended,
// прошлые события не меняются.
func TestAmend_UpdatesDetails(t *testing.T) {
	app := mustSubmitWithDetails(t, "hema club", false)
	ev, err := app.Amend(adminID, domain.AmendPatch{Club: "HEMA Club", NeedsEquipment: true}, time.Unix(2000, 0))
	if err != nil {
		t.Fatalf("Amend: %v", err)
	}
	if ev.Type != domain.EventAmended {
		t.Fatalf("expected EventAmended, got %s", ev.Type)
	}
	if ev.Sequence != app.Version+1 {
		t.Fatalf("expected sequence %d, got %d", app.Version+1, ev.Sequence)
	}

	rebuilt, err := domain.Rebuild("app-1", append(streamOf(t, app), ev))
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if rebuilt.Club != "HEMA Club" || !rebuilt.NeedsEquipment {
		t.Fatalf("expected amended club/needs_equipment, got %+v", rebuilt)
	}
	if rebuilt.NominationID != nominationID || rebuilt.State != domain.StateSubmitted {
		t.Fatalf("amend must not touch nomination/state when not requested: %+v", rebuilt)
	}
}

// AC-4/AC-5: переопределение имени хранится на заявке; пустое значение —
// откат к имени из auth (эффективное имя вычисляется в service).
func TestAmend_NameOverride(t *testing.T) {
	app := mustSubmit(t)
	ev, err := app.Amend(adminID, domain.AmendPatch{ApplicantNameOverride: "Ivan Petrov"}, time.Unix(2000, 0))
	if err != nil {
		t.Fatalf("Amend: %v", err)
	}
	rebuilt, err := domain.Rebuild("app-1", append(streamOf(t, app), ev))
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if rebuilt.ApplicantNameOverride != "Ivan Petrov" {
		t.Fatalf("expected override, got %q", rebuilt.ApplicantNameOverride)
	}
}

// AC-8: перенос заявки в другую номинацию переопределяет и турнир.
func TestAmend_TransfersNomination(t *testing.T) {
	app := mustSubmit(t)
	otherNomination := "nomination-2"
	otherTournament := "tournament-2"
	ev, err := app.Amend(adminID, domain.AmendPatch{
		NominationID: &otherNomination,
		TournamentID: otherTournament,
	}, time.Unix(2000, 0))
	if err != nil {
		t.Fatalf("Amend: %v", err)
	}
	rebuilt, err := domain.Rebuild("app-1", append(streamOf(t, app), ev))
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if rebuilt.NominationID != otherNomination || rebuilt.TournamentID != otherTournament {
		t.Fatalf("expected transferred nomination/tournament, got %+v", rebuilt)
	}
}

// AC-10: ручная смена статуса переводит заявку в указанное состояние в обход
// обычного флоу (напрямую из «Подана» в «Зарегистрирована», минуя оплату).
func TestAmend_ManualStateOverride(t *testing.T) {
	app := mustSubmit(t)
	target := domain.StateRegistered
	ev, err := app.Amend(adminID, domain.AmendPatch{NewState: &target}, time.Unix(2000, 0))
	if err != nil {
		t.Fatalf("Amend: %v", err)
	}
	rebuilt, err := domain.Rebuild("app-1", append(streamOf(t, app), ev))
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if rebuilt.State != domain.StateRegistered {
		t.Fatalf("expected manual state override to Registered, got %s", rebuilt.State)
	}
}

// AC-12: правка допустима над терминальной заявкой (FR-9) — в отличие от
// пользовательских переходов (ADR 0011/спека 0005), Amend их не проверяет.
func TestAmend_AllowedOnTerminalState(t *testing.T) {
	for _, st := range []domain.State{domain.StateRegistered, domain.StateWithdrawn} {
		t.Run(string(st), func(t *testing.T) {
			app := mustSubmit(t)
			app.State = st
			if _, err := app.Amend(adminID, domain.AmendPatch{Club: "New Club"}, time.Now()); err != nil {
				t.Fatalf("Amend on terminal %s: unexpected error %v", st, err)
			}
		})
	}
}

// AC-13: несколько правок подряд — каждая добавляет факт, свёртка применяет
// их по порядку; предыдущие события не меняются.
func TestRebuild_MultipleAmendsInOrder(t *testing.T) {
	app := mustSubmitWithDetails(t, "Club A", false)
	stream := streamOf(t, app)

	ev1, err := app.Amend(adminID, domain.AmendPatch{Club: "Club B", NeedsEquipment: true}, time.Unix(2000, 0))
	if err != nil {
		t.Fatalf("Amend 1: %v", err)
	}
	stream = append(stream, ev1)
	app, err = domain.Rebuild("app-1", stream)
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}

	ev2, err := app.Amend(adminID, domain.AmendPatch{Club: "Club C", NeedsEquipment: false, ApplicantNameOverride: "Fixed Name"}, time.Unix(3000, 0))
	if err != nil {
		t.Fatalf("Amend 2: %v", err)
	}
	stream = append(stream, ev2)
	app, err = domain.Rebuild("app-1", stream)
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}

	if app.Club != "Club C" || app.NeedsEquipment || app.ApplicantNameOverride != "Fixed Name" {
		t.Fatalf("expected last amend to win, got %+v", app)
	}
	if app.Version != 3 {
		t.Fatalf("expected version 3 (submit + 2 amends), got %d", app.Version)
	}
	if stream[0].Type != domain.EventSubmitted {
		t.Fatalf("first event in stream must remain Submitted (history immutable)")
	}
}

func TestAmend_InvalidNominationTransfer(t *testing.T) {
	app := mustSubmit(t)
	empty := ""
	_, err := app.Amend(adminID, domain.AmendPatch{NominationID: &empty, TournamentID: tournamentID}, time.Now())
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("expected ErrInvalidTransition for empty target nomination, got %v", err)
	}
}

func TestAmend_InvalidManualState(t *testing.T) {
	app := mustSubmit(t)
	bogus := domain.State("bogus")
	_, err := app.Amend(adminID, domain.AmendPatch{NewState: &bogus}, time.Now())
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("expected ErrInvalidTransition for unknown state, got %v", err)
	}
}

func streamOf(t *testing.T, app domain.Application) []domain.Event {
	t.Helper()
	ev, err := domain.Submit(app.NominationID, app.TournamentID, app.ApplicantUserID, app.Club, app.NeedsEquipment, app.CreatedAt)
	if err != nil {
		t.Fatalf("Submit (rebuild helper): %v", err)
	}
	return []domain.Event{ev}
}
