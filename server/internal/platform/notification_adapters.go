package platform

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"

	appdomain "github.com/hema/server/modules/application/domain"
	"github.com/hema/server/modules/auth"
	fighterrepo "github.com/hema/server/modules/fighter/repo"
	fighterservice "github.com/hema/server/modules/fighter/service"
	nomrepo "github.com/hema/server/modules/nomination/repo"
	nomservice "github.com/hema/server/modules/nomination/service"
	stagedomain "github.com/hema/server/modules/stage/domain"
	tournamentrepo "github.com/hema/server/modules/tournament/repo"
	tournamentservice "github.com/hema/server/modules/tournament/service"
	"github.com/hema/server/pkg/notify"
)

// Спека 0042: адаптеры-нотификаторы, реализующие межмодульные порты
// domain.Notifier модулей application и stage (ADR 0011 п.5 — кроссдоменный
// эффект через явный порт модуля-источника, не через шину). Оба адаптера:
//  1. читают глобальный переключатель вида у tournament (FR-19);
//  2. если разрешён — резолвят получателей у auth.RecipientsProvider
//     (лично включено + адрес подтверждён, FR-21) и человекочитаемые имена
//     у nomination/tournament;
//  3. кладут готовые письма в notify.Dispatcher (отправка — вне запроса).
//
// Резолв (шаги 1-2) выполняется в отдельной горутине, а не в горутине
// вызывающего запроса: доменная операция (постановка пула, подтверждение
// оплаты) не должна ждать несколько последовательных обращений к БД ради
// письма (FR-28) — этого не даёт сам по себе асинхронный notify.Dispatcher,
// который асинхронен только на шаге отправки. Сервисы модулей-источников
// дополнительно гасят панику реализации порта (defer recover в
// service.notify/notifyPoolSeated) — она здесь не нужна, но не вредит.

// fighterAccountResolver резолвит id бойца в id связанной учётки (0040,
// FR-8) — используется только уведомлением о постановке пула (FR-25).
// Строится поверх минимального набора зависимостей fighter.Service: этому
// адаптеру нужен только GetFighter, поэтому Nominations/Tournaments/
// Seeding/Stage/Bout — nil (тот же приём, что fighter.NewRegistrationSink
// использует только часть портов сервиса).
type fighterAccountResolver struct {
	svc *fighterservice.Service
}

func newFighterAccountResolver(pool *pgxpool.Pool, accounts fighterAccountsPort) *fighterAccountResolver {
	r := fighterrepo.New(pool)
	return &fighterAccountResolver{svc: fighterservice.New(r, nil, nil, nil, nil, nil, accounts)}
}

// accountForFighter возвращает id учётки, связанной с бойцом, и признак,
// что связь есть. Ошибка резолва (боец не найден и т.п.) трактуется как
// «связи нет» — письмо тогда просто не уйдёт этому бойцу, это не сбой
// операции постановки пула (FR-27).
func (r *fighterAccountResolver) accountForFighter(ctx context.Context, fighterID string) (string, bool) {
	f, err := r.svc.GetFighter(ctx, fighterID)
	if err != nil || f.LinkedAccountID == "" {
		return "", false
	}
	return f.LinkedAccountID, true
}

// applicationStateLabels — человекочитаемые формулировки нового состояния
// заявки для текста письма (FR-23). Презентационная деталь адаптера, не
// домена — тем же приёмом, что тексты писем в pkg/notify/templates.go.
var applicationStateLabels = map[appdomain.State]string{
	appdomain.StatePaid:       "оплата подтверждена",
	appdomain.StateRegistered: "боец зарегистрирован",
}

// ApplicationNotifier реализует application/domain.Notifier поверх
// tournament (глобальный переключатель + название турнира), nomination
// (название номинации), auth (получатели) и notify.Dispatcher (доставка).
type ApplicationNotifier struct {
	tournaments  *tournamentservice.Service
	nominations  *nomservice.Service
	recipients   *auth.RecipientsProvider
	dispatcher   *notify.Dispatcher
	publicAppURL string
	log          *slog.Logger
}

// NewApplicationNotifier создаёт нотификатор модуля application.
func NewApplicationNotifier(pool *pgxpool.Pool, dispatcher *notify.Dispatcher, recipients *auth.RecipientsProvider, publicAppURL string, log *slog.Logger) *ApplicationNotifier {
	tRepo := tournamentrepo.New(pool)
	nRepo := nomrepo.New(pool)
	return &ApplicationNotifier{
		tournaments: tournamentservice.New(tRepo, nil, nil),
		// tournaments/pools/bouts аргументы nomservice не нужны: адаптер
		// только читает номинацию по id (Get), не создаёт/не удаляет её.
		nominations:  nomservice.New(nRepo, nil, nil, nil),
		recipients:   recipients,
		dispatcher:   dispatcher,
		publicAppURL: publicAppURL,
		log:          log,
	}
}

var _ appdomain.Notifier = (*ApplicationNotifier)(nil)

