// Package mailer адаптирует domain.Mailer поверх pkg/mail.Sender: собирает
// текст писем модуля auth. Домен знает только «отправить ссылку»/«отправить
// уведомление» (domain.Mailer); этот пакет знает, как выглядит письмо
// (спека 0037, решение 3 — почта через порт с подменяемой реализацией).
package mailer

import (
	"context"
	"fmt"
	"time"

	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/pkg/mail"
)

const (
	// resetSubject — тема письма восстановления. Не параметризуется: одна
	// форма письма на весь продукт (NFR-7 — одна цель на письмо).
	resetSubject = "Восстановление доступа — openHEMA"
	// verificationSubject — тема письма подтверждения адреса (спека 0042, FR-3).
	verificationSubject = "Подтверждение адреса — openHEMA"
	// changeConfirmationSubject — тема письма подтверждения смены адреса,
	// уходит на НОВЫЙ адрес (FR-6).
	changeConfirmationSubject = "Подтверждение смены адреса — openHEMA"
	// changeNoticeSubject — тема письма-предупреждения о смене адреса,
	// уходит на ПРЕЖНИЙ адрес, без ссылки (FR-7).
	changeNoticeSubject = "Запрошена смена адреса вашей учётки — openHEMA"
)

// Mailer — адаптер domain.Mailer поверх pkg/mail.Sender.
type Mailer struct {
	sender mail.Sender
	// resetTTL — срок жизни ссылки восстановления, указывается в тексте
	// письма (FR-3 спеки 0037, NFR-4).
	resetTTL time.Duration
	// emailTokenTTL — срок жизни ссылки подтверждения/смены адреса,
	// указывается в тексте соответствующих писем (спека 0042, FR-3/FR-6).
	emailTokenTTL time.Duration
}

// New создаёт адаптер над произвольным Sender (SMTP или лог-адаптер).
func New(sender mail.Sender, resetTTL, emailTokenTTL time.Duration) *Mailer {
	return &Mailer{sender: sender, resetTTL: resetTTL, emailTokenTTL: emailTokenTTL}
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
		link, formatMinutes(m.resetTTL),
	)
	return m.sender.Send(ctx, mail.Message{
		To:      to,
		Subject: resetSubject,
		Text:    text,
	})
}

// SendEmailVerification отправляет письмо подтверждения адреса (спека
// 0042, FR-3): одна ссылка, явный срок её действия, на русском.
func (m *Mailer) SendEmailVerification(ctx context.Context, to, link string) error {
	text := fmt.Sprintf(
		"Здравствуйте!\n\n"+
			"Чтобы подтвердить, что этот адрес принадлежит вам, перейдите по "+
			"ссылке:\n\n"+
			"%s\n\n"+
			"Ссылка действует %s с момента отправки этого письма. Если вы не "+
			"регистрировались в openHEMA, просто проигнорируйте это письмо.",
		link, formatMinutes(m.emailTokenTTL),
	)
	return m.sender.Send(ctx, mail.Message{
		To:      to,
		Subject: verificationSubject,
		Text:    text,
	})
}

// SendEmailChangeConfirmation отправляет письмо со ссылкой подтверждения
// смены адреса на НОВЫЙ адрес (спека 0042, FR-6).
func (m *Mailer) SendEmailChangeConfirmation(ctx context.Context, newAddr, link string) error {
	text := fmt.Sprintf(
		"Здравствуйте!\n\n"+
			"Для вашей учётки openHEMA запрошена смена адреса на этот. Чтобы "+
			"подтвердить смену, перейдите по ссылке:\n\n"+
			"%s\n\n"+
			"Ссылка действует %s с момента отправки этого письма. Если вы не "+
			"запрашивали смену адреса, просто проигнорируйте это письмо — адрес "+
			"учётки не изменится.",
		link, formatMinutes(m.emailTokenTTL),
	)
	return m.sender.Send(ctx, mail.Message{
		To:      newAddr,
		Subject: changeConfirmationSubject,
		Text:    text,
	})
}

// SendEmailChangeNotice отправляет письмо-предупреждение о запросе смены
// адреса на ПРЕЖНИЙ адрес — без ссылки подтверждения (спека 0042, FR-7):
// цель письма — дать владельцу узнать о попытке увести учётку, а не
// предложить действие.
func (m *Mailer) SendEmailChangeNotice(ctx context.Context, oldAddr, newAddr string) error {
	text := fmt.Sprintf(
		"Здравствуйте!\n\n"+
			"Для вашей учётки openHEMA (%s) запрошена смена адреса на %s. Если "+
			"это были вы — никаких действий не требуется, смена вступит в силу "+
			"после перехода по ссылке в письме на новый адрес.\n\n"+
			"Если это были не вы — как можно скорее смените пароль и завершите "+
			"все сессии в разделе безопасности личного кабинета.",
		oldAddr, newAddr,
	)
	return m.sender.Send(ctx, mail.Message{
		To:      oldAddr,
		Subject: changeNoticeSubject,
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
