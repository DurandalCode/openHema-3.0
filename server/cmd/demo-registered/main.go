// Command demo-registered — тот же исходный набор данных, что и `make demo`
// (savepoint «demo»), но доведённый на шаг глубже во флоу турнира: каждая
// незавершённая заявка (кроме отозванных) доводится до терминального
// «Зарегистрирована», реально создавая бойцов через кроссдоменный эффект
// application → fighter (спека 0007). Удобно для проверки экрана
// /admin/fighters и публичного состава номинаций без ручного прокликивания
// сводного экрана заявок.
//
// Идемпотентен (как и cmd/demo): очищает demo-сущности и создаёт заново.
// НЕ предназначен для прод-окружения.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"math/rand"
	"os"

	"github.com/hema/server/internal/demoseed"
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
	// Тот же сид (rand seed 42), что и cmd/demo — savepoint «demo-registered»
	// начинается с той же самой выборки заявок, просто доводит её до конца.
	rng := rand.New(rand.NewSource(42))

	result, err := demoseed.Seed(ctx, svc, cfg, rng)
	if err != nil {
		log.Error("seed", "err", err)
		os.Exit(1)
	}
	log.Info("создали базовое состояние (как cmd/demo)",
		"admins", len(result.AdminIDs),
		"fighters", len(result.FighterUserIDs),
		"nominations", len(result.NominationIDs),
		"applications", result.Stats.Total,
	)

	organizerID := result.AdminIDs[0]
	advanced, err := demoseed.RegisterAll(ctx, svc.Application, organizerID, result.Applications)
	if err != nil {
		log.Error("register all", "err", err)
		os.Exit(1)
	}
	log.Info("довели заявки до регистрации",
		"registered_now", advanced.Registered,
		"already_terminal", advanced.AlreadyTerminal,
		"overflow_warnings", advanced.OverflowWarnings,
	)

	roster, err := svc.Fighter.ListRoster(ctx, result.TournamentID)
	if err != nil {
		log.Error("list roster", "err", err)
		os.Exit(1)
	}
	activeParticipations := 0
	for _, f := range roster {
		for range f.Participations {
			activeParticipations++
		}
	}
	log.Info("ростер бойцов турнира",
		"fighters", len(roster),
		"participations", activeParticipations,
	)

	fmt.Println()
	fmt.Println("Готово: все незавершённые заявки доведены до регистрации бойцов.")
	fmt.Println("Тестовые учётки (пароль одинаковый для всей группы):")
	if cfg.BootstrapAdminEmail != "" && cfg.BootstrapAdminPassword != "" {
		fmt.Printf("  bootstrap-админ: %s (пароль: %s)\n", cfg.BootstrapAdminEmail, cfg.BootstrapAdminPassword)
	}
	fmt.Printf("  админы:     %s (пароль: %s)\n", demoseed.JoinEmails(demoseed.Admins), demoseed.AdminPassword)
	fmt.Printf("  заявители:  %s (пароль: %s)\n", demoseed.JoinEmails(demoseed.Fighters), demoseed.FighterPassword)
}
