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

// SentChangeNotice — письмо-предупреждение о смене адреса, запомненное
// FakeMailer (без ссылки — SendEmailChangeNotice её не несёт, FR-7).
type SentChangeNotice struct {
	OldAddr string
	NewAddr string
}

// FakeMailer — in-memory реализация domain.Mailer для тестов: запоминает
// последнее отправленное письмо каждого вида, не отправляет ничего реально.
type FakeMailer struct {
	mu                     sync.Mutex
	last                   *SentMail
	lastVerification       *SentMail
	lastChangeConfirmation *SentMail
	lastChangeNotice       *SentChangeNotice
	// Err, если задан, возвращается из всех Send*-методов (для проверки, что
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

// SendEmailVerification запоминает письмо подтверждения адреса.
func (m *FakeMailer) SendEmailVerification(_ context.Context, to, link string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Err != nil {
		return m.Err
	}
	m.lastVerification = &SentMail{To: to, Link: link}
	return nil
}

// LastVerification возвращает последнее письмо подтверждения адреса.
func (m *FakeMailer) LastVerification() *SentMail {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.lastVerification
}

// SendEmailChangeConfirmation запоминает письмо со ссылкой подтверждения
// смены адреса (отправляется на НОВЫЙ адрес).
func (m *FakeMailer) SendEmailChangeConfirmation(_ context.Context, newAddr, link string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Err != nil {
		return m.Err
	}
	m.lastChangeConfirmation = &SentMail{To: newAddr, Link: link}
	return nil
}

// LastChangeConfirmation возвращает последнее письмо подтверждения смены
// адреса (на новый адрес).
func (m *FakeMailer) LastChangeConfirmation() *SentMail {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.lastChangeConfirmation
}

// SendEmailChangeNotice запоминает письмо-предупреждение о смене адреса
// (отправляется на ПРЕЖНИЙ адрес, без ссылки).
func (m *FakeMailer) SendEmailChangeNotice(_ context.Context, oldAddr, newAddr string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Err != nil {
		return m.Err
	}
	m.lastChangeNotice = &SentChangeNotice{OldAddr: oldAddr, NewAddr: newAddr}
	return nil
}

// LastChangeNotice возвращает последнее письмо-предупреждение о смене адреса.
func (m *FakeMailer) LastChangeNotice() *SentChangeNotice {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.lastChangeNotice
}

// Reset сбрасывает все запомненные письма (для проверки «повторного письма
// не было»).
func (m *FakeMailer) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.last = nil
	m.lastVerification = nil
	m.lastChangeConfirmation = nil
	m.lastChangeNotice = nil
}
