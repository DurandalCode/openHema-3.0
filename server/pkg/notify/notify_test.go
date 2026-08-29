package notify

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/hema/server/pkg/mail"
)

// countingSender считает вызовы Send и умеет искусственно задерживать или
// стопорить каждый вызов — без этого тесты дренажа/неблокирующей очереди
// были бы тривиальны: воркер обработал бы сообщения быстрее, чем тест
// успел бы проверить промежуточное состояние очереди.
type countingSender struct {
	mu    sync.Mutex
	calls []mail.Message

	delay time.Duration
	// block, если не nil, — Send блокируется на получении из этого канала
	// перед возвратом. Используется, чтобы намеренно застопорить воркер и
	// проверить, что Enqueue при заполненном буфере всё равно не блокирует
	// вызывающего.
	block <-chan struct{}

	// failSubject — Send вернёт errSendFailed для писем с этой темой
	// (не останавливая воркер).
	failSubject string
}

func (s *countingSender) Send(_ context.Context, m mail.Message) error {
	if s.delay > 0 {
		time.Sleep(s.delay)
	}
	if s.block != nil {
		<-s.block
	}
	s.mu.Lock()
	s.calls = append(s.calls, m)
	s.mu.Unlock()
	if s.failSubject != "" && m.Subject == s.failSubject {
		return errSendFailed
	}
	return nil
}

func (s *countingSender) count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.calls)
}

var errSendFailed = errors.New("send failed")

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// TestClose_DrainsQueueBeforeReturning — Close дожидается обработки всех
// сообщений, которые были в очереди на момент вызова, прежде чем вернуться.
func TestClose_DrainsQueueBeforeReturning(t *testing.T) {
	sender := &countingSender{delay: 20 * time.Millisecond}
	d := New(sender, discardLogger(), 10)

	const n = 5
	for i := 0; i < n; i++ {
		d.Enqueue(mail.Message{To: "a@example.com", Subject: "msg"})
	}

	d.Close()

	if got := sender.count(); got != n {
		t.Fatalf("expected %d messages sent by the time Close returns, got %d", n, got)
	}
}

// TestEnqueue_DoesNotBlockWhenBufferFull — Enqueue никогда не блокирует
// вызывающего, даже когда буфер полон и воркер занят обработкой предыдущего
// сообщения (FR-28).
func TestEnqueue_DoesNotBlockWhenBufferFull(t *testing.T) {
	block := make(chan struct{})
	sender := &countingSender{block: block}
	d := New(sender, discardLogger(), 1)
	defer func() {
		close(block)
		d.Close()
	}()

	// Первое сообщение уходит воркеру и застревает в Send, ожидая block.
	d.Enqueue(mail.Message{To: "a@example.com", Subject: "1"})
	// Дать воркеру время забрать первое сообщение из канала — иначе оно
	// могло бы остаться в буфере, а не "в обработке у воркера".
	time.Sleep(50 * time.Millisecond)
	// Буфер ёмкостью 1 — заполняем его вторым сообщением.
	d.Enqueue(mail.Message{To: "a@example.com", Subject: "2"})

	done := make(chan struct{})
	go func() {
		// Буфер полон, воркер занят — это сообщение должно быть отброшено
		// немедленно, не блокируя вызывающего.
		d.Enqueue(mail.Message{To: "a@example.com", Subject: "3"})
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Enqueue blocked with a full buffer instead of dropping the message")
	}
}

// TestWorker_ContinuesAfterSendError — ошибка Sender.Send на одном письме не
// останавливает воркер: следующее сообщение всё равно доходит (FR-27).
func TestWorker_ContinuesAfterSendError(t *testing.T) {
	sender := &countingSender{failSubject: "bad"}
	d := New(sender, discardLogger(), 10)

	d.Enqueue(mail.Message{To: "a@example.com", Subject: "bad"})
	d.Enqueue(mail.Message{To: "a@example.com", Subject: "good"})

	d.Close()

	if got := sender.count(); got != 2 {
		t.Fatalf("expected both messages to reach the sender despite the first failing, got %d", got)
	}
}
