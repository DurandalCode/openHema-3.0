// Package bout — bounded context боёв, сформированных внутри пулов номинации
// (спека 0010).
//
// Модуль экспортирует единую точку входа Register, которую вызывает
// composition root (internal/platform). Единственный сервис
// BoutAdminService монтируется под RequireAdmin — публичного чтения нет
// (FR-8). bout ни от кого не зависит (никаких межмодульных портов) — pool
// вызывает генерацию/очистку боёв через собственный порт
// pool/domain.BoutGenerator, реализованный адаптером в internal/platform
// (plan.md «Обзор решения»).
package bout

import (
	"net/http"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/bout/api"
	"github.com/hema/server/modules/bout/repo"
	"github.com/hema/server/modules/bout/service"
)

// Deps — явные зависимости модуля bout (DI через конструктор).
type Deps struct {
	Pool *pgxpool.Pool
}

// Register монтирует Connect-хендлер модуля на переданный mux. baseOpts
// применяются к сервису (recovery/logging/auth); adminOpts дополнительно
// накладываются на BoutAdminService (require-admin).
func Register(mux *http.ServeMux, deps Deps, baseOpts []connect.HandlerOption, adminOpts []connect.HandlerOption) {
	r := repo.New(deps.Pool)
	svc := service.New(r)

	adminHandler := api.NewAdminHandler(svc)

	adminAll := make([]connect.HandlerOption, 0, len(baseOpts)+len(adminOpts))
	adminAll = append(adminAll, baseOpts...)
	adminAll = append(adminAll, adminOpts...)
	adminPath, adminH := hemav1connect.NewBoutAdminServiceHandler(adminHandler, adminAll...)
	mux.Handle(adminPath, adminH)
}
