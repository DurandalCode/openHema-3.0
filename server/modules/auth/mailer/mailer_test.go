package mailer

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/hema/server/pkg/mail"
)

// fakeSender записывает последнее отправленное сообщение.
type fakeSender struct {
	last *mail.Message
}

func (f *fakeSender) Send(_ context.Context, m mail.Message) error {
	f.last = &m
	return nil
}

// TestSendPasswordReset_RussianSubjectAndLink — NFR-4: письмо на русском,
// с одной ссылкой и явным сроком действия.
func TestSendPasswordReset_RussianSubjectAndLink(t *testing.T) {
	sender := &fakeSender{}
	m := New(sender, 30*time.Minute, 30*time.Minute)

	err := m.SendPasswordReset(context.Background(), "ivan@example.com", "https://app.hema.test/reset-password?token=abc")
	if err != nil {
		t.Fatalf("SendPasswordReset: %v", err)
	}
	if sender.last == nil {
		t.Fatal("expected a message to be sent")
	}
	if sender.last.To != "ivan@example.com" {
		t.Errorf("To = %q", sender.last.To)
	}
	if sender.last.Subject != "Восстановление доступа — openHEMA" {
		t.Errorf("Subject = %q", sender.last.Subject)
	}
	if !strings.Contains(sender.last.Text, "https://app.hema.test/reset-password?token=abc") {
		t.Errorf("Text should contain the link: %q", sender.last.Text)
	}
	if !strings.Contains(sender.last.Text, "30 минут") {
		t.Errorf("Text should state the TTL: %q", sender.last.Text)
	}
}

// TestSendEmailVerification_RussianSubjectAndLink — FR-3: письмо на
// русском, с одной ссылкой и явным сроком действия.
func TestSendEmailVerification_RussianSubjectAndLink(t *testing.T) {
	sender := &fakeSender{}
	m := New(sender, 30*time.Minute, 15*time.Minute)

	err := m.SendEmailVerification(context.Background(), "ivan@example.com", "https://app.hema.test/verify-email?token=abc")
	if err != nil {
		t.Fatalf("SendEmailVerification: %v", err)
	}
	if sender.last == nil {
		t.Fatal("expected a message to be sent")
	}
	if sender.last.To != "ivan@example.com" {
		t.Errorf("To = %q", sender.last.To)
	}
	if sender.last.Subject != "Подтверждение адреса — openHEMA" {
		t.Errorf("Subject = %q", sender.last.Subject)
	}
	if !strings.Contains(sender.last.Text, "https://app.hema.test/verify-email?token=abc") {
		t.Errorf("Text should contain the link: %q", sender.last.Text)
	}
	if !strings.Contains(sender.last.Text, "15 минут") {
		t.Errorf("Text should state the TTL: %q", sender.last.Text)
	}
}

// TestSendEmailChangeConfirmation_RussianSubjectAndLink — FR-6: письмо
// со ссылкой подтверждения уходит на новый адрес.
func TestSendEmailChangeConfirmation_RussianSubjectAndLink(t *testing.T) {
	sender := &fakeSender{}
	m := New(sender, 30*time.Minute, 15*time.Minute)

	err := m.SendEmailChangeConfirmation(context.Background(), "new@example.com", "https://app.hema.test/email-change/confirm?token=abc")
	if err != nil {
		t.Fatalf("SendEmailChangeConfirmation: %v", err)
	}
	if sender.last == nil {
		t.Fatal("expected a message to be sent")
	}
	if sender.last.To != "new@example.com" {
		t.Errorf("To = %q, want new address", sender.last.To)
	}
	if sender.last.Subject != "Подтверждение смены адреса — openHEMA" {
		t.Errorf("Subject = %q", sender.last.Subject)
	}
	if !strings.Contains(sender.last.Text, "https://app.hema.test/email-change/confirm?token=abc") {
		t.Errorf("Text should contain the link: %q", sender.last.Text)
	}
	if !strings.Contains(sender.last.Text, "15 минут") {
		t.Errorf("Text should state the TTL: %q", sender.last.Text)
	}
}

// TestSendEmailChangeNotice_NoLinkGoesToOldAddress — FR-7: письмо-
// предупреждение уходит на прежний адрес и не содержит ссылки подтверждения.
func TestSendEmailChangeNotice_NoLinkGoesToOldAddress(t *testing.T) {
	sender := &fakeSender{}
	m := New(sender, 30*time.Minute, 15*time.Minute)

	err := m.SendEmailChangeNotice(context.Background(), "old@example.com", "new@example.com")
	if err != nil {
		t.Fatalf("SendEmailChangeNotice: %v", err)
	}
	if sender.last == nil {
		t.Fatal("expected a message to be sent")
	}
	if sender.last.To != "old@example.com" {
		t.Errorf("To = %q, want old address", sender.last.To)
	}
	if !strings.Contains(sender.last.Text, "new@example.com") {
		t.Errorf("Text should mention the new address: %q", sender.last.Text)
	}
	if strings.Contains(sender.last.Text, "http") {
		t.Errorf("notice mail should not contain a confirmation link: %q", sender.last.Text)
	}
}

func TestFormatMinutes_RussianPlural(t *testing.T) {
	cases := []struct {
		minutes int
		want    string
	}{
		{1, "1 минуту"},
		{2, "2 минуты"},
		{4, "4 минуты"},
		{5, "5 минут"},
		{11, "11 минут"},
		{21, "21 минуту"},
		{30, "30 минут"},
	}
	for _, tc := range cases {
		got := formatMinutes(time.Duration(tc.minutes) * time.Minute)
		if got != tc.want {
			t.Errorf("formatMinutes(%d) = %q, want %q", tc.minutes, got, tc.want)
		}
	}
}