// ApplicationStateChanged резолвит письмо и кладёт его в очередь. См.
// комментарий в начале файла — резолв идёт в отдельной горутине (FR-28),
// контекст запроса не наследуется (может быть отменён раньше, чем
// завершится резолв) — используется отдельный context.Background().
func (n *ApplicationNotifier) ApplicationStateChanged(_ context.Context, in appdomain.ApplicationNotice) {
	go func() {
		ctx := context.Background()

		tournament, err := n.tournaments.GetActive(ctx)
		if err != nil {
			n.log.Error("application notifier: get active tournament", "err", err)
			return
		}
		if !tournament.Notifications.ApplicationState {
			return
		}

		label, ok := applicationStateLabels[in.NewState]
		if !ok {
			// Состояние, для которого письма не предусмотрены (FR-23
			// перечисляет ровно два — подтверждение оплаты и регистрация
			// бойца; правка заявки организатором не меняет State).
			return
		}

		nomination, err := n.nominations.Get(ctx, in.NominationID)
		if err != nil {
			n.log.Error("application notifier: get nomination", "err", err)
			return
		}

		recipients, err := n.recipients.Recipients(ctx, "application_state", []string{in.ApplicantUserID})
		if err != nil {
			n.log.Error("application notifier: resolve recipients", "err", err)
			return
		}
		email, ok := recipients[in.ApplicantUserID]
		if !ok {
			return
		}

		link := n.publicAppURL + "/dashboard"
		msg := notify.ApplicationStateChanged(tournament.Title, nomination.Title, label, link)
		msg.To = email
		n.dispatcher.Enqueue(msg)
	}()
}

// StageNotifier реализует stage/domain.Notifier поверх tournament
// (глобальный переключатель + название турнира), nomination (название
// номинации), fighter (связь боец→учётка), auth (получатели) и
// notify.Dispatcher (доставка).
type StageNotifier struct {
	tournaments  *tournamentservice.Service
	nominations  *nomservice.Service
	fighters     *fighterAccountResolver
	recipients   *auth.RecipientsProvider
	dispatcher   *notify.Dispatcher
	publicAppURL string
	log          *slog.Logger
}

// fighterAccountsPort — узкий алиас fighter/domain.AccountDirectory,
// избегающий прямого импорта пакета fighter/domain здесь только ради типа
// параметра конструктора.
type fighterAccountsPort = interface {
	DisplayNames(ctx context.Context, ids []string) (map[string]string, error)
}

// NewStageNotifier создаёт нотификатор модуля stage. accounts — тот же
// auth.DisplayNameProvider, что уже собран для fighter.Deps.Accounts
// (platform.go) — переиспользуется, не дублируется.
func NewStageNotifier(pool *pgxpool.Pool, dispatcher *notify.Dispatcher, recipients *auth.RecipientsProvider, accounts fighterAccountsPort, publicAppURL string, log *slog.Logger) *StageNotifier {
	tRepo := tournamentrepo.New(pool)
	nRepo := nomrepo.New(pool)
	return &StageNotifier{
		tournaments:  tournamentservice.New(tRepo, nil, nil),
		nominations:  nomservice.New(nRepo, nil, nil, nil),
		fighters:     newFighterAccountResolver(pool, accounts),
		recipients:   recipients,
		dispatcher:   dispatcher,
		publicAppURL: publicAppURL,
		log:          log,
	}
}

var _ stagedomain.Notifier = (*StageNotifier)(nil)

// PoolSeated резолвит письма всем бойцам пула со связанной учёткой и
// включённым уведомлением, кладёт их в очередь. Резолв — в отдельной
// горутине, см. комментарий в начале файла (FR-28).
func (n *StageNotifier) PoolSeated(_ context.Context, in stagedomain.PoolSeatedNotice) {
	go func() {
		ctx := context.Background()

		tournament, err := n.tournaments.GetActive(ctx)
		if err != nil {
			n.log.Error("stage notifier: get active tournament", "err", err)
			return
		}
		if !tournament.Notifications.PoolSeated {
			return
		}

		nomination, err := n.nominations.Get(ctx, in.NominationID)
		if err != nil {
			n.log.Error("stage notifier: get nomination", "err", err)
			return
		}

		userIDs := make([]string, 0, len(in.FighterIDs))
		for _, fighterID := range in.FighterIDs {
			if userID, ok := n.fighters.accountForFighter(ctx, fighterID); ok {
				userIDs = append(userIDs, userID)
			}
		}
		if len(userIDs) == 0 {
			return
		}

		recipients, err := n.recipients.Recipients(ctx, "pool_seated", userIDs)
		if err != nil {
			n.log.Error("stage notifier: resolve recipients", "err", err)
			return
		}

		link := n.publicAppURL + "/nominations/" + in.NominationID
		for _, email := range recipients {
			msg := notify.PoolSeated(tournament.Title, nomination.Title, in.PoolName, in.ArenaName, link)
			msg.To = email
			n.dispatcher.Enqueue(msg)
		}
	}()
}
