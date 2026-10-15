// Спека 0063: очередь пулов на арену. Чистые функции порядка и прогноза —
// без зависимостей от репозитория; хранение и атомарность — repo/service.
package domain

import (
	"errors"
	"fmt"
	"time"
)

var (
	// ErrPoolQueued — расфиксация раскладки (ready → draft) отклонена: хотя
	// бы один пул этапа стоит в очереди арены (спека 0063, FR-12). Конкретную
	// арену несёт PoolQueuedError.
	ErrPoolQueued = errors.New("pool: a pool of this stage is queued on an arena")
	// ErrQueueEmpty — «поставить следующий» при пустой очереди (FR-9).
	ErrQueueEmpty = errors.New("pool: arena queue is empty")
	// ErrQueueMismatch — набор id при переупорядочивании не совпал с текущей
	// очередью (устаревший клиент, гонка двух операторов, NFR-3).
	ErrQueueMismatch = errors.New("pool: queue changed, reload and retry")
	// ErrNotQueued — пул не стоит ни в одной очереди.
	ErrNotQueued = errors.New("pool: pool is not in an arena queue")
)

// PoolQueuedError — ErrPoolQueued с названием арены, в очереди которой стоит
// пул (FR-12: сообщение называет арену).
type PoolQueuedError struct {
	ArenaID   string
	ArenaName string
}

func (e *PoolQueuedError) Error() string {
	name := e.ArenaName
	if name == "" {
		name = e.ArenaID
	}
	return fmt.Sprintf("%s: %s", ErrPoolQueued.Error(), name)
}

func (e *PoolQueuedError) Unwrap() error { return ErrPoolQueued }

// QueueChangeoverPause — пауза смены пула на арене, прибавляемая перед
// каждым пулом очереди (спека 0063, FR-21; константа спеки, как пороги 0043).
const QueueChangeoverPause = 5 * time.Minute

// EnqueueOrder возвращает порядок очереди после добавления id в конец. Если
// id уже в очереди, он переезжает в конец (идемпотентный перенос). Вход не
// мутируется.
func EnqueueOrder(cur []string, id string) []string {
	out := RemoveFromOrder(cur, id)
	return append(out, id)
}

// RemoveFromOrder возвращает порядок без id (порядок остальных сохраняется,
// «без пропусков» обеспечивает уплотнение позиций в repo). Вход не мутируется.
func RemoveFromOrder(cur []string, id string) []string {
	out := make([]string, 0, len(cur))
	for _, c := range cur {
		if c != id {
			out = append(out, c)
		}
	}
	return out
}

// ValidateReorder проверяет, что next — перестановка cur: тот же набор id, без
// повторов. Иначе ErrQueueMismatch.
func ValidateReorder(cur, next []string) error {
	if len(cur) != len(next) {
		return ErrQueueMismatch
	}
	want := make(map[string]struct{}, len(cur))
	for _, c := range cur {
		want[c] = struct{}{}
	}
	seen := make(map[string]struct{}, len(next))
	for _, n := range next {
		if _, ok := want[n]; !ok {
			return ErrQueueMismatch
		}
		if _, dup := seen[n]; dup {
			return ErrQueueMismatch
		}
		seen[n] = struct{}{}
	}
	return nil
}

// ForecastQueue расставляет не начатые бои пулов очереди подряд (спека 0063,
// FR-21/FR-22). start — момент, когда освобождается арена (конец стоящего
// пула по оценке либо now у свободной арены); перед каждым пулом очереди
// добавляется QueueChangeoverPause. Темп — pace арены; оценка всегда
// предварительная. pools — бои каждого пула очереди по порядку (уже
// отсортированы вызывающим по SequenceNumber). Второе значение — момент
// окончания последнего пула очереди (start, если очередь пуста).
func ForecastQueue(pools [][]BoutRef, pace PaceEstimate, now, start time.Time) (map[string]BoutForecast, time.Time) {
	out := make(map[string]BoutForecast)
	cursor := start
	for _, bouts := range pools {
		cursor = cursor.Add(QueueChangeoverPause)
		ahead := 0
		for _, b := range bouts {
			if b.State != BoutStateNotStarted {
				continue
			}
			expected := cursor.Add(pace.Tick * time.Duration(ahead))
			out[b.ID] = BoutForecast{
				ExpectedStartAt: expected,
				BoutsAhead:      ahead,
				Provisional:     true,
				Imminent:        !expected.After(now),
			}
			ahead++
		}
		cursor = cursor.Add(pace.Tick * time.Duration(ahead))
	}
	return out, cursor
}
