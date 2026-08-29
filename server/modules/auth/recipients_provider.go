package auth

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/modules/auth/repo"
	"github.com/hema/server/modules/auth/service"
	"github.com/hema/server/pkg/jwt"
)

// RecipientsProvider — адаптер, резолвящий получателей почтовых
// уведомлений (спека 0042, FR-21) поверх сервиса модуля auth. Экспортируется
// для внедрения в composition root (internal/platform), которому нужен
// список «кому включён этот вид уведомлений и подтверждён адрес» без
// прямого доступа к PG-схеме auth (ADR 0002). Тот же приём, что
// DisplayNameProvider.
type RecipientsProvider struct {
	svc *service.Service
}

// NewRecipientsProvider создаёт провайдер поверх пула соединений.
// Провайдер использует только Recipients, поэтому почтовые/reset-параметры
// сервиса ему не нужны (nil-мейлер, нулевой TTL — тот же приём, что
// NewDisplayNameProvider).
func NewRecipientsProvider(pool *pgxpool.Pool, tokens *jwt.Manager) *RecipientsProvider {
	r := repo.New(pool)
	return &RecipientsProvider{svc: service.New(r, tokens, nil, "", 0, 0, 0, time.Now)}
}

// Recipients возвращает map[userID]email для тех из userIDs, у кого вид
// kind ("application_state" | "pool_seated") включён лично и адрес
// подтверждён. Глобальный переключатель (модуль tournament) сюда не
// входит — его проверяет вызывающий адаптер до обращения за получателями.
func (p *RecipientsProvider) Recipients(ctx context.Context, kind string, userIDs []string) (map[string]string, error) {
	return p.svc.Recipients(ctx, kind, userIDs)
}
