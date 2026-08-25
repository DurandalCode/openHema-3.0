package bout

import (
	"context"

	"github.com/hema/server/modules/bout/service"
)

// BoutOccupancyAdapter реализует nomination/domain.BoutOccupancyChecker
// поверх modules/bout/service.Service — гейт удаления номинации (спека
// 0040, сценарий 1, FR-1б): номинацию нельзя удалить, если у неё уже есть
// поставленный (в процессе или завершённый) бой. Тонкий делегат, без
// собственной логики и собственных тестов сверх service.TestHasBouts_*
// (адаптер = прямой делегат, тот же приём, что и у остальных
// cross-module портов этой спеки, см. plan.md «modules/stage → адаптеры»).
//
// Composition root (internal/platform) конструирует этот адаптер и
// передаёт его в nomination.Deps.Bouts (join-волна, после регистрации
// bout, но до регистрации nomination).
type BoutOccupancyAdapter struct {
	svc *service.Service
}

// NewBoutOccupancyAdapter создаёт адаптер поверх готового сервиса bout.
func NewBoutOccupancyAdapter(svc *service.Service) *BoutOccupancyAdapter {
	return &BoutOccupancyAdapter{svc: svc}
}

// HasBouts — есть ли среди боёв номинации хотя бы один поставленный.
// Сигнатура совпадает с nomination/domain.BoutOccupancyChecker
// (структурная совместимость Go-интерфейсов проверяется join-волной после
// мержа всех треков — этот пакет не импортирует modules/nomination, чтобы
// не зависеть от его нестабильного во время параллельной разработки API,
// см. docs/specs/0040-domain-gaps/plan.md, «modules/bout»).
func (a *BoutOccupancyAdapter) HasBouts(ctx context.Context, nominationID string) (bool, error) {
	return a.svc.HasBouts(ctx, nominationID)
}
