// Package fighter — bounded context ростера бойцов турнира (спека 0007).
//
// Модуль экспортирует Register (точка входа для composition root,
// internal/platform) и NewRegistrationSink — адаптер, которым модуль
// application уведомляет о регистрации заявки (кроссдоменный эффект,
// ADR 0002). Sink синхронный in-process вызов: событийной шины пока нет.
package fighter

import (
	"context"
	"net/http"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/gen/hema/v1/hemav1connect"
	appdomain "github.com/hema/server/modules/application/domain"
	"github.com/hema/server/modules/fighter/api"
	"github.com/hema/server/modules/fighter/domain"
	"github.com/hema/server/modules/fighter/repo"
	"github.com/hema/server/modules/fighter/service"
)

// Deps — явные зависимости модуля fighter (DI через конструктор).
// Nominations и Tournaments — межмодульные зависимости (порты, не прямой
// доступ к чужим схемам, ADR 0002).
type Deps struct {
	Pool        *pgxpool.Pool
	Nominations domain.NominationProvider
	Tournaments domain.ActiveTournamentProvider
}

// Register монтирует Connect-хендлеры модуля на переданный mux. baseOpts
// применяются к обоим сервисам (recovery/logging/auth); adminOpts
// дополнительно накладываются на FighterAdminService (require-admin).
// FighterPublicService остаётся публичным (см. publicProcedures интерсептора
// Auth).
func Register(mux *http.ServeMux, deps Deps, baseOpts []connect.HandlerOption, adminOpts []connect.HandlerOption) {
	svc := newService(deps)

	adminHandler := api.NewHandler(svc)
	publicHandler := api.NewPublicHandler(svc)

	adminAll := make([]connect.HandlerOption, 0, len(baseOpts)+len(adminOpts))
	adminAll = append(adminAll, baseOpts...)
	adminAll = append(adminAll, adminOpts...)
	adminPath, adminH := hemav1connect.NewFighterAdminServiceHandler(adminHandler, adminAll...)
	mux.Handle(adminPath, adminH)

	pubPath, pubH := hemav1connect.NewFighterPublicServiceHandler(publicHandler, baseOpts...)
	mux.Handle(pubPath, pubH)
}

func newService(deps Deps) *service.Service {
	r := repo.New(deps.Pool)
	return service.New(r, deps.Nominations, deps.Tournaments)
}

// RegistrationSink адаптирует модуль fighter к порту
// application/domain.FighterRegistrationSink: кроссдоменный эффект
// регистрации заявки (application → fighter). Не использует
// ActiveTournamentProvider — RegisterFromApplication всегда получает
// tournament_id явно из заявки.
type RegistrationSink struct {
	svc *service.Service
}

// NewRegistrationSink создаёт sink-адаптер поверх пула соединений.
func NewRegistrationSink(pool *pgxpool.Pool, nominations domain.NominationProvider) *RegistrationSink {
	r := repo.New(pool)
	return &RegistrationSink{svc: service.New(r, nominations, nil)}
}

var _ appdomain.FighterRegistrationSink = (*RegistrationSink)(nil)

// OnRegistered создаёт/дополняет бойца по факту регистрации заявки.
// Дедуплицирует по (tournament_id, origin_user_id) — см. спека 0007, FR-5.
func (s *RegistrationSink) OnRegistered(ctx context.Context, in appdomain.RegisteredFighter) error {
	_, err := s.svc.RegisterFromApplication(ctx, service.RegistrationInput{
		TournamentID: in.TournamentID,
		NominationID: in.NominationID,
		OriginUserID: in.OriginUserID,
		Name:         in.Name,
		Club:         in.Club,
	})
	return err
}
