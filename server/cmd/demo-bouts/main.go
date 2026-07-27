// Command demo-bouts — тот же исходный набор данных, что и `make demo`/
// `make demo-registered` (savepoint «demo», доведённый до регистрации
// бойцов), но доведённый ещё на шаг глубже во флоу турнира: пулы
// сформированы (спека 0009), раскладка зафиксирована — бои сгенерированы
// (спека 0010), и три площадки реально ведут турнирный день в разных фазах
// (спеки 0011/0013):
//   - Ристалище 1 — пул целиком проведён (все бои завершены, видны исходы);
//   - Ристалище 2 — пул «идёт»: первый бой начат и несёт реальный
//     незавершённый счёт — открой публичный экран его номинации
//     (`/nominations/{id}`), чтобы увидеть живой push (спека 0014);
//   - Ристалище 3 — пул поставлен, но ещё не начат («готовится к запуску»).
//
// Удобно для проверки экрана ведения боёв (`/admin/arenas/{id}`) и
// публичного живого экрана номинации без ручного прокликивания раскладки.
//
// Идемпотентен (как cmd/demo и cmd/demo-registered): очищает demo-сущности
// (включая ранее сформированные пулы/бои) и создаёт заново. НЕ предназначен
// для прод-окружения.
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
	// Тот же сид (rand seed 42), что и cmd/demo/cmd/demo-registered —
	// savepoint «demo-bouts» начинается с той же самой выборки заявок.
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

	pools, err := demoseed.SeedPoolsAndBouts(
		ctx, svc.Pool, svc.Fighter,
		result.TournamentID, result.NominationIDs, result.ArenaIDs,
		organizerID, rng,
	)
	if err != nil {
		log.Error("seed pools and bouts", "err", err)
		os.Exit(1)
	}
	log.Info("сформировали пулы и бои",
		"nominations_with_pools", len(pools.NominationIDs),
		"finished_pool", pools.FinishedPoolID,
		"running_pool", pools.RunningPoolID,
		"preparing_pool", pools.PreparingPoolID,
	)

	fmt.Println()
	fmt.Println("Готово: пулы сформированы, три площадки ведут турнирный день.")
	fmt.Println("Тестовые учётки (пароль одинаковый для всей группы):")
	if cfg.BootstrapAdminEmail != "" && cfg.BootstrapAdminPassword != "" {
		fmt.Printf("  bootstrap-админ: %s (пароль: %s)\n", cfg.BootstrapAdminEmail, cfg.BootstrapAdminPassword)
	}
	fmt.Printf("  админы:     %s (пароль: %s)\n", demoseed.JoinEmails(demoseed.Admins), demoseed.AdminPassword)
	fmt.Printf("  заявители:  %s (пароль: %s)\n", demoseed.JoinEmails(demoseed.Fighters), demoseed.FighterPassword)
	fmt.Println()
	if pools.RunningNominationID != "" {
		fmt.Printf("Живой публичный экран (бой идёт прямо сейчас): /nominations/%s\n", pools.RunningNominationID)
	}
	if pools.RunningArenaID != "" {
		fmt.Printf("Ведение этого боя (admin):                     /admin/arenas/%s\n", pools.RunningArenaID)
	}
}
