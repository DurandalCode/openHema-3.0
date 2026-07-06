// Package platform — composition root: собирает зависимости и HTTP-мультиплексор
// из всех модулей монолита.
package platform

import (
	"context"
	"log/slog"
	"net/http"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/modules/auth"
	"github.com/hema/server/pkg/config"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
	"github.com/hema/server/pkg/pgxutil"
)

// App — собранное приложение: HTTP-хендлер и ресурсы для graceful shutdown.
type App struct {
	Handler http.Handler
	pool    *pgxpool.Pool
}

// New строит приложение: пул БД, менеджер токенов, регистрация модулей.
// Также запускает бутстрап первого админа из env-кредов (идемпотентен).
func New(ctx context.Context, cfg config.Config, log *slog.Logger) (*App, error) {
	pool, err := pgxutil.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}

	tokens := jwt.NewManager(
		cfg.JWTAccessSecret,
		cfg.JWTRefreshSecret,
		cfg.JWTAccessTTL,
		cfg.JWTRefreshTTL,
	)

	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(
			connectutil.Recovery(log),
			connectutil.Logging(log),
			connectutil.Auth(tokens),
		),
	}
	adminOpts := []connect.HandlerOption{
		connect.WithInterceptors(connectutil.RequireAdmin()),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// ── Регистрация модулей монолита ─────────────────────────────
	deps := auth.Deps{Pool: pool, Tokens: tokens}
	auth.Register(mux, deps, baseOpts, adminOpts)

	// ── Бутстрап первого админа (до начала приёма запросов) ───────
	auth.Bootstrap(ctx, deps, log,
		cfg.BootstrapAdminEmail,
		cfg.BootstrapAdminPassword,
		cfg.BootstrapAdminDisplayName,
	)

	return &App{Handler: mux, pool: pool}, nil
}

// Close освобождает ресурсы приложения.
func (a *App) Close() {
	if a.pool != nil {
		a.pool.Close()
	}
}
