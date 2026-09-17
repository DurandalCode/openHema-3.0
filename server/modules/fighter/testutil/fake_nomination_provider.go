package testutil

import (
	"context"
	"sync"

	"github.com/hema/server/modules/fighter/domain"
)

// FakeNominationProvider — in-memory domain.NominationProvider для тестов.
type FakeNominationProvider struct {
	mu          sync.Mutex
	nominations map[string]domain.NominationInfo
	// titles — названия номинаций для NominationsByTournament (спека 0049).
	titles map[string]string
	// order — порядок регистрации: список номинаций турнира должен быть
	// детерминированным, а не порядком итерации по map.
	order []string
	// listErr — ошибка NominationsByTournament (эмуляция недоступности
	// модуля nomination).
	listErr error
}

// NewFakeNominationProvider создаёт пустой fake-провайдер.
func NewFakeNominationProvider() *FakeNominationProvider {
	return &FakeNominationProvider{
		nominations: make(map[string]domain.NominationInfo),
		titles:      make(map[string]string),
	}
}

var _ domain.NominationProvider = (*FakeNominationProvider)(nil)

// Set регистрирует номинацию для последующего резолва (test helper).
func (p *FakeNominationProvider) Set(nominationID string, info domain.NominationInfo) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if _, ok := p.nominations[nominationID]; !ok {
		p.order = append(p.order, nominationID)
	}
	p.nominations[nominationID] = info
}

// SetTitled регистрирует номинацию вместе с названием — для импорта ростера,
// который резолвит названия из файла (test helper).
func (p *FakeNominationProvider) SetTitled(nominationID, tournamentID, title string) {
	p.Set(nominationID, domain.NominationInfo{TournamentID: tournamentID})
	p.mu.Lock()
	defer p.mu.Unlock()
	p.titles[nominationID] = title
}

// SetListError заставляет NominationsByTournament возвращать ошибку
// (test helper).
func (p *FakeNominationProvider) SetListError(err error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.listErr = err
}

// Nomination возвращает сведения о номинации либо ErrNominationNotFound.
func (p *FakeNominationProvider) Nomination(_ context.Context, nominationID string) (domain.NominationInfo, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	info, ok := p.nominations[nominationID]
	if !ok {
		return domain.NominationInfo{}, domain.ErrNominationNotFound
	}
	return info, nil
}

// NominationsByTournament возвращает номинации турнира в порядке регистрации.
func (p *FakeNominationProvider) NominationsByTournament(
	_ context.Context,
	tournamentID string,
) ([]domain.NominationRef, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.listErr != nil {
		return nil, p.listErr
	}

	var refs []domain.NominationRef
	for _, id := range p.order {
		if p.nominations[id].TournamentID != tournamentID {
			continue
		}
		refs = append(refs, domain.NominationRef{ID: id, Title: p.titles[id]})
	}
	return refs, nil
}
