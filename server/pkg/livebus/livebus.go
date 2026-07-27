// Package livebus реализует внутрипроцессный примитив оповещения
// «что-то изменилось, перечитай» по строковому топику. Это не событийная
// шина: нет типов событий, payload, порядка доставки или гарантий
// at-least-once — только сигнал-пустышка, коалесируемый на пути к
// подписчику. См. docs/adr/0012-in-process-live-broadcaster.md.
package livebus

import "sync"

// Bus — потокобезопасный in-process pub/sub по строковому топику.
// Нулевое значение непригодно к использованию — создавайте через New.
type Bus struct {
	mu     sync.Mutex
	topics map[string]map[chan struct{}]struct{}
}

// New создаёт готовую к использованию шину.
func New() *Bus {
	return &Bus{
		topics: make(map[string]map[chan struct{}]struct{}),
	}
}

// Subscribe подписывает на топик и возвращает канал сигналов и cancel-
// функцию для отписки. Канал буферизован на 1: всплеск публикаций
// схлопывается в один висящий сигнал (коалесинг), подписчику важно только
// «что-то изменилось», а не сколько раз. cancel идемпотентен, безопасен для
// повторного вызова и снимает опустевший топик из внутренней карты.
func (b *Bus) Subscribe(topic string) (<-chan struct{}, func()) {
	ch := make(chan struct{}, 1)

	b.mu.Lock()
	subs, ok := b.topics[topic]
	if !ok {
		subs = make(map[chan struct{}]struct{})
		b.topics[topic] = subs
	}
	subs[ch] = struct{}{}
	b.mu.Unlock()

	var once sync.Once
	cancel := func() {
		once.Do(func() {
			b.mu.Lock()
			defer b.mu.Unlock()
			if subs, ok := b.topics[topic]; ok {
				delete(subs, ch)
				if len(subs) == 0 {
					delete(b.topics, topic)
				}
			}
		})
	}

	return ch, cancel
}

// Publish сигнализирует всем текущим подписчикам топика. Неблокирующая:
// подписчик, чей канал уже заполнен (сигнал ещё не прочитан), пропускается —
// он и так получит следующий цикл чтения с актуальным состоянием. Публикация
// в топик без подписчиков — no-op.
func (b *Bus) Publish(topic string) {
	b.mu.Lock()
	subs := b.topics[topic]
	// Снимаем копию каналов под локом, но сам send делаем без лока, чтобы
	// не держать мьютекс на время потенциально дольгой отправки (хотя она
	// неблокирующая — это лишь на случай будущих изменений).
	chans := make([]chan struct{}, 0, len(subs))
	for ch := range subs {
		chans = append(chans, ch)
	}
	b.mu.Unlock()

	for _, ch := range chans {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

// subscriberCount возвращает число текущих подписчиков топика. Test-only
// интроспекция, чтобы проверить, что cancel действительно чистит опустевшие
// топики (не аккумулирует пустые записи).
func (b *Bus) subscriberCount(topic string) int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.topics[topic])
}
