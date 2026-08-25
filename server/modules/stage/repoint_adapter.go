package stage

import (
	"context"

	"github.com/hema/server/modules/stage/service"
)

// RepointAdapter — адаптер, переносящий членства пулов и запомненные посевы
// (withdrawn_seeds) бойца source на бойца target при слиянии дублей (спека
// 0040, сценарий 3, FR-10). Экспортируется для внедрения в модуль fighter
// composition root'ом (internal/platform, join-волна T30) — структурно
// совпадает с fighter/domain.StageRepointer:
//
//	type StageRepointer interface {
//	    RepointFighter(ctx context.Context, oldID, newID string) error
//	}
//
// но НЕ импортирует пакет fighter напрямую (ADR 0002).
//
// svc — тот же *service.Service, что уже собран для stage.Register (см.
// occupancy_adapter.go — те же соображения против отдельного экземпляра).
type RepointAdapter struct {
	svc *service.Service
}

// NewRepointAdapter создаёт адаптер поверх уже сконструированного сервиса
// модуля stage.
func NewRepointAdapter(svc *service.Service) *RepointAdapter {
	return &RepointAdapter{svc: svc}
}

// RepointFighter переносит членства пулов и запомненные посевы oldID
// (source) на newID (target). Коллизия по uq_members_stage_fighter/PK
// withdrawn_seeds не репойнтится молча (см. repo/queries/stage.sql) —
// снятие такой строки делегировано отдельному ручному действию admin, не
// merge.
func (a *RepointAdapter) RepointFighter(ctx context.Context, oldID, newID string) error {
	return a.svc.RepointFighter(ctx, oldID, newID)
}
