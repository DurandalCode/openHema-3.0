// Package domain описывает сущности, порты, ошибки и чистую логику модуля
// bout: формирование пар внутри пулов (спека 0010) и жизненный цикл боя
// (спека 0013, event-sourced агрегат, ADR 0011).
//
// Bout реконструируется сверткой своего потока событий (Rebuild). Команды
// (Start/Score/Finish/Reopen/Reset) — чистые доменные решения: по текущему
// агрегату возвращают новое событие либо доменную ошибку; сама запись в
// хранилище — задача repo/service.
package domain

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Доменные ошибки. Слой api/pool мапит их в connect.Code.
var (
	// ErrInvalidInput — некорректные входные данные (пустой nominationID,
	// отрицательный счёт, невалидные поля Scheduled и т.п.).
	ErrInvalidInput = errors.New("bout: invalid input")
	// ErrNotFound — бой (поток событий) не найден.
	ErrNotFound = errors.New("bout: not found")
	// ErrInvalidTransition — недопустимый переход из текущего состояния боя.
	ErrInvalidTransition = errors.New("bout: invalid transition")
	// ErrConcurrency — конфликт версии потока при добавлении события
	// (оптимистичная конкуренция, ADR 0011 п.3).
	ErrConcurrency = errors.New("bout: concurrent modification")
)

// FighterRef — снапшот бойца на момент формирования боя (имя/клуб не
// перечитываются из модуля fighter при чтении — спека, решение №5).
// Собственная копия, не шарится с pool/fighter (ADR 0002).
type FighterRef struct {
	ID   string
	Name string
	Club string
}

// BoutState — состояние боя, вычисленное сверткой потока событий (спека
// 0013, FR-1).
type BoutState string

const (
	StateNotStarted BoutState = "not_started"
	StateInProgress BoutState = "in_progress"
	StateFinished   BoutState = "finished"
)

// Outcome — исход боя, выведенный из счёта (не задаётся отдельно, FR-3).
type Outcome string

const (
	OutcomeFighterA Outcome = "fighter_a"
	OutcomeFighterB Outcome = "fighter_b"
	OutcomeDraw     Outcome = "draw"
)

// EventType — тип доменного события в журнале боя. Именование — в
// прошедшем времени, доменный факт (ADR 0011).
type EventType string

const (
	EventScheduled EventType = "scheduled"
	EventStarted   EventType = "started"
	EventScored    EventType = "scored"
	EventFinished  EventType = "finished"
	EventReopened  EventType = "reopened"
	EventReset     EventType = "reset"
)

// Payload — полезная нагрузка события.
//
// Для EventScheduled значимы PoolID/NominationID/RoundNumber/SequenceNumber/
// FighterA/FighterB (идентичность и состав первого события потока). Для
// EventScored (и снапшота в EventFinished) — ScoreA/ScoreB.
type Payload struct {
	PoolID         string
	NominationID   string
	RoundNumber    int
	SequenceNumber int
	FighterA       FighterRef
	FighterB       FighterRef
	ScoreA         int
	ScoreB         int
}

// Event — один факт в журнале боя. Неизменяем после записи (ADR 0011).
type Event struct {
	Type    EventType
	ActorID string
	// OccurredAt — момент факта. Sequence — версия события в потоке, 1-based.
	OccurredAt time.Time
	Sequence   int
	Payload    Payload
}

// Bout — один бой, реконструированный сверткой своего потока событий: пара
// бойцов внутри пула, место в порядке проведения (спека 0010) + жизненный
// цикл/счёт (спека 0013). RoundNumber — тур (внутри одного тура боец
// участвует не более раза, FR-3a). SequenceNumber — итоговый порядок
// исполнения в пуле, 1..N, уникален в пределах PoolID (FR-3a/FR-3b).
type Bout struct {
	ID             string
	PoolID         string
	NominationID   string
	RoundNumber    int
	SequenceNumber int
	FighterA       FighterRef
	FighterB       FighterRef
	State          BoutState
	ScoreA         int
	ScoreB         int
	// Version — версия потока = номер последнего применённого события.
	Version int
}

// BoutTimes — фактическое время начала/завершения боя, выведенное из
// событийного журнала (ADR 0011). Оба поля nil, если соответствующее
// событие ещё не произошло (спека 0034, FR-16): боя ещё нет в очереди —
// StartedAt nil; идёт — StartedAt задан, FinishedAt nil; завершён — оба
// заданы. Переоткрытие после завершения (спека 0013) обнуляет прежнее
// FinishedAt заново обновлённым чтением — репозиторий берёт последнее по
// времени событие каждого вида, не первое.
type BoutTimes struct {
	StartedAt  *time.Time
	FinishedAt *time.Time
}

