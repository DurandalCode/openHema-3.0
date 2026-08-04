// Package demoseed содержит общую логику наполнения БД демо-данными,
// переиспользуемую несколькими demo-сценариями (`cmd/demo`, `cmd/demo-registered`,
// `cmd/demo-bouts`, ...). Каждый сценарий — «savepoint» в турнирном флоу:
// `cmd/demo` — заявки во всех статусах жизненного цикла (см. Seed);
// `cmd/demo-registered` — то же самое состояние, доведённое до конца
// (RegisterAll переводит все незавершённые заявки в «Зарегистрирована»,
// реально создавая бойцов через кроссдоменный эффект, спека 0007);
// `cmd/demo-bouts` — ещё глубже: пулы сформированы и часть площадок реально
// ведёт бои (SeedPoolsAndBouts, спеки 0009–0014).
//
// Идемпотентно: Wipe очищает demo-сущности перед повторным наполнением.
// НЕ предназначено для прод-окружения.
package demoseed

import (
	"context"
	"errors"
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
	fighterdomain "github.com/hema/server/modules/fighter/domain"
	fighterrepo "github.com/hema/server/modules/fighter/repo"
	fighterservice "github.com/hema/server/modules/fighter/service"
	nomdomain "github.com/hema/server/modules/nomination/domain"
	nomrepo "github.com/hema/server/modules/nomination/repo"
	nomservice "github.com/hema/server/modules/nomination/service"
	stagedomain "github.com/hema/server/modules/stage/domain"
	stagerepo "github.com/hema/server/modules/stage/repo"
	stageservice "github.com/hema/server/modules/stage/service"
	"github.com/hema/server/modules/tournament"
	tournamentdomain "github.com/hema/server/modules/tournament/domain"
	tournamentrepo "github.com/hema/server/modules/tournament/repo"
	tournamentservice "github.com/hema/server/modules/tournament/service"
	"github.com/hema/server/pkg/config"
	"github.com/hema/server/pkg/jwt"
	"github.com/hema/server/pkg/livebus"
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
	{
		// Отдельная от showcase-пулов SeedPoolsAndBouts арена (спека 0018,
		// cmd/demo-bouts): верхняя половина «1/4 финала» демо-сетки ведётся
		// здесь, пока три первых ристалища заняты показательными группами.
		Name:        "Ристалище 4",
		Description: "Дополнительная арена. Здесь ведётся верхняя половина плейофф-сетки.",
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
	Pool        *stageservice.Service
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
		Pool: stageservice.New(
			stagerepo.New(pool),
			platform.NewStageActiveFightersProvider(pool),
			platform.NewStageBoutConductor(pool),
			platform.NewStageArenaProvider(pool, activeTournaments),
			platform.NewStageNominationProvider(pool, activeTournaments),
			platform.NewStageLiveBus(livebus.New()),
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
	AdminIDs         []string
	FighterUserIDs   []string
	TournamentID     string
	NominationIDs    []string
	NominationTitles map[string]string // nominationID -> title, для отчётов
	ArenaIDs         []string
	Applications     []ApplicationRecord
	Stats            AppStats
}

// Wipe очищает demo-сущности перед повторным наполнением. Активный турнир
// (tournament.tournaments) не трогаем — он единственный (сид миграции,
// partial unique index на is_active); его контакты атомарно заменяются
// внутри UpdateActive. Схема fighter тоже очищается: без этого повторный
// запуск копил бы бойцов-сирот — auth.users truncate меняет user id заявителей,
// и старые origin_user_id в fighter.fighters переставали бы совпадать с кем-либо
// (спека 0007, дедуп по origin_user_id).
//
// stage/bout — тоже demo-сущности (спека cmd/demo-bouts): stage.pools/
// bout.bouts ссылаются на nomination_id/arena_id обычными UUID-колонками
// БЕЗ кросс-схемного FK (ADR 0002) — TRUNCATE nomination.nominations/
// arena.arenas их не каскадирует. Без явной очистки здесь повторный прогон
// демо копил бы осиротевшие пулы/бои прошлых запусков (мусор в «доступные
// пулы для постановки», спека 0011 FR-9, даже если сам сценарий их не видел
// раньше — cmd/demo и cmd/demo-registered тоже вызывают Wipe).
//
// stage.pool_members/stage.pools/stage.stages — одной командой (спека
// 0017): pools.stage_id — FK ON DELETE CASCADE на stages, отдельный
// TRUNCATE stages потребовал бы CASCADE или упал бы на ссылке.
func Wipe(ctx context.Context, pool *pgxpool.Pool) error {
	stmts := []string{
		"TRUNCATE TABLE bout.bout_events, bout.bouts RESTART IDENTITY CASCADE",
		"TRUNCATE TABLE stage.pool_members, stage.pools, stage.stages RESTART IDENTITY CASCADE",
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

// targetPoolSize — ориентировочный размер пула при формировании демо-раскладки
// (спека 0009): не константа домена, просто разумное число для демо-данных.
const targetPoolSize = 5

// PoolBoutsResult — итог SeedPoolsAndBouts: что сформировано и проведено, для
// отчёта в консоль.
type PoolBoutsResult struct {
	// NominationIDs — номинации, для которых сформированы пулы и бои (только
	// те, где после регистрации ≥2 активных бойцов — вести бои не для кого).
	NominationIDs []string
	// PoolsByNomination — сколько пулов сформировано в каждой номинации.
	PoolsByNomination map[string]int
	// FinishedPoolID/FinishedArenaID — пул, у которого проведены ВСЕ бои
	// (витрина «завершённый пул», спека 0013); пусто, если показать нечего.
	FinishedPoolID, FinishedArenaID string
	// RunningPoolID/RunningArenaID/RunningNominationID — пул, где бой «идёт»
	// прямо сейчас с реальным (незавершённым) счётом — витрина «живого»
	// публичного экрана номинации (спека 0014): именно эту номинацию стоит
	// открыть на /nominations/{RunningNominationID}, чтобы увидеть live push.
	RunningPoolID, RunningArenaID, RunningNominationID string
	// PreparingPoolID/PreparingArenaID — пул поставлен на арену, но ни один
	// бой ещё не начат (витрина «готовится к запуску», спека 0011).
	PreparingPoolID, PreparingArenaID string
}

// SeedPoolsAndBouts — savepoint «бои» (cmd/demo-bouts): поверх состояния
// demo-registered (все заявки доведены до регистрации бойцов, спека 0007)
// формирует пулы по каждой номинации с ≥2 активными бойцами (спека 0009),
// фиксирует раскладку — генерирует бои (спека 0010) — и расставляет до трёх
// площадок в разных фазах исполнения турнирного дня (спеки 0011/0013),
// разом показывая полный спектр состояний:
//   - первая площадка — пул целиком проведён (все бои завершены, видны исходы);
//   - вторая — пул «идёт»: первый бой начат и несёт реальный незавершённый
//     счёт — витрина «живого» push на публичном экране номинации (спека 0014);
//   - третья — пул поставлен, но ещё не начат («готовится к запуску»).
//
// Остальные пулы (сверх трёх показанных площадок) остаются «готов», не
// поставленными ни на одну арену. actorID — от чьего имени фиксируются
// действия секретаря (журнал ЖЦ боя, ADR 0011); organizerID из RegisterAll
// подходит.
func SeedPoolsAndBouts(
	ctx context.Context,
	poolSvc *stageservice.Service,
	fighterSvc *fighterservice.Service,
	tournamentID string,
	nominationIDs []string,
	arenaIDs []string,
	actorID string,
	rng *rand.Rand,
) (PoolBoutsResult, error) {
	result := PoolBoutsResult{PoolsByNomination: make(map[string]int)}

	activeCounts, err := activeFighterCountsByNomination(ctx, fighterSvc, tournamentID)
	if err != nil {
		return result, fmt.Errorf("count active fighters: %w", err)
	}

	// layouts — готовая (ready) раскладка каждой подходящей номинации, чтобы
	// не перечитывать её повторно на шаге расстановки по аренам ниже.
	layouts := make(map[string]stagedomain.Layout)
	var eligible []string
	for _, nomID := range nominationIDs {
		if activeCounts[nomID] < 2 {
			continue // некого расставлять по парам — бои не сформируются (0010, FR-4)
		}

		// Адресация раскладки — этапом, не номинацией (спека 0018, FR-18):
		// групповой этап материализуется ListStages (0017, FR-4) — тем же
		// путём, что и админский экран этапов.
		groupsStageID, err := groupsStageID(ctx, poolSvc, nomID)
		if err != nil {
			return result, fmt.Errorf("resolve groups stage for nomination %s: %w", nomID, err)
		}

		poolCount := (activeCounts[nomID] + targetPoolSize - 1) / targetPoolSize
		for i := 0; i < poolCount; i++ {
			if _, err := poolSvc.CreatePool(ctx, groupsStageID); err != nil {
				return result, fmt.Errorf("create pool for nomination %s: %w", nomID, err)
			}
		}
		if _, err := poolSvc.AutoDistribute(ctx, groupsStageID); err != nil {
			return result, fmt.Errorf("auto-distribute nomination %s: %w", nomID, err)
		}
		layout, err := poolSvc.SetStatus(ctx, groupsStageID, stagedomain.LayoutReady)
		if err != nil {
			return result, fmt.Errorf("ready nomination %s: %w", nomID, err)
		}

		eligible = append(eligible, nomID)
		layouts[nomID] = layout
		result.NominationIDs = append(result.NominationIDs, nomID)
		result.PoolsByNomination[nomID] = len(layout.Pools)
	}

	// Ристалище 1: пул первой подходящей номинации — довести до конца.
	if len(arenaIDs) > 0 && len(eligible) > 0 {
		nomID := eligible[0]
		if poolID := poolWithMostMembers(layouts[nomID].Pools); poolID != "" {
			if _, err := poolSvc.SeatPoolOnArena(ctx, poolID, arenaIDs[0]); err != nil {
				return result, fmt.Errorf("seat finished-showcase pool (nomination %s): %w", nomID, err)
			}
			if err := conductAllBouts(ctx, poolSvc, poolID, actorID, rng); err != nil {
				return result, fmt.Errorf("conduct all bouts (finished showcase, nomination %s): %w", nomID, err)
			}
			result.FinishedPoolID, result.FinishedArenaID = poolID, arenaIDs[0]
		}
	}

	// Ристалище 2: следующая подходящая номинация — начать первый бой и
	// оставить его «идёт» с реальным счётом (витрина 0014).
	if len(arenaIDs) > 1 && len(eligible) > 1 {
		nomID := eligible[1]
		if poolID := poolWithMostMembers(layouts[nomID].Pools); poolID != "" {
			if _, err := poolSvc.SeatPoolOnArena(ctx, poolID, arenaIDs[1]); err != nil {
				return result, fmt.Errorf("seat running-showcase pool (nomination %s): %w", nomID, err)
			}
			if _, err := poolSvc.StartCurrentBout(ctx, poolID, actorID); err != nil {
				return result, fmt.Errorf("start running-showcase bout (nomination %s): %w", nomID, err)
			}
			scoreA, scoreB := randomLiveScore(rng)
			if _, err := poolSvc.ScoreCurrentBout(ctx, poolID, actorID, scoreA, scoreB); err != nil {
				return result, fmt.Errorf("score running-showcase bout (nomination %s): %w", nomID, err)
			}
			result.RunningPoolID = poolID
			result.RunningArenaID = arenaIDs[1]
			result.RunningNominationID = nomID
		}
	}

	// Ристалище 3: ещё одна подходящая номинация — только поставить, боёв не
	// начинать («готовится к запуску»).
	if len(arenaIDs) > 2 && len(eligible) > 2 {
		nomID := eligible[2]
		if poolID := poolWithMostMembers(layouts[nomID].Pools); poolID != "" {
			if _, err := poolSvc.SeatPoolOnArena(ctx, poolID, arenaIDs[2]); err != nil {
				return result, fmt.Errorf("seat preparing-showcase pool (nomination %s): %w", nomID, err)
			}
			result.PreparingPoolID, result.PreparingArenaID = poolID, arenaIDs[2]
		}
	}

	return result, nil
}

// groupsStageID возвращает id группового этапа номинации, материализуя его
// при первом обращении (спека 0017, FR-4 — ListStages, единственное место с
// EnsureStage на write-пути, план «service/service.go»). Раскладка
// адресуется этапом, а не номинацией (спека 0018, FR-18) — демо-сид следует
// тому же пути, что и админский экран `/admin/nominations/{id}/stages`.
func groupsStageID(ctx context.Context, svc *stageservice.Service, nominationID string) (string, error) {
	stages, err := svc.ListStages(ctx, nominationID)
	if err != nil {
		return "", err
	}
	for _, st := range stages {
		if st.Type == stagedomain.StageTypeGroups {
			return st.ID, nil
		}
	}
	return "", fmt.Errorf("groups stage not found for nomination %s", nominationID)
}

// activeFighterCountsByNomination считает активных бойцов с активным
// участием (спека 0007) по каждой номинации турнира — тот же критерий, что
// ActiveFightersProvider отдаёт AutoDistribute, чтобы оценка «сколько
// пулов нужно» соответствовала реальному числу бойцов, которых распределит
// AutoDistribute.
func activeFighterCountsByNomination(ctx context.Context, svc *fighterservice.Service, tournamentID string) (map[string]int, error) {
	roster, err := svc.ListRoster(ctx, tournamentID)
	if err != nil {
		return nil, err
	}
	counts := make(map[string]int)
	for _, f := range roster {
		if f.Status != fighterdomain.StatusActive {
			continue
		}
		for _, p := range f.Participations {
			if p.Status != fighterdomain.ParticipationActive {
				continue
			}
			counts[p.NominationID]++
		}
	}
	return counts, nil
}

// poolWithMostMembers выбирает самый населённый пул раскладки — гарантирует,
// что показательный пул реально имеет бои (а не 0-1 бойца, если
// автораспределение легло неровно), не завязываясь на конкретный номер пула.
func poolWithMostMembers(pools []stagedomain.Pool) string {
	best, max := "", -1
	for _, p := range pools {
		if len(p.Members) > max {
			max, best = len(p.Members), p.ID
		}
	}
	return best
}

// conductAllBouts проводит пул от первого до последнего боя: старт → счёт →
// завершение, пока есть текущий бой (ErrNoCurrentBout — пул целиком проведён
// либо не боевой, спека 0013).
func conductAllBouts(ctx context.Context, svc *stageservice.Service, poolID, actorID string, rng *rand.Rand) error {
	for {
		if _, err := svc.StartCurrentBout(ctx, poolID, actorID); err != nil {
			if errors.Is(err, stagedomain.ErrNoCurrentBout) {
				return nil
			}
			return err
		}
		scoreA, scoreB := randomFinalScore(rng)
		if _, err := svc.ScoreCurrentBout(ctx, poolID, actorID, scoreA, scoreB); err != nil {
			return err
		}
		if _, err := svc.FinishCurrentBout(ctx, poolID, actorID); err != nil {
			return err
		}
	}
}

// randomFinalScore — правдоподобный итоговый счёт завершённого боя (демо).
func randomFinalScore(rng *rand.Rand) (int, int) {
	return 3 + rng.Intn(8), 3 + rng.Intn(8) // 3..10 каждому
}

// randomLiveScore — счёт идущего (незавершённого) боя: намеренно ниже
// randomFinalScore, чтобы выглядело как «бой в разгаре», а не доигранным.
func randomLiveScore(rng *rand.Rand) (int, int) {
	return rng.Intn(6), rng.Intn(6) // 0..5 каждому
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
