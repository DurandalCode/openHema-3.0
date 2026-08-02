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

// GenerateForNomination формирует бои каждого пула номинации (round-robin,
// FR-3) на переходе раскладки draft → ready.
func (g *StageBoutConductor) GenerateForNomination(ctx context.Context, nominationID string, pools []stagedomain.BoutPoolInput) error {
	in := make([]boutdomain.PoolInput, len(pools))
	for i, p := range pools {
		fighters := make([]boutdomain.FighterRef, len(p.Fighters))
		for j, f := range p.Fighters {
			fighters[j] = boutdomain.FighterRef{ID: f.ID, Name: f.Name, Club: f.Club}
		}
		in[i] = boutdomain.PoolInput{PoolID: p.PoolID, Fighters: fighters}
	}
	return g.svc.GenerateForNomination(ctx, nominationID, in)
}

// ClearForNomination удаляет все бои номинации на переходе раскладки
// ready → draft (гейтится AnyStartedInNomination на стороне stage, FR-13).
func (g *StageBoutConductor) ClearForNomination(ctx context.Context, nominationID string) error {
	return g.svc.ClearForNomination(ctx, nominationID)
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

// AnyStartedInNomination — есть ли в номинации хотя бы один бой со state ≠
// not_started (гейт FR-13, AC-12).
func (g *StageBoutConductor) AnyStartedInNomination(ctx context.Context, nominationID string) (bool, error) {
	ok, err := g.svc.AnyStartedInNomination(ctx, nominationID)
	return ok, mapBoutErr(err)
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