// EventRecord — плоская запись журнала для чтения наружу (спека 0033,
// FR-33): read-model, не агрегат — свёртки не требует. Fighter/pool/
// sequence берутся из проекции (bout.bouts), а не из payload события —
// только EventScheduled несёт FighterA/FighterB в payload, остальные типы
// событий их не дублируют (спека 0033, план «Модуль bout»).
type EventRecord struct {
	BoutID         string
	PoolID         string
	SequenceNumber int
	FighterA       FighterRef
	FighterB       FighterRef
	Type           EventType
	ScoreA         int
	ScoreB         int
	ActorID        string
	OccurredAt     time.Time
}

// BoutView — плоское текущее состояние агрегата для инлайн-проекции
// (read-model). Обновляется атомарно с записью события (ADR 0011 п.4).
// Совпадает по форме с Bout — отдельного набора полей проекция не несёт.
type BoutView = Bout

// Outcome выводит исход боя из счёта (не задаётся отдельно, FR-3): больше
// очков — победа этого бойца, равные — ничья (AC-2/AC-2b/AC-3). Осмыслен
// для завершённого боя; у not_started/in_progress — предварительный.
func (b Bout) Outcome() Outcome {
	switch {
	case b.ScoreA > b.ScoreB:
		return OutcomeFighterA
	case b.ScoreB > b.ScoreA:
		return OutcomeFighterB
	default:
		return OutcomeDraw
	}
}

// Scheduled создаёт первое событие нового потока боя (version 1) —
// используется при генерации боёв пула (спека 0010, T3). Не проверяет
// существование пула/номинации/бойцов — это задача service (через порты).
func Scheduled(poolID, nominationID string, roundNumber, sequenceNumber int, fighterA, fighterB FighterRef, now time.Time) (Event, error) {
	if poolID == "" || nominationID == "" || fighterA.ID == "" || fighterB.ID == "" {
		return Event{}, ErrInvalidInput
	}
	if fighterA.ID == fighterB.ID {
		return Event{}, ErrInvalidInput
	}
	if roundNumber < 1 || sequenceNumber < 1 {
		return Event{}, ErrInvalidInput
	}
	return Event{
		Type:       EventScheduled,
		OccurredAt: now,
		Sequence:   1,
		Payload: Payload{
			PoolID:         poolID,
			NominationID:   nominationID,
			RoundNumber:    roundNumber,
			SequenceNumber: sequenceNumber,
			FighterA:       fighterA,
			FighterB:       fighterB,
		},
	}, nil
}

// Start переводит бой не начат → идёт (FR-4). Допустимо только из
// StateNotStarted.
func (b Bout) Start(actorID string, now time.Time) (Event, error) {
	if b.State != StateNotStarted {
		return Event{}, ErrInvalidTransition
	}
	return b.nextEvent(EventStarted, actorID, now, Payload{}), nil
}

// Score вводит/правит счёт боя — абсолютная установка (спека, решение №7,
// plan.md «Способ выражения счёта»). Допустимо только пока бой in_progress
// (FR-2); счёт не может быть отрицательным (FR-2a) — иначе ErrInvalidInput.
func (b Bout) Score(actorID string, scoreA, scoreB int, now time.Time) (Event, error) {
	if b.State != StateInProgress {
		return Event{}, ErrInvalidTransition
	}
	if scoreA < 0 || scoreB < 0 {
		return Event{}, ErrInvalidInput
	}
	return b.nextEvent(EventScored, actorID, now, Payload{ScoreA: scoreA, ScoreB: scoreB}), nil
}

// Finish переводит идёт → завершён (FR-5), фиксируя итоговый счёт (снапшот
// в payload — для истории/аудита, счёт уже записан предыдущими Scored).
// Допустимо только из StateInProgress.
func (b Bout) Finish(actorID string, now time.Time) (Event, error) {
	if b.State != StateInProgress {
		return Event{}, ErrInvalidTransition
	}
	return b.nextEvent(EventFinished, actorID, now, Payload{ScoreA: b.ScoreA, ScoreB: b.ScoreB}), nil
}

// Reopen возвращает завершённый бой в ход (FR-6, обратимость решение №3):
// завершён → идёт. Счёт сохраняется — секретарь правит его следующим Score.
// Допустимо только из StateFinished.
func (b Bout) Reopen(actorID string, now time.Time) (Event, error) {
	if b.State != StateFinished {
		return Event{}, ErrInvalidTransition
	}
	return b.nextEvent(EventReopened, actorID, now, Payload{}), nil
}

// Reset возвращает начатый бой в исходное состояние (FR-6): идёт → не
// начат, счёт обнуляется в проекции (журнал хранит прошлое, AC-8).
// Допустимо только из StateInProgress.
func (b Bout) Reset(actorID string, now time.Time) (Event, error) {
	if b.State != StateInProgress {
		return Event{}, ErrInvalidTransition
	}
	return b.nextEvent(EventReset, actorID, now, Payload{}), nil
}

