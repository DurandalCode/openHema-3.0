// Package bout — bounded context боёв, сформированных внутри пулов номинации
// (спека 0010).
//
// Модуль экспортирует единую точку входа Register, которую вызывает
// composition root (internal/platform). BoutAdminService монтируется под
// RequireAdmin (FR-8); BoutPublicService (спека 0011, FR-11) — тот же
// read-хендлер, смонтированный под baseOpts без admin-опций (публичное
// чтение боёв номинации). Домен/сервис/репо этой спекой не затронуты — bout
// по-прежнему ни от кого не зависит (никаких межмодульных портов); pool
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

// Register монтирует Connect-хендлеры модуля на переданный mux. baseOpts
// применяются ко всем сервисам (recovery/logging/auth); adminOpts
// дополнительно накладываются на BoutAdminService (require-admin).
// BoutPublicService — только baseOpts, без adminOpts (публичный доступ);
// оба сервиса используют один и тот же handler-объект (api.AdminHandler
// реализует оба интерфейса).
func Register(mux *http.ServeMux, deps Deps, baseOpts []connect.HandlerOption, adminOpts []connect.HandlerOption) {
	r := repo.New(deps.Pool)
	svc := service.New(r)

	handler := api.NewAdminHandler(svc)

	adminAll := make([]connect.HandlerOption, 0, len(baseOpts)+len(adminOpts))
	adminAll = append(adminAll, baseOpts...)
	adminAll = append(adminAll, adminOpts...)
	adminPath, adminH := hemav1connect.NewBoutAdminServiceHandler(handler, adminAll...)
	mux.Handle(adminPath, adminH)

	publicPath, publicH := hemav1connect.NewBoutPublicServiceHandler(handler, baseOpts...)
	mux.Handle(publicPath, publicH)
}
