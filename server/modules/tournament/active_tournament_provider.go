package tournament

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/modules/tournament/repo"
	"github.com/hema/server/modules/tournament/service"
)

// ActiveTournamentIDProvider — адаптер, резолвящий id активного турнира
// поверх сервиса модуля tournament. Экспортируется для внедрения в другие
// модули (напр. nomination), которым нужен id активного турнира без прямого
// доступа к PG-схеме tournament (ADR 0002: чужие данные — только через API
// модуля).
type ActiveTournamentIDProvider struct {
	svc *service.Service
}

// NewActiveTournamentIDProvider создаёт провайдер поверх пула соединений.
func NewActiveTournamentIDProvider(pool *pgxpool.Pool) *ActiveTournamentIDProvider {
	r := repo.New(pool)
	return &ActiveTournamentIDProvider{svc: service.New(r)}
}

// ActiveTournamentID возвращает идентификатор активного турнира.
func (p *ActiveTournamentIDProvider) ActiveTournamentID(ctx context.Context) (string, error) {
	t, err := p.svc.GetActive(ctx)
	if err != nil {
		return "", err
	}
	return t.ID, nil
}
