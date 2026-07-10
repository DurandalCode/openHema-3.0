package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/application/domain"
	"github.com/hema/server/modules/application/service"
	"github.com/hema/server/modules/application/testutil"
)

const (
	applicantID  = "user-applicant"
	otherUserID  = "user-other"
	adminID      = "user-admin"
	nominationID = "nomination-1"
	tournamentID = "tournament-1"
)

func newTestService() (*service.Service, *testutil.FakeRepo, *testutil.FakeNominationProvider, *testutil.FakeUserProvider) {
	repo := testutil.NewFakeRepo()
	nominations := testutil.NewFakeNominationProvider()
	nominations.Set(nominationID, domain.NominationInfo{TournamentID: tournamentID})
	users := testutil.NewFakeUserProvider()
	users.Set(applicantID, "Applicant Name")
	users.Set(adminID, "Admin Name")
	svc := service.New(repo, nominations, users)
	return svc, repo, nominations, users
}

func TestSubmit_HappyPath(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if app.State != domain.StateSubmitted {
		t.Fatalf("expected StateSubmitted, got %s", app.State)
	}
	if app.TournamentID != tournamentID {
		t.Fatalf("expected tournament resolved from nomination, got %s", app.TournamentID)
	}
	if app.ApplicantDisplayName != "Applicant Name" {
		t.Fatalf("expected display name enriched, got %q", app.ApplicantDisplayName)
	}
}

func TestSubmit_NominationNotFound(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	_, err := svc.Submit(ctx, applicantID, "missing-nomination")
	if !errors.Is(err, domain.ErrNominationNotFound) {
		t.Fatalf("expected ErrNominationNotFound, got %v", err)
	}
}

func TestSubmit_DuplicateActiveRejected(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	if _, err := svc.Submit(ctx, applicantID, nominationID); err != nil {
		t.Fatalf("first Submit: %v", err)
	}
	_, err := svc.Submit(ctx, applicantID, nominationID)
	if !errors.Is(err, domain.ErrDuplicateActive) {
		t.Fatalf("expected ErrDuplicateActive, got %v", err)
	}
}

func TestSubmit_AllowedAfterWithdraw(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if _, err := svc.Withdraw(ctx, applicantID, app.ID); err != nil {
		t.Fatalf("Withdraw: %v", err)
	}
	if _, err := svc.Submit(ctx, applicantID, nominationID); err != nil {
		t.Fatalf("Submit after withdraw should succeed, got %v", err)
	}
}

func TestDeclarePayment_Owner_HappyPath(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	app, err = svc.DeclarePayment(ctx, applicantID, app.ID)
	if err != nil {
		t.Fatalf("DeclarePayment: %v", err)
	}
	if app.State != domain.StateAwaitingPaymentConfirmation {
		t.Fatalf("expected AwaitingPaymentConfirmation, got %s", app.State)
	}
}

func TestDeclarePayment_WrongOwner_Forbidden(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	_, err = svc.DeclarePayment(ctx, otherUserID, app.ID)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected ErrForbidden, got %v", err)
	}
}

func submitPaidApplication(t *testing.T, svc *service.Service, ctx context.Context) service.Application {
	t.Helper()
	app, err := svc.Submit(ctx, applicantID, nominationID)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	app, err = svc.DeclarePayment(ctx, applicantID, app.ID)
	if err != nil {
		t.Fatalf("DeclarePayment: %v", err)
	}
	app, err = svc.ConfirmPayment(ctx, adminID, app.ID)
	if err != nil {
		t.Fatalf("ConfirmPayment: %v", err)
	}
	return app
}

func TestWithdraw_FromPaid_HappyPath(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	app := submitPaidApplication(t, svc, ctx)
	if app.State != domain.StatePaid {
		t.Fatalf("expected StatePaid precondition, got %s", app.State)
	}
	app, err := svc.Withdraw(ctx, applicantID, app.ID)
	if err != nil {
		t.Fatalf("Withdraw from Paid: %v", err)
	}
	if app.State != domain.StateWithdrawn {
		t.Fatalf("expected StateWithdrawn, got %s", app.State)
	}
}

