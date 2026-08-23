package mail

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net"
	"strings"
	"testing"
	"time"
)

// TestLoggerSend_WritesAddressSubjectBody проверяет, что лог-адаптер (дефолт
// без настроенного SMTP, NFR-3) печатает всё письмо в журнал уровнем Info.
func TestLoggerSend_WritesAddressSubjectBody(t *testing.T) {
	var buf bytes.Buffer
	log := slog.New(slog.NewTextHandler(&buf, nil))
	sender := NewLogger(log)

	err := sender.Send(context.Background(), Message{
		To:      "ivan@example.com",
		Subject: "Восстановление доступа",
		Text:    "Ссылка: https://example.com/reset-password?token=abc",
	})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "ivan@example.com") {
		t.Errorf("log output missing recipient: %q", out)
	}
	if !strings.Contains(out, "Восстановление доступа") {
		t.Errorf("log output missing subject: %q", out)
	}
	if !strings.Contains(out, "reset-password?token=abc") {
		t.Errorf("log output missing body: %q", out)
	}
	if !strings.Contains(out, "level=INFO") {
		t.Errorf("expected Info level, got: %q", out)
	}
}

// TestBuildMessage_HeadersAndUTF8Subject проверяет сборку RFC 5322 сообщения
// для SMTP-адаптера без сети: корректные заголовки и UTF-8 тема в кодировке
// MIME (encoded-word), тело — как есть.
func TestBuildMessage_HeadersAndUTF8Subject(t *testing.T) {
	raw := buildMessage("noreply@hema.test", Message{
		To:      "ivan@example.com",
		Subject: "Восстановление доступа — openHEMA",
		Text:    "Ссылка действует 30 минут.",
	})
	msg := string(raw)

	if !strings.Contains(msg, "From: noreply@hema.test\r\n") {
		t.Errorf("missing From header: %q", msg)
	}
	if !strings.Contains(msg, "To: ivan@example.com\r\n") {
		t.Errorf("missing To header: %q", msg)
	}
	if !strings.Contains(msg, "MIME-Version: 1.0\r\n") {
		t.Errorf("missing MIME-Version header: %q", msg)
	}
	if !strings.Contains(msg, "Content-Type: text/plain; charset=UTF-8\r\n") {
		t.Errorf("missing Content-Type header: %q", msg)
	}
	// Тема кириллицы должна прийти MIME-encoded (не голым UTF-8 в заголовке).
	if strings.Contains(msg, "Subject: Восстановление") {
		t.Errorf("subject should be MIME-encoded, got raw UTF-8: %q", msg)
	}
	if !strings.Contains(msg, "Subject: =?utf-8?") && !strings.Contains(msg, "Subject: =?UTF-8?") {
		t.Errorf("subject should be RFC 2047 encoded: %q", msg)
	}
	// Тело идёт как есть, после пустой строки-разделителя заголовков.
	if !strings.Contains(msg, "\r\n\r\nСсылка действует 30 минут.") {
		t.Errorf("body not found after header separator: %q", msg)
	}
}

// TestNewSMTP_NoAuthWhenUsernameEmpty проверяет, что без username SMTP-адаптер
// не требует аутентификации (легальная конфигурация — открытый relay/локальный
// dev-SMTP).
func TestNewSMTP_NoAuthWhenUsernameEmpty(t *testing.T) {
	s := NewSMTP("localhost", "1025", "", "", "noreply@hema.test")
	if s == nil {
		t.Fatal("NewSMTP returned nil")
	}
}

// TestSmtpSend_RejectsHeaderInjectionInTo проверяет защиту от SMTP header
// injection: CR/LF в получателе позволили бы вписать произвольные
// заголовки (Bcc и т.п.) в сырое сообщение (buildMessage пишет To
// напрямую в заголовок). Send должен отклонить такой адрес ДО попытки
// сетевого соединения — используем заведомо недостижимый адрес, чтобы
// убедиться, что ошибка приходит от валидации, а не от таймаута дозвона.
func TestSmtpSend_RejectsHeaderInjectionInTo(t *testing.T) {
	s := NewSMTP("127.0.0.1", "1", "", "", "noreply@hema.test")

	err := s.Send(context.Background(), Message{
		To:      "evil@x.com\r\nBcc: victim@evil.com",
		Subject: "x",
		Text:    "y",
	})
	if !errors.Is(err, ErrInvalidRecipient) {
		t.Fatalf("Send with CRLF in To: err = %v, want ErrInvalidRecipient", err)
	}
}

func TestSmtpSend_RejectsBareLFInTo(t *testing.T) {
	s := NewSMTP("127.0.0.1", "1", "", "", "noreply@hema.test")

	err := s.Send(context.Background(), Message{
		To:      "evil@x.com\nBcc: victim@evil.com",
		Subject: "x",
		Text:    "y",
	})
	if !errors.Is(err, ErrInvalidRecipient) {
		t.Fatalf("Send with bare LF in To: err = %v, want ErrInvalidRecipient", err)
	}
}

// TestSmtpSend_RespectsContextDeadline проверяет, что зависший relay не
// блокирует Send бесконечно: сервер принимает TCP-соединение и никогда не
// шлёт приветствие "220 ...", клиент должен вернуть ошибку по дедлайну
// context, а не висеть до ОС-таймаута (которого у голого net/smtp.SendMail
// нет вовсе — соединение живое, чтение блокируется навсегда).
func TestSmtpSend_RespectsContextDeadline(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	t.Cleanup(func() { _ = ln.Close() })

	connCh := make(chan net.Conn, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		connCh <- conn
		// Намеренно ничего не пишет и не закрывает — имитация зависшего
		// relay на этапе SMTP-приветствия.
	}()

	host, port, err := net.SplitHostPort(ln.Addr().String())
	if err != nil {
		t.Fatalf("split host/port: %v", err)
	}
	s := NewSMTP(host, port, "", "", "noreply@hema.test")

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	start := time.Now()
	sendErr := s.Send(ctx, Message{To: "ivan@example.com", Subject: "x", Text: "y"})
	elapsed := time.Since(start)

	select {
	case conn := <-connCh:
		_ = conn.Close()
	default:
	}

	if sendErr == nil {
		t.Fatal("Send against an unresponsive server: err = nil, want a timeout error")
	}
	if elapsed > 2*time.Second {
		t.Errorf("Send took %v, want bounded by the context deadline (~200ms), not hanging", elapsed)
	}
}
