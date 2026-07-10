package auth

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/modules/auth/repo"
	"github.com/hema/server/modules/auth/service"
	"github.com/hema/server/pkg/jwt"
)

// DisplayNameProvider — адаптер, резолвящий отображаемые имена пользователей
// поверх сервиса модуля auth. Экспортируется для внедрения в другие модули
// (напр. application), которым нужны имена пользователей без прямого доступа
// к PG-схеме auth (ADR 0002: чужие данные — только через API модуля).
type DisplayNameProvider struct {
	svc *service.Service
}

// NewDisplayNameProvider создаёт провайдер поверх пула соединений.
func NewDisplayNameProvider(pool *pgxpool.Pool, tokens *jwt.Manager) *DisplayNameProvider {
	r := repo.New(pool)
	return &DisplayNameProvider{svc: service.New(r, tokens)}
}

// DisplayNames возвращает батч отображаемых имён по набору id.
func (p *DisplayNameProvider) DisplayNames(ctx context.Context, ids []string) (map[string]string, error) {
	return p.svc.DisplayNames(ctx, ids)
}
