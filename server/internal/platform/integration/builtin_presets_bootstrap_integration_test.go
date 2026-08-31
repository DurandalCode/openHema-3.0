//go:build integration

// Package integration — сквозной тест бутстрапа встроенного каталога
// пресетов формата (спека 0047, T14/AC-1): composition root на свежей
// (testcontainers) БД — то же, что «docker compose down -v && make dev» на
// чистой локальной БД, без побочного эффекта стирания дев-окружения
// разработчика. Проверяет, что stagemodule.BootstrapPresets, вызванный так
// же, как в platform.go (сразу после Register, до приёма запросов), даёт
// организатору непустую библиотеку форматов с первого запуска.
package integration

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/internal/platform"
	"github.com/hema/server/internal/testdb"
	stagemodule "github.com/hema/server/modules/stage"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
	"github.com/hema/server/pkg/livebus"
)

// TestIntegration_BuiltinPresets_BootstrapOnFreshDatabase — AC-1: на чистой
// БД (свежая инсталляция) один вызов BootstrapPresets — тот же, что делает
// platform.go при старте сервера — наполняет библиотеку форматов каталогом
// целиком, без единого действия администратора.
func TestIntegration_BuiltinPresets_BootstrapOnFreshDatabase(t *testing.T) {
	pool := testdb.Postgres(t)

	tokens := jwt.NewManager("bootstrap-access-secret", "bootstrap-refresh-secret", 15*time.Minute, 720*time.Hour)
	baseOpts := []connect.HandlerOption{connect.WithInterceptors(connectutil.Auth(tokens))}
	adminOpts := []connect.HandlerOption{connect.WithInterceptors(connectutil.RequireAdmin())}

	mux := http.NewServeMux()
	stageDeps := stagemodule.Deps{
		Pool:    pool,
		LiveBus: platform.NewStageLiveBus(livebus.New()),
	}
	stagemodule.Register(mux, stageDeps, baseOpts, adminOpts)

	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	stagemodule.BootstrapPresets(context.Background(), stageDeps, log)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	client := hemav1connect.NewStageAdminServiceClient(server.Client(), server.URL)

	pair, err := tokens.Issue("00000000-0000-0000-0000-0000000000bb", "admin", "")
	if err != nil {
		t.Fatalf("issue admin token: %v", err)
	}

	req := connect.NewRequest(&hemav1.ListFormatPresetsRequest{})
	req.Header().Set("Authorization", "Bearer "+pair.Access)
	res, err := client.ListFormatPresets(context.Background(), req)
	if err != nil {
		t.Fatalf("ListFormatPresets: %v", err)
	}
	if got := len(res.Msg.Presets); got != 10 {
		t.Fatalf("expected 10 builtin presets on a fresh database, got %d", got)
	}
}
