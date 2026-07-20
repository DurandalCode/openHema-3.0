// Package service содержит бизнес-логику модуля nomination (юзкейсы).
package service

import (
	"context"
	"strings"

	"github.com/hema/server/modules/nomination/domain"
)

// Service реализует юзкейсы номинаций. Зависит от портов, не от pg/proto.
type Service struct {
	repo        domain.Repository
	tournaments domain.ActiveTournamentProvider
}

// New создаёт сервис nomination.
func New(repo domain.Repository, tournaments domain.ActiveTournamentProvider) *Service {
	return &Service{repo: repo, tournaments: tournaments}
}

// List возвращает номинации турнира по порядку. tournamentID обязателен и
// должен указывать на активный турнир (MVP).
func (s *Service) List(ctx context.Context, tournamentID string) ([]domain.Nomination, error) {
	tid, err := s.resolveTournament(ctx, tournamentID)
	if err != nil {
		return nil, err
	}
	return s.repo.ListByTournament(ctx, tid)
}

// Get возвращает номинацию по идентификатору.
func (s *Service) Get(ctx context.Context, id string) (domain.Nomination, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return domain.Nomination{}, domain.ErrInvalidInput
	}
	return s.repo.GetByID(ctx, id)
}

// Create создаёт номинацию у указанного турнира. tournamentID обязателен и
// должен указывать на активный турнир (MVP).
func (s *Service) Create(ctx context.Context, tournamentID string, in domain.CreateInput) (domain.Nomination, error) {
	tid, err := s.resolveTournament(ctx, tournamentID)
	if err != nil {
		return domain.Nomination{}, err
	}

	title, description, meta, err := normalizeAndValidate(in.Title, in.Description, in.FighterCapacity, in.HasFighterCapacity, in.Metadata)
	if err != nil {
		return domain.Nomination{}, err
	}
	in.Title = title
	in.Description = description
	in.Metadata = meta

	return s.repo.Create(ctx, tid, in)
}

// Update обновляет поля существующей номинации целиком. Идентификатор турнира
// неизменяем.
func (s *Service) Update(ctx context.Context, in domain.UpdateInput) (domain.Nomination, error) {
	id := strings.TrimSpace(in.ID)
	if id == "" {
		return domain.Nomination{}, domain.ErrInvalidInput
	}

	title, description, meta, err := normalizeAndValidate(in.Title, in.Description, in.FighterCapacity, in.HasFighterCapacity, in.Metadata)
	if err != nil {
		return domain.Nomination{}, err
	}
	in.ID = id
	in.Title = title
	in.Description = description
	in.Metadata = meta

	return s.repo.Update(ctx, in)
}

// Delete удаляет номинацию по идентификатору.
func (s *Service) Delete(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return domain.ErrInvalidInput
	}
	return s.repo.Delete(ctx, id)
}

// Reorder задаёт порядок номинаций турнира целиком. orderedIDs должен
// содержать ровно текущий набор id номинаций турнира (без повторов), иначе
// ErrInvalidInput.
func (s *Service) Reorder(ctx context.Context, tournamentID string, orderedIDs []string) ([]domain.Nomination, error) {
	tid, err := s.resolveTournament(ctx, tournamentID)
	if err != nil {
		return nil, err
	}

	current, err := s.repo.ListByTournament(ctx, tid)
	if err != nil {
		return nil, err
	}
	if len(orderedIDs) != len(current) {
		return nil, domain.ErrInvalidInput
	}
	currentSet := make(map[string]struct{}, len(current))
	for _, n := range current {
		currentSet[n.ID] = struct{}{}
	}
	seen := make(map[string]struct{}, len(orderedIDs))
	for _, id := range orderedIDs {
		if _, ok := currentSet[id]; !ok {
			return nil, domain.ErrInvalidInput
		}
		if _, dup := seen[id]; dup {
			return nil, domain.ErrInvalidInput
		}
		seen[id] = struct{}{}
	}

	return s.repo.Reorder(ctx, tid, orderedIDs)
}

// CloseRegistration закрывает приём заявок в номинацию вручную (FR-3, AC-3).
// Идемпотентна: если номинация уже закрыта (любой причиной), возвращает
// текущее значение без записи — ClosedReason не перезаписывается, иначе
// повторный клик «Закрыть» на уже закрытой от раскладки номинации тихо
// перепривязал бы причину и сломал бы гейты FR-4/FR-6 (см. «Риски» plan.md).
func (s *Service) CloseRegistration(ctx context.Context, id string) (domain.Nomination, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return domain.Nomination{}, domain.ErrInvalidInput
	}
	current, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return domain.Nomination{}, err
	}
	if current.Status == domain.StatusClosed {
		return current, nil
	}
	return s.repo.SetRegistrationState(ctx, id, domain.StatusClosed, domain.ClosedReasonManual, current.HasDistributedFighters)
}

