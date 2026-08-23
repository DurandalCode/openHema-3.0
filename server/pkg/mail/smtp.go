package mail

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// ErrInvalidRecipient — получатель содержит CR/LF. buildMessage пишет To
// напрямую в сырой заголовок RFC 5322 (net/smtp не экранирует его), поэтому
// непроверенный адрес — вектор SMTP header injection (лишние заголовки,
// напр. Bcc, вписанные в письмо через email пользователя).
var ErrInvalidRecipient = errors.New("mail: invalid recipient address")

// sendTimeout — бюджет на TCP-соединение и весь SMTP-диалог (HELO/AUTH/
// MAIL FROM/RCPT TO/DATA). net/smtp не принимает context и не выставляет
// дедлайн на соединение сам — без него зависший/недостижимый relay
// блокирует Send (и вызывающую его публичную RPC RequestPasswordReset)
// на неопределённое время: живое TCP-соединение без дедлайна читается
// бесконечно, а не до ОС-таймаута дозвона (тот срабатывает только если
// relay вовсе не отвечает на SYN, а не если он принял соединение и молчит).
const sendTimeout = 15 * time.Second

// smtpSender отправляет письма через net/smtp (stdlib, без новых зависимостей).
type smtpSender struct {
	addr string
	host string
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
	return &smtpSender{addr: addr, host: host, auth: auth, from: from}
}

// Send устанавливает соединение через net.Dialer.DialContext (отменяемое
// вызывающим context) и сразу выставляет net.Conn.SetDeadline — единственный
// способ ограничить по времени сам SMTP-диалог, т.к. net/smtp.Client не
// принимает context. Дедлайн — минимум из sendTimeout и дедлайна context,
// если он задан и раньше.
func (s *smtpSender) Send(ctx context.Context, m Message) error {
	if strings.ContainsAny(m.To, "\r\n") {
		return ErrInvalidRecipient
	}

	deadline := time.Now().Add(sendTimeout)
	if ctxDeadline, ok := ctx.Deadline(); ok && ctxDeadline.Before(deadline) {
		deadline = ctxDeadline
	}

	dialer := &net.Dialer{Deadline: deadline}
	conn, err := dialer.DialContext(ctx, "tcp", s.addr)
	if err != nil {
		return fmt.Errorf("mail: dial smtp: %w", err)
	}
	if err := conn.SetDeadline(deadline); err != nil {
		_ = conn.Close()
		return fmt.Errorf("mail: set deadline: %w", err)
	}

	client, err := smtp.NewClient(conn, s.host)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("mail: new client: %w", err)
	}
	defer client.Close()

	if s.auth != nil {
		if ok, _ := client.Extension("AUTH"); ok {
			if err := client.Auth(s.auth); err != nil {
				return fmt.Errorf("mail: auth: %w", err)
			}
		}
	}
	if err := client.Mail(s.from); err != nil {
		return fmt.Errorf("mail: MAIL FROM: %w", err)
	}
	if err := client.Rcpt(m.To); err != nil {
		return fmt.Errorf("mail: RCPT TO: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("mail: DATA: %w", err)
	}
	if _, err := w.Write(buildMessage(s.from, m)); err != nil {
		_ = w.Close()
		return fmt.Errorf("mail: write body: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("mail: close body: %w", err)
	}
	return client.Quit()
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
