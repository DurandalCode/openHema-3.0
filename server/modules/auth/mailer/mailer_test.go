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
	m := New(sender, 30*time.Minute)

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