func TestConfirmPayment_FromWrongState_InvalidTransition(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	_, err = svc.ConfirmPayment(ctx, adminID, app.ID)
	if !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("expected ErrInvalidTransition, got %v", err)
	}
}

func TestActionOnTerminal_Rejected(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	app, err = svc.Withdraw(ctx, applicantID, app.ID)
	if err != nil {
		t.Fatalf("Withdraw: %v", err)
	}
	if _, err := svc.DeclarePayment(ctx, applicantID, app.ID); !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("expected ErrInvalidTransition on withdrawn, got %v", err)
	}
	if _, err := svc.Withdraw(ctx, applicantID, app.ID); !errors.Is(err, domain.ErrInvalidTransition) {
		t.Fatalf("expected ErrInvalidTransition on double withdraw, got %v", err)
	}
}

func TestGetApplication_OwnerAccess(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	got, history, err := svc.Get(ctx, applicantID, false, app.ID)
	if err != nil {
		t.Fatalf("Get as owner: %v", err)
	}
	if got.ID != app.ID {
		t.Fatalf("expected same application id")
	}
	if len(history) != 1 {
		t.Fatalf("expected 1 history event, got %d", len(history))
	}
}

func TestGetApplication_AdminAccess(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if _, _, err := svc.Get(ctx, adminID, true, app.ID); err != nil {
		t.Fatalf("Get as admin: %v", err)
	}
}

func TestGetApplication_OtherUser_Forbidden(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if _, _, err := svc.Get(ctx, otherUserID, false, app.ID); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected ErrForbidden, got %v", err)
	}
}

