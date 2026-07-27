package testutil

import (
	"sync"

	"github.com/hema/server/modules/pool/domain"
)

// FakeLiveBus — in-memory реализация domain.LiveBus для тестов (спека 0014,
// ADR 0012). В отличие от большинства fake-портов этого пакета, это не
// просто спай: подписчики топика (nominationID) реально получают сигнал при
// Publish — api-слою нужно уметь эмулировать конкурентную мутацию поверх
// открытого стрима (см. handler_test.go, WatchNominationLive). Сервисному
// слою достаточно записи опубликованных топиков (см. Published/PublishedCount)
// без реального подписчика.
type FakeLiveBus struct {
	mu        sync.Mutex
	nextID    int
	subs      map[string]map[int]chan struct{}
	published []string
}

// NewFakeLiveBus создаёт пустую fake-шину.
func NewFakeLiveBus() *FakeLiveBus {
	return &FakeLiveBus{subs: make(map[string]map[int]chan struct{})}
}

var _ domain.LiveBus = (*FakeLiveBus)(nil)

// PublishNominationChanged записывает топик (для Published/PublishedCount) и
// сигнализирует всем текущим подписчикам этого топика — неблокирующе,
// коалесцируя (сигнал сам по себе, без payload, ADR 0012): если у
// подписчика уже есть непрочитанный сигнал в буфере, второй не копится.
func (b *FakeLiveBus) PublishNominationChanged(nominationID string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.published = append(b.published, nominationID)
	for _, ch := range b.subs[nominationID] {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

// SubscribeNomination подписывается на топик nominationID. Возвращённый
// cancel обязателен к вызову по завершении подписки — удаляет подписчика из
// шины (иначе — утечка, см. проверку в handler_test.go через SubscriberCount).
func (b *FakeLiveBus) SubscribeNomination(nominationID string) (<-chan struct{}, func()) {
	b.mu.Lock()
	defer b.mu.Unlock()

	ch := make(chan struct{}, 1)
	id := b.nextID
	b.nextID++
	if b.subs[nominationID] == nil {
		b.subs[nominationID] = make(map[int]chan struct{})
	}
	b.subs[nominationID][id] = ch

	cancel := func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		delete(b.subs[nominationID], id)
	}
	return ch, cancel
}

// Published возвращает все опубликованные топики в порядке публикации
// (копия — безопасно для наблюдения в тестах без гонки на слайсе).
func (b *FakeLiveBus) Published() []string {
	b.mu.Lock()
	defer b.mu.Unlock()

	out := make([]string, len(b.published))
	copy(out, b.published)
	return out
}

// PublishedCount — сколько раз PublishNominationChanged был вызван с данным
// nominationID (сервисные тесты: «после успешной мутации опубликовано ровно
// N раз для правильной номинации», «после неуспешной — 0 раз»).
func (b *FakeLiveBus) PublishedCount(nominationID string) int {
	b.mu.Lock()
	defer b.mu.Unlock()

	n := 0
	for _, id := range b.published {
		if id == nominationID {
			n++
		}
	}
	return n
}

// SubscriberCount — сколько активных подписчиков сейчас у топика
// (handler_test.go: после отмены контекста стрима подписчик должен
// отписаться — счётчик должен вернуться к 0, без утечки горутин).
func (b *FakeLiveBus) SubscriberCount(nominationID string) int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.subs[nominationID])
}
