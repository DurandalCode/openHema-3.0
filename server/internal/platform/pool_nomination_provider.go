package platform

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	nomdomain "github.com/hema/server/modules/nomination/domain"
	nomrepo "github.com/hema/server/modules/nomination/repo"
	nomservice "github.com/hema/server/modules/nomination/service"
	pooldomain "github.com/hema/server/modules/pool/domain"
)

// PoolNominationProvider адаптирует nomination-сервис к порту
// pool/domain.NominationProvider (межмодульная зависимость через API модуля
// nomination, а не через прямой доступ к его PG-схеме, ADR 0002).
// Направление зависимости — только pool → nomination. Used для резолва
// имени номинации пула на экране арены (FR-9: список «готовых пулов для
// постановки» собран из разных номинаций — без имени они неразличимы).
type PoolNominationProvider struct {
	svc *nomservice.Service
}

// NewPoolNominationProvider создаёт адаптер поверх пула соединений.
// nomination-сервису нужен ActiveTournamentProvider для собственных
// mutating-операций (Create/Update/Reorder), но Get/List — нет; однако
// конструктор единый, передаём как есть.
func NewPoolNominationProvider(pool *pgxpool.Pool, tournaments nomdomain.ActiveTournamentProvider) *PoolNominationProvider {
	r := nomrepo.New(pool)
	return &PoolNominationProvider{svc: nomservice.New(r, tournaments)}
}

var _ pooldomain.NominationProvider = (*PoolNominationProvider)(nil)

// NominationsByIDs — батч-резолв названий номинаций (для обогащения пулов
// именем номинации, спека 0011 FR-9). nomination-сервис не даёт батч-чтения
// по списку id — последовательные Get по уже дедуплицированному списку
// (повторяет resolveArenaNames в pool). Отсутствующие/ошибочные id просто
// не попадают в карту.
func (p *PoolNominationProvider) NominationsByIDs(ctx context.Context, ids []string) (map[string]pooldomain.NominationRef, error) {
	out := make(map[string]pooldomain.NominationRef, len(ids))
	for _, id := range ids {
		n, err := p.svc.Get(ctx, id)
		if err != nil {
			continue
		}
		out[id] = pooldomain.NominationRef{ID: n.ID, Title: n.Title}
	}
	return out, nil
}