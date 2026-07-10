// Command demo наполняет БД реалистичными тестовыми данными для ручной
// проверки UX (make demo): пользователей разных ролей, номинации с разной
// вместимостью, заявки во всех статусах жизненного цикла, включая
// переполнение мягкого лимита номинации.
//
// Идемпотентен: перед заполнением очищает demo-сущности (пользователей,
// номинации, заявки) и заново их создаёт — активный турнир не пересоздаётся
// (он единственный, сид миграции), а обновляется. НЕ предназначен для
// прод-окружения — использует DATABASE_URL/JWT_* из того же .env, что и сервер.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"math/rand"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/internal/platform"
	"github.com/hema/server/modules/application/domain"
	appservice "github.com/hema/server/modules/application/service"
	"github.com/hema/server/modules/auth"
	authrepo "github.com/hema/server/modules/auth/repo"
	authservice "github.com/hema/server/modules/auth/service"
	apprepo "github.com/hema/server/modules/application/repo"
	nomdomain "github.com/hema/server/modules/nomination/domain"
	nomrepo "github.com/hema/server/modules/nomination/repo"
	nomservice "github.com/hema/server/modules/nomination/service"
	"github.com/hema/server/modules/tournament"
	tournamentdomain "github.com/hema/server/modules/tournament/domain"
	tournamentrepo "github.com/hema/server/modules/tournament/repo"
	tournamentservice "github.com/hema/server/modules/tournament/service"
	"github.com/hema/server/pkg/config"
	"github.com/hema/server/pkg/jwt"
	"github.com/hema/server/pkg/pgxutil"
)

const fighterPassword = "fighter123"
const adminPassword = "admin12345"

// fighter — сид-данные заявителя.
type fighter struct {
	Email       string
	DisplayName string
}

var fighters = []fighter{
	{"ivan.sokolov@example.com", "Иван Соколов"},
	{"dmitry.volkov@example.com", "Дмитрий Волков"},
	{"alexey.morozov@example.com", "Алексей Морозов"},
	{"sergey.lebedev@example.com", "Сергей Лебедев"},
	{"maria.kuznetsova@example.com", "Мария Кузнецова"},
	{"anna.smirnova@example.com", "Анна Смирнова"},
	{"olga.zaharova@example.com", "Ольга Захарова"},
	{"pavel.nikitin@example.com", "Павел Никитин"},
	{"roman.kozlov@example.com", "Роман Козлов"},
	{"artem.fedorov@example.com", "Артём Фёдоров"},
	{"nikita.egorov@example.com", "Никита Егоров"},
	{"maxim.grigoriev@example.com", "Максим Григорьев"},
	{"victoria.pavlova@example.com", "Виктория Павлова"},
	{"tatiana.semenova@example.com", "Татьяна Семёнова"},
	{"kirill.vorobiev@example.com", "Кирилл Воробьёв"},
	{"yulia.solovieva@example.com", "Юлия Соловьёва"},
}

// admins — сид-данные администраторов (двое — чтобы в UI были рабочие
// сценарии повышения/понижения роли, требующие больше одного админа).
var admins = []fighter{
	{"admin@hema.local", "Админ Оргкомитета"},
	{"secretary@hema.local", "Секретарь Турнира"},
}

// nominationSeed — сид-данные номинации.
type nominationSeed struct {
	Title           string
	Description     string
	FighterCapacity int32
	HasCapacity     bool
	RulesURL        string
}

