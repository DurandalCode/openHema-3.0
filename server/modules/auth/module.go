// Package auth — bounded context аутентификации (модуль монолита).
//
// Модуль экспортирует единую точку входа Register, которую вызывает как
// монолит (cmd/server), так и потенциальный микросервис (cmd/auth).
package auth

import (
	"net/http"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/auth/api"
	"github.com/hema/server/modules/auth/repo"
	"github.com/hema/server/modules/auth/service"
	"github.com/hema/server/pkg/jwt"
)

// Deps — явные зависимости модуля auth (DI через конструктор).
type Deps struct {
	Pool   *pgxpool.Pool
	Tokens *jwt.Manager
}

// Register монтирует Connect-хендлеры модуля на переданный mux.
func Register(mux *http.ServeMux, deps Deps, opts ...connect.HandlerOption) {
	r := repo.New(deps.Pool)
	svc := service.New(r, deps.Tokens)
	handler := api.NewHandler(svc)

	path, h := hemav1connect.NewAuthServiceHandler(handler, opts...)
	mux.Handle(path, h)
}