func TestGetApplication_HistoryFullPath(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	app := submitPaidApplication(t, svc, ctx)
	app, _, err := svc.Register(ctx, adminID, app.ID)
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	_, history, err := svc.Get(ctx, adminID, true, app.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(history) != 4 {
		t.Fatalf("expected 4 history events, got %d", len(history))
	}
	wantTypes := []domain.EventType{
		domain.EventSubmitted,
		domain.EventPaymentDeclared,
		domain.EventPaymentConfirmed,
		domain.EventFighterRegistered,
	}
	for i, ev := range history {
		if ev.Type != wantTypes[i] {
			t.Fatalf("history[%d]: expected %s, got %s", i, wantTypes[i], ev.Type)
		}
	}
}

func TestRegister_CapacityExceeded_SoftWarning(t *testing.T) {
	svc, _, nominations, users := newTestService()
	ctx := context.Background()

	capacity := int32(1)
	nominations.Set(nominationID, domain.NominationInfo{TournamentID: tournamentID, FighterCapacity: &capacity})

	// First fighter fills capacity exactly — no warning yet.
	users.Set("user-1", "Fighter One")
	app1, err := svc.Submit(ctx, "user-1", nominationID)
	if err != nil {
		t.Fatalf("Submit 1: %v", err)
	}
	app1, err = svc.DeclarePayment(ctx, "user-1", app1.ID)
	if err != nil {
		t.Fatalf("DeclarePayment 1: %v", err)
	}
	app1, err = svc.ConfirmPayment(ctx, adminID, app1.ID)
	if err != nil {
		t.Fatalf("ConfirmPayment 1: %v", err)
	}
	app1, exceeded, err := svc.Register(ctx, adminID, app1.ID)
	if err != nil {
		t.Fatalf("Register 1: %v", err)
	}
	if exceeded {
		t.Fatalf("expected no capacity warning for the fighter filling exact capacity")
	}
	if app1.State != domain.StateRegistered {
		t.Fatalf("expected StateRegistered, got %s", app1.State)
	}

	// Second fighter — capacity already reached, registering triggers warning.
	users.Set("user-2", "Fighter Two")
	app2, err := svc.Submit(ctx, "user-2", nominationID)
	if err != nil {
		t.Fatalf("Submit 2: %v", err)
	}
	app2, err = svc.DeclarePayment(ctx, "user-2", app2.ID)
	if err != nil {
		t.Fatalf("DeclarePayment 2: %v", err)
	}
	app2, err = svc.ConfirmPayment(ctx, adminID, app2.ID)
	if err != nil {
		t.Fatalf("ConfirmPayment 2: %v", err)
	}
	_, exceeded, err = svc.Register(ctx, adminID, app2.ID)
	if err != nil {
		t.Fatalf("Register 2: %v", err)
	}
	if !exceeded {
		t.Fatalf("expected capacity warning for the fighter registered over capacity")
	}
}

func TestRegister_NoCapacitySet_NoWarning(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	app := submitPaidApplication(t, svc, ctx)
	_, exceeded, err := svc.Register(ctx, adminID, app.ID)
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if exceeded {
		t.Fatalf("expected no warning when fighter_capacity is not set")
	}
}

// flakyRepo — тестовый декоратор над FakeRepo, симулирующий конфликт версии
// (ErrConcurrency) на первых N вызовах Append, не трогая реальное хранилище.
type flakyRepo struct {
	*testutil.FakeRepo
	failuresLeft int
	calls        int
}

func (r *flakyRepo) Append(ctx context.Context, appID string, expectedVersion int, ev domain.Event, view domain.ApplicationView) error {
	r.calls++
	if r.failuresLeft > 0 {
		r.failuresLeft--
		return domain.ErrConcurrency
	}
	return r.FakeRepo.Append(ctx, appID, expectedVersion, ev, view)
}

func TestConcurrency_OneRetryThenSuccess(t *testing.T) {
	nominations := testutil.NewFakeNominationProvider()
	nominations.Set(nominationID, domain.NominationInfo{TournamentID: tournamentID})
	users := testutil.NewFakeUserProvider()
	users.Set(applicantID, "Applicant Name")

	repo := &flakyRepo{FakeRepo: testutil.NewFakeRepo()}
	svc := service.New(repo, nominations, users)
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}

	repo.failuresLeft = 1
	repo.calls = 0
	app, err = svc.DeclarePayment(ctx, applicantID, app.ID)
	if err != nil {
		t.Fatalf("expected DeclarePayment to succeed after one retry, got %v", err)
	}
	if app.State != domain.StateAwaitingPaymentConfirmation {
		t.Fatalf("expected AwaitingPaymentConfirmation, got %s", app.State)
	}
	if repo.calls != 2 {
		t.Fatalf("expected exactly 2 Append calls (1 conflict + 1 retry), got %d", repo.calls)
	}
}

func TestConcurrency_ExhaustedThenAborted(t *testing.T) {
	nominations := testutil.NewFakeNominationProvider()
	nominations.Set(nominationID, domain.NominationInfo{TournamentID: tournamentID})
	users := testutil.NewFakeUserProvider()
	users.Set(applicantID, "Applicant Name")

	repo := &flakyRepo{FakeRepo: testutil.NewFakeRepo()}
	svc := service.New(repo, nominations, users)
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}

	repo.failuresLeft = 2
	repo.calls = 0
	_, err = svc.DeclarePayment(ctx, applicantID, app.ID)
	if !errors.Is(err, domain.ErrConcurrency) {
		t.Fatalf("expected ErrConcurrency after exhausted retry, got %v", err)
	}
	if repo.calls != 2 {
		t.Fatalf("expected exactly 2 Append attempts (no unbounded retry loop), got %d", repo.calls)
	}
}

