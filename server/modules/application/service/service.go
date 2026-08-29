// Package service содержит бизнес-логику модуля application (юзкейсы).
//
// Каждая команда идёт по циклу load stream → rebuild (fold) → decide
// (доменная команда) → append (ADR 0011). Оптимистичная конкуренция:
// конфликт версии при Append — один прозрачный повтор, затем ErrConcurrency
// наружу.
package service

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/hema/server/modules/application/domain"
)

const maxAppendAttempts = 2

// Application — заявка, обогащённая отображаемым именем заявителя.
// ApplicantDisplayName — эффективное имя: переопределение (если задано
// админом), иначе имя из домена auth (резолв через UserProvider; ни то, ни
// другое не хранится в журнале — override живёт в заявке, имя из auth — в
// профиле пользователя).
type Application struct {
	ID                    string
	NominationID          string
	TournamentID          string
	ApplicantUserID       string
	ApplicantDisplayName  string
	State                 domain.State
	Club                  string
	NeedsEquipment        bool
	ApplicantNameOverride string
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

// HistoryEvent — одна запись истории заявки (для GetApplication).
// ActorDisplayName — обогащение на чтении (спека 0025, FR-19): не хранится в
// журнале, резолвится батчем через UserProvider в Service.Get, как
// ApplicantDisplayName у Application. Пустая строка — имя недоступно.
type HistoryEvent struct {
	Type             domain.EventType
	ActorID          string
	OccurredAt       time.Time
	Sequence         int
	ActorDisplayName string
}

// Participant — элемент публичного стартового листа номинации.
type Participant struct {
	DisplayName string
	State       domain.State
	// Club — публичное поле (поправка 0006 в спеке 0007): клуб бойца виден в
	// составе номинации.
	Club string
}

// EditInput — желаемые значения полей при админской правке заявки
// (спека 0006, FR-3). Club/NeedsEquipment/ApplicantNameOverride — полный
// снапшот (форма всегда шлёт текущее значение). NominationID/State —
// опциональны: nil = не менять.
type EditInput struct {
	Club                  string
	NeedsEquipment        bool
	ApplicantNameOverride string
	NominationID          *string
	State                 *domain.State
}

// Service реализует юзкейсы заявок. Зависит от портов, не от pg/proto.
type Service struct {
	repo        domain.Repository
	nominations domain.NominationProvider
	users       domain.UserProvider
	fighters    domain.FighterRegistrationSink
	notifier    domain.Notifier
}

// New создаёт сервис application. notifier — домен.Notifier (спека 0042,
// FR-23), опциональный вариадический параметр (не более одного значения):
// этот трек (0042, трек D) не трогает module.go/composition root (вне
// границ трека, см. задание трека), который сегодня вызывает New без
// пятого аргумента — вариадическая форма оставляет этот вызов рабочим без
// правки. Join-волна, подключая реальный адаптер уведомлений, передаст его
// сюда и обновит вызов New в module.go. Отсутствующий/nil notifier — валиден
// (уведомления выключены, no-op) — так продолжают работать все существующие
// вызовы New.
func New(repo domain.Repository, nominations domain.NominationProvider, users domain.UserProvider, fighters domain.FighterRegistrationSink, notifier ...domain.Notifier) *Service {
	var n domain.Notifier
	if len(notifier) > 0 {
		n = notifier[0]
	}
	return &Service{repo: repo, nominations: nominations, users: users, fighters: fighters, notifier: n}
}

// notify уведомляет заявителя о смене состояния заявки, автором которой он
// не является (FR-23). Вызывается после успешного применения события в
// хранилище — почта не должна и не может откатить уже свершившийся факт
// (FR-27). Notifier по контракту порта не возвращает ошибку, но паника
// внутри чужой реализации — гасится здесь через defer/recover и уходит в
// журнал, а не наружу вызывающему (FR-27/FR-28): доменная операция уже
// совершена и не должна зависеть от надёжности уведомления.
func (s *Service) notify(ctx context.Context, app Application) {
	if s.notifier == nil {
		return
	}
	defer func() {
		if r := recover(); r != nil {
			slog.Default().Error("application: notifier panicked", "err", r, "application_id", app.ID)
		}
	}()
	s.notifier.ApplicationStateChanged(ctx, domain.ApplicationNotice{
		ApplicantUserID: app.ApplicantUserID,
		NominationID:    app.NominationID,
		TournamentID:    app.TournamentID,
		NewState:        app.State,
	})
}

// Submit подаёт заявку callerID в номинацию. Резолвит tournament_id номинации
// через NominationProvider; проверяет, что приём заявок в номинацию открыт
// (FR-7, спека 0012, дешёвый fail-fast до ActiveExists/записи); предпроверяет
// активный дубль (быстрый отказ — финальный арбитр гонки — partial unique
// index в Append). club и needsEquipment — детали, указанные бойцом при
// подаче (FR-1, спека 0006).
func (s *Service) Submit(ctx context.Context, callerID, nominationID, club string, needsEquipment bool) (Application, error) {
	callerID = strings.TrimSpace(callerID)
	nominationID = strings.TrimSpace(nominationID)
	if callerID == "" || nominationID == "" {
		return Application{}, domain.ErrInvalidTransition
	}

	info, err := s.nominations.Nomination(ctx, nominationID)
	if err != nil {
		return Application{}, domain.ErrNominationNotFound
	}
	if !info.RegistrationOpen {
		return Application{}, domain.ErrRegistrationClosed
	}

	exists, err := s.repo.ActiveExists(ctx, callerID, nominationID)
	if err != nil {
		return Application{}, err
	}
	if exists {
		return Application{}, domain.ErrDuplicateActive
	}

	ev, err := domain.Submit(nominationID, info.TournamentID, callerID, club, needsEquipment, time.Now())
	if err != nil {
		return Application{}, err
	}

	appID := uuid.NewString()
	app, err := domain.Rebuild(appID, []domain.Event{ev})
	if err != nil {
		return Application{}, err
	}

	if err := s.repo.Append(ctx, appID, 0, ev, toView(app)); err != nil {
		return Application{}, err
	}
	return s.enrich(ctx, app)
}

// DeclarePayment отмечает оплату собственной заявки заявителем.
func (s *Service) DeclarePayment(ctx context.Context, callerID, appID string) (Application, error) {
	return s.act(ctx, appID, func(a domain.Application) (domain.Event, error) {
		return a.DeclarePayment(callerID, time.Now())
	})
}

// ConfirmPayment подтверждает оплату (секретарь/admin — доступ проверяется
// вне домена, интерсептором RequireAdmin). Уведомляет заявителя (FR-23,
// спека 0042) — подтверждение не его собственное действие.
func (s *Service) ConfirmPayment(ctx context.Context, actorID, appID string) (Application, error) {
	out, err := s.act(ctx, appID, func(a domain.Application) (domain.Event, error) {
		return a.ConfirmPayment(actorID, time.Now())
	})
	if err != nil {
		return Application{}, err
	}
	s.notify(ctx, out)
	return out, nil
}

// Withdraw отзывает собственную заявку заявителем из любого нетерминального
// состояния.
func (s *Service) Withdraw(ctx context.Context, callerID, appID string) (Application, error) {
	return s.act(ctx, appID, func(a domain.Application) (domain.Event, error) {
		return a.Withdraw(callerID, time.Now())
	})
}

// Register регистрирует оплаченную заявку (терминальный шаг). Возвращает
// мягкое предупреждение о переполнении номинации (soft cap), вычисленное по
// числу уже зарегистрированных бойцов до этой регистрации — не блокирует.
func (s *Service) Register(ctx context.Context, actorID, appID string) (Application, bool, error) {
	appID = strings.TrimSpace(appID)
	if appID == "" {
		return Application{}, false, domain.ErrNotFound
	}

	var lastErr error
	for attempt := 0; attempt < maxAppendAttempts; attempt++ {
		events, err := s.repo.Load(ctx, appID)
		if err != nil {
			return Application{}, false, err
		}
		current, err := domain.Rebuild(appID, events)
		if err != nil {
			return Application{}, false, err
		}

		ev, err := current.Register(actorID, time.Now())
		if err != nil {
			return Application{}, false, err
		}

		capacityExceeded, err := s.capacityExceeded(ctx, current.NominationID)
		if err != nil {
			return Application{}, false, err
		}

		next, err := domain.Rebuild(appID, append(events, ev))
		if err != nil {
			return Application{}, false, err
		}

		if err := s.repo.Append(ctx, appID, current.Version, ev, toView(next)); err != nil {
			if isConcurrencyConflict(err) {
				lastErr = err
				continue
			}
			return Application{}, false, err
		}

		out, err := s.enrich(ctx, next)
		if err != nil {
			return Application{}, false, err
		}

		if err := s.fighters.OnRegistered(ctx, domain.RegisteredFighter{
			TournamentID: out.TournamentID,
			NominationID: out.NominationID,
			OriginUserID: out.ApplicantUserID,
			Name:         out.ApplicantDisplayName,
			Club:         out.Club,
		}); err != nil {
			return Application{}, false, err
		}

		// Уведомляет заявителя (FR-23, спека 0042) — регистрация секретарём/
		// admin не его собственное действие.
		s.notify(ctx, out)

		return out, capacityExceeded, nil
	}
	return Application{}, false, lastErr
}

// EditApplication редактирует заявку (только admin, доступ проверяется вне
// домена — RequireAdmin): клуб, признак экипировки, переопределение имени,
// перенос в другую номинацию и/или ручную смену статуса (FR-3..FR-9,
// спека 0006). Допустимо над заявкой в любом состоянии, включая терминальные
// (FR-9). Фиксируется событием ApplicationAmended, не переписывая прошлое.
// Конфликт версии — один прозрачный повтор, затем ErrConcurrency.
func (s *Service) EditApplication(ctx context.Context, actorID, appID string, in EditInput) (Application, error) {
	appID = strings.TrimSpace(appID)
	if appID == "" {
		return Application{}, domain.ErrNotFound
	}

	var lastErr error
	for attempt := 0; attempt < maxAppendAttempts; attempt++ {
		events, err := s.repo.Load(ctx, appID)
		if err != nil {
			return Application{}, err
		}
		current, err := domain.Rebuild(appID, events)
		if err != nil {
			return Application{}, err
		}

		patch := domain.AmendPatch{
			Club:                  in.Club,
			NeedsEquipment:        in.NeedsEquipment,
			ApplicantNameOverride: in.ApplicantNameOverride,
			NewState:              in.State,
		}
		if in.NominationID != nil {
			targetNominationID := strings.TrimSpace(*in.NominationID)
			info, err := s.nominations.Nomination(ctx, targetNominationID)
			if err != nil {
				return Application{}, domain.ErrNominationNotFound
			}
			patch.NominationID = &targetNominationID
			patch.TournamentID = info.TournamentID
		}

		ev, err := current.Amend(actorID, patch, time.Now())
		if err != nil {
			return Application{}, err
		}

		next, err := domain.Rebuild(appID, append(events, ev))
		if err != nil {
			return Application{}, err
		}

		if err := s.repo.Append(ctx, appID, current.Version, ev, toView(next)); err != nil {
			if isConcurrencyConflict(err) {
				lastErr = err
				continue
			}
			return Application{}, err
		}
		out, err := s.enrich(ctx, next)
		if err != nil {
			return Application{}, err
		}
		// Уведомляет заявителя (FR-23, спека 0042) — правка организатором не
		// его собственное действие.
		s.notify(ctx, out)
		return out, nil
	}
	return Application{}, lastErr
}

// GetApplication возвращает заявку с историей. Доступна владельцу заявки или
// admin (callerIsAdmin — решается по роли на уровне api, домен ролей не знает).
func (s *Service) Get(ctx context.Context, callerID string, callerIsAdmin bool, appID string) (Application, []HistoryEvent, error) {
	appID = strings.TrimSpace(appID)
	if appID == "" {
		return Application{}, nil, domain.ErrNotFound
	}

	events, err := s.repo.Load(ctx, appID)
	if err != nil {
		return Application{}, nil, err
	}
	app, err := domain.Rebuild(appID, events)
	if err != nil {
		return Application{}, nil, err
	}
	if !callerIsAdmin && app.ApplicantUserID != callerID {
		return Application{}, nil, domain.ErrForbidden
	}

	history := toHistory(events)

	// Один батч на весь GetApplication: имя заявителя (для Application) и
	// имена авторов истории (спека 0025, FR-19) резолвятся вместе — не по
	// отдельному вызову на заявителя и на каждое событие.
	ids := append(uniqueActorIDs(history), app.ApplicantUserID)
	names, err := s.users.DisplayNames(ctx, dedupeIDs(ids))
	if err != nil {
		return Application{}, nil, err
	}
	out := enrichWithNames(app, names)
	for i := range history {
		history[i].ActorDisplayName = names[history[i].ActorID]
	}
	return out, history, nil
}

// ListMy возвращает заявки текущего пользователя.
func (s *Service) ListMy(ctx context.Context, callerID string) ([]Application, error) {
	views, err := s.repo.ListByApplicant(ctx, callerID)
	if err != nil {
		return nil, err
	}
	return s.enrichViews(ctx, views)
}

// ListByNomination возвращает все заявки номинации (admin-разрез).
func (s *Service) ListByNomination(ctx context.Context, nominationID string) ([]Application, error) {
	views, err := s.repo.ListByNomination(ctx, nominationID)
	if err != nil {
		return nil, err
	}
	return s.enrichViews(ctx, views)
}

// ListApplications — сводный экран заявок турнира с фильтром/поиском/
// постраничностью (спека 0041). Возвращает страницу, total (число заявок,
// подходящих под фильтр, без Limit/Offset — FR-5) и statusCounts (счётчик по
// каждому статусу турнира, не зависящий ни от одного из полей фильтра, кроме
// tournamentID — FR-4).
//
// Search — особый случай (см. domain.ListFilter, «Риски» plan.md 0041):
// отображаемое имя заявителя не хранится в read-модели заявки — это
// ApplicantNameOverride (локально), если задан, иначе имя резолвится через
// UserProvider (auth), кросс-модульно. Поэтому при активном Search сервис не
// может отдать фильтрацию по имени целиком в SQL:
//   - repo.SearchCandidates возвращает всех заявок турнира, подходящих под
//     статус/номинацию/экипировку (без Limit/Offset) — те, чей override уже
//     точно не совпадает с search, отсеяны в SQL; те, чей override пуст,
//     остаются кандидатами, т.к. их итоговое имя ещё не известно;
//   - здесь имена кандидатов резолвятся батчем (как в enrichViews) и
//     досеиваются по подстроке в эффективном имени (override ИЛИ
//     резолвленное) или по клубу; total и Limit/Offset — уже над этим
//     отфильтрованным в Go срезом.
//
// Без активного Search путь целиком в SQL: repo.ListByTournament уже
// применяет Limit/Offset и считает total отдельным COUNT(*) — это и есть
// путь, снимающий NFR-1 (не растёт с общим числом записей турнира).
func (s *Service) ListApplications(ctx context.Context, tournamentID string, f domain.ListFilter) ([]Application, int, map[domain.State]int, error) {
	tournamentID = strings.TrimSpace(tournamentID)
	if tournamentID == "" {
		return nil, 0, nil, domain.ErrInvalidTransition
	}

	statusCounts, err := s.repo.CountByTournamentStatus(ctx, tournamentID)
	if err != nil {
		return nil, 0, nil, err
	}

	search := f.Search
	if search != nil && strings.TrimSpace(*search) == "" {
		search = nil
	}

	if search == nil {
		views, total, err := s.repo.ListByTournament(ctx, tournamentID, f)
		if err != nil {
			return nil, 0, nil, err
		}
		items, err := s.enrichViews(ctx, views)
		if err != nil {
			return nil, 0, nil, err
		}
		return items, total, statusCounts, nil
	}

	candidates, err := s.repo.SearchCandidates(ctx, tournamentID, f)
	if err != nil {
		return nil, 0, nil, err
	}
	names, err := s.users.DisplayNames(ctx, uniqueApplicantIDs(candidates))
	if err != nil {
		return nil, 0, nil, err
	}

	needle := strings.ToLower(strings.TrimSpace(*search))
	matched := make([]domain.ApplicationView, 0, len(candidates))
	for _, v := range candidates {
		name := effectiveName(v.ApplicantNameOverride, names[v.ApplicantUserID])
		if strings.Contains(strings.ToLower(name), needle) || strings.Contains(strings.ToLower(v.Club), needle) {
			matched = append(matched, v)
		}
	}

	total := len(matched)
	page := paginateViews(matched, f.Limit, f.Offset)
	items := make([]Application, 0, len(page))
	for _, v := range page {
		items = append(items, Application{
			ID:                    v.ID,
			NominationID:          v.NominationID,
			TournamentID:          v.TournamentID,
			ApplicantUserID:       v.ApplicantUserID,
			ApplicantDisplayName:  effectiveName(v.ApplicantNameOverride, names[v.ApplicantUserID]),
			State:                 v.State,
			Club:                  v.Club,
			NeedsEquipment:        v.NeedsEquipment,
			ApplicantNameOverride: v.ApplicantNameOverride,
			CreatedAt:             v.CreatedAt,
			UpdatedAt:             v.UpdatedAt,
		})
	}
	return items, total, statusCounts, nil
}

// paginateViews режет уже отфильтрованный/отсортированный (по created_at —
// views приходят из repo.SearchCandidates, который сохраняет тот же
// ORDER BY, что и repo.ListByTournament) срез по Limit/Offset — та же
// семантика, что LIMIT/OFFSET в SQL (Limit<=0 → пустая страница, как
// ListUsers/admin.proto: сервис не задаёт свой дефолт/потолок поверх уже
// принятого в проекте).
func paginateViews(views []domain.ApplicationView, limit, offset int32) []domain.ApplicationView {
	start := int(offset)
	if start < 0 {
		start = 0
	}
	if start >= len(views) || limit <= 0 {
		return nil
	}
	end := start + int(limit)
	if end > len(views) {
		end = len(views)
	}
	out := make([]domain.ApplicationView, end-start)
	copy(out, views[start:end])
	return out
}

// NominationParticipants возвращает публичный стартовый лист номинации:
// имена заявленных/подтверждённых бойцов, счётчики и лимит (soft cap).
func (s *Service) NominationParticipants(ctx context.Context, nominationID string) ([]Participant, int, int, *int32, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return nil, 0, 0, nil, domain.ErrNominationNotFound
	}

	info, err := s.nominations.Nomination(ctx, nominationID)
	if err != nil {
		return nil, 0, 0, nil, err
	}

	views, err := s.repo.ParticipantsByNomination(ctx, nominationID)
	if err != nil {
		return nil, 0, 0, nil, err
	}
	applied, confirmed, err := s.repo.CountsByNomination(ctx, nominationID)
	if err != nil {
		return nil, 0, 0, nil, err
	}

	names, err := s.users.DisplayNames(ctx, uniqueApplicantIDs(views))
	if err != nil {
		return nil, 0, 0, nil, err
	}

	participants := make([]Participant, 0, len(views))
	for _, v := range views {
		participants = append(participants, Participant{
			DisplayName: effectiveName(v.ApplicantNameOverride, names[v.ApplicantUserID]),
			State:       v.State,
			Club:        v.Club,
		})
	}
	return participants, applied, confirmed, info.FighterCapacity, nil
}