func (b Bout) nextEvent(t EventType, actorID string, now time.Time, payload Payload) Event {
	return Event{
		Type:       t,
		ActorID:    actorID,
		OccurredAt: now,
		Sequence:   b.Version + 1,
		Payload:    payload,
	}
}

// Rebuild реконструирует агрегат сверткой (fold) потока событий. Пустой
// поток — ErrNotFound (боя не существует).
func Rebuild(boutID string, events []Event) (Bout, error) {
	if len(events) == 0 {
		return Bout{}, ErrNotFound
	}
	b := Bout{ID: boutID}
	for _, ev := range events {
		if err := b.apply(ev); err != nil {
			return Bout{}, err
		}
	}
	return b, nil
}

// apply переводит агрегат в новое состояние согласно событию. Это чистая
// свёртка: события уже являются записанными фактами и не перепроверяются на
// допустимость (эту проверку делают команды-решения до записи).
func (b *Bout) apply(ev Event) error {
	switch ev.Type {
	case EventScheduled:
		b.PoolID = ev.Payload.PoolID
		b.NominationID = ev.Payload.NominationID
		b.RoundNumber = ev.Payload.RoundNumber
		b.SequenceNumber = ev.Payload.SequenceNumber
		b.FighterA = ev.Payload.FighterA
		b.FighterB = ev.Payload.FighterB
		b.State = StateNotStarted
		b.ScoreA = 0
		b.ScoreB = 0
	case EventStarted:
		b.State = StateInProgress
	case EventScored:
		b.ScoreA = ev.Payload.ScoreA
		b.ScoreB = ev.Payload.ScoreB
	case EventFinished:
		b.State = StateFinished
	case EventReopened:
		b.State = StateInProgress
	case EventReset:
		b.State = StateNotStarted
		b.ScoreA = 0
		b.ScoreB = 0
	default:
		return fmt.Errorf("bout: unknown event type %q", ev.Type)
	}
	b.Version = ev.Sequence
	return nil
}

// PoolInput — вход генерации: состав одного пула на момент фиксации
// раскладки (порядок Fighters неважен, GenerateRoundRobin сортирует сама).
type PoolInput struct {
	PoolID   string
	Fighters []FighterRef
}

