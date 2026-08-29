package service

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/auth/domain"
)

// TestUpdateNotificationSettings_UnverifiedEmail_RejectsTurningOn —
// FR-21: включение вида при неподтверждённом адресе отклоняется.
func TestUpdateNotificationSettings_UnverifiedEmail_RejectsTurningOn(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	user, _, err := svc.Register(ctx, "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	_, err = svc.UpdateNotificationSettings(ctx, user.ID, domain.NotificationSettings{
		ApplicationState: true,
	})
	if !errors.Is(err, domain.ErrEmailNotVerified) {
		t.Errorf("expected ErrEmailNotVerified, got %v", err)
	}
}

// TestUpdateNotificationSettings_UnverifiedEmail_TurningOffAlwaysAllowed —
// выключение видов разрешено даже при неподтверждённом адресе (нюанс из
// tasks.md T10: отклоняется только попытка включить что-то новое).
func TestUpdateNotificationSettings_UnverifiedEmail_TurningOffAlwaysAllowed(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	user, _, err := svc.Register(ctx, "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	// Оба и так выключены по умолчанию — запрос «выключить оба» (без
	// изменений) не должен считаться попыткой включения.
	updated, err := svc.UpdateNotificationSettings(ctx, user.ID, domain.NotificationSettings{
		ApplicationState: false,
		PoolSeated:       false,
	})
	if err != nil {
		t.Fatalf("UpdateNotificationSettings should allow turning off/no-op while unverified, got %v", err)
	}
	if updated.Notifications.ApplicationState || updated.Notifications.PoolSeated {
		t.Errorf("expected both off, got %+v", updated.Notifications)
	}
}

// TestUpdateNotificationSettings_VerifiedEmail_AllowsTurningOn — с
// подтверждённым адресом включение разрешено.
func TestUpdateNotificationSettings_VerifiedEmail_AllowsTurningOn(t *testing.T) {
	svc, _, mailer := testServiceWithMailer()
	ctx := context.Background()

	user, _, err := svc.Register(ctx, "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	raw := tokenFromLink(t, mailer.LastVerification().Link)
	if err := svc.VerifyEmail(ctx, raw); err != nil {
		t.Fatalf("VerifyEmail: %v", err)
	}

	updated, err := svc.UpdateNotificationSettings(ctx, user.ID, domain.NotificationSettings{
		ApplicationState: true,
		PoolSeated:       true,
	})
	if err != nil {
		t.Fatalf("UpdateNotificationSettings: %v", err)
	}
	if !updated.Notifications.ApplicationState || !updated.Notifications.PoolSeated {
		t.Errorf("expected both on, got %+v", updated.Notifications)
	}
}

// TestUpdateNotificationSettings_AlreadyOnEmail_UnverifiedStillAllowsSame
// — если вид уже был включён (напр. верифицированный адрес потом сменили,
// FR-6 сбрасывает подтверждённость), повторная отправка того же значения
// true не считается «включением нового» — turningOn сравнивает с текущим.
func TestUpdateNotificationSettings_AlreadyOnEmail_UnverifiedStillAllowsSame(t *testing.T) {
	svc, repo, mailer := testServiceWithMailer()
	ctx := context.Background()

	user, _, err := svc.Register(ctx, "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	raw := tokenFromLink(t, mailer.LastVerification().Link)
	if err := svc.VerifyEmail(ctx, raw); err != nil {
		t.Fatalf("VerifyEmail: %v", err)
	}
	if _, err := svc.UpdateNotificationSettings(ctx, user.ID, domain.NotificationSettings{ApplicationState: true}); err != nil {
		t.Fatalf("UpdateNotificationSettings: %v", err)
	}

	// Смена адреса сбрасывает EmailVerifiedAt (см. email_change_test.go).
	if _, err := svc.RequestEmailChange(ctx, user.ID, "new@example.com", "password1"); err != nil {
		t.Fatalf("RequestEmailChange: %v", err)
	}
	changeRaw := tokenFromLink(t, mailer.LastChangeConfirmation().Link)
	if _, err := svc.ConfirmEmailChange(ctx, changeRaw); err != nil {
		t.Fatalf("ConfirmEmailChange: %v", err)
	}

	got, err := repo.GetUserByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if got.EmailVerifiedAt != nil {
		t.Fatal("precondition: email should be unverified after change")
	}
	if !got.Notifications.ApplicationState {
		t.Fatal("precondition: ApplicationState should still be on from before")
	}

	// Повторная отправка того же true (не новое включение) должна пройти.
	if _, err := svc.UpdateNotificationSettings(ctx, user.ID, domain.NotificationSettings{ApplicationState: true}); err != nil {
		t.Errorf("resubmitting already-on setting should not require verification, got %v", err)
	}
}

// TestRecipients_OnlyPersonallyEnabledAndVerified — Recipients отдаёт
// только тех, у кого вид включён лично и адрес подтверждён.
func TestRecipients_OnlyPersonallyEnabledAndVerified(t *testing.T) {
	svc, _, mailer := testServiceWithMailer()
	ctx := context.Background()

	// verified + включено — должен попасть в результат.
	verifiedOn, _, err := svc.Register(ctx, "verified-on@example.com", "password1", "Verified On")
	if err != nil {
		t.Fatalf("Register verifiedOn: %v", err)
	}
	raw := tokenFromLink(t, mailer.LastVerification().Link)
	if err := svc.VerifyEmail(ctx, raw); err != nil {
		t.Fatalf("VerifyEmail verifiedOn: %v", err)
	}
	if _, err := svc.UpdateNotificationSettings(ctx, verifiedOn.ID, domain.NotificationSettings{ApplicationState: true}); err != nil {
		t.Fatalf("UpdateNotificationSettings verifiedOn: %v", err)
	}

	// verified, но выключено — не должен попасть.
	verifiedOff, _, err := svc.Register(ctx, "verified-off@example.com", "password1", "Verified Off")
	if err != nil {
		t.Fatalf("Register verifiedOff: %v", err)
	}
	raw2 := tokenFromLink(t, mailer.LastVerification().Link)
	if err := svc.VerifyEmail(ctx, raw2); err != nil {
		t.Fatalf("VerifyEmail verifiedOff: %v", err)
	}

	// не verified — не должен попасть, даже если бы был включён (włączить
	// нельзя — ErrEmailNotVerified — так что просто остаётся выключенным).
	unverified, _, err := svc.Register(ctx, "unverified@example.com", "password1", "Unverified")
	if err != nil {
		t.Fatalf("Register unverified: %v", err)
	}

	recipients, err := svc.Recipients(ctx, "application_state", []string{verifiedOn.ID, verifiedOff.ID, unverified.ID})
	if err != nil {
		t.Fatalf("Recipients: %v", err)
	}
	if len(recipients) != 1 {
		t.Fatalf("expected exactly 1 recipient, got %+v", recipients)
	}
	if recipients[verifiedOn.ID] != "verified-on@example.com" {
		t.Errorf("recipients[verifiedOn.ID] = %q, want %q", recipients[verifiedOn.ID], "verified-on@example.com")
	}
}

// TestRecipients_DifferentKindIsolated — виды не путаются: включённый
// application_state не делает пользователя получателем pool_seated.
func TestRecipients_DifferentKindIsolated(t *testing.T) {
	svc, _, mailer := testServiceWithMailer()
	ctx := context.Background()

	user, _, err := svc.Register(ctx, "ivan@example.com", "password1", "Ivan")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	raw := tokenFromLink(t, mailer.LastVerification().Link)
	if err := svc.VerifyEmail(ctx, raw); err != nil {
		t.Fatalf("VerifyEmail: %v", err)
	}
	if _, err := svc.UpdateNotificationSettings(ctx, user.ID, domain.NotificationSettings{ApplicationState: true}); err != nil {
		t.Fatalf("UpdateNotificationSettings: %v", err)
	}

	recipients, err := svc.Recipients(ctx, "pool_seated", []string{user.ID})
	if err != nil {
		t.Fatalf("Recipients: %v", err)
	}
	if len(recipients) != 0 {
		t.Errorf("expected no pool_seated recipients, got %+v", recipients)
	}
}

// TestRecipients_EmptyInput — пустой список id не обращается к репозиторию
// напрасно и возвращает пустую карту (тем же приёмом, что и DisplayNames).
func TestRecipients_EmptyInput(t *testing.T) {
	svc, _ := testService()

	recipients, err := svc.Recipients(context.Background(), "application_state", nil)
	if err != nil {
		t.Fatalf("Recipients: %v", err)
	}
	if len(recipients) != 0 {
		t.Fatalf("expected empty map, got %+v", recipients)
	}
}