// act реализует общий цикл load → rebuild → decide → append для команд,
// возвращающих одну обновлённую заявку (DeclarePayment/ConfirmPayment/
// Withdraw). Конфликт версии — один прозрачный повтор, затем ErrConcurrency.
func (s *Service) act(ctx context.Context, appID string, decide func(domain.Application) (domain.Event, error)) (Application, error) {
	appID = strings.TrimSpace(appID)
	if appID == "" {
		return Application{}, domain.ErrNotFound
	}

	var lastErr error
	for attempt := 0; attempt < maxAppendAttempts; attempt++ {
		events, err := s.repo.Load(ctx, appID)
		if err != nil {
			return Application{}, err
		}
		current, err := domain.Rebuild(appID, events)
		if err != nil {
			return Application{}, err
		}

		ev, err := decide(current)
		if err != nil {
			return Application{}, err
		}

		next, err := domain.Rebuild(appID, append(events, ev))
		if err != nil {
			return Application{}, err
		}

		if err := s.repo.Append(ctx, appID, current.Version, ev, toView(next)); err != nil {
			if isConcurrencyConflict(err) {
				lastErr = err
				continue
			}
			return Application{}, err
		}
		return s.enrich(ctx, next)
	}
	return Application{}, lastErr
}

func (s *Service) capacityExceeded(ctx context.Context, nominationID string) (bool, error) {
	info, err := s.nominations.Nomination(ctx, nominationID)
	if err != nil {
		return false, err
	}
	if info.FighterCapacity == nil {
		return false, nil
	}
	count, err := s.repo.CountRegistered(ctx, nominationID)
	if err != nil {
		return false, err
	}
	return int32(count) >= *info.FighterCapacity, nil
}

