package platform

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	boutdomain "github.com/hema/server/modules/bout/domain"
	boutrepo "github.com/hema/server/modules/bout/repo"
	boutservice "github.com/hema/server/modules/bout/service"
	pooldomain "github.com/hema/server/modules/pool/domain"
)

// PoolBoutConductor адаптирует bout-сервис к порту
// pool/domain.BoutConductor (межмодульная зависимость через API модуля
// bout, а не через прямой доступ к его PG-схеме, ADR 0002). Направление
// зависимости — только pool → bout (спека 0010 «Обзор решения», расширено
// спекой 0013: жизненный цикл боя, счёт, чтения для доски ведения).
type PoolBoutConductor struct {
	svc *boutservice.Service
}

// NewPoolBoutConductor создаёт адаптер поверх пула соединений, строя
// собственный bout-сервис (не переиспользует HTTP-инстанс из
// bout.Register — по образцу PoolActiveFightersProvider).
func NewPoolBoutConductor(pool *pgxpool.Pool) *PoolBoutConductor {
	r := boutrepo.New(pool)
	return &PoolBoutConductor{svc: boutservice.New(r)}
}

var _ pooldomain.BoutConductor = (*PoolBoutConductor)(nil)

// GenerateForNomination формирует бои каждого пула номинации (round-robin,
// FR-3) на переходе раскладки draft → ready.
func (g *PoolBoutConductor) GenerateForNomination(ctx context.Context, nominationID string, pools []pooldomain.BoutPoolInput) error {
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
// ready → draft (гейтится AnyStartedInNomination на стороне pool, FR-13).
func (g *PoolBoutConductor) ClearForNomination(ctx context.Context, nominationID string) error {
	return g.svc.ClearForNomination(ctx, nominationID)
}

// StartBout переводит бой не начат → идёт (спека 0013, FR-4).
func (g *PoolBoutConductor) StartBout(ctx context.Context, boutID, actorID string) error {
	_, err := g.svc.StartBout(ctx, boutID, actorID, time.Now())
	return mapBoutErr(err)
}

// ScoreBout задаёт абсолютный счёт боя (спека 0013, FR-2/FR-2a).
func (g *PoolBoutConductor) ScoreBout(ctx context.Context, boutID, actorID string, scoreA, scoreB int) error {
	_, err := g.svc.ScoreBout(ctx, boutID, actorID, scoreA, scoreB, time.Now())
	return mapBoutErr(err)
}

// FinishBout переводит бой идёт → завершён, фиксируя счёт (спека 0013, FR-5).
func (g *PoolBoutConductor) FinishBout(ctx context.Context, boutID, actorID string) error {
	_, err := g.svc.FinishBout(ctx, boutID, actorID, time.Now())
	return mapBoutErr(err)
}

// ReopenBout переводит бой завершён → идёт для правки счёта (спека 0013, FR-6).
func (g *PoolBoutConductor) ReopenBout(ctx context.Context, boutID, actorID string) error {
	_, err := g.svc.ReopenBout(ctx, boutID, actorID, time.Now())
	return mapBoutErr(err)
}

// ResetBout переводит бой идёт → не начат, счёт обнуляется (спека 0013, FR-6).
func (g *PoolBoutConductor) ResetBout(ctx context.Context, boutID, actorID string) error {
	_, err := g.svc.ResetBout(ctx, boutID, actorID, time.Now())
	return mapBoutErr(err)
}

// BoutsByPool возвращает бои пула для доски ведения (спека 0013, FR-14).
func (g *PoolBoutConductor) BoutsByPool(ctx context.Context, poolID string) ([]pooldomain.BoutRef, error) {
	bouts, err := g.svc.BoutsByPool(ctx, poolID)
	if err != nil {
		return nil, mapBoutErr(err)
	}
	out := make([]pooldomain.BoutRef, len(bouts))
	for i, b := range bouts {
		out[i] = pooldomain.BoutRef{
			ID:             b.ID,
			RoundNumber:    b.RoundNumber,
			SequenceNumber: b.SequenceNumber,
			FighterA:       pooldomain.FighterRef{ID: b.FighterA.ID, Name: b.FighterA.Name, Club: b.FighterA.Club},
			FighterB:       pooldomain.FighterRef{ID: b.FighterB.ID, Name: b.FighterB.Name, Club: b.FighterB.Club},
			State:          mapBoutState(b.State),
			ScoreA:         b.ScoreA,
			ScoreB:         b.ScoreB,
		}
	}
	return out, nil
}

// PoolProgress — сколько всего боёв у пула, сколько начато и сколько
// завершено (спека 0013, FR-10).
func (g *PoolBoutConductor) PoolProgress(ctx context.Context, poolID string) (total, started, finished int, err error) {
	total, started, finished, err = g.svc.PoolProgress(ctx, poolID)
	return total, started, finished, mapBoutErr(err)
}

// AnyStartedInNomination — есть ли в номинации хотя бы один бой со state ≠
// not_started (гейт FR-13, AC-12).
func (g *PoolBoutConductor) AnyStartedInNomination(ctx context.Context, nominationID string) (bool, error) {
	ok, err := g.svc.AnyStartedInNomination(ctx, nominationID)
	return ok, mapBoutErr(err)
}

// mapBoutState переводит bout.domain.BoutState в собственный тип pool
// (модули не делят типы напрямую, ADR 0002).
func mapBoutState(s boutdomain.BoutState) pooldomain.BoutState {
	switch s {
	case boutdomain.StateInProgress:
		return pooldomain.BoutStateInProgress
	case boutdomain.StateFinished:
		return pooldomain.BoutStateFinished
	default:
		return pooldomain.BoutStateNotStarted
	}
}

// mapBoutErr переводит доменные ошибки bout в сентинелы pool/domain,
// которые уже знает api-слой pool (см. комментарий у BoutConductor).
func mapBoutErr(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, boutdomain.ErrNotFound):
		return pooldomain.ErrNotFound
	case errors.Is(err, boutdomain.ErrInvalidTransition):
		return pooldomain.ErrInvalidTransition
	case errors.Is(err, boutdomain.ErrInvalidInput):
		return pooldomain.ErrInvalidInput
	case errors.Is(err, boutdomain.ErrConcurrency):
		return pooldomain.ErrConcurrency
	default:
		return err
	}
}
