// Package application — bounded context флоу подачи заявки бойца (модуль
// монолита, event-sourced, ADR 0011).
//
// Модуль экспортирует единую точку входа Register, которую вызывает
// composition root (internal/platform). ApplicationService (заявитель) и
// ApplicationAdminService (секретарь/admin) требуют auth; ApplicationPublicService
// (стартовый лист номинации) публичен без токена (см. publicProcedures
// интерсептора Auth).
package application

import (
	"net/http"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/application/api"
	"github.com/hema/server/modules/application/domain"
	"github.com/hema/server/modules/application/repo"
	"github.com/hema/server/modules/application/service"
)

// Deps — явные зависимости модуля application (DI через конструктор).
// Nominations, Users и Fighters — межмодульные зависимости (порты, не прямой
// доступ к чужим схемам, ADR 0002). Fighters — кроссдоменный эффект
// регистрации заявки в домен бойцов (спека 0007).
type Deps struct {
	Pool        *pgxpool.Pool
	Nominations domain.NominationProvider
	Users       domain.UserProvider
	Fighters    domain.FighterRegistrationSink
}

// Register монтирует Connect-хендлеры модуля на переданный mux. baseOpts
// применяются ко всем трём сервисам (recovery/logging/auth); adminOpts
// дополнительно накладываются на ApplicationAdminService (require-admin).
func Register(mux *http.ServeMux, deps Deps, baseOpts []connect.HandlerOption, adminOpts []connect.HandlerOption) {
	r := repo.New(deps.Pool)
	svc := service.New(r, deps.Nominations, deps.Users, deps.Fighters)

	handler := api.NewHandler(svc)
	adminHandler := api.NewAdminHandler(svc)
	publicHandler := api.NewPublicHandler(svc)

	path, h := hemav1connect.NewApplicationServiceHandler(handler, baseOpts...)
	mux.Handle(path, h)

	adminAll := make([]connect.HandlerOption, 0, len(baseOpts)+len(adminOpts))
	adminAll = append(adminAll, baseOpts...)
	adminAll = append(adminAll, adminOpts...)
	adminPath, adminH := hemav1connect.NewApplicationAdminServiceHandler(adminHandler, adminAll...)
	mux.Handle(adminPath, adminH)

	pubPath, pubH := hemav1connect.NewApplicationPublicServiceHandler(publicHandler, baseOpts...)
	mux.Handle(pubPath, pubH)
}
