// Package arena — bounded context площадок (ристалищ/арен) турнира (модуль
// монолита).
//
// Модуль экспортирует единую точку входа Register, которую вызывает
// composition root (internal/platform). Единственный сервис
// ArenaAdminService монтируется под RequireAdmin — домен админский,
// публичного чтения в этом инкременте нет (появится вместе с боями/
// расписанием, см. spec 0008 «Вне скоупа»).
package arena

import (
	"net/http"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/arena/api"
	"github.com/hema/server/modules/arena/domain"
	"github.com/hema/server/modules/arena/repo"
	"github.com/hema/server/modules/arena/service"
)

// Deps — явные зависимости модуля arena (DI через конструктор).
// Tournaments — межмодульная зависимость (порт, не прямой доступ к схеме
// tournament); см. tournament.NewActiveTournamentIDProvider.
type Deps struct {
	Pool        *pgxpool.Pool
	Tournaments domain.ActiveTournamentProvider
}

// Register монтирует Connect-хендлеры модуля на переданный mux.
// baseOpts применяются к сервису (recovery/logging/auth);
// adminOpts дополнительно накладываются на ArenaAdminService (require-admin).
func Register(mux *http.ServeMux, deps Deps, baseOpts []connect.HandlerOption, adminOpts []connect.HandlerOption) {
	r := repo.New(deps.Pool)
	svc := service.New(r, deps.Tournaments)

	adminHandler := api.NewAdminHandler(svc)

	adminAll := make([]connect.HandlerOption, 0, len(baseOpts)+len(adminOpts))
	adminAll = append(adminAll, baseOpts...)
	adminAll = append(adminAll, adminOpts...)
	adminPath, adminH := hemav1connect.NewArenaAdminServiceHandler(adminHandler, adminAll...)
	mux.Handle(adminPath, adminH)
}