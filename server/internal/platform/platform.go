// Package platform — composition root: собирает зависимости и HTTP-мультиплексор
// из всех модулей монолита.
package platform

import (
	"context"
	"log/slog"
	"net/http"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/modules/application"
	"github.com/hema/server/modules/arena"
	"github.com/hema/server/modules/auth"
	"github.com/hema/server/modules/auth/mailer"
	boutmodule "github.com/hema/server/modules/bout"
	"github.com/hema/server/modules/fighter"
	"github.com/hema/server/modules/nomination"
	stagemodule "github.com/hema/server/modules/stage"
	"github.com/hema/server/modules/tournament"
	"github.com/hema/server/pkg/config"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
	"github.com/hema/server/pkg/livebus"
	"github.com/hema/server/pkg/mail"
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

	// Почта восстановления пароля (спека 0037, решение 3): SMTP при
	// настроенном хосте, иначе лог-адаптер (NFR-3) — dev/тесты работают без
	// внешнего почтового сервера.
	var sender mail.Sender
	if cfg.SMTPHost != "" {
		sender = mail.NewSMTP(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword, cfg.SMTPFrom)
	} else {
		sender = mail.NewLogger(log)
		log.Warn("SMTP_HOST not set: password reset emails are logged, not delivered")
	}

	deps := auth.Deps{
		Pool:             pool,
		Tokens:           tokens,
		Mailer:           mailer.New(sender, cfg.PasswordResetTTL),
		PublicAppURL:     cfg.PublicAppURL,
		PasswordResetTTL: cfg.PasswordResetTTL,
	}
	auth.Register(mux, deps, baseOpts, adminOpts)

	tournamentDeps := tournament.Deps{Pool: pool}
	tournament.Register(mux, tournamentDeps, baseOpts, adminOpts)

	activeTournaments := tournament.NewActiveTournamentIDProvider(pool)

	// displayNames — резолв отображаемых имён пользователей (модуль auth,
	// ADR 0002): один объект, переиспользуемый application (спека 0025),
	// stage (спека 0033, журнал боёв площадки, приём 0025) и fighter (спека
	// 0040, обратная проекция «учётка↔боец», FR-8).
	displayNames := auth.NewDisplayNameProvider(pool, tokens)

	// Межмодульные адаптеры спеки 0040 (сценарии 1-3): гейт на удаление
	// номинации, восстановление посева при возврате бойца, репойнт при
	// слиянии дублей. См. domain_gaps_adapters.go.
	poolOccupancy, seedingSink, stageRepointer := NewStageCrossModuleAdapters(pool)
	boutOccupancy, boutRepointer := NewBoutCrossModuleAdapters(pool)

	// Pools/Bouts — гейт на удаление номинации (спека 0040, сценарий 1,
	// FR-1).
	nominationDeps := nomination.Deps{
		Pool:        pool,
		Tournaments: activeTournaments,
		Pools:       poolOccupancy,
		Bouts:       boutOccupancy,
	}
	nomination.Register(mux, nominationDeps, baseOpts, adminOpts)

	fighterNominations := NewFighterNominationProvider(pool, activeTournaments)
	// Seeding/Stage/Bout — восстановление посева при возврате бойца
	// (сценарий 2) и репойнт при слиянии дублей (сценарий 3). Accounts —
	// обратная проекция «учётка↔боец» (сценарий 3, FR-8/FR-9).
	fighterDeps := fighter.Deps{
		Pool:        pool,
		Nominations: fighterNominations,
		Tournaments: activeTournaments,
		Seeding:     seedingSink,
		Stage:       stageRepointer,
		Bout:        boutRepointer,
		Accounts:    displayNames,
	}
	fighter.Register(mux, fighterDeps, baseOpts, adminOpts)

	applicationDeps := application.Deps{
		Pool:        pool,
		Nominations: NewNominationInfoProvider(pool, activeTournaments),
		Users:       displayNames,
		Fighters:    fighter.NewRegistrationSink(pool, fighterNominations),
	}
	application.Register(mux, applicationDeps, baseOpts, adminOpts)

	arenaDeps := arena.Deps{
		Pool:        pool,
		Tournaments: activeTournaments,
	}
	arena.Register(mux, arenaDeps, baseOpts, adminOpts)

	boutDeps := boutmodule.Deps{Pool: pool}
	boutmodule.Register(mux, boutDeps, baseOpts, adminOpts)

	stageDeps := stagemodule.Deps{
		Pool:        pool,
		Fighters:    NewStageActiveFightersProvider(pool),
		Bouts:       NewStageBoutConductor(pool),
		Arenas:      NewStageArenaProvider(pool, activeTournaments),
		Nominations: NewStageNominationProvider(pool, activeTournaments),
		LiveBus:     NewStageLiveBus(livebus.New()),
		Users:       displayNames,
	}
	stagemodule.Register(mux, stageDeps, baseOpts, adminOpts)

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
