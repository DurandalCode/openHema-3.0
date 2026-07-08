// Package tournament — bounded context профиля турнира (модуль монолита).
//
// Модуль экспортирует единую точку входа Register, которую вызывает composition
// root (internal/platform). Публичный TournamentService монтируется без
// RequireAdmin (GetActiveTournament доступен без access-токена — см.
// publicProcedures интерсептора Auth); TournamentAdminService — под RequireAdmin.
package tournament

import (
	"net/http"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/tournament/api"
	"github.com/hema/server/modules/tournament/repo"
	"github.com/hema/server/modules/tournament/service"
)

// Deps — явные зависимости модуля tournament (DI через конструктор).
type Deps struct {
	Pool *pgxpool.Pool
}

// Register монтирует Connect-хендлеры модуля на переданный mux.
// baseOpts применяются к обоим сервисам (recovery/logging/auth);
// adminOpts дополнительно накладываются на TournamentAdminService
// (require-admin).
func Register(mux *http.ServeMux, deps Deps, baseOpts []connect.HandlerOption, adminOpts []connect.HandlerOption) {
	r := repo.New(deps.Pool)
	svc := service.New(r)

	pubHandler := api.NewHandler(svc)
	adminHandler := api.NewAdminHandler(svc)

	pubPath, pubH := hemav1connect.NewTournamentServiceHandler(pubHandler, baseOpts...)
	mux.Handle(pubPath, pubH)

	adminAll := make([]connect.HandlerOption, 0, len(baseOpts)+len(adminOpts))
	adminAll = append(adminAll, baseOpts...)
	adminAll = append(adminAll, adminOpts...)
	adminPath, adminH := hemav1connect.NewTournamentAdminServiceHandler(adminHandler, adminAll...)
	mux.Handle(adminPath, adminH)
}