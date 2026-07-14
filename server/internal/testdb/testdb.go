// Package testdb предоставляет интеграционный хелпер для поднятия PostgreSQL
// в Docker (testcontainers-go) и применения миграций всех серверных модулей
// goose Go-API с per-module таблицей версий. См. ADR 0010.
//
// Хелпер используется только в тестах с build-tag `integration`. Локальный
// цикл разработки (`go test ./...`) не зависит от Docker —
// `*_integration_test.go` не входят в дефолтный набор.
package testdb

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver for goose.
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	tcp "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// moduleMigration — модуль сервера со своей PG-схемой и директорией миграций.
// Добавить сюда новый модуль, когда он появляется (см. AGENTS.md).
var moduleMigrations = []struct {
	name string // имя схемы/модуля (для таблицы версий goose)
	dir  string // абсолютный путь к директории migrations
}{
	{"auth", moduleDir("auth")}, {"tournament", moduleDir("tournament")},
	{"nomination", moduleDir("nomination")},
	{"application", moduleDir("application")},
	{"fighter", moduleDir("fighter")},
	{"arena", moduleDir("arena")},
	{"pool", moduleDir("pool")},
}

// Postgres поднимает PostgreSQL в Docker (testcontainers), применяет миграции
// всех модулей и возвращает pgxpool готовый к использованию в тестах. Cleanup
// (terminate) вешается на t.Cleanup. Требует установленный Docker на машине.
//
// Логика миграций идентична `make migrate` и `docker-compose.yml`:
// goose Go-API с per-module tablesны `goose_db_version_<module>`, что
// позволяет одинаково названным `00001_init.sql` в разных модулях не
// silent-skip'ать друг друга (ADR 0010).
func Postgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	container, err := tcp.Run(ctx,
		"postgres:16-alpine",
		tcp.WithDatabase("hema_test"),
		tcp.WithUsername("hema"),
		tcp.WithPassword("hema-test-password"),
		testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").
			WithOccurrence(2).WithStartupTimeout(30*time.Second)),
	)
	if err != nil {
		t.Fatalf("testdb: start postgres container: %v", err)
	}
	t.Cleanup(func() {
		_ = container.Terminate(ctx)
	})

	connStr, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("testdb: connection string: %v", err)
	}

	// Apply migrations via goose (database/sql + pgx stdlib driver), one
	// filesystem per module with its own version table.
	if err := applyMigrations(ctx, connStr); err != nil {
		t.Fatalf("testdb: apply migrations: %v", err)
	}

	// Proper pgxpool for client code.
	cfg, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		t.Fatalf("testdb: parse config: %v", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("testdb: new pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func applyMigrations(ctx context.Context, connStr string) error {
	db, err := sql.Open("pgx", connStr)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer db.Close()

	for _, m := range moduleMigrations {
		provider, err := goose.NewProvider(
			goose.DialectPostgres, db, os.DirFS(m.dir),
			goose.WithTableName("goose_db_version_"+m.name),
		)
		if err != nil {
			return fmt.Errorf("goose provider for module %q: %w", m.name, err)
		}
		if _, err := provider.Up(ctx); err != nil {
			return fmt.Errorf("goose up module %q: %w", m.name, err)
		}
	}
	return nil
}

// moduleDir возвращает абсолютный путь к директории migrations модуля.
// Берётся относительно исходника testdb (server/internal/testdb).
func moduleDir(name string) string {
	_, file, _, _ := runtime.Caller(0) // server/internal/testdb/testdb.go
	root := filepath.Dir(filepath.Dir(filepath.Dir(file))) // server
	return filepath.Join(root, "modules", name, "migrations")
}