// ReopenRegistration открывает приём заявок обратно после ручного закрытия
// (FR-3, AC-4). Идемпотентна на уже open. Разрешена только если оба условия
// верны: закрытие было ручным (ClosedReason == Manual) и сейчас нет
// распределённых бойцов (HasDistributedFighters == false) — иначе
// ErrCannotReopen (FR-4, AC-9/AC-16).
func (s *Service) ReopenRegistration(ctx context.Context, id string) (domain.Nomination, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return domain.Nomination{}, domain.ErrInvalidInput
	}
	current, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return domain.Nomination{}, err
	}
	if current.Status == domain.StatusOpen {
		return current, nil
	}
	if current.ClosedReason != domain.ClosedReasonManual || current.HasDistributedFighters {
		return domain.Nomination{}, domain.ErrCannotReopen
	}
	return s.repo.SetRegistrationState(ctx, id, domain.StatusOpen, domain.ClosedReasonNone, false)
}

// SyncRegistrationState синхронизирует статус номинации с фактическим
// состоянием раскладки пулов (FR-5/FR-6/FR-10, push из модуля pool после
// мутирующих операций). hasDistributed — есть ли сейчас ≥1 распределённый
// боец номинации.
//
// Правила перехода:
//   - hasDistributed && Status == Open → (Closed, Drawing) — автозакрытие
//     при первом посаде бойца (AC-7);
//   - !hasDistributed && Status == Closed && ClosedReason == Drawing →
//     (Open, None) — автооткат при полном удалении раскладки (AC-10);
//   - иначе — статус/причина не меняются (в частности Closed+Manual не
//     трогается ни в какую сторону — FR-6/AC-11/AC-16).
//
// В любом случае HasDistributedFighters обновляется до hasDistributed —
// нужно ReopenRegistration'у для гейта AC-16, даже когда status/reason не
// меняются. Идемпотентна.
func (s *Service) SyncRegistrationState(ctx context.Context, nominationID string, hasDistributed bool) error {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.ErrInvalidInput
	}
	current, err := s.repo.GetByID(ctx, nominationID)
	if err != nil {
		return err
	}

	status := current.Status
	reason := current.ClosedReason
	switch {
	case hasDistributed && current.Status == domain.StatusOpen:
		status = domain.StatusClosed
		reason = domain.ClosedReasonDrawing
	case !hasDistributed && current.Status == domain.StatusClosed && current.ClosedReason == domain.ClosedReasonDrawing:
		status = domain.StatusOpen
		reason = domain.ClosedReasonNone
	}

	_, err = s.repo.SetRegistrationState(ctx, nominationID, status, reason, hasDistributed)
	return err
}

// resolveTournament проверяет, что tournamentID непустой и указывает на
// активный турнир (в MVP — единственный способ существования турнира).
// Любая ошибка провайдера (в т.ч. «активного турнира нет») мапится в
// ErrNotFound, не раскрывая деталей модуля tournament.
func (s *Service) resolveTournament(ctx context.Context, tournamentID string) (string, error) {
	tournamentID = strings.TrimSpace(tournamentID)
	if tournamentID == "" {
		return "", domain.ErrInvalidInput
	}
	activeID, err := s.tournaments.ActiveTournamentID(ctx)
	if err != nil {
		return "", domain.ErrNotFound
	}
	if tournamentID != activeID {
		return "", domain.ErrNotFound
	}
	return tournamentID, nil
}

// normalizeAndValidate триммит текстовые поля и проверяет инварианты,
// общие для Create и Update: непустой title, неотрицательная вместимость.
func normalizeAndValidate(title, description string, capacity int32, hasCapacity bool, meta domain.Metadata) (string, string, domain.Metadata, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return "", "", domain.Metadata{}, domain.ErrInvalidInput
	}
	if hasCapacity && capacity < 0 {
		return "", "", domain.Metadata{}, domain.ErrInvalidInput
	}
	description = strings.TrimSpace(description)
	meta.RulesURL = strings.TrimSpace(meta.RulesURL)
	return title, description, meta, nil
}
