package mail

import (
	"context"
	"log/slog"
)

// loggerSender пишет письмо в журнал вместо реальной отправки. Дефолт, когда
// SMTP не настроен (NFR-3): разработка и тесты сценария сброса пароля не
// зависят от внешнего почтового сервиса.
type loggerSender struct {
	log *slog.Logger
}

// NewLogger создаёт Sender, записывающий письма в журнал уровнем Info.
func NewLogger(log *slog.Logger) Sender {
	return &loggerSender{log: log}
}

func (s *loggerSender) Send(_ context.Context, m Message) error {
	s.log.Info("mail: sending", "to", m.To, "subject", m.Subject, "text", m.Text)
	return nil
}
