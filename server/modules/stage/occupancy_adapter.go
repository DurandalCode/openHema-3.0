package stage

import (
	"context"

	"github.com/hema/server/modules/stage/service"
)

// PoolOccupancyAdapter — адаптер, отвечающий на вопрос «есть ли в номинации
// хотя бы один боец, распределённый в пул любой её стадии» поверх сервиса
// модуля stage (спека 0040, FR-1, сценарий 1: гейт на удаление номинации).
// Экспортируется для внедрения в модуль nomination composition root'ом
// (internal/platform, join-волна T30) — структурно совпадает с
// nomination/domain.PoolOccupancyChecker
// (HasDistributedFighters(ctx, nominationID) (bool, error)), но НЕ
// импортирует пакет nomination напрямую (ADR 0002: чужие данные — только
// через порт, направление зависимости — stage не знает о nomination).
//
// svc — тот же *service.Service, что уже собран для stage.Register (не
// отдельный экземпляр поверх пула, как ActiveTournamentIDProvider: методы
// ниже трогают только repo, конструировать параллельный service.Service со
// всеми его межмодульными зависимостями (fighters/bouts/arenas/
// nominations/liveBus/users) ради этого было бы избыточно) — join-волна
// передаёт его при вызове New.
type PoolOccupancyAdapter struct {
	svc *service.Service
}

// NewPoolOccupancyAdapter создаёт адаптер поверх уже сконструированного
// сервиса модуля stage.
func NewPoolOccupancyAdapter(svc *service.Service) *PoolOccupancyAdapter {
	return &PoolOccupancyAdapter{svc: svc}
}

// HasDistributedFighters — есть ли в номинации хотя бы один боец,
// распределённый в пул любой её стадии.
func (a *PoolOccupancyAdapter) HasDistributedFighters(ctx context.Context, nominationID string) (bool, error) {
	return a.svc.HasDistributedFighters(ctx, nominationID)
}
