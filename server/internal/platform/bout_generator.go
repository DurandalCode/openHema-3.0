package platform

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	boutdomain "github.com/hema/server/modules/bout/domain"
	boutrepo "github.com/hema/server/modules/bout/repo"
	boutservice "github.com/hema/server/modules/bout/service"
	pooldomain "github.com/hema/server/modules/pool/domain"
)

// PoolBoutGenerator адаптирует bout-сервис к порту
// pool/domain.BoutGenerator (межмодульная зависимость через API модуля
// bout, а не через прямой доступ к его PG-схеме, ADR 0002). Направление
// зависимости — только pool → bout (спека 0010 «Обзор решения»); bout сам
// ни от кого не зависит.
type PoolBoutGenerator struct {
	svc *boutservice.Service
}

// NewPoolBoutGenerator создаёт адаптер поверх пула соединений, строя
// собственный bout-сервис (не переиспользует HTTP-инстанс из
// bout.Register — по образцу PoolActiveFightersProvider).
func NewPoolBoutGenerator(pool *pgxpool.Pool) *PoolBoutGenerator {
	r := boutrepo.New(pool)
	return &PoolBoutGenerator{svc: boutservice.New(r)}
}

var _ pooldomain.BoutGenerator = (*PoolBoutGenerator)(nil)

// GenerateForNomination формирует бои каждого пула номинации (round-robin,
// FR-3) на переходе раскладки draft → ready.
func (g *PoolBoutGenerator) GenerateForNomination(ctx context.Context, nominationID string, pools []pooldomain.BoutPoolInput) error {
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
// ready → draft.
func (g *PoolBoutGenerator) ClearForNomination(ctx context.Context, nominationID string) error {
	return g.svc.ClearForNomination(ctx, nominationID)
}
