// Package demoseed содержит общую логику наполнения БД демо-данными,
// переиспользуемую несколькими demo-сценариями (`cmd/demo`, `cmd/demo-registered`,
// ...). Каждый сценарий — «savepoint» в турнирном флоу: `cmd/demo` — заявки во
// всех статусах жизненного цикла (см. Seed); `cmd/demo-registered` — то же
// самое состояние, доведённое до конца (RegisterAll переводит все
// незавершённые заявки в «Зарегистрирована», реально создавая бойцов через
// кроссдоменный эффект, спека 0007).
//
// Идемпотентно: Wipe очищает demo-сущности перед повторным наполнением.
// НЕ предназначено для прод-окружения.
package demoseed

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/internal/platform"
	"github.com/hema/server/modules/application/domain"
	apprepo "github.com/hema/server/modules/application/repo"
	appservice "github.com/hema/server/modules/application/service"
	arenadomain "github.com/hema/server/modules/arena/domain"
	arenarepo "github.com/hema/server/modules/arena/repo"
	arenaservice "github.com/hema/server/modules/arena/service"
	"github.com/hema/server/modules/auth"
	authrepo "github.com/hema/server/modules/auth/repo"
	authservice "github.com/hema/server/modules/auth/service"
	fightermodule "github.com/hema/server/modules/fighter"
	fighterrepo "github.com/hema/server/modules/fighter/repo"
	fighterservice "github.com/hema/server/modules/fighter/service"
	nomdomain "github.com/hema/server/modules/nomination/domain"
	nomrepo "github.com/hema/server/modules/nomination/repo"
	nomservice "github.com/hema/server/modules/nomination/service"
	"github.com/hema/server/modules/tournament"
	tournamentdomain "github.com/hema/server/modules/tournament/domain"
	tournamentrepo "github.com/hema/server/modules/tournament/repo"
	tournamentservice "github.com/hema/server/modules/tournament/service"
	"github.com/hema/server/pkg/config"
	"github.com/hema/server/pkg/jwt"
)

const (
	FighterPassword = "fighter123"
	AdminPassword   = "admin12345"
)

// Fighter — сид-данные заявителя. Club — клуб бойца для заявок (спека 0006,
// FR-1); «» намеренно у части бойцов — демонстрирует подачу без клуба (AC-2).
type Fighter struct {
	Email       string
	DisplayName string
	Club        string
}

var Fighters = []Fighter{
	{"ivan.sokolov@example.com", "Иван Соколов", "Сокол"},
	{"dmitry.volkov@example.com", "Дмитрий Волков", "Сокол"},
	{"alexey.morozov@example.com", "Алексей Морозов", "Стальной Клинок"},
	{"sergey.lebedev@example.com", "Сергей Лебедев", "Стальной Клинок"},
	{"maria.kuznetsova@example.com", "Мария Кузнецова", "Дружина"},
	{"anna.smirnova@example.com", "Анна Смирнова", "Дружина"},
	{"olga.zaharova@example.com", "Ольга Захарова", ""},
	{"pavel.nikitin@example.com", "Павел Никитин", "Вольный Стрелок"},
	{"roman.kozlov@example.com", "Роман Козлов", "Вольный Стрелок"},
	{"artem.fedorov@example.com", "Артём Фёдоров", "Гардемарин"},
	{"nikita.egorov@example.com", "Никита Егоров", "Гардемарин"},
	{"maxim.grigoriev@example.com", "Максим Григорьев", ""},
	{"victoria.pavlova@example.com", "Виктория Павлова", "Сокол"},
	{"tatiana.semenova@example.com", "Татьяна Семёнова", "Стальной Клинок"},
	{"kirill.vorobiev@example.com", "Кирилл Воробьёв", "Дружина"},
	{"yulia.solovieva@example.com", "Юлия Соловьёва", "Вольный Стрелок"},
}

