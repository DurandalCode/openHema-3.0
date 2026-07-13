// Command demo наполняет БД реалистичными тестовыми данными для ручной
// проверки UX (make demo): пользователей разных ролей, номинации с разной
// вместимостью, заявки во всех статусах жизненного цикла, включая
// переполнение мягкого лимита номинации.
//
// Это savepoint «demo»: заявки остаются в разных статусах (в т.ч.
// незавершённых), чтобы демонстрировать сам флоу приёма заявок. Для
// savepoint «всё доведено до регистрации бойцов» — см. cmd/demo-registered
// (та же исходная выборка данных, доведённая до конца).
//
// Идемпотентен: перед заполнением очищает demo-сущности (пользователей,
// номинации, заявки, бойцов) и заново их создаёт — активный турнир не
// пересоздаётся (он единственный, сид миграции), а обновляется.
// НЕ предназначен для прод-окружения — использует DATABASE_URL/JWT_* из
// того же .env, что и сервер.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"math/rand"
	"os"

	"github.com/hema/server/internal/demoseed"
	"github.com/hema/server/modules/application/domain"
	"github.com/hema/server/pkg/config"
	"github.com/hema/server/pkg/jwt"
	"github.com/hema/server/pkg/pgxutil"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		log.Error("load config", "err", err)
		os.Exit(1)
	}

	ctx := context.Background()
	pool, err := pgxutil.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("connect db", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := demoseed.Wipe(ctx, pool); err != nil {
		log.Error("wipe demo data", "err", err)
		os.Exit(1)
	}

	tokens := jwt.NewManager(cfg.JWTAccessSecret, cfg.JWTRefreshSecret, cfg.JWTAccessTTL, cfg.JWTRefreshTTL)
	svc := demoseed.NewServices(pool, tokens)
	rng := rand.New(rand.NewSource(42))

	result, err := demoseed.Seed(ctx, svc, cfg, rng)
	if err != nil {
		log.Error("seed", "err", err)
		os.Exit(1)
	}

	log.Info("создали админов", "count", len(result.AdminIDs))
	log.Info("создали заявителей", "count", len(result.FighterUserIDs))
	log.Info("обновили активный турнир", "id", result.TournamentID)
	log.Info("создали номинации", "count", len(result.NominationIDs))
	log.Info("создали заявки",
		"total", result.Stats.Total,
		"submitted", result.Stats.ByState[domain.StateSubmitted],
		"awaiting_payment_confirmation", result.Stats.ByState[domain.StateAwaitingPaymentConfirmation],
		"paid", result.Stats.ByState[domain.StatePaid],
		"registered", result.Stats.ByState[domain.StateRegistered],
		"withdrawn", result.Stats.ByState[domain.StateWithdrawn],
		"overflow_warnings", result.Stats.OverflowWarnings,
	)

	fmt.Println()
	fmt.Println("Готово. Тестовые учётки (пароль одинаковый для всей группы):")
	if cfg.BootstrapAdminEmail != "" && cfg.BootstrapAdminPassword != "" {
		fmt.Printf("  bootstrap-админ: %s (пароль: %s)\n", cfg.BootstrapAdminEmail, cfg.BootstrapAdminPassword)
	}
	fmt.Printf("  админы:     %s (пароль: %s)\n", demoseed.JoinEmails(demoseed.Admins), demoseed.AdminPassword)
	fmt.Printf("  заявители:  %s (пароль: %s)\n", demoseed.JoinEmails(demoseed.Fighters), demoseed.FighterPassword)
}
