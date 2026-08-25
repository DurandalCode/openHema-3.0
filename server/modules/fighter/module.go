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
// доступ к чужим схемам, ADR 0002). Seeding/Stage/Bout/Accounts (спека 0040)
// — новые межмодульные порты сценариев 2/3: реализации-адаптеры строит
// composition root (internal/platform, join-волна T30) поверх модулей
// stage/bout/auth — этот модуль их не импортирует напрямую. Допускают nil
// (см. service.Service) до тех пор, пока wiring их не подключит.
type Deps struct {
	Pool        *pgxpool.Pool
	Nominations domain.NominationProvider
	Tournaments domain.ActiveTournamentProvider
	Seeding     domain.SeedingWithdrawalSink
	Stage       domain.StageRepointer
	Bout        domain.BoutRepointer
	Accounts    domain.AccountDirectory
}

// Register монтирует Connect-хендлеры модуля на переданный mux. baseOpts
// применяются ко всем трём сервисам (recovery/logging/auth); adminOpts
// дополнительно накладываются на FighterAdminService (require-admin).
// FighterPublicService остаётся публичным (см. publicProcedures интерсептора
// Auth). FighterService (GetMyFighter, спека 0038/ADR 0016) требует
// access-токен — только baseOpts, без adminOpts: авторизация владельца
// проверяется на уровне CallerID внутри хендлера, не роли.
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

	meHandler := api.NewMeHandler(svc)
	mePath, meH := hemav1connect.NewFighterServiceHandler(meHandler, baseOpts...)
	mux.Handle(mePath, meH)
}

func newService(deps Deps) *service.Service {
	r := repo.New(deps.Pool)
	return service.New(r, deps.Nominations, deps.Tournaments, deps.Seeding, deps.Stage, deps.Bout, deps.Accounts)
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
	// tournaments/seeding/stage/bout/accounts — nil: RegisterFromApplication
	// не резолвит активный турнир (tournament_id всегда приходит явно из
	// заявки) и не затрагивает withdraw/return/merge/обогащение ростера.
	return &RegistrationSink{svc: service.New(r, nominations, nil, nil, nil, nil, nil)}
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
