// Package mailer адаптирует domain.Mailer поверх pkg/mail.Sender: собирает
// текст письма восстановления пароля. Домен знает только «отправить ссылку»
// (domain.Mailer); этот пакет знает, как выглядит письмо (спека 0037,
// решение 3 — почта через порт с подменяемой реализацией).
package mailer

import (
	"context"
	"fmt"
	"time"

	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/pkg/mail"
)

// subject — тема письма восстановления. Не параметризуется: одна форма
// письма на весь продукт.
const subject = "Восстановление доступа — openHEMA"

// Mailer — адаптер domain.Mailer поверх pkg/mail.Sender.
type Mailer struct {
	sender mail.Sender
	// ttl — срок жизни ссылки восстановления, указывается в тексте письма
	// (FR-3, NFR-4).
	ttl time.Duration
}

// New создаёт адаптер над произвольным Sender (SMTP или лог-адаптер).
func New(sender mail.Sender, ttl time.Duration) *Mailer {
	return &Mailer{sender: sender, ttl: ttl}
}

var _ domain.Mailer = (*Mailer)(nil)

// SendPasswordReset отправляет письмо восстановления: одна ссылка и явный
// срок её действия, на русском (NFR-4).
func (m *Mailer) SendPasswordReset(ctx context.Context, to, link string) error {
	text := fmt.Sprintf(
		"Здравствуйте!\n\n"+
			"Вы (или кто-то от вашего имени) запросили восстановление доступа к "+
			"аккаунту openHEMA. Чтобы задать новый пароль, перейдите по ссылке:\n\n"+
			"%s\n\n"+
			"Ссылка действует %s с момента отправки этого письма. Если вы не "+
			"запрашивали восстановление доступа, просто проигнорируйте это письмо — "+
			"пароль останется прежним.",
		link, formatMinutes(m.ttl),
	)
	return m.sender.Send(ctx, mail.Message{
		To:      to,
		Subject: subject,
		Text:    text,
	})
}

// formatMinutes форматирует длительность в минутах с русским склонением
// («1 минуту», «2 минуты», «5 минут», «30 минут» — правило единиц/десятков).
func formatMinutes(d time.Duration) string {
	n := int(d.Minutes())
	return fmt.Sprintf("%d %s", n, minuteWord(n))
}

func minuteWord(n int) string {
	abs := n
	if abs < 0 {
		abs = -abs
	}
	if abs%100 >= 11 && abs%100 <= 14 {
		return "минут"
	}
	switch abs % 10 {
	case 1:
		return "минуту"
	case 2, 3, 4:
		return "минуты"
	default:
		return "минут"
	}
}
