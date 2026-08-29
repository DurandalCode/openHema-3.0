package notify

import (
	"strings"
	"testing"
)

// TestApplicationStateChanged_ContainsAllParameters — FR-26: письмо
// называет турнир, номинацию и суть события и ведёт ссылкой.
func TestApplicationStateChanged_ContainsAllParameters(t *testing.T) {
	msg := ApplicationStateChanged(
		"Турнир Клинок Севера",
		"Лонгсворд, мужчины",
		"оплата подтверждена",
		"https://app.hema.test/my-applications",
	)

	assertContainsAll(t, msg.Subject+"\n"+msg.Text, []string{
		"Турнир Клинок Севера",
		"Лонгсворд, мужчины",
		"оплата подтверждена",
		"https://app.hema.test/my-applications",
	})
}

// TestPoolSeated_ContainsAllParameters — FR-26/FR-24: письмо бойцу о
// постановке пула называет турнир, номинацию, пул, площадку и ведёт
// ссылкой на страницу номинации.
func TestPoolSeated_ContainsAllParameters(t *testing.T) {
	msg := PoolSeated(
		"Турнир Клинок Севера",
		"Лонгсворд, мужчины",
		"Пул 3",
		"Площадка B",
		"https://app.hema.test/nominations/42",
	)

	assertContainsAll(t, msg.Subject+"\n"+msg.Text, []string{
		"Турнир Клинок Севера",
		"Лонгсворд, мужчины",
		"Пул 3",
		"Площадка B",
		"https://app.hema.test/nominations/42",
	})
}

// TestTemplates_LeaveToEmpty — шаблоны не проставляют получателя: одно и то
// же письмо рассылается разным адресатам (напр. постановка пула —
// нескольким бойцам, AC-12), получатель — забота вызывающего кода.
func TestTemplates_LeaveToEmpty(t *testing.T) {
	msg := ApplicationStateChanged("t", "n", "s", "l")
	if msg.To != "" {
		t.Errorf("ApplicationStateChanged: To = %q, want empty", msg.To)
	}

	msg = PoolSeated("t", "n", "p", "a", "l")
	if msg.To != "" {
		t.Errorf("PoolSeated: To = %q, want empty", msg.To)
	}
}

func assertContainsAll(t *testing.T, haystack string, needles []string) {
	t.Helper()
	for _, n := range needles {
		if !strings.Contains(haystack, n) {
			t.Errorf("expected message to contain %q, got:\n%s", n, haystack)
		}
	}
}
