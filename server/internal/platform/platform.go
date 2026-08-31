// Package platform — composition root: собирает зависимости и HTTP-мультиплексор
// из всех модулей монолита.
package platform

import (
	"context"
	"log/slog"
	"net/http"
	"time"

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
	"github.com/hema/server/pkg/filestore"
	"github.com/hema/server/pkg/filestore/local"
	"github.com/hema/server/pkg/jwt"
	"github.com/hema/server/pkg/livebus"
	"github.com/hema/server/pkg/mail"
	"github.com/hema/server/pkg/notify"
	"github.com/hema/server/pkg/pgxutil"
)

// rateLimitedProcedures — RPC, чувствительные к перебору и рассылке (спека
// 0042, FR-39): вход, регистрация, восстановление/смена пароля,
// подтверждение/смена email. Явный список — тот же приём, что
// publicProcedures у интерсептора Auth (auth_interceptor.go): безопаснее
// умолчания «лимитировать всё».
var rateLimitedProcedures = map[string]struct{}{
	"/hema.v1.AuthService/Login":                   {},
	"/hema.v1.AuthService/Register":                {},
	"/hema.v1.AuthService/RequestPasswordReset":    {},
	"/hema.v1.AuthService/ResetPassword":           {},
	"/hema.v1.AuthService/ResendEmailVerification": {},
	"/hema.v1.AuthService/RequestEmailChange":      {},
}

// App — собранное приложение: HTTP-хендлер и ресурсы для graceful shutdown.
type App struct {
	Handler    http.Handler
	pool       *pgxpool.Pool
	dispatcher *notify.Dispatcher
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

	// Ограничение частоты по адресу источника (спека 0042, FR-39) — общий
	// интерсептор для всех модулей, набор защищаемых процедур —
	// rateLimitedProcedures. RATE_LIMIT_TRUST_PROXY по умолчанию false:
	// без доверенного прокси перед сервером доверять X-Forwarded-For
	// небезопасно (NFR-6) — в docker-compose, где BFF единственный
	// сетевой клиент сервера (ADR 0001), включается явно.
	rateLimiter := connectutil.NewRateLimiter(cfg.RateLimitRequests, cfg.RateLimitWindow)
	go func() {
		ticker := time.NewTicker(cfg.RateLimitWindow)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				rateLimiter.Cleanup(now)
			}
		}
	}()

	baseOpts := []connect.HandlerOption{
		connect.WithInterceptors(
			connectutil.Recovery(log),
			connectutil.Logging(log),
			connectutil.Auth(tokens),
			rateLimiter.Interceptor(rateLimitedProcedures, cfg.RateLimitTrustProxy),
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
		log.Warn("SMTP_HOST not set: password reset/verification emails are logged, not delivered")
	}

	// Диспетчер почтовых уведомлений (спека 0042, FR-27/FR-28): очередь +
	// один фоновый воркер поверх того же sender, что и служебные письма
	// учётки — канал один, различаются только домен вызова (синхронный
	// mail.Sender для служебных писем, асинхронный notify.Dispatcher для
	// уведомлений о событиях турнира). Буфер — 256, с запасом на пул из
	// нескольких десятков бойцов (см. plan.md, «Риски»); переполнение
	// логируется и не блокирует вызывающий запрос.
	dispatcher := notify.New(sender, log, 256)

	deps := auth.Deps{
		Pool:             pool,
		Tokens:           tokens,
		Mailer:           mailer.New(sender, cfg.PasswordResetTTL, cfg.EmailTokenTTL),
		PublicAppURL:     cfg.PublicAppURL,
		PasswordResetTTL: cfg.PasswordResetTTL,
		EmailTokenTTL:    cfg.EmailTokenTTL,
		// SessionTTL — то же значение, что TTL refresh-токена (ADR 0018):
		// сессия не должна пережить несущий её токен и не должна истечь
		// раньше него.
		SessionTTL: cfg.JWTRefreshTTL,
	}
	auth.Register(mux, deps, baseOpts, adminOpts)

	// Файловое хранилище регламента/эмблемы турнира (спека 0042, ADR 0019):
	// локальный том при заданном каталоге, иначе nil — легальное состояние
	// «хранилище не настроено» (NFR-4), профиль турнира остаётся рабочим
	// на внешних ссылках.
	var fileStore filestore.Store
	if cfg.FileStorageDir != "" {
		fileStore = local.New(cfg.FileStorageDir)
	} else {
		log.Warn("FILE_STORAGE_DIR not set: tournament file uploads (regulations/emblem) are disabled")
	}

	tournamentDeps := tournament.Deps{
		Pool:     pool,
		Files:    fileStore,
		Policies: tournament.DefaultPolicies(cfg.RegulationsMaxBytes, cfg.EmblemMaxBytes),
	}
	tournament.Register(mux, tournamentDeps, baseOpts, adminOpts)

	// Отдача загруженных файлов турнира — публичный GET, не Connect (ADR
	// 0019 п.6). Смонтирован независимо от того, настроено ли хранилище:
	// при fileStore == nil хендлер сам отвечает 404 на любой id.
	mux.HandleFunc("GET /files/{id}", filesHandler(fileStore))

	activeTournaments := tournament.NewActiveTournamentIDProvider(pool)

	// displayNames — резолв отображаемых имён пользователей (модуль auth,
	// ADR 0002): один объект, переиспользуемый application (спека 0025),
	// stage (спека 0033, журнал боёв площадки, приём 0025) и fighter (спека
	// 0040, обратная проекция «учётка↔боец», FR-8).
	displayNames := auth.NewDisplayNameProvider(pool, tokens)

	// recipients — резолв получателей почтовых уведомлений (спека 0042,
	// FR-21): личный переключатель + подтверждённый адрес. Переиспользуется
	// обоими нотификаторами (application, stage) — тот же приём, что
	// displayNames.
	recipients := auth.NewRecipientsProvider(pool, tokens)

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
		// Notifier — почтовое уведомление о смене состояния заявки не её
		// автором (спека 0042, FR-23).
		Notifier: NewApplicationNotifier(pool, dispatcher, recipients, cfg.PublicAppURL, log),
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
		// Notifier — почтовое уведомление о постановке пула на площадку
		// (спека 0042, FR-24).
		Notifier: NewStageNotifier(pool, dispatcher, recipients, displayNames, cfg.PublicAppURL, log),
	}
	stagemodule.Register(mux, stageDeps, baseOpts, adminOpts)

	// ── Бутстрап каталога встроенных пресетов формата (спека 0047,
	// FR-6/FR-9) — ошибка только логируется, сервер не блокируется (NFR-2).
	stagemodule.BootstrapPresets(ctx, stageDeps, log)

	// ── Бутстрап первого админа (до начала приёма запросов) ───────
	auth.Bootstrap(ctx, deps, log,
		cfg.BootstrapAdminEmail,
		cfg.BootstrapAdminPassword,
		cfg.BootstrapAdminDisplayName,
	)

	return &App{Handler: mux, pool: pool, dispatcher: dispatcher}, nil
}

// Close освобождает ресурсы приложения. Диспетчер уведомлений закрывается
// первым — дренирует очередь (см. notify.Dispatcher.Close) до того, как
// закроется пул БД, которым могут пользоваться ещё не отправленные письма
// (резолв получателей в адаптерах, спека 0042).
func (a *App) Close() {
	if a.dispatcher != nil {
		a.dispatcher.Close()
	}
	if a.pool != nil {
		a.pool.Close()
	}
}