// Admins — сид-данные администраторов (двое — чтобы в UI были рабочие
// сценарии повышения/понижения роли, требующие больше одного админа).
var Admins = []Fighter{
	{"admin@hema.local", "Админ Оргкомитета", ""},
	{"secretary@hema.local", "Секретарь Турнира", ""},
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
		Title:           "Лонгсворд — женщины",
		Description:     "Лонгсворд, женский зачёт",
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

// arenaSeed — сид-данные площадки (ристалища/арены турнира, спека 0008).
type arenaSeed struct {
	Name        string
	Description string
}

var arenaSeeds = []arenaSeed{
	{
		Name:        "Ристалище 1",
		Description: "Главная арена, у входа. Ковёр 6×6 м.",
	},
	{
		Name:        "Ристалище 2",
		Description: "Боковая арена, у трибун. Ковёр 5×5 м.",
	},
	{
		Name:        "Тренировочная зона",
		Description: "Разминочная площадка без зрительских мест.",
	},
}

// Services — собранные сервисы всех модулей, нужные сценариям наполнения.
type Services struct {
	Auth        *authservice.Service
	Tournament  *tournamentservice.Service
	Nomination  *nomservice.Service
	Arena       *arenaservice.Service
	Application *appservice.Service
	Fighter     *fighterservice.Service
}

// NewServices собирает сервисы поверх пула соединений — та же композиция,
// что и прод (internal/platform), без HTTP-обвязки.
func NewServices(pool *pgxpool.Pool, tokens *jwt.Manager) Services {
	activeTournaments := tournament.NewActiveTournamentIDProvider(pool)
	fighterNominations := platform.NewFighterNominationProvider(pool, activeTournaments)

	return Services{
		Auth:       authservice.New(authrepo.New(pool), tokens),
		Tournament: tournamentservice.New(tournamentrepo.New(pool)),
		Nomination: nomservice.New(nomrepo.New(pool), activeTournaments),
		Arena:      arenaservice.New(arenarepo.New(pool), activeTournaments),
		Application: appservice.New(
			apprepo.New(pool),
			platform.NewNominationInfoProvider(pool, activeTournaments),
			auth.NewDisplayNameProvider(pool, tokens),
			fightermodule.NewRegistrationSink(pool, fighterNominations),
		),
		Fighter: fighterservice.New(
			fighterrepo.New(pool),
			fighterNominations,
			activeTournaments,
		),
	}
}

// ApplicationRecord — заявка, созданная в рамках Seed: достаточно данных,
// чтобы дальнейший сценарий (RegisterAll) мог довести её до конца от
// текущего состояния, не подавая заново.
type ApplicationRecord struct {
	ID           string
	ApplicantID  string
	NominationID string
	State        domain.State
}

// AppStats — сводка по состояниям заявок, созданных Seed.
type AppStats struct {
	Total            int
	ByState          map[domain.State]int
	OverflowWarnings int
}

// SeedResult — всё, что создал Seed: идентификаторы и достигнутые состояния,
// нужные последующим шагам (напр. RegisterAll) и отчёту в консоли.
type SeedResult struct {
	BootstrapAdminID string
	AdminIDs          []string
	FighterUserIDs    []string
	TournamentID      string
	NominationIDs     []string
	NominationTitles  map[string]string // nominationID -> title, для отчётов
	ArenaIDs          []string
	Applications      []ApplicationRecord
	Stats             AppStats
}

// Wipe очищает demo-сущности перед повторным наполнением. Активный турнир
// (tournament.tournaments) не трогаем — он единственный (сид миграции,
// partial unique index на is_active); его контакты атомарно заменяются
// внутри UpdateActive. Схема fighter тоже очищается: без этого повторный
// запуск копил бы бойцов-сирот — auth.users truncate меняет user id заявителей,
// и старые origin_user_id в fighter.fighters переставали бы совпадать с кем-либо
// (спека 0007, дедуп по origin_user_id).
func Wipe(ctx context.Context, pool *pgxpool.Pool) error {
	stmts := []string{
		"TRUNCATE TABLE arena.arenas RESTART IDENTITY CASCADE",
		"TRUNCATE TABLE fighter.participations, fighter.fighters RESTART IDENTITY CASCADE",
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

// Seed наполняет БД базовым набором данных: bootstrap-админ (из .env),
// админы, заявители, активный турнир, номинации, заявки во всех статусах
// жизненного цикла (включая намеренное переполнение мягкого лимита одной
// номинации). Это savepoint «demo» (cmd/demo) — используется как отправная
// точка и для более глубоких сценариев (напр. cmd/demo-registered).
func Seed(ctx context.Context, svc Services, cfg config.Config, rng *rand.Rand) (SeedResult, error) {
	var result SeedResult

	bootstrapAdminID, err := seedBootstrapAdmin(ctx, svc.Auth, cfg)
	if err != nil {
		return result, fmt.Errorf("seed bootstrap admin: %w", err)
	}
	result.BootstrapAdminID = bootstrapAdminID

	adminIDs, err := seedAdmins(ctx, svc.Auth)
	if err != nil {
		return result, fmt.Errorf("seed admins: %w", err)
	}
	result.AdminIDs = adminIDs

	fighterUserIDs, err := seedFighterUsers(ctx, svc.Auth)
	if err != nil {
		return result, fmt.Errorf("seed fighters: %w", err)
	}
	result.FighterUserIDs = fighterUserIDs

	tournamentID, err := seedTournament(ctx, svc.Tournament)
	if err != nil {
		return result, fmt.Errorf("seed tournament: %w", err)
	}
	result.TournamentID = tournamentID

	nominationIDs, err := seedNominations(ctx, svc.Nomination, tournamentID)
	if err != nil {
		return result, fmt.Errorf("seed nominations: %w", err)
	}
	result.NominationIDs = nominationIDs
	result.NominationTitles = make(map[string]string, len(nominationIDs))
	for i, id := range nominationIDs {
		result.NominationTitles[id] = nominationSeeds[i].Title
	}

	arenaIDs, err := seedArenas(ctx, svc.Arena, tournamentID)
	if err != nil {
		return result, fmt.Errorf("seed arenas: %w", err)
	}
	result.ArenaIDs = arenaIDs

	applications, stats, err := seedApplications(ctx, svc.Application, rng, adminIDs[0], fighterUserIDs, nominationIDs)
	if err != nil {
		return result, fmt.Errorf("seed applications: %w", err)
	}
	result.Applications = applications
	result.Stats = stats

	return result, nil
}

// AdvanceStats — сводка результата RegisterAll.
type AdvanceStats struct {
	Registered       int // переведены в «Зарегистрирована» этим вызовом
	AlreadyTerminal  int // уже были терминальны (Зарегистрирована/Отозвана) — пропущены
	OverflowWarnings int
}

// RegisterAll доводит каждую незавершённую заявку из apps до терминального
// «Зарегистрирована» — от того состояния, в котором она сейчас находится
// (Withdraw не трогает; терминальные заявки пропускаются). Это и есть
// savepoint «demo-registered»: то же исходное распределение заявок, что и в
// Seed, но полностью доведённое до регистрации бойцов — включая реальный
// кроссдоменный эффект создания бойцов (спека 0007).
func RegisterAll(ctx context.Context, svc *appservice.Service, organizerID string, apps []ApplicationRecord) (AdvanceStats, error) {
	var stats AdvanceStats
	for _, a := range apps {
		if a.State == domain.StateRegistered || a.State == domain.StateWithdrawn {
			stats.AlreadyTerminal++
			continue
		}
		_, warned, err := advanceToRegistered(ctx, svc, a.ApplicantID, organizerID, a.ID, a.State)
		if err != nil {
			return stats, fmt.Errorf("advance application %s: %w", a.ID, err)
		}
		stats.Registered++
		if warned {
			stats.OverflowWarnings++
		}
	}
	return stats, nil
}

// advanceToRegistered прогоняет заявку через оставшиеся шаги флоу от
// текущего состояния до «Зарегистрирована» (свободно продолжает с
// произвольного нетерминального состояния, а не только с начала).
func advanceToRegistered(
	ctx context.Context,
	svc *appservice.Service,
	applicantID, organizerID, appID string,
	current domain.State,
) (domain.State, bool, error) {
	state := current
	var warned bool

	if state == domain.StateSubmitted {
		app, err := svc.DeclarePayment(ctx, applicantID, appID)
		if err != nil {
			return "", false, fmt.Errorf("declare payment: %w", err)
		}
		state = app.State
	}
	if state == domain.StateAwaitingPaymentConfirmation {
		app, err := svc.ConfirmPayment(ctx, organizerID, appID)
		if err != nil {
			return "", false, fmt.Errorf("confirm payment: %w", err)
		}
		state = app.State
	}
	if state == domain.StatePaid {
		app, w, err := svc.Register(ctx, organizerID, appID)
		if err != nil {
			return "", false, fmt.Errorf("register: %w", err)
		}
		state = app.State
		warned = w
	}
	return state, warned, nil
}

// seedBootstrapAdmin пересоздаёт админа из BOOTSTRAP_ADMIN_* (.env) — Wipe
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

func seedAdmins(ctx context.Context, svc *authservice.Service) ([]string, error) {
	ids := make([]string, 0, len(Admins))
	for _, a := range Admins {
		u, err := svc.CreateAdmin(ctx, a.Email, AdminPassword, a.DisplayName)
		if err != nil {
			return nil, fmt.Errorf("create admin %s: %w", a.Email, err)
		}
		ids = append(ids, u.ID)
	}
	return ids, nil
}

func seedFighterUsers(ctx context.Context, svc *authservice.Service) ([]string, error) {
	ids := make([]string, 0, len(Fighters))
	for _, f := range Fighters {
		u, _, err := svc.Register(ctx, f.Email, FighterPassword, f.DisplayName)
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

// seedArenas создаёт площадки турнира (спека 0008). Позиции назначаются
// сервисом по порядку добавления (MaxPosition+1 в транзакции).
func seedArenas(ctx context.Context, svc *arenaservice.Service, tournamentID string) ([]string, error) {
	ids := make([]string, 0, len(arenaSeeds))
	for _, a := range arenaSeeds {
		created, err := svc.Create(ctx, tournamentID, arenadomain.CreateInput{
			Name:        a.Name,
			Description: a.Description,
		})
		if err != nil {
			return nil, fmt.Errorf("create arena %q: %w", a.Name, err)
		}
		ids = append(ids, created.ID)
	}
	return ids, nil
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
	fighterUserIDs []string,
	nominationIDs []string,
) ([]ApplicationRecord, AppStats, error) {
	stats := AppStats{ByState: map[domain.State]int{}}
	var records []ApplicationRecord

	// Основной пул — все номинации, кроме последней (её вместимость намеренно
	// переполняется отдельно ниже).
	mainNominations := nominationIDs[:len(nominationIDs)-1]
	overflowNomination := nominationIDs[len(nominationIDs)-1]

	for idx, applicantID := range fighterUserIDs {
		// fighterUserIDs идёт в том же порядке, что и package-level Fighters
		// (seedFighterUsers сохраняет порядок) — индекс даёт клуб/экипировку.
		club, needsEquipment := fighterDetails(idx)
		count := 1 + rng.Intn(3) // 1..3 заявки на заявителя
		perm := rng.Perm(len(mainNominations))
		for i := 0; i < count && i < len(perm); i++ {
			nominationID := mainNominations[perm[i]]
			outcome := outcomeWeights[rng.Intn(len(outcomeWeights))]
			app, warned, err := driveApplication(ctx, svc, applicantID, organizerID, nominationID, club, needsEquipment, outcome)
			if err != nil {
				return nil, stats, fmt.Errorf("applicant %s -> nomination %s: %w", applicantID, nominationID, err)
			}
			stats.Total++
			stats.ByState[app.State]++
			if warned {
				stats.OverflowWarnings++
			}
			records = append(records, ApplicationRecord{
				ID: app.ID, ApplicantID: applicantID, NominationID: nominationID, State: app.State,
			})
		}
	}

	// Намеренное переполнение маленькой номинации (вместимость 3): регистрируем
	// 5 заявителей, чтобы в UI было видно превышение мягкого лимита.
	overflowApplicants := fighterUserIDs
	if len(overflowApplicants) > 5 {
		overflowApplicants = overflowApplicants[:5]
	}
	for idx, applicantID := range overflowApplicants {
		club, needsEquipment := fighterDetails(idx)
		app, warned, err := driveApplication(ctx, svc, applicantID, organizerID, overflowNomination, club, needsEquipment, outcomeRegistered)
		if err != nil {
			return nil, stats, fmt.Errorf("overflow applicant %s: %w", applicantID, err)
		}
		stats.Total++
		stats.ByState[app.State]++
		if warned {
			stats.OverflowWarnings++
		}
		records = append(records, ApplicationRecord{
			ID: app.ID, ApplicantID: applicantID, NominationID: overflowNomination, State: app.State,
		})
	}

	return records, stats, nil
}

// fighterDetails возвращает клуб и признак нужды в экипировке для бойца по
// его индексу в package-level Fighters (спека 0006, FR-1). needsEquipment —
// детерминированно у каждого третьего бойца, чтобы демо показывало оба случая.
func fighterDetails(idx int) (club string, needsEquipment bool) {
	return Fighters[idx].Club, idx%3 == 0
}

// driveApplication подаёт заявку и проводит её командами сервиса до нужного
// статуса. Возвращает достигнутую заявку и флаг мягкого предупреждения о
// переполнении номинации (значим только для outcomeRegistered).
func driveApplication(
	ctx context.Context,
	svc *appservice.Service,
	applicantID, organizerID, nominationID, club string,
	needsEquipment bool,
	outcome targetOutcome,
) (appservice.Application, bool, error) {
	app, err := svc.Submit(ctx, applicantID, nominationID, club, needsEquipment)
	if err != nil {
		return appservice.Application{}, false, fmt.Errorf("submit: %w", err)
	}
	if outcome == outcomeSubmitted {
		return app, false, nil
	}
	if outcome == outcomeWithdrawn {
		app, err = svc.Withdraw(ctx, applicantID, app.ID)
		if err != nil {
			return appservice.Application{}, false, fmt.Errorf("withdraw: %w", err)
		}
		return app, false, nil
	}

	app, err = svc.DeclarePayment(ctx, applicantID, app.ID)
	if err != nil {
		return appservice.Application{}, false, fmt.Errorf("declare payment: %w", err)
	}
	if outcome == outcomeAwaitingPayment {
		return app, false, nil
	}

	app, err = svc.ConfirmPayment(ctx, organizerID, app.ID)
	if err != nil {
		return appservice.Application{}, false, fmt.Errorf("confirm payment: %w", err)
	}
	if outcome == outcomePaid {
		return app, false, nil
	}

	app, warned, err := svc.Register(ctx, organizerID, app.ID)
	if err != nil {
		return appservice.Application{}, false, fmt.Errorf("register: %w", err)
	}
	return app, warned, nil
}

// JoinEmails форматирует список email через запятую — для печати учёток в
// консоль по завершении сценария.
func JoinEmails(list []Fighter) string {
	out := ""
	for i, f := range list {
		if i > 0 {
			out += ", "
		}
		out += f.Email
	}
	return out
}
