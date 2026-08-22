package mail

import (
	"bytes"
	"context"
	"fmt"
	"mime"
	"net/smtp"
)

// smtpSender отправляет письма через net/smtp (stdlib, без новых зависимостей).
type smtpSender struct {
	addr string
	auth smtp.Auth
	from string
}

// NewSMTP создаёт Sender поверх SMTP. PLAIN-аутентификация подключается,
// только если username непуст (пустой username — легальная конфигурация,
// напр. локальный dev-relay без авторизации).
func NewSMTP(host, port, username, password, from string) Sender {
	addr := fmt.Sprintf("%s:%s", host, port)
	var auth smtp.Auth
	if username != "" {
		auth = smtp.PlainAuth("", username, password, host)
	}
	return &smtpSender{addr: addr, auth: auth, from: from}
}

func (s *smtpSender) Send(_ context.Context, m Message) error {
	return smtp.SendMail(s.addr, s.auth, s.from, []string{m.To}, buildMessage(s.from, m))
}

// buildMessage собирает RFC 5322 сообщение: заголовки + пустая строка +
// тело. Тема кодируется как RFC 2047 encoded-word (UTF-8), тело идёт как
// есть (Content-Type объявляет charset=UTF-8).
func buildMessage(from string, m Message) []byte {
	var b bytes.Buffer
	fmt.Fprintf(&b, "From: %s\r\n", from)
	fmt.Fprintf(&b, "To: %s\r\n", m.To)
	fmt.Fprintf(&b, "Subject: %s\r\n", mime.QEncoding.Encode("utf-8", m.Subject))
	fmt.Fprintf(&b, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(&b, "Content-Type: text/plain; charset=UTF-8\r\n")
	fmt.Fprintf(&b, "\r\n")
	b.WriteString(m.Text)
	return b.Bytes()
}
