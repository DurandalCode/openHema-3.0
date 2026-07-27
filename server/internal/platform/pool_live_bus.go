package platform

import (
	pooldomain "github.com/hema/server/modules/pool/domain"
	"github.com/hema/server/pkg/livebus"
)

// PoolLiveBus адаптирует общий (без бизнес-логики) примитив pkg/livebus к
// порту pool/domain.LiveBus (спека 0014, ADR 0012): topic = nominationID.
// Composition root — единственное место, где pool узнаёт о конкретной
// реализации шины (ADR 0002); сам модуль pool зависит только от
// pool/domain.LiveBus.
type PoolLiveBus struct {
	bus *livebus.Bus
}

// NewPoolLiveBus создаёт адаптер поверх общей шины процесса.
func NewPoolLiveBus(bus *livebus.Bus) *PoolLiveBus {
	return &PoolLiveBus{bus: bus}
}

var _ pooldomain.LiveBus = (*PoolLiveBus)(nil)

// PublishNominationChanged сигнализирует «публичный снапшот номинации
// nominationID мог измениться» (без payload, ADR 0012).
func (p *PoolLiveBus) PublishNominationChanged(nominationID string) {
	p.bus.Publish(nominationID)
}

// SubscribeNomination подписывается на сигналы изменения номинации
// nominationID; вызывающий обязан вызвать возвращённую cancel-функцию по
// завершении подписки.
func (p *PoolLiveBus) SubscribeNomination(nominationID string) (<-chan struct{}, func()) {
	return p.bus.Subscribe(nominationID)
}
