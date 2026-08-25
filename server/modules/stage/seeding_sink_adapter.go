package stage

import (
	"context"

	"github.com/hema/server/modules/stage/service"
)

// SeedingSinkAdapter — адаптер, синхронно уведомляемый модулем fighter о
// выводе/возврате бойца на турнир (спека 0040, FR-4..FR-7, сценарий 2:
// восстановление посева при возврате выведенного бойца). Экспортируется для
// внедрения в модуль fighter composition root'ом (internal/platform,
// join-волна T30) — структурно совпадает с
// fighter/domain.SeedingWithdrawalSink:
//
//	type SeedingWithdrawalSink interface {
//	    OnFighterWithdrawn(ctx context.Context, fighterID string) error
//	    OnFighterReturned(ctx context.Context, fighterID string) error
//	}
//
// но НЕ импортирует пакет fighter напрямую (ADR 0002) — тот же приём, что
// application.RegistrationSink (0007): best-effort синхронный сайд-эффект
// без распределённой транзакции (см. plan.md, «Риски»).
//
// svc — тот же *service.Service, что уже собран для stage.Register (см.
// occupancy_adapter.go — те же соображения против отдельного экземпляра).
type SeedingSinkAdapter struct {
	svc *service.Service
}

// NewSeedingSinkAdapter создаёт адаптер поверх уже сконструированного
// сервиса модуля stage.
func NewSeedingSinkAdapter(svc *service.Service) *SeedingSinkAdapter {
	return &SeedingSinkAdapter{svc: svc}
}

// OnFighterWithdrawn запоминает пулы, из которых выведенный боец был
// распределён, пока их стадия ещё draft (FR-4).
func (a *SeedingSinkAdapter) OnFighterWithdrawn(ctx context.Context, fighterID string) error {
	return a.svc.OnFighterWithdrawn(ctx, fighterID)
}

// OnFighterReturned пытается восстановить все запомненные посевы бойца
// (FR-5/FR-6); при неудаче тихо освобождает память — боец остаётся
// «нераспределённым» (как и раньше, без силового восстановления).
func (a *SeedingSinkAdapter) OnFighterReturned(ctx context.Context, fighterID string) error {
	return a.svc.OnFighterReturned(ctx, fighterID)
}
