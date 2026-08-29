package testutil

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/hema/server/modules/stage/domain"
)

// FakeArenaProvider — in-memory реализация domain.ArenaProvider для тестов
// (спека 0011). ArenaByID возвращает domain.ErrArenaNotAvailable для id, не
// заданных через Set (площадка не найдена).
type FakeArenaProvider struct {
	mu       sync.Mutex
	arenas   map[string]domain.ArenaRef
	defaults map[string]int
	// active — площадки турнира для ActiveArenas (спека 0034, FR-14): ключ —
	// tournamentID. Отдельно от arenas (Set/ArenaByID/ArenasByIDs) — та карта
	// адресуется по arenaID, эта по tournamentID, площадка может быть в
	// нескольких турнирах в тестовых данных.
	active map[string][]domain.ArenaRef

	// MarkFreedCalls — зафиксированные вызовы MarkFreed (спека 0043: тест
	// проверяет, что UnseatPool зовёт его ровно один раз при успешном
	// снятии пула и не зовёт при отказе).
	MarkFreedCalls []string
}

// NewFakeArenaProvider создаёт пустой fake-провайдер площадок.
func NewFakeArenaProvider() *FakeArenaProvider {
	return &FakeArenaProvider{
		arenas:   make(map[string]domain.ArenaRef),
		defaults: make(map[string]int),
		active:   make(map[string][]domain.ArenaRef),
	}
}

var _ domain.ArenaProvider = (*FakeArenaProvider)(nil)

// Set задаёт (или переопределяет) площадку.
func (p *FakeArenaProvider) Set(ref domain.ArenaRef) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.arenas[ref.ID] = ref
}

// ArenaByID возвращает заданную площадку. Отсутствие — domain.ErrArenaNotAvailable
// (нарочно доменная, а не generic ошибка — service должен сам решать, как
// мапить любые ошибки провайдера в ErrArenaNotAvailable; здесь чтобы тесты
// могли использовать errors.Is напрямую при желании).
func (p *FakeArenaProvider) ArenaByID(_ context.Context, id string) (domain.ArenaRef, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	ref, ok := p.arenas[id]
	if !ok {
		return domain.ArenaRef{}, domain.ErrArenaNotAvailable
	}
	return ref, nil
}

// ArenasByIDs — батч-резолв: отсутствующие id просто не попадают в карту.
func (p *FakeArenaProvider) ArenasByIDs(_ context.Context, ids []string) (map[string]domain.ArenaRef, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	out := make(map[string]domain.ArenaRef, len(ids))
	for _, id := range ids {
		if ref, ok := p.arenas[id]; ok {
			out[id] = ref
		}
	}
	return out, nil
}

// SetDefaultDuration задаёт нестандартный дефолт длительности таймера табло
// для арены (спека 0015). Без явного вызова DefaultDurationSeconds
// возвращает 90 секунд — произвольная, но фиксированная константа для
// тестов, не заданных этим методом.
func (p *FakeArenaProvider) SetDefaultDuration(arenaID string, seconds int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.defaults[arenaID] = seconds
}

// DefaultDurationSeconds возвращает персистентный дефолт длительности
// таймера арены (спека 0015): заданный через SetDefaultDuration, либо 90
// секунд по умолчанию.
func (p *FakeArenaProvider) DefaultDurationSeconds(_ context.Context, arenaID string) (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if v, ok := p.defaults[arenaID]; ok {
		return v, nil
	}
	return 90, nil
}

// SeedActiveArenas задаёт (заменяя предыдущий набор) площадки турнира для
// ActiveArenas (спека 0034, FR-14). Тест сам решает порядок аргументов —
// ActiveArenas всё равно отсортирует по Position на чтении, как это делает
// реальный адаптер (спека 0027, admin-порядок).
func (p *FakeArenaProvider) SeedActiveArenas(tournamentID string, arenas ...domain.ArenaRef) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.active[tournamentID] = append([]domain.ArenaRef{}, arenas...)
}

// ActiveArenas возвращает площадки, засеянные SeedActiveArenas для
// tournamentID, отсортированные по Position — фейку не нужно валидировать
// tournamentID против «активного турнира» (это делает реальный адаптер в
// internal/platform, join-волна T13): пустой список для незасеянного id, без
// ошибки.
func (p *FakeArenaProvider) ActiveArenas(_ context.Context, tournamentID string) ([]domain.ArenaRef, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := append([]domain.ArenaRef{}, p.active[tournamentID]...)
	sort.Slice(out, func(i, j int) bool { return out[i].Position < out[j].Position })
	return out, nil
}

// MarkFreed фиксирует вызов (для MarkFreedCalls) и, если площадка задана
// через Set, проставляет LastFreedAt текущим моментом — тестовому коду
// не нужно эмулировать ошибку хранилища для этого метода, реальный адаптер
// (internal/platform, join-волна T13) сам мапит ошибки repo.
func (p *FakeArenaProvider) MarkFreed(_ context.Context, arenaID string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.MarkFreedCalls = append(p.MarkFreedCalls, arenaID)
	if ref, ok := p.arenas[arenaID]; ok {
		now := time.Now()
		ref.LastFreedAt = &now
		p.arenas[arenaID] = ref
	}
	return nil
}
