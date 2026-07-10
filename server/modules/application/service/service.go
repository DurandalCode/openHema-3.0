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
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/hema/server/modules/application/domain"
)

const maxAppendAttempts = 2

// Application — заявка, обогащённая отображаемым именем заявителя (резолв из
// домена auth через UserProvider; в журнале/проекции имя не хранится).
type Application struct {
	ID                   string
	NominationID         string
	TournamentID         string
	ApplicantUserID      string
	ApplicantDisplayName string
	State                domain.State
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

// HistoryEvent — одна запись истории заявки (для GetApplication).
type HistoryEvent struct {
	Type       domain.EventType
	ActorID    string
	OccurredAt time.Time
	Sequence   int
}

// Participant — элемент публичного стартового листа номинации.
type Participant struct {
	DisplayName string
	State       domain.State
}

// Service реализует юзкейсы заявок. Зависит от портов, не от pg/proto.
type Service struct {
	repo        domain.Repository
	nominations domain.NominationProvider
	users       domain.UserProvider
}

// New создаёт сервис application.
func New(repo domain.Repository, nominations domain.NominationProvider, users domain.UserProvider) *Service {
	return &Service{repo: repo, nominations: nominations, users: users}
}

// Submit подаёт заявку callerID в номинацию. Резолвит tournament_id номинации
// через NominationProvider; предпроверяет активный дубль (быстрый отказ —
// финальный арбитр гонки — partial unique index в Append).
func (s *Service) Submit(ctx context.Context, callerID, nominationID string) (Application, error) {
	callerID = strings.TrimSpace(callerID)
	nominationID = strings.TrimSpace(nominationID)
	if callerID == "" || nominationID == "" {
		return Application{}, domain.ErrInvalidTransition
	}

	info, err := s.nominations.Nomination(ctx, nominationID)
	if err != nil {
		return Application{}, domain.ErrNominationNotFound
	}

	exists, err := s.repo.ActiveExists(ctx, callerID, nominationID)
	if err != nil {
		return Application{}, err
	}
	if exists {
		return Application{}, domain.ErrDuplicateActive
	}

	ev, err := domain.Submit(nominationID, info.TournamentID, callerID, time.Now())
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
// вне домена, интерсептором RequireAdmin).
func (s *Service) ConfirmPayment(ctx context.Context, actorID, appID string) (Application, error) {
	return s.act(ctx, appID, func(a domain.Application) (domain.Event, error) {
		return a.ConfirmPayment(actorID, time.Now())
	})
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
		return out, capacityExceeded, err
	}
	return Application{}, false, lastErr
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

	out, err := s.enrich(ctx, app)
	if err != nil {
		return Application{}, nil, err
	}
	return out, toHistory(events), nil
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

// ListApplications — сводный экран заявок турнира с опциональными фильтрами
// по статусу и/или номинации (комбинируются).
func (s *Service) ListApplications(ctx context.Context, tournamentID string, status *domain.State, nominationID *string) ([]Application, error) {
	tournamentID = strings.TrimSpace(tournamentID)
	if tournamentID == "" {
		return nil, domain.ErrInvalidTransition
	}
	views, err := s.repo.ListByTournament(ctx, tournamentID, status, nominationID)
	if err != nil {
		return nil, err
	}
	return s.enrichViews(ctx, views)
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
		participants = append(participants, Participant{DisplayName: names[v.ApplicantUserID], State: v.State})
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
	return Application{
		ID:                   app.ID,
		NominationID:         app.NominationID,
		TournamentID:         app.TournamentID,
		ApplicantUserID:      app.ApplicantUserID,
		ApplicantDisplayName: names[app.ApplicantUserID],
		State:                app.State,
		CreatedAt:            app.CreatedAt,
		UpdatedAt:            app.UpdatedAt,
	}, nil
}

func (s *Service) enrichViews(ctx context.Context, views []domain.ApplicationView) ([]Application, error) {
	names, err := s.users.DisplayNames(ctx, uniqueApplicantIDs(views))
	if err != nil {
		return nil, err
	}
	out := make([]Application, 0, len(views))
	for _, v := range views {
		out = append(out, Application{
			ID:                   v.ID,
			NominationID:         v.NominationID,
			TournamentID:         v.TournamentID,
			ApplicantUserID:      v.ApplicantUserID,
			ApplicantDisplayName: names[v.ApplicantUserID],
			State:                v.State,
			CreatedAt:            v.CreatedAt,
			UpdatedAt:            v.UpdatedAt,
		})
	}
	return out, nil
}

func toView(app domain.Application) domain.ApplicationView {
	return domain.ApplicationView{
		ID:              app.ID,
		NominationID:    app.NominationID,
		TournamentID:    app.TournamentID,
		ApplicantUserID: app.ApplicantUserID,
		State:           app.State,
		Version:         app.Version,
		CreatedAt:       app.CreatedAt,
		UpdatedAt:       app.UpdatedAt,
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
