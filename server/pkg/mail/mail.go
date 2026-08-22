// Package mail описывает порт отправки почты и его адаптеры (SMTP, лог).
// Домен модулей (напр. auth) знает только «отправить письмо»; конкретный
// канал настраивается развёртыванием (спека 0037, решение 3).
package mail

import "context"

// Message — письмо с одним получателем: тема и текст (только plain text).
type Message struct {
	To      string
	Subject string
	Text    string
}

// Sender — порт отправки почты. Реализации — NewSMTP (реальная доставка) и
// NewLogger (запись в журнал, дефолт без настроенного SMTP, NFR-3).
type Sender interface {
	Send(ctx context.Context, m Message) error
}
