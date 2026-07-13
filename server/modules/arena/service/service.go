// Package service содержит бизнес-логику модуля arena (юзкейсы).
package service

import (
	"context"
	"strings"

	"github.com/hema/server/modules/arena/domain"
)

// Service реализует юзкейсы площадок. Зависит от портов, не от pg/proto.
type Service struct {
	repo        domain.Repository
	tournaments domain.ActiveTournamentProvider
}

// New создаёт сервис arena.
func New(repo domain.Repository, tournaments domain.ActiveTournamentProvider) *Service {
	return &Service{repo: repo, tournaments: tournaments}
}

// List возвращает площадки турнира по порядку. tournamentID обязателен и
// должен указывать на активный турнир (MVP). Активные и архивные площадки
// присутствуют в выдаче, различимы по Status.
func (s *Service) List(ctx context.Context, tournamentID string) ([]domain.Arena, error) {
	tid, err := s.resolveTournament(ctx, tournamentID)
	if err != nil {
		return nil, err
	}
	return s.repo.ListByTournament(ctx, tid)
}

// Get возвращает площадку по идентификатору.
func (s *Service) Get(ctx context.Context, id string) (domain.Arena, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return domain.Arena{}, domain.ErrInvalidInput
	}
	return s.repo.GetByID(ctx, id)
}

// Create создаёт площадку у указанного турнира. tournamentID обязателен и
// должен указывать на активный турнир (MVP). Имя непустое (после тримминга).
func (s *Service) Create(ctx context.Context, tournamentID string, in domain.CreateInput) (domain.Arena, error) {
	tid, err := s.resolveTournament(ctx, tournamentID)
	if err != nil {
		return domain.Arena{}, err
	}
	name, description, err := normalizeAndValidate(in.Name, in.Description)
	if err != nil {
		return domain.Arena{}, err
	}
	in.Name = name
	in.Description = description
	return s.repo.Create(ctx, tid, in)
}

// Update обновляет редактируемые поля существующей площадки целиком.
// Идентификаторы (ID, TournamentID) неизменяемы.
func (s *Service) Update(ctx context.Context, in domain.UpdateInput) (domain.Arena, error) {
	id := strings.TrimSpace(in.ID)
	if id == "" {
		return domain.Arena{}, domain.ErrInvalidInput
	}
	name, description, err := normalizeAndValidate(in.Name, in.Description)
	if err != nil {
		return domain.Arena{}, err
	}
	in.ID = id
	in.Name = name
	in.Description = description
	return s.repo.Update(ctx, in)
}

// Archive убирает площадку в архив (обратимо). Идемпотентна: повторная
// архивация архивной площадки не возвращает ошибку.
func (s *Service) Archive(ctx context.Context, id string) (domain.Arena, error) {
	return s.setStatus(ctx, id, domain.StatusArchived)
}

// Restore возвращает площадку из архива. Идемпотентна: возврат активной
// площадки не возвращает ошибку.
func (s *Service) Restore(ctx context.Context, id string) (domain.Arena, error) {
	return s.setStatus(ctx, id, domain.StatusActive)
}

func (s *Service) setStatus(ctx context.Context, id string, status domain.Status) (domain.Arena, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return domain.Arena{}, domain.ErrInvalidInput
	}
	return s.repo.SetStatus(ctx, id, status)
}

// Reorder задаёт порядок площадок турнира целиком. orderedIDs должен
// содержать ровно текущий набор id площадок турнира (без повторов), иначе
// ErrInvalidInput.
func (s *Service) Reorder(ctx context.Context, tournamentID string, orderedIDs []string) ([]domain.Arena, error) {
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
	for _, a := range current {
		currentSet[a.ID] = struct{}{}
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

// resolveTournament проверяет, что tournamentID непустой и указывает на
// активный турнир (в MVP — единственный способ существования турнира).
// Любая ошибка провайдера (в т.ч. «активного турнира нет») мапится в
// ErrNotFound, не раскрывая детали модуля tournament.
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

// normalizeAndValidate триммит текстовые поля и проверяет инвариант
// непустого имени (общий для Create и Update).
func normalizeAndValidate(name, description string) (string, string, error) {
	name = strings.TrimSpace(name)
	if err := domain.ValidateName(name); err != nil {
		return "", "", err
	}
	description = strings.TrimSpace(description)
	return name, description, nil
}