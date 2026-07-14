// Package pool — bounded context раскладки бойцов номинации по пулам
// (спека 0009).
//
// Модуль экспортирует единую точку входа Register, которую вызывает
// composition root (internal/platform). Единственный сервис
// PoolAdminService монтируется под RequireAdmin — публичного чтения нет
// (FR-13).
package pool

import (
	"net/http"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/pool/api"
	"github.com/hema/server/modules/pool/domain"
	"github.com/hema/server/modules/pool/repo"
	"github.com/hema/server/modules/pool/service"
)

// Deps — явные зависимости модуля pool (DI через конструктор). Fighters —
// межмодульная зависимость (порт, не прямой доступ к схеме fighter,
// ADR 0002); направление зависимости — только pool → fighter.
type Deps struct {
	Pool     *pgxpool.Pool
	Fighters domain.ActiveFightersProvider
}

// Register монтирует Connect-хендлер модуля на переданный mux. baseOpts
// применяются к сервису (recovery/logging/auth); adminOpts дополнительно
// накладываются на PoolAdminService (require-admin).
func Register(mux *http.ServeMux, deps Deps, baseOpts []connect.HandlerOption, adminOpts []connect.HandlerOption) {
	r := repo.New(deps.Pool)
	svc := service.New(r, deps.Fighters)

	adminHandler := api.NewAdminHandler(svc)

	adminAll := make([]connect.HandlerOption, 0, len(baseOpts)+len(adminOpts))
	adminAll = append(adminAll, baseOpts...)
	adminAll = append(adminAll, adminOpts...)
	adminPath, adminH := hemav1connect.NewPoolAdminServiceHandler(adminHandler, adminAll...)
	mux.Handle(adminPath, adminH)
}