// Repository — порт доступа к хранилищу боёв (PG-схема bout): event store +
// инлайн-проекция (ADR 0011).
type Repository interface {
	// ReplaceForPools одной транзакцией удаляет бои перечисленных пулов (и
	// их потоки событий, каскадом на уровне БД) и вставляет новые: на
	// каждый бой — строку проекции (bouts) и событие scheduled (version 1)
	// (bouts == nil → только удаление, см. spec 0010 «Принятые решения»
	// №3). Используется GenerateForStage — материализация состава
	// контейнеров одного этапа. Адресация удаления — явный список пулов
	// этапа, а не номинация целиком: до спеки 0018 это был
	// ReplaceForNomination(nominationID, bouts) — безвредный, пока у
	// номинации ровно один этап (0017, FR-4). С появлением второго этапа
	// (плейофф-сетка) номинационный replace стёр бы бои пулов первого этапа
	// при фиксации второго — латентный баг, зафиксированный в
	// docs/specs/0018-playoff-bracket/plan.md «Риски». Пустой poolIDs —
	// валидный no-op на delete-стороне (только insert).
	ReplaceForPools(ctx context.Context, poolIDs []string, bouts []Bout) error
	// ScheduleBouts одной транзакцией вставляет проекции + события
	// scheduled (version 1) для перечисленных боёв, не удаляя ничего —
	// точечная материализация пары сетки, когда становятся известны обе её
	// стороны (спека 0018, FR-14). В отличие от ReplaceForPools/
	// GenerateForStage это инкрементальное добавление, а не полная замена
	// состава контейнера. Пустой список — валидный no-op.
	ScheduleBouts(ctx context.Context, bouts []Bout) error
	// DeleteBouts точечно удаляет перечисленные бои (и их потоки событий,
	// каскадом на уровне БД) по id — снятие продвижения победителя при
	// пересмотре результата предыдущего круга сетки (спека 0018, FR-16):
	// адресация по конкретным боям, а не по пулу — соседние бои того же
	// контейнера не трогаются. Пустой список — валидный no-op.
	DeleteBouts(ctx context.Context, ids []string) error
	// DeleteBoutsByPools удаляет бои (и их потоки событий, каскадом на
	// уровне БД) перечисленных пулов — используется расфиксацией этапа
	// (спека 0017, ClearForPools): адресация по пулам этапа, а не по
	// номинации целиком, чтобы не задеть бои пулов других этапов той же
	// номинации (FR-8). Пустой список — валидный no-op.
	DeleteBoutsByPools(ctx context.Context, poolIDs []string) error
	// ListByNomination возвращает бои номинации, отсортированные по
	// PoolID, затем SequenceNumber.
	ListByNomination(ctx context.Context, nominationID string) ([]Bout, error)
	// BoutsByPool возвращает бои одного пула (состояние/счёт в проекции),
	// отсортированные по SequenceNumber — для доски ведения пула.
	BoutsByPool(ctx context.Context, poolID string) ([]Bout, error)
	// GetBout возвращает проекцию одного боя.
	GetBout(ctx context.Context, boutID string) (Bout, error)
	// PoolProgress возвращает total/started/finished боёв пула (FR-10):
	// started — бои, вышедшие из not_started (in_progress или finished).
	PoolProgress(ctx context.Context, poolID string) (total, started, finished int, err error)
	// AnyStartedInPools — есть ли среди боёв перечисленных пулов хотя бы
	// один со state ≠ not_started (гейт расфиксации этапа, спека 0017
	// FR-8/FR-13). Пустой список — валидный no-op: false, без ошибки.
	AnyStartedInPools(ctx context.Context, poolIDs []string) (bool, error)
	// Load возвращает полный поток событий боя, упорядоченный по версии.
	Load(ctx context.Context, boutID string) ([]Event, error)
	// Append атомарно вставляет событие с version = expectedVersion+1 и
	// обновляет инлайн-проекцию. Конфликт версии → ErrConcurrency.
	Append(ctx context.Context, boutID string, expectedVersion int, ev Event, view BoutView) error
	// EventsForPools возвращает журнал боёв перечисленных пулов (спека 0033,
	// FR-33) — для будущего RPC GetArenaJournal (модуль stage резолвит пул
	// на арене и передаёт []string{poolID}). EventScheduled исключается: у
	// него нет человека-инициатора (FR-34/FR-36). Новыми событиями вперёд
	// (occurred_at DESC, затем версия события DESC), ограничено limit.
	// Пустой poolIDs — валидный no-op: пустой срез, без ошибки.
	EventsForPools(ctx context.Context, poolIDs []string, limit int) ([]EventRecord, error)
	// BoutTimesForPools возвращает фактическое время начала/завершения
	// каждого боя перечисленных пулов (спека 0034, FR-16) — источник для
	// публичной ленты турнира: время не прогнозируется, а читается из
	// событийного журнала (ADR 0011). Переоткрытие/сброс боя (спека 0013)
	// не должны показывать устаревшую отметку — реализация учитывает
	// последний restart-маркер потока (reopened/reset), а не просто
	// последнее событие своего вида без учёта порядка (см. doc-комментарий
	// SQL-запроса BoutTimesForPools). Пустой poolIDs — валидный no-op:
	// пустая карта без ошибки (как EventsForPools/AnyStartedInPools).
	BoutTimesForPools(ctx context.Context, poolIDs []string) (map[string]BoutTimes, error)
	// StartedAtByBouts возвращает первый момент начала каждого боя из
	// перечисленных (спека 0043, ADR 0020: наблюдения для оценки темпа
	// площадки) — MIN(occurred_at) события 'started', не свёртка по
	// restart-маркерам (в отличие от BoutTimesForPools/started_at, которому
	// нужен ПОСЛЕДНИЙ актуальный started — здесь нужен ПЕРВЫЙ, чтобы
	// reset+повторный старт не искажал такт). Бои без единого события
	// 'started' просто отсутствуют в результирующей карте — не ошибка.
	// Пустой список — валидный вход, no-op → пустая карта (как
	// AnyStartedInPools/EventsForPools).
	StartedAtByBouts(ctx context.Context, boutIDs []string) (map[string]time.Time, error)
	// ExistsBoutForNomination — есть ли среди боёв номинации хотя бы один
	// поставленный (spec 0040, сценарий 1, FR-1б: гейт удаления номинации —
	// nomination/domain.BoutOccupancyChecker, реализуется
	// modules/bout.BoutOccupancyAdapter поверх этого метода). Использует
	// idx_bouts_nomination.
	ExistsBoutForNomination(ctx context.Context, nominationID string) (bool, error)
	// RepointFighter переносит оба борта (FighterA/FighterB) всех боёв
	// дубля-источника (oldID) на итоговую запись (newID) по идентификатору —
	// сторона слияния дублей бойца (спека 0040, сценарий 3:
	// fighter/domain.BoutRepointer, реализуется
	// modules/bout.RepointAdapter). Денормализованные имя/клуб бойца в
	// журнале боя НЕ переписываются — это исторический снапшот на момент
	// проведения, не текущее состояние ростера (plan.md, «Риски»).
	// Идемпотентно: повторный вызов на уже репойнтнутые строки — no-op.
	RepointFighter(ctx context.Context, oldID, newID string) error
}
