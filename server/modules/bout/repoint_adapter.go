package bout

import (
	"context"

	"github.com/hema/server/modules/bout/service"
)

// RepointAdapter реализует fighter/domain.BoutRepointer поверх
// modules/bout/service.Service — сторона слияния дублей бойца (спека
// 0040, сценарий 3): после MergeFighters переносит оба борта
// (fighter_a_id/fighter_b_id) всех боёв дубля-источника на итоговую
// запись. Тонкий делегат, без собственной логики и собственных тестов
// сверх service.TestRepointFighter_* (адаптер = прямой делегат, тот же
// приём, что и у остальных cross-module портов этой спеки, см. plan.md
// «modules/stage → адаптеры»).
//
// Best-effort шаг без распределённой транзакции (нет 2PC, событийная шина
// не введена, ADR 0002/шаблон «События») — идемпотентен, повторный вызов
// после частичного сбоя безопасен (plan.md, «Риски»).
//
// Composition root (internal/platform) конструирует этот адаптер и
// передаёт его в fighter.Deps.Bout (join-волна, после регистрации bout,
// но до регистрации fighter).
type RepointAdapter struct {
	svc *service.Service
}

// NewRepointAdapter создаёт адаптер поверх готового сервиса bout.
func NewRepointAdapter(svc *service.Service) *RepointAdapter {
	return &RepointAdapter{svc: svc}
}

// RepointFighter переносит оба борта всех боёв дубля-источника (oldID) на
// итоговую запись (newID). Сигнатура совпадает с
// fighter/domain.BoutRepointer (структурная совместимость Go-интерфейсов
// проверяется join-волной после мержа всех треков — этот пакет не
// импортирует modules/fighter, чтобы не зависеть от его нестабильного во
// время параллельной разработки API, см. docs/specs/0040-domain-gaps/
// plan.md, «modules/bout»).
func (a *RepointAdapter) RepointFighter(ctx context.Context, oldID, newID string) error {
	return a.svc.RepointFighter(ctx, oldID, newID)
}
