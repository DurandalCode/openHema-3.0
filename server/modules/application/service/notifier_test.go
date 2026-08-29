package service_test

import (
	"context"
	"testing"

	"github.com/hema/server/modules/application/domain"
	"github.com/hema/server/modules/application/service"
	"github.com/hema/server/modules/application/testutil"
)

// newTestServiceWithNotifier — как newTestService, но с явно заданным
// domain.Notifier (тесты этого файла, в отличие от остальных, проверяют
// именно вызов уведомления).
func newTestServiceWithNotifier(notifier domain.Notifier) (*service.Service, *testutil.FakeRepo, *testutil.FakeNominationProvider, *testutil.FakeUserProvider) {
	repo := testutil.NewFakeRepo()
	nominations := testutil.NewFakeNominationProvider()
	nominations.Set(nominationID, domain.NominationInfo{TournamentID: tournamentID, RegistrationOpen: true})
	users := testutil.NewFakeUserProvider()
	users.Set(applicantID, "Applicant Name")
	users.Set(adminID, "Admin Name")
	svc := service.New(repo, nominations, users, testutil.NewFakeFighterSink(), notifier)
	return svc, repo, nominations, users
}

// TestConfirmPayment_NotifiesApplicant — FR-23: подтверждение оплаты
// секретарём/admin не является собственным действием заявителя, письмо
// уходит.
func TestConfirmPayment_NotifiesApplicant(t *testing.T) {
	notifier := &testutil.FakeNotifier{}
	svc, _, _, _ := newTestServiceWithNotifier(notifier)
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID, "", false)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	app, err = svc.DeclarePayment(ctx, applicantID, app.ID)
	if err != nil {
		t.Fatalf("DeclarePayment: %v", err)
	}
	if len(notifier.Calls) != 0 {
		t.Fatalf("expected no notification yet, got %d calls", len(notifier.Calls))
	}

	app, err = svc.ConfirmPayment(ctx, adminID, app.ID)
	if err != nil {
		t.Fatalf("ConfirmPayment: %v", err)
	}

	if len(notifier.Calls) != 1 {
		t.Fatalf("expected exactly 1 notification, got %d", len(notifier.Calls))
	}
	got := notifier.Calls[0]
	if got.ApplicantUserID != applicantID {
		t.Fatalf("expected applicant id %q, got %q", applicantID, got.ApplicantUserID)
	}
	if got.NewState != domain.StatePaid {
		t.Fatalf("expected new state %q, got %q", domain.StatePaid, got.NewState)
	}
	if got.TournamentID != tournamentID || got.NominationID != nominationID {
		t.Fatalf("unexpected tournament/nomination in notice: %+v", got)
	}
	_ = app
}

// TestRegister_NotifiesApplicant — FR-23: регистрация бойца секретарём/admin
// не является собственным действием заявителя, письмо уходит.
func TestRegister_NotifiesApplicant(t *testing.T) {
	notifier := &testutil.FakeNotifier{}
	svc, _, _, _ := newTestServiceWithNotifier(notifier)
	ctx := context.Background()

	// submitPaidApplication доходит до ConfirmPayment (тоже уведомляемый
	// переход) — это уже 1 звонок до Register.
	app := submitPaidApplication(t, svc, ctx)
	if len(notifier.Calls) != 1 {
		t.Fatalf("expected exactly 1 notification from ConfirmPayment, got %d", len(notifier.Calls))
	}

	_, _, err := svc.Register(ctx, adminID, app.ID)
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	if len(notifier.Calls) != 2 {
		t.Fatalf("expected exactly 2 notifications (ConfirmPayment + Register), got %d", len(notifier.Calls))
	}
	got := notifier.Calls[1]
	if got.ApplicantUserID != applicantID {
		t.Fatalf("expected applicant id %q, got %q", applicantID, got.ApplicantUserID)
	}
	if got.NewState != domain.StateRegistered {
		t.Fatalf("expected new state %q, got %q", domain.StateRegistered, got.NewState)
	}
}

// TestEditApplication_NotifiesApplicant — FR-23: правка заявки организатором
// не является собственным действием заявителя, письмо уходит.
func TestEditApplication_NotifiesApplicant(t *testing.T) {
	notifier := &testutil.FakeNotifier{}
	svc, _, _, _ := newTestServiceWithNotifier(notifier)
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID, "hema club", false)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}

	_, err = svc.EditApplication(ctx, adminID, app.ID, service.EditInput{
		Club:           "HEMA Club",
		NeedsEquipment: true,
	})
	if err != nil {
		t.Fatalf("EditApplication: %v", err)
	}

	if len(notifier.Calls) != 1 {
		t.Fatalf("expected exactly 1 notification, got %d", len(notifier.Calls))
	}
	got := notifier.Calls[0]
	if got.ApplicantUserID != applicantID {
		t.Fatalf("expected applicant id %q, got %q", applicantID, got.ApplicantUserID)
	}
	if got.NewState != domain.StateSubmitted {
		t.Fatalf("expected unchanged state %q, got %q", domain.StateSubmitted, got.NewState)
	}
}

