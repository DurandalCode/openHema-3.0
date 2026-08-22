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

// topicTournament — топик живой сводки турнира целиком (спека 0034): один
// на процесс, не пересекается с id номинаций (те — UUID, этот — фиксированное
// слово). MVP — активный турнир один (как GetActiveTournament/
// UpdateActiveTournament), поэтому топик не параметризован tournamentID.
const topicTournament = "tournament"

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

// PublishTournamentChanged сигнализирует «живая сводка турнира могла
// измениться» (спека 0034, без payload, ADR 0012).
func (p *StageLiveBus) PublishTournamentChanged() {
	p.bus.Publish(topicTournament)
}

// SubscribeTournament подписывается на сигналы изменения сводки турнира;
// вызывающий обязан вызвать возвращённую cancel-функцию по завершении
// подписки.
func (p *StageLiveBus) SubscribeTournament() (<-chan struct{}, func()) {
	return p.bus.Subscribe(topicTournament)
}
