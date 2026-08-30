package platform

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	boutdomain "github.com/hema/server/modules/bout/domain"
	boutrepo "github.com/hema/server/modules/bout/repo"
	boutservice "github.com/hema/server/modules/bout/service"
	stagedomain "github.com/hema/server/modules/stage/domain"
)

// StageBoutConductor адаптирует bout-сервис к порту
// stage/domain.BoutConductor (межмодульная зависимость через API модуля
// bout, а не через прямой доступ к его PG-схеме, ADR 0002). Направление
// зависимости — только stage → bout (спека 0010 «Обзор решения», расширено
// спекой 0013: жизненный цикл боя, счёт, чтения для доски ведения).
type StageBoutConductor struct {
	svc *boutservice.Service
}

// NewStageBoutConductor создаёт адаптер поверх пула соединений, строя
// собственный bout-сервис (не переиспользует HTTP-инстанс из
// bout.Register — по образцу StageActiveFightersProvider).
func NewStageBoutConductor(pool *pgxpool.Pool) *StageBoutConductor {
	r := boutrepo.New(pool)
	return &StageBoutConductor{svc: boutservice.New(r)}
}

var _ stagedomain.BoutConductor = (*StageBoutConductor)(nil)

// GenerateForStage формирует бои каждого пула этапа (round-robin, FR-3) на
// переходе раскладки draft → ready. nominationID не адресует (это по-прежнему
// пулы этапа) — штампуется в payload события Scheduled (спека 0017, план
// «Модуль bout»).
func (g *StageBoutConductor) GenerateForStage(ctx context.Context, nominationID string, pools []stagedomain.BoutPoolInput) error {
	in := make([]boutdomain.PoolInput, len(pools))
	for i, p := range pools {
		fighters := make([]boutdomain.FighterRef, len(p.Fighters))
		for j, f := range p.Fighters {
			fighters[j] = boutdomain.FighterRef{ID: f.ID, Name: f.Name, Club: f.Club}
		}
		in[i] = boutdomain.PoolInput{PoolID: p.PoolID, Fighters: fighters}
	}
	return g.svc.GenerateForStage(ctx, nominationID, in)
}

// ClearForPools удаляет бои перечисленных пулов на переходе раскладки этапа
// ready → draft (гейтится AnyStartedInPools на стороне stage, FR-13/спека
// 0017 FR-8) — не трогает бои пулов других этапов той же номинации.
func (g *StageBoutConductor) ClearForPools(ctx context.Context, poolIDs []string) error {
	return g.svc.ClearForPools(ctx, poolIDs)
}

// ScheduleBout материализует один бой пары сетки (спека 0018, FR-14):
// точечная вставка, ничего не удаляет. Возвращает id созданного боя.
func (g *StageBoutConductor) ScheduleBout(ctx context.Context, nominationID, poolID string, round, sequence int, a, b stagedomain.FighterRef) (string, error) {
	id, err := g.svc.ScheduleBout(ctx, nominationID, poolID, round, sequence,
		boutdomain.FighterRef{ID: a.ID, Name: a.Name, Club: a.Club},
		boutdomain.FighterRef{ID: b.ID, Name: b.Name, Club: b.Club},
	)
	return id, mapBoutErr(err)
}

// DeleteBouts точечно удаляет перечисленные бои (снятие продвижения при
// пересмотре результата, спека 0018, FR-16).
func (g *StageBoutConductor) DeleteBouts(ctx context.Context, boutIDs []string) error {
	return mapBoutErr(g.svc.DeleteBouts(ctx, boutIDs))
}

// StartBout переводит бой не начат → идёт (спека 0013, FR-4).
func (g *StageBoutConductor) StartBout(ctx context.Context, boutID, actorID string) error {
	_, err := g.svc.StartBout(ctx, boutID, actorID, time.Now())
	return mapBoutErr(err)
}