var nominationSeeds = []nominationSeed{
	{
		Title:           "Лонгсорд — мужчины",
		Description:     "Одноручный/двуручный лонгсорд, мужской зачёт",
		FighterCapacity: 24,
		HasCapacity:     true,
		RulesURL:        "https://hema-tournament.example/rules/longsword-men",
	},
	{
		Title:           "Лонгсорд — женщины",
		Description:     "Лонгсорд, женский зачёт",
		FighterCapacity: 12,
		HasCapacity:     true,
		RulesURL:        "https://hema-tournament.example/rules/longsword-women",
	},
	{
		Title:       "Меч и баклер",
		Description: "Одноручный меч и баклер, смешанный зачёт",
		HasCapacity: false,
	},
	{
		Title:       "Рапира",
		Description: "Историческая рапира, смешанный зачёт",
		HasCapacity: false,
	},
	{
		// Маленький лимит специально — чтобы продемонстрировать
		// переполнение (мягкое предупреждение при регистрации).
		Title:           "Опен-класс: стальной лонгсорд",
		Description:     "Открытый класс на стальном оружии, ограниченное число мест",
		FighterCapacity: 3,
		HasCapacity:     true,
		RulesURL:        "https://hema-tournament.example/rules/steel-open",
	},
}

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

	if err := wipe(ctx, pool); err != nil {
		log.Error("wipe demo data", "err", err)
		os.Exit(1)
	}

	tokens := jwt.NewManager(cfg.JWTAccessSecret, cfg.JWTRefreshSecret, cfg.JWTAccessTTL, cfg.JWTRefreshTTL)

	authSvc := authservice.New(authrepo.New(pool), tokens)
	tournamentSvc := tournamentservice.New(tournamentrepo.New(pool))
	activeTournaments := tournament.NewActiveTournamentIDProvider(pool)
	nomSvc := nomservice.New(nomrepo.New(pool), activeTournaments)
	appSvc := appservice.New(
		apprepo.New(pool),
		platform.NewNominationInfoProvider(pool, activeTournaments),
		auth.NewDisplayNameProvider(pool, tokens),
	)

	rng := rand.New(rand.NewSource(42))

	if _, err := seedBootstrapAdmin(ctx, authSvc, cfg); err != nil {
		log.Error("seed bootstrap admin", "err", err)
		os.Exit(1)
	}

	adminIDs, err := seedAdmins(ctx, authSvc)
	if err != nil {
		log.Error("seed admins", "err", err)
		os.Exit(1)
	}
	log.Info("создали админов", "count", len(adminIDs))

	fighterIDs, err := seedFighters(ctx, authSvc)
	if err != nil {
		log.Error("seed fighters", "err", err)
		os.Exit(1)
	}
	log.Info("создали заявителей", "count", len(fighterIDs))

	tournamentID, err := seedTournament(ctx, tournamentSvc)
	if err != nil {
		log.Error("seed tournament", "err", err)
		os.Exit(1)
	}
	log.Info("обновили активный турнир", "id", tournamentID)

	nominationIDs, err := seedNominations(ctx, nomSvc, tournamentID)
	if err != nil {
		log.Error("seed nominations", "err", err)
		os.Exit(1)
	}
	log.Info("создали номинации", "count", len(nominationIDs))

	stats, err := seedApplications(ctx, appSvc, rng, adminIDs[0], fighterIDs, nominationIDs)
	if err != nil {
		log.Error("seed applications", "err", err)
		os.Exit(1)
	}
	log.Info("создали заявки",
		"total", stats.total,
		"submitted", stats.byState[domain.StateSubmitted],
		"awaiting_payment_confirmation", stats.byState[domain.StateAwaitingPaymentConfirmation],
		"paid", stats.byState[domain.StatePaid],
		"registered", stats.byState[domain.StateRegistered],
		"withdrawn", stats.byState[domain.StateWithdrawn],
		"overflow_warnings", stats.overflowWarnings,
	)

	fmt.Println()
	fmt.Println("Готово. Тестовые учётки (пароль одинаковый для всей группы):")
	if cfg.BootstrapAdminEmail != "" && cfg.BootstrapAdminPassword != "" {
		fmt.Printf("  bootstrap-админ: %s (пароль: %s)\n", cfg.BootstrapAdminEmail, cfg.BootstrapAdminPassword)
	}
	fmt.Printf("  админы:     %s (пароль: %s)\n", joinEmails(admins), adminPassword)
	fmt.Printf("  заявители:  %s (пароль: %s)\n", joinEmails(fighters), fighterPassword)
}

// seedBootstrapAdmin пересоздаёт админа из BOOTSTRAP_ADMIN_* (.env) — wipe
// перед наполнением стирает auth.users, а сервер выполняет бутстрап только
// один раз при старте (idempotent-skip, если админы уже есть), поэтому без
// этого шага учётка из .env терялась бы до следующего перезапуска сервера.
// Поля необязательны (см. config.Load); пустые — пропускаем.
func seedBootstrapAdmin(ctx context.Context, svc *authservice.Service, cfg config.Config) (string, error) {
	if cfg.BootstrapAdminEmail == "" || cfg.BootstrapAdminPassword == "" {
		return "", nil
	}
	u, err := svc.CreateAdmin(ctx, cfg.BootstrapAdminEmail, cfg.BootstrapAdminPassword, cfg.BootstrapAdminDisplayName)
	if err != nil {
		return "", fmt.Errorf("create bootstrap admin %s: %w", cfg.BootstrapAdminEmail, err)
	}
	return u.ID, nil
}

