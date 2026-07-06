// Package auth — bounded context аутентификации (модуль монолита).
//
// Модуль экспортирует единую точку входа Register, которую вызывает как
// монолит (cmd/server), так и потенциальный микросервис (cmd/auth).
package auth

import (
	"context"
	"log/slog"
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
// baseOpts применяются к обоим сервисам (recovery/logging/auth);
// adminOpts дополнительно накладываются на AdminService (require-admin).
func Register(mux *http.ServeMux, deps Deps, baseOpts []connect.HandlerOption, adminOpts []connect.HandlerOption) {
	r := repo.New(deps.Pool)
	svc := service.New(r, deps.Tokens)

	authHandler := api.NewHandler(svc)
	adminHandler := api.NewAdminHandler(svc)

	authPath, authH := hemav1connect.NewAuthServiceHandler(authHandler, baseOpts...)
	mux.Handle(authPath, authH)

	adminAll := make([]connect.HandlerOption, 0, len(baseOpts)+len(adminOpts))
	adminAll = append(adminAll, baseOpts...)
	adminAll = append(adminAll, adminOpts...)
	adminPath, adminH := hemav1connect.NewAdminServiceHandler(adminHandler, adminAll...)
	mux.Handle(adminPath, adminH)
}

// Bootstrap создаёт первого админа из переданных кредов, если в системе
// ещё нет ни одного администратора. Идемпотентен. Логирует результат.
// Вызывается composition root'ом (internal/platform) при старте сервера.
func Bootstrap(ctx context.Context, deps Deps, log *slog.Logger, email, password, displayName string) {
	r := repo.New(deps.Pool)
	svc := service.New(r, deps.Tokens)

	created, err := svc.BootstrapAdmin(ctx, email, password, displayName)
	switch {
	case err != nil:
		log.Error("bootstrap admin failed", "err", err)
	case created:
		log.Info("bootstrap admin created", "email", email)
	default:
		log.Info("bootstrap admin skipped", "reason", "admins exist or no credentials")
	}
}
