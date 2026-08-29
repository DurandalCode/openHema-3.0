package domain

import "time"

// Спека 0043, FR-15/FR-16: лента «требует внимания» операторской консоли.
// DetectAlerts ничего не хранит и не гасит вручную — просто пересчитывает
// список каждый вызов по переданному состоянию «на сейчас»: условие
// пропало → запись не появится в следующем вызове.

// Пороги срабатывания тревог (спека 0043, FR-15). У вида «этап завершён,
// следующий не сформирован» порога нет — срабатывает сразу.
const (
	ArenaIdleAlertThreshold           = 3 * time.Minute
	BoutStuckAlertThreshold           = 15 * time.Minute
	PoolNotStartedAlertThreshold      = 10 * time.Minute
	PoolDoneNotUnseatedAlertThreshold = 5 * time.Minute
	NominationStalledAlertThreshold   = 15 * time.Minute
)

// ConsoleAlertKind — вид тревоги в ленте «требует внимания» (спека 0043,
// FR-15).
type ConsoleAlertKind string

const (
	ConsoleAlertArenaIdle           ConsoleAlertKind = "arena_idle"
	ConsoleAlertBoutStuck           ConsoleAlertKind = "bout_stuck"
	ConsoleAlertPoolNotStarted      ConsoleAlertKind = "pool_not_started"
	ConsoleAlertPoolDoneNotUnseated ConsoleAlertKind = "pool_done_not_unseated"
	ConsoleAlertNextStageNotBuilt   ConsoleAlertKind = "next_stage_not_built"
	ConsoleAlertNominationStalled   ConsoleAlertKind = "nomination_stalled"
)

// ConsoleAlert — одна запись ленты «требует внимания».
type ConsoleAlert struct {
	Kind           ConsoleAlertKind
	Since          time.Time
	ArenaID        string
	ArenaName      string
	NominationID   string
	NominationName string
	PoolID         string
	PoolName       string
	BoutID         string
}

// ConsoleAlertArenaInput — состояние одной площадки для DetectAlerts.
type ConsoleAlertArenaInput struct {
	ArenaID   string
	ArenaName string

	// Occupied — стоит ли на площадке пул сейчас.
	Occupied bool
	// FreeSince — момент освобождения площадки (nil, если площадка
	// никогда не освобождалась — «ждёт первый пул», простоя не было;
	// значим только при Occupied == false).
	FreeSince *time.Time

	// BoutInProgress/BoutInProgressSince/BoutID — идёт ли сейчас бой,
	// когда начат, его id (для BOUT_STUCK).
	BoutInProgress      bool
	BoutInProgressSince time.Time
	BoutID              string

	// PoolID/PoolName — пул, стоящий на площадке (пусто при !Occupied).
	PoolID   string
	PoolName string
	// PoolSeatedSince — момент постановки этого пула на площадку
	// (приближение; чем именно его получает вызывающий — не забота этой
	// функции).
	PoolSeatedSince time.Time
	// PoolAnyBoutStarted — начат ли хотя бы один бой пула (для
	// POOL_NOT_STARTED: тревога, только если false).
	PoolAnyBoutStarted bool
	// PoolAllBoutsFinished/PoolLastFinishedAt — все ли бои пула
	// завершены и момент завершения последнего (для
	// POOL_DONE_NOT_UNSEATED).
	PoolAllBoutsFinished bool
	PoolLastFinishedAt   time.Time
}

// ConsoleAlertNominationInput — состояние одной номинации для
// DetectAlerts.
type ConsoleAlertNominationInput struct {
	NominationID   string
	NominationName string
	// NextStageNotBuilt — предыдущий этап доигран, следующий существует
	// и стоит в draft (без порога — тревога сразу, если true).
	NextStageNotBuilt bool
	// Stalled/StalledSince — раскладка этапа зафиксирована (ready), ни
	// один пул не поставлен, ни один бой не проведён; StalledSince —
	// момент, с которого условие держится.
	Stalled      bool
	StalledSince time.Time
}

// ConsoleAlertQueueInput — турнир-широкий контекст для DetectAlerts.
type ConsoleAlertQueueInput struct {
	// HasReadyPools — есть ли в турнире хотя бы один пул, готовый к
	// постановке (простаивающая площадка не тревожит, если ставить
	// нечего — ARENA_IDLE).
	HasReadyPools bool
}

// DetectAlerts пересчитывает ленту «требует внимания» по переданному
// состоянию площадок и номинаций «на сейчас» (спека 0043, FR-15/FR-16).
// Ничего не хранит между вызовами: условие снялось — записи не будет.
func DetectAlerts(
	arenas []ConsoleAlertArenaInput,
	nominations []ConsoleAlertNominationInput,
	queue ConsoleAlertQueueInput,
	now time.Time,
) []ConsoleAlert {
	out := make([]ConsoleAlert, 0)

	for _, a := range arenas {
		if !a.Occupied && a.FreeSince != nil && queue.HasReadyPools && now.Sub(*a.FreeSince) >= ArenaIdleAlertThreshold {
			out = append(out, ConsoleAlert{
				Kind:      ConsoleAlertArenaIdle,
				Since:     *a.FreeSince,
				ArenaID:   a.ArenaID,
				ArenaName: a.ArenaName,
			})
		}
		if a.Occupied && a.BoutInProgress && now.Sub(a.BoutInProgressSince) >= BoutStuckAlertThreshold {
			out = append(out, ConsoleAlert{
				Kind:      ConsoleAlertBoutStuck,
				Since:     a.BoutInProgressSince,
				ArenaID:   a.ArenaID,
				ArenaName: a.ArenaName,
				PoolID:    a.PoolID,
				PoolName:  a.PoolName,
				BoutID:    a.BoutID,
			})
		}
		if a.Occupied && !a.PoolAnyBoutStarted && now.Sub(a.PoolSeatedSince) >= PoolNotStartedAlertThreshold {
			out = append(out, ConsoleAlert{
				Kind:      ConsoleAlertPoolNotStarted,
				Since:     a.PoolSeatedSince,
				ArenaID:   a.ArenaID,
				ArenaName: a.ArenaName,
				PoolID:    a.PoolID,
				PoolName:  a.PoolName,
			})
		}
		if a.Occupied && a.PoolAllBoutsFinished && now.Sub(a.PoolLastFinishedAt) >= PoolDoneNotUnseatedAlertThreshold {
			out = append(out, ConsoleAlert{
				Kind:      ConsoleAlertPoolDoneNotUnseated,
				Since:     a.PoolLastFinishedAt,
				ArenaID:   a.ArenaID,
				ArenaName: a.ArenaName,
				PoolID:    a.PoolID,
				PoolName:  a.PoolName,
			})
		}
	}

	for _, n := range nominations {
		if n.NextStageNotBuilt {
			out = append(out, ConsoleAlert{
				Kind:           ConsoleAlertNextStageNotBuilt,
				Since:          now,
				NominationID:   n.NominationID,
				NominationName: n.NominationName,
			})
		}
		if n.Stalled && now.Sub(n.StalledSince) >= NominationStalledAlertThreshold {
			out = append(out, ConsoleAlert{
				Kind:           ConsoleAlertNominationStalled,
				Since:          n.StalledSince,
				NominationID:   n.NominationID,
				NominationName: n.NominationName,
			})
		}
	}

	return out
}