// wipe очищает demo-сущности перед повторным наполнением. Активный турнир
// (tournament.tournaments) не трогаем — он единственный (сид миграции,
// partial unique index на is_active); его контакты атомарно заменяются
// внутри UpdateActive.
func wipe(ctx context.Context, pool *pgxpool.Pool) error {
	stmts := []string{
		"TRUNCATE TABLE application.events, application.application_current RESTART IDENTITY CASCADE",
		"TRUNCATE TABLE nomination.nominations RESTART IDENTITY CASCADE",
		"TRUNCATE TABLE auth.users RESTART IDENTITY CASCADE",
	}
	for _, s := range stmts {
		if _, err := pool.Exec(ctx, s); err != nil {
			return fmt.Errorf("exec %q: %w", s, err)
		}
	}
	return nil
}

func joinEmails(list []fighter) string {
	out := ""
	for i, f := range list {
		if i > 0 {
			out += ", "
		}
		out += f.Email
	}
	return out
}

func seedAdmins(ctx context.Context, svc *authservice.Service) ([]string, error) {
	ids := make([]string, 0, len(admins))
	for _, a := range admins {
		u, err := svc.CreateAdmin(ctx, a.Email, adminPassword, a.DisplayName)
		if err != nil {
			return nil, fmt.Errorf("create admin %s: %w", a.Email, err)
		}
		ids = append(ids, u.ID)
	}
	return ids, nil
}

func seedFighters(ctx context.Context, svc *authservice.Service) ([]string, error) {
	ids := make([]string, 0, len(fighters))
	for _, f := range fighters {
		u, _, err := svc.Register(ctx, f.Email, fighterPassword, f.DisplayName)
		if err != nil {
			return nil, fmt.Errorf("register fighter %s: %w", f.Email, err)
		}
		ids = append(ids, u.ID)
	}
	return ids, nil
}

func seedTournament(ctx context.Context, svc *tournamentservice.Service) (string, error) {
	start := time.Now().AddDate(0, 2, 0).Truncate(time.Hour)
	end := start.AddDate(0, 0, 2)

	t, err := svc.UpdateActive(ctx, tournamentdomain.UpdateInput{
		Title:           "Кубок Северной Столицы по историческому фехтованию",
		Description:     "Ежегодный турнир HEMA: лонгсорд, меч и баклер, рапира. Открытая регистрация для клубов региона.",
		EventStartAt:    start,
		HasEventStartAt: true,
		EventEndAt:      end,
		HasEventEndAt:   true,
		Contacts: []tournamentdomain.ContactInput{
			{Type: tournamentdomain.ContactTypeTelegram, Value: "@hema_tournament"},
			{Type: tournamentdomain.ContactTypeVK, Value: "https://vk.com/hema_tournament"},
			{Type: tournamentdomain.ContactTypeEmail, Value: "org@hema-tournament.example"},
		},
	})
	if err != nil {
		return "", err
	}
	return t.ID, nil
}

func seedNominations(ctx context.Context, svc *nomservice.Service, tournamentID string) ([]string, error) {
	ids := make([]string, 0, len(nominationSeeds))
	for _, n := range nominationSeeds {
		created, err := svc.Create(ctx, tournamentID, nomdomain.CreateInput{
			Title:              n.Title,
			Description:        n.Description,
			FighterCapacity:    n.FighterCapacity,
			HasFighterCapacity: n.HasCapacity,
			Metadata:           nomdomain.Metadata{RulesURL: n.RulesURL},
		})
		if err != nil {
			return nil, fmt.Errorf("create nomination %q: %w", n.Title, err)
		}
		ids = append(ids, created.ID)
	}
	return ids, nil
}

type appStats struct {
	total            int
	byState          map[domain.State]int
	overflowWarnings int
}

// targetOutcome — до какого статуса довести заявку в общем случайном потоке.
type targetOutcome int