// TestDeclarePayment_DoesNotNotify — FR-23: объявление оплаты — собственное
// действие заявителя, письмо не уходит.
func TestDeclarePayment_DoesNotNotify(t *testing.T) {
	notifier := &testutil.FakeNotifier{}
	svc, _, _, _ := newTestServiceWithNotifier(notifier)
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID, "", false)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if _, err := svc.DeclarePayment(ctx, applicantID, app.ID); err != nil {
		t.Fatalf("DeclarePayment: %v", err)
	}

	if len(notifier.Calls) != 0 {
		t.Fatalf("expected no notification on own action, got %d calls", len(notifier.Calls))
	}
}

// TestWithdraw_DoesNotNotify — FR-23: отзыв заявки — собственное действие
// заявителя, письмо не уходит.
func TestWithdraw_DoesNotNotify(t *testing.T) {
	notifier := &testutil.FakeNotifier{}
	svc, _, _, _ := newTestServiceWithNotifier(notifier)
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID, "", false)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if _, err := svc.Withdraw(ctx, applicantID, app.ID); err != nil {
		t.Fatalf("Withdraw: %v", err)
	}

	if len(notifier.Calls) != 0 {
		t.Fatalf("expected no notification on own action, got %d calls", len(notifier.Calls))
	}
}

// TestConfirmPayment_NilNotifier_NoPanic — nil-Notifier допустим (no-op):
// существующие тесты сервиса, не думающие про уведомления, продолжают
// работать без правки.
func TestConfirmPayment_NilNotifier_NoPanic(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID, "", false)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if _, err := svc.DeclarePayment(ctx, applicantID, app.ID); err != nil {
		t.Fatalf("DeclarePayment: %v", err)
	}
	if _, err := svc.ConfirmPayment(ctx, adminID, app.ID); err != nil {
		t.Fatalf("ConfirmPayment with nil notifier: %v", err)
	}
}

// panickingNotifier — локальный анонимный тип (не FakeNotifier), чей вызов
// паникует, — для проверки, что паника внутри реализации Notifier не рушит
// уже совершённую доменную операцию (FR-27/FR-28) и не мешает следующему
// вызову сервиса.
type panickingNotifier struct{}

func (panickingNotifier) ApplicationStateChanged(context.Context, domain.ApplicationNotice) {
	panic("boom: notifier exploded")
}

// TestConfirmPayment_PanickingNotifier_DoesNotAbortOperation — ключевой
// архитектурный тест: паника внутри Notifier.ApplicationStateChanged не
// пробрасывается наружу метода сервиса (уже применённое событие остаётся
// применённым, ответ — успешный), и следующий вызов сервиса после паники
// продолжает работать нормально.
func TestConfirmPayment_PanickingNotifier_DoesNotAbortOperation(t *testing.T) {
	svc, repo, _, _ := newTestServiceWithNotifier(panickingNotifier{})
	ctx := context.Background()

	app, err := svc.Submit(ctx, applicantID, nominationID, "", false)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if _, err := svc.DeclarePayment(ctx, applicantID, app.ID); err != nil {
		t.Fatalf("DeclarePayment: %v", err)
	}

	confirmed, err := svc.ConfirmPayment(ctx, adminID, app.ID)
	if err != nil {
		t.Fatalf("ConfirmPayment should not fail despite panicking notifier: %v", err)
	}
	if confirmed.State != domain.StatePaid {
		t.Fatalf("expected StatePaid despite notifier panic, got %s", confirmed.State)
	}

	// Событие действительно закоммичено в журнал, а не только в память ответа.
	events, err := repo.Load(ctx, app.ID)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	rebuilt, err := domain.Rebuild(app.ID, events)
	if err != nil {
		t.Fatalf("Rebuild: %v", err)
	}
	if rebuilt.State != domain.StatePaid {
		t.Fatalf("expected persisted state StatePaid, got %s", rebuilt.State)
	}

	// Следующий вызов сервиса после паникующего нотификатора работает как ни
	// в чём не бывало.
	next, err := svc.Submit(ctx, otherUserID, nominationID, "", false)
	if err != nil {
		t.Fatalf("Submit after panicking notifier call: %v", err)
	}
	if next.State != domain.StateSubmitted {
		t.Fatalf("expected StateSubmitted for the next call, got %s", next.State)
	}
}