// ScoreBout задаёт абсолютный счёт боя (спека 0013, FR-2/FR-2a).
func (g *StageBoutConductor) ScoreBout(ctx context.Context, boutID, actorID string, scoreA, scoreB int) error {
	_, err := g.svc.ScoreBout(ctx, boutID, actorID, scoreA, scoreB, time.Now())
	return mapBoutErr(err)
}

// FinishBout переводит бой идёт → завершён, фиксируя счёт (спека 0013, FR-5).
func (g *StageBoutConductor) FinishBout(ctx context.Context, boutID, actorID string) error {
	_, err := g.svc.FinishBout(ctx, boutID, actorID, time.Now())
	return mapBoutErr(err)
}

// ReopenBout переводит бой завершён → идёт для правки счёта (спека 0013, FR-6).
func (g *StageBoutConductor) ReopenBout(ctx context.Context, boutID, actorID string) error {
	_, err := g.svc.ReopenBout(ctx, boutID, actorID, time.Now())
	return mapBoutErr(err)
}

// ResetBout переводит бой идёт → не начат, счёт обнуляется (спека 0013, FR-6).
func (g *StageBoutConductor) ResetBout(ctx context.Context, boutID, actorID string) error {
	_, err := g.svc.ResetBout(ctx, boutID, actorID, time.Now())
	return mapBoutErr(err)
}

// BoutsByPool возвращает бои пула для доски ведения (спека 0013, FR-14).
func (g *StageBoutConductor) BoutsByPool(ctx context.Context, poolID string) ([]stagedomain.BoutRef, error) {
	bouts, err := g.svc.BoutsByPool(ctx, poolID)
	if err != nil {
		return nil, mapBoutErr(err)
	}
	out := make([]stagedomain.BoutRef, len(bouts))
	for i, b := range bouts {
		out[i] = stagedomain.BoutRef{
			ID:             b.ID,
			RoundNumber:    b.RoundNumber,
			SequenceNumber: b.SequenceNumber,
			FighterA:       stagedomain.FighterRef{ID: b.FighterA.ID, Name: b.FighterA.Name, Club: b.FighterA.Club},
			FighterB:       stagedomain.FighterRef{ID: b.FighterB.ID, Name: b.FighterB.Name, Club: b.FighterB.Club},
			State:          mapBoutState(b.State),
			ScoreA:         b.ScoreA,
			ScoreB:         b.ScoreB,
		}
	}
	return out, nil
}

// PoolProgress — сколько всего боёв у пула, сколько начато и сколько
// завершено (спека 0013, FR-10).
func (g *StageBoutConductor) PoolProgress(ctx context.Context, poolID string) (total, started, finished int, err error) {
	total, started, finished, err = g.svc.PoolProgress(ctx, poolID)
	return total, started, finished, mapBoutErr(err)
}

// AnyStartedInPools — есть ли среди боёв перечисленных пулов хотя бы один
// со state ≠ not_started (гейт расфиксации этапа, спека 0017 FR-8/FR-13).
func (g *StageBoutConductor) AnyStartedInPools(ctx context.Context, poolIDs []string) (bool, error) {
	ok, err := g.svc.AnyStartedInPools(ctx, poolIDs)
	return ok, mapBoutErr(err)
}

// EventsForPools возвращает журнал боёв перечисленных пулов (спека 0033,
// FR-33): перекладка bout/domain.EventRecord → stage/domain.BoutEventRecord
// (модули не делят типы напрямую, ADR 0002).
func (g *StageBoutConductor) EventsForPools(ctx context.Context, poolIDs []string, limit int) ([]stagedomain.BoutEventRecord, error) {
	records, err := g.svc.ListEventsForPools(ctx, poolIDs, limit)
	if err != nil {
		return nil, mapBoutErr(err)
	}
	out := make([]stagedomain.BoutEventRecord, len(records))
	for i, r := range records {
		out[i] = stagedomain.BoutEventRecord{
			BoutID:         r.BoutID,
			SequenceNumber: r.SequenceNumber,
			FighterA:       stagedomain.FighterRef{ID: r.FighterA.ID, Name: r.FighterA.Name, Club: r.FighterA.Club},
			FighterB:       stagedomain.FighterRef{ID: r.FighterB.ID, Name: r.FighterB.Name, Club: r.FighterB.Club},
			Kind:           mapBoutEventKind(r.Type),
			ScoreA:         r.ScoreA,
			ScoreB:         r.ScoreB,
			ActorID:        r.ActorID,
			OccurredAt:     r.OccurredAt,
		}
	}
	return out, nil
}

