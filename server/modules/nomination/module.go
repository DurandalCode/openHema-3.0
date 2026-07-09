// Package nomination — bounded context номинаций турнира (модуль монолита).
//
// Модуль экспортирует единую точку входа Register, которую вызывает composition
// root (internal/platform). Публичный NominationService монтируется без
// RequireAdmin (ListNominations/GetNomination доступны без access-токена —
// см. publicProcedures интерсептора Auth); NominationAdminService — под
// RequireAdmin.
package nomination

import (
	"net/http"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/nomination/api"
	"github.com/hema/server/modules/nomination/domain"
	"github.com/hema/server/modules/nomination/repo"
	"github.com/hema/server/modules/nomination/service"
)

// Deps — явные зависимости модуля nomination (DI через конструктор).
// Tournaments — межмодульная зависимость (порт, не прямой доступ к схеме
// tournament); см. tournament.NewActiveTournamentIDProvider.
type Deps struct {
	Pool        *pgxpool.Pool
	Tournaments domain.ActiveTournamentProvider
}

// Register монтирует Connect-хендлеры модуля на переданный mux.
// baseOpts применяются к обоим сервисам (recovery/logging/auth);
// adminOpts дополнительно накладываются на NominationAdminService
// (require-admin).
func Register(mux *http.ServeMux, deps Deps, baseOpts []connect.HandlerOption, adminOpts []connect.HandlerOption) {
	r := repo.New(deps.Pool)
	svc := service.New(r, deps.Tournaments)

	pubHandler := api.NewHandler(svc)
	adminHandler := api.NewAdminHandler(svc)

	pubPath, pubH := hemav1connect.NewNominationServiceHandler(pubHandler, baseOpts...)
	mux.Handle(pubPath, pubH)

	adminAll := make([]connect.HandlerOption, 0, len(baseOpts)+len(adminOpts))
	adminAll = append(adminAll, baseOpts...)
	adminAll = append(adminAll, adminOpts...)
	adminPath, adminH := hemav1connect.NewNominationAdminServiceHandler(adminHandler, adminAll...)
	mux.Handle(adminPath, adminH)
}