func TestListApplications_Filters(t *testing.T) {
	svc, _, nominations, users := newTestService()
	ctx := context.Background()

	const otherNomination = "nomination-2"
	nominations.Set(otherNomination, domain.NominationInfo{TournamentID: tournamentID})
	users.Set(otherUserID, "Other Name")

	app1, err := svc.Submit(ctx, applicantID, nominationID)
	if err != nil {
		t.Fatalf("Submit 1: %v", err)
	}
	app1, err = svc.DeclarePayment(ctx, applicantID, app1.ID)
	if err != nil {
		t.Fatalf("DeclarePayment: %v", err)
	}
	_, err = svc.Submit(ctx, otherUserID, otherNomination)
	if err != nil {
		t.Fatalf("Submit 2: %v", err)
	}

	all, err := svc.ListApplications(ctx, tournamentID, nil, nil)
	if err != nil {
		t.Fatalf("ListApplications (no filter): %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("expected 2 applications, got %d", len(all))
	}

	byNomination, err := svc.ListApplications(ctx, tournamentID, nil, ptr(nominationID))
	if err != nil {
		t.Fatalf("ListApplications (by nomination): %v", err)
	}
	if len(byNomination) != 1 || byNomination[0].ID != app1.ID {
		t.Fatalf("expected only app1 filtered by nomination, got %+v", byNomination)
	}

	awaiting := domain.StateAwaitingPaymentConfirmation
	byStatus, err := svc.ListApplications(ctx, tournamentID, &awaiting, nil)
	if err != nil {
		t.Fatalf("ListApplications (by status): %v", err)
	}
	if len(byStatus) != 1 || byStatus[0].ID != app1.ID {
		t.Fatalf("expected only app1 filtered by status, got %+v", byStatus)
	}
}

func TestNominationParticipants_CountsAndNames(t *testing.T) {
	svc, _, _, users := newTestService()
	ctx := context.Background()

	users.Set("user-1", "Fighter One")
	users.Set("user-2", "Fighter Two")

	app1, err := svc.Submit(ctx, "user-1", nominationID)
	if err != nil {
		t.Fatalf("Submit 1: %v", err)
	}
	app1, err = svc.DeclarePayment(ctx, "user-1", app1.ID)
	if err != nil {
		t.Fatalf("DeclarePayment 1: %v", err)
	}
	if _, err := svc.ConfirmPayment(ctx, adminID, app1.ID); err != nil {
		t.Fatalf("ConfirmPayment 1: %v", err)
	}

	if _, err := svc.Submit(ctx, "user-2", nominationID); err != nil {
		t.Fatalf("Submit 2: %v", err)
	}

	participants, applied, confirmed, capacity, err := svc.NominationParticipants(ctx, nominationID)
	if err != nil {
		t.Fatalf("NominationParticipants: %v", err)
	}
	if applied != 2 {
		t.Fatalf("expected applied=2, got %d", applied)
	}
	if confirmed != 1 {
		t.Fatalf("expected confirmed=1, got %d", confirmed)
	}
	if capacity != nil {
		t.Fatalf("expected nil capacity, got %v", *capacity)
	}
	if len(participants) != 2 {
		t.Fatalf("expected 2 participants, got %d", len(participants))
	}
}

func TestNominationParticipants_WithdrawnExcluded(t *testing.T) {
	svc, _, _, users := newTestService()
	ctx := context.Background()
	users.Set("user-1", "Fighter One")

	app, err := svc.Submit(ctx, "user-1", nominationID)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if _, err := svc.Withdraw(ctx, "user-1", app.ID); err != nil {
		t.Fatalf("Withdraw: %v", err)
	}

	participants, applied, confirmed, _, err := svc.NominationParticipants(ctx, nominationID)
	if err != nil {
		t.Fatalf("NominationParticipants: %v", err)
	}
	if len(participants) != 0 {
		t.Fatalf("expected withdrawn applicant excluded from participants, got %+v", participants)
	}
	if applied != 0 || confirmed != 0 {
		t.Fatalf("expected zero counts after withdraw, got applied=%d confirmed=%d", applied, confirmed)
	}
}

func TestNominationParticipants_NoCapacitySet(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	_, _, _, capacity, err := svc.NominationParticipants(ctx, nominationID)
	if err != nil {
		t.Fatalf("NominationParticipants: %v", err)
	}
	if capacity != nil {
		t.Fatalf("expected nil capacity when not set, got %v", *capacity)
	}
}

func ptr[T any](v T) *T { return &v }