const (
	outcomeSubmitted targetOutcome = iota
	outcomeAwaitingPayment
	outcomePaid
	outcomeRegistered
	outcomeWithdrawn
)

// outcomeWeights — распределение статусов по заявкам общего потока (без учёта
// намеренно переполняемой номинации). Смещено к «зарегистрирован», чтобы
// стартовые листы номинаций не были пустыми.
var outcomeWeights = []targetOutcome{
	outcomeSubmitted, outcomeSubmitted,
	outcomeAwaitingPayment, outcomeAwaitingPayment,
	outcomePaid, outcomePaid,
	outcomeRegistered, outcomeRegistered, outcomeRegistered,
	outcomeWithdrawn,
}

func seedApplications(
	ctx context.Context,
	svc *appservice.Service,
	rng *rand.Rand,
	organizerID string,
	fighterIDs []string,
	nominationIDs []string,
) (appStats, error) {
	stats := appStats{byState: map[domain.State]int{}}

	// Основной пул — все номинации, кроме последней (её вместимость намеренно
	// переполняется отдельно ниже).
	mainNominations := nominationIDs[:len(nominationIDs)-1]
	overflowNomination := nominationIDs[len(nominationIDs)-1]

	for _, applicantID := range fighterIDs {
		count := 1 + rng.Intn(3) // 1..3 заявки на заявителя
		perm := rng.Perm(len(mainNominations))
		for i := 0; i < count && i < len(perm); i++ {
			nominationID := mainNominations[perm[i]]
			outcome := outcomeWeights[rng.Intn(len(outcomeWeights))]
			state, warned, err := driveApplication(ctx, svc, applicantID, organizerID, nominationID, outcome)
			if err != nil {
				return stats, fmt.Errorf("applicant %s -> nomination %s: %w", applicantID, nominationID, err)
			}
			stats.total++
			stats.byState[state]++
			if warned {
				stats.overflowWarnings++
			}
		}
	}

	// Намеренное переполнение маленькой номинации (вместимость 3): регистрируем
	// 5 заявителей, чтобы в UI было видно превышение мягкого лимита.
	overflowApplicants := fighterIDs
	if len(overflowApplicants) > 5 {
		overflowApplicants = overflowApplicants[:5]
	}
	for _, applicantID := range overflowApplicants {
		state, warned, err := driveApplication(ctx, svc, applicantID, organizerID, overflowNomination, outcomeRegistered)
		if err != nil {
			return stats, fmt.Errorf("overflow applicant %s: %w", applicantID, err)
		}
		stats.total++
		stats.byState[state]++
		if warned {
			stats.overflowWarnings++
		}
	}

	return stats, nil
}

// driveApplication подаёт заявку и проводит её командами сервиса до нужного
// статуса. Возвращает достигнутое состояние и флаг мягкого предупреждения о
// переполнении номинации (значим только для outcomeRegistered).
func driveApplication(
	ctx context.Context,
	svc *appservice.Service,
	applicantID, organizerID, nominationID string,
	outcome targetOutcome,
) (domain.State, bool, error) {
	app, err := svc.Submit(ctx, applicantID, nominationID)
	if err != nil {
		return "", false, fmt.Errorf("submit: %w", err)
	}
	if outcome == outcomeSubmitted {
		return app.State, false, nil
	}
	if outcome == outcomeWithdrawn {
		app, err = svc.Withdraw(ctx, applicantID, app.ID)
		if err != nil {
			return "", false, fmt.Errorf("withdraw: %w", err)
		}
		return app.State, false, nil
	}

	app, err = svc.DeclarePayment(ctx, applicantID, app.ID)
	if err != nil {
		return "", false, fmt.Errorf("declare payment: %w", err)
	}
	if outcome == outcomeAwaitingPayment {
		return app.State, false, nil
	}

	app, err = svc.ConfirmPayment(ctx, organizerID, app.ID)
	if err != nil {
		return "", false, fmt.Errorf("confirm payment: %w", err)
	}
	if outcome == outcomePaid {
		return app.State, false, nil
	}

	app, warned, err := svc.Register(ctx, organizerID, app.ID)
	if err != nil {
		return "", false, fmt.Errorf("register: %w", err)
	}
	return app.State, warned, nil
}