// BoutTimesForPools возвращает фактическое время начала/завершения боёв
// перечисленных пулов (спека 0034, FR-16): перекладка bout/domain.BoutTimes
// → stage/domain.BoutTimes (модули не делят типы напрямую, ADR 0002).
func (g *StageBoutConductor) BoutTimesForPools(ctx context.Context, poolIDs []string) (map[string]stagedomain.BoutTimes, error) {
	times, err := g.svc.TimesForPools(ctx, poolIDs)
	if err != nil {
		return nil, mapBoutErr(err)
	}
	out := make(map[string]stagedomain.BoutTimes, len(times))
	for id, t := range times {
		out[id] = stagedomain.BoutTimes{StartedAt: t.StartedAt, FinishedAt: t.FinishedAt}
	}
	return out, nil
}

// StartedAtByBouts возвращает первый момент начала каждого боя из списка
// (спека 0043, ADR 0020) — наблюдения для темпа площадки модуля stage.
func (g *StageBoutConductor) StartedAtByBouts(ctx context.Context, boutIDs []string) (map[string]time.Time, error) {
	out, err := g.svc.StartedAtByBouts(ctx, boutIDs)
	if err != nil {
		return nil, mapBoutErr(err)
	}
	return out, nil
}

// mapBoutEventKind переводит bout.domain.EventType в собственный тип stage
// (модули не делят типы напрямую, ADR 0002). `scheduled` не встречается на
// входе — bout/repo уже фильтрует его из EventsForPools (спека 0033, план
// «Модуль bout»); default покрывает эту невозможную ветку пустым значением.
func mapBoutEventKind(t boutdomain.EventType) stagedomain.BoutEventKind {
	switch t {
	case boutdomain.EventStarted:
		return stagedomain.BoutEventStarted
	case boutdomain.EventScored:
		return stagedomain.BoutEventScored
	case boutdomain.EventFinished:
		return stagedomain.BoutEventFinished
	case boutdomain.EventReopened:
		return stagedomain.BoutEventReopened
	case boutdomain.EventReset:
		return stagedomain.BoutEventReset
	default:
		return ""
	}
}

// mapBoutState переводит bout.domain.BoutState в собственный тип stage
// (модули не делят типы напрямую, ADR 0002).
func mapBoutState(s boutdomain.BoutState) stagedomain.BoutState {
	switch s {
	case boutdomain.StateInProgress:
		return stagedomain.BoutStateInProgress
	case boutdomain.StateFinished:
		return stagedomain.BoutStateFinished
	default:
		return stagedomain.BoutStateNotStarted
	}
}

// mapBoutErr переводит доменные ошибки bout в сентинелы stage/domain,
// которые уже знает api-слой stage (см. комментарий у BoutConductor).
func mapBoutErr(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, boutdomain.ErrNotFound):
		return stagedomain.ErrNotFound
	case errors.Is(err, boutdomain.ErrInvalidTransition):
		return stagedomain.ErrInvalidTransition
	case errors.Is(err, boutdomain.ErrInvalidInput):
		return stagedomain.ErrInvalidInput
	case errors.Is(err, boutdomain.ErrConcurrency):
		return stagedomain.ErrConcurrency
	default:
		return err
	}
}
