package platform

import (
	stagedomain "github.com/hema/server/modules/stage/domain"
	"github.com/hema/server/pkg/livebus"
)

// StageLiveBus адаптирует общий (без бизнес-логики) примитив pkg/livebus к
// порту stage/domain.LiveBus (спека 0014, ADR 0012): topic = nominationID.
// Composition root — единственное место, где stage узнаёт о конкретной
// реализации шины (ADR 0002); сам модуль stage зависит только от
// stage/domain.LiveBus.
type StageLiveBus struct {
	bus *livebus.Bus
}

// NewStageLiveBus создаёт адаптер поверх общей шины процесса.
func NewStageLiveBus(bus *livebus.Bus) *StageLiveBus {
	return &StageLiveBus{bus: bus}
}

var _ stagedomain.LiveBus = (*StageLiveBus)(nil)

// PublishNominationChanged сигнализирует «публичный снапшот номинации
// nominationID мог измениться» (без payload, ADR 0012).
func (p *StageLiveBus) PublishNominationChanged(nominationID string) {
	p.bus.Publish(nominationID)
}

// SubscribeNomination подписывается на сигналы изменения номинации
// nominationID; вызывающий обязан вызвать возвращённую cancel-функцию по
// завершении подписки.
func (p *StageLiveBus) SubscribeNomination(nominationID string) (<-chan struct{}, func()) {
	return p.bus.Subscribe(nominationID)
}
