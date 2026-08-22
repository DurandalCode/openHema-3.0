package testutil

import (
	"context"
	"sync"

	"github.com/hema/server/modules/auth/domain"
)

// SentMail — письмо восстановления, запомненное FakeMailer.
type SentMail struct {
	To   string
	Link string
}

// FakeMailer — in-memory реализация domain.Mailer для тестов: запоминает
// последнее отправленное письмо, не отправляет ничего реально.
type FakeMailer struct {
	mu   sync.Mutex
	last *SentMail
	// Err, если задан, возвращается из SendPasswordReset (для проверки, что
	// сбой отправки не превращается в ошибку RPC, NFR-2).
	Err error
}

// NewFakeMailer создаёт пустой fake-мейлер.
func NewFakeMailer() *FakeMailer {
	return &FakeMailer{}
}

var _ domain.Mailer = (*FakeMailer)(nil)

// SendPasswordReset запоминает письмо восстановления.
func (m *FakeMailer) SendPasswordReset(_ context.Context, to, link string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Err != nil {
		return m.Err
	}
	m.last = &SentMail{To: to, Link: link}
	return nil
}

// Last возвращает последнее отправленное письмо (nil, если ничего не отправлено).
func (m *FakeMailer) Last() *SentMail {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.last
}

// Reset сбрасывает запомненное письмо (для проверки «второго письма не было»).
func (m *FakeMailer) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.last = nil
}
