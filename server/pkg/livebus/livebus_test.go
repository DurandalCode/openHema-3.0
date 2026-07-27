package livebus

import (
	"sync"
	"testing"
	"time"
)

// waitSignal ждёт сигнал на ch до истечения таймаута; фейлит тест при таймауте.
func waitSignal(t *testing.T, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for signal")
	}
}

// assertNoSignal проверяет, что канал пуст (нет ожидающего сигнала).
func assertNoSignal(t *testing.T, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
		t.Fatal("unexpected signal received")
	default:
	}
}

func TestSubscribeReceivesSignalAfterPublish(t *testing.T) {
	b := New()
	ch, cancel := b.Subscribe("nomination-1")
	defer cancel()

	b.Publish("nomination-1")

	waitSignal(t, ch)
}

func TestPublishDoesNotSignalOtherTopics(t *testing.T) {
	b := New()
	chX, cancelX := b.Subscribe("nomination-x")
	defer cancelX()
	chY, cancelY := b.Subscribe("nomination-y")
	defer cancelY()

	b.Publish("nomination-x")

	waitSignal(t, chX)
	assertNoSignal(t, chY)
}

func TestBurstOfPublishesCoalescesToSingleSignal(t *testing.T) {
	b := New()
	ch, cancel := b.Subscribe("nomination-1")
	defer cancel()

	// Публикуем дважды до чтения — подписчик должен увидеть только один
	// висящий сигнал (буфер 1, неблокирующая отправка).
	b.Publish("nomination-1")
	b.Publish("nomination-1")

	waitSignal(t, ch)
	assertNoSignal(t, ch)

	// Следующая публикация после чтения снова доставляется.
	b.Publish("nomination-1")
	waitSignal(t, ch)
}

func TestCancelUnsubscribesAndStopsDelivery(t *testing.T) {
	b := New()
	ch, cancel := b.Subscribe("nomination-1")

	cancel()

	// Публикация после cancel не должна паниковать и не доставляется.
	b.Publish("nomination-1")

	assertNoSignal(t, ch)
}

func TestCancelCleansUpEmptyTopic(t *testing.T) {
	b := New()
	_, cancel := b.Subscribe("nomination-1")
	cancel()

	if n := b.subscriberCount("nomination-1"); n != 0 {
		t.Fatalf("expected topic to be cleaned up after last cancel, got %d subscribers", n)
	}
}

func TestCancelIsIdempotent(t *testing.T) {
	b := New()
	_, cancel := b.Subscribe("nomination-1")

	cancel()
	cancel() // must not panic

	if n := b.subscriberCount("nomination-1"); n != 0 {
		t.Fatalf("expected 0 subscribers, got %d", n)
	}
}

func TestPublishToTopicWithNoSubscribersIsNoop(t *testing.T) {
	b := New()

	// Must not panic even though nobody ever subscribed.
	b.Publish("nomination-nobody-home")
}

func TestMultipleSubscribersOfSameTopicAllReceiveSignal(t *testing.T) {
	b := New()
	ch1, cancel1 := b.Subscribe("nomination-1")
	defer cancel1()
	ch2, cancel2 := b.Subscribe("nomination-1")
	defer cancel2()

	b.Publish("nomination-1")

	waitSignal(t, ch1)
	waitSignal(t, ch2)
}

// TestConcurrentSubscribePublishCancel hammers the bus from many goroutines
// across a handful of topics to surface races/deadlocks/panics under -race.
func TestConcurrentSubscribePublishCancel(t *testing.T) {
	b := New()
	topics := []string{"a", "b", "c"}

	var wg sync.WaitGroup

	// Publishers.
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < 200; j++ {
				b.Publish(topics[j%len(topics)])
			}
		}(i)
	}

	// Subscribers that subscribe, optionally read, then cancel.
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < 200; j++ {
				topic := topics[j%len(topics)]
				ch, cancel := b.Subscribe(topic)
				select {
				case <-ch:
				default:
				}
				cancel()
			}
		}(i)
	}

	wg.Wait()

	// After everything settles and unsubscribes, topics should be cleaned up.
	for _, topic := range topics {
		if n := b.subscriberCount(topic); n != 0 {
			t.Fatalf("topic %q leaked %d subscribers after concurrent test", topic, n)
		}
	}
}
