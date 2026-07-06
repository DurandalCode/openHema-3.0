// Command server — точка входа монолита: поднимает HTTP/2 (h2c) сервер со
// всеми зарегистрированными модулями.
package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/hema/server/internal/platform"
	"github.com/hema/server/pkg/config"
	"github.com/hema/server/pkg/logger"
)

func main() {
	log := logger.New()

	cfg, err := config.Load()
	if err != nil {
		log.Error("load config", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	app, err := platform.New(ctx, cfg, log)
	if err != nil {
		log.Error("build app", "err", err)
		os.Exit(1)
	}
	defer app.Close()

	// h2c: HTTP/2 без TLS (Connect/gRPC поверх cleartext внутри доверенной сети).
	srv := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           h2c.NewHandler(app.Handler, &http2.Server{}),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Info("server listening", "addr", cfg.Addr())
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server error", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	log.Info("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("shutdown", "err", err)
	}
}