func (s *Service) enrich(ctx context.Context, app domain.Application) (Application, error) {
	names, err := s.users.DisplayNames(ctx, []string{app.ApplicantUserID})
	if err != nil {
		return Application{}, err
	}
	return enrichWithNames(app, names), nil
}

// enrichWithNames — чистая часть enrich: раскладывает уже резолвленную карту
// имён на Application, без обращения к порту. Вынесена, чтобы GetApplication
// мог резолвить имя заявителя тем же батчем, что и имена авторов истории
// (спека 0025, FR-19), не делая отдельный вызов DisplayNames.
func enrichWithNames(app domain.Application, names map[string]string) Application {
	return Application{
		ID:                    app.ID,
		NominationID:          app.NominationID,
		TournamentID:          app.TournamentID,
		ApplicantUserID:       app.ApplicantUserID,
		ApplicantDisplayName:  effectiveName(app.ApplicantNameOverride, names[app.ApplicantUserID]),
		State:                 app.State,
		Club:                  app.Club,
		NeedsEquipment:        app.NeedsEquipment,
		ApplicantNameOverride: app.ApplicantNameOverride,
		CreatedAt:             app.CreatedAt,
		UpdatedAt:             app.UpdatedAt,
	}
}

// dedupeIDs убирает повторы, сохраняя порядок первого появления.
func dedupeIDs(ids []string) []string {
	seen := make(map[string]struct{}, len(ids))
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func (s *Service) enrichViews(ctx context.Context, views []domain.ApplicationView) ([]Application, error) {
	names, err := s.users.DisplayNames(ctx, uniqueApplicantIDs(views))
	if err != nil {
		return nil, err
	}
	out := make([]Application, 0, len(views))
	for _, v := range views {
		out = append(out, Application{
			ID:                    v.ID,
			NominationID:          v.NominationID,
			TournamentID:          v.TournamentID,
			ApplicantUserID:       v.ApplicantUserID,
			ApplicantDisplayName:  effectiveName(v.ApplicantNameOverride, names[v.ApplicantUserID]),
			State:                 v.State,
			Club:                  v.Club,
			NeedsEquipment:        v.NeedsEquipment,
			ApplicantNameOverride: v.ApplicantNameOverride,
			CreatedAt:             v.CreatedAt,
			UpdatedAt:             v.UpdatedAt,
		})
	}
	return out, nil
}

// effectiveName — переопределение имени приоритетнее имени из auth; пустой
// override — откат к auth (спека 0006, FR-4).
func effectiveName(override, authName string) string {
	if override != "" {
		return override
	}
	return authName
}

func toView(app domain.Application) domain.ApplicationView {
	return domain.ApplicationView{
		ID:                    app.ID,
		NominationID:          app.NominationID,
		TournamentID:          app.TournamentID,
		ApplicantUserID:       app.ApplicantUserID,
		State:                 app.State,
		Club:                  app.Club,
		NeedsEquipment:        app.NeedsEquipment,
		ApplicantNameOverride: app.ApplicantNameOverride,
		Version:               app.Version,
		CreatedAt:             app.CreatedAt,
		UpdatedAt:             app.UpdatedAt,
	}
}

func toHistory(events []domain.Event) []HistoryEvent {
	out := make([]HistoryEvent, 0, len(events))
	for _, ev := range events {
		out = append(out, HistoryEvent{
			Type:       ev.Type,
			ActorID:    ev.ActorID,
			OccurredAt: ev.OccurredAt,
			Sequence:   ev.Sequence,
		})
	}
	return out
}

func uniqueActorIDs(history []HistoryEvent) []string {
	seen := make(map[string]struct{}, len(history))
	out := make([]string, 0, len(history))
	for _, ev := range history {
		if _, ok := seen[ev.ActorID]; ok {
			continue
		}
		seen[ev.ActorID] = struct{}{}
		out = append(out, ev.ActorID)
	}
	return out
}

func uniqueApplicantIDs(views []domain.ApplicationView) []string {
	seen := make(map[string]struct{}, len(views))
	out := make([]string, 0, len(views))
	for _, v := range views {
		if _, ok := seen[v.ApplicantUserID]; ok {
			continue
		}
		seen[v.ApplicantUserID] = struct{}{}
		out = append(out, v.ApplicantUserID)
	}
	return out
}

func isConcurrencyConflict(err error) bool {
	return errors.Is(err, domain.ErrConcurrency)
}
