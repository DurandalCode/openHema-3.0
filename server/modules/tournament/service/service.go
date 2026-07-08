// Package service содержит бизнес-логику модуля tournament (юзкейсы).
package service

import (
	"context"
	"strings"

	"github.com/hema/server/modules/tournament/domain"
)

// Service реализует юзкейсы турнира. Зависит от порта, не от pg/proto.
type Service struct {
	repo domain.Repository
}

// New создаёт сервис tournament.
func New(repo domain.Repository) *Service {
	return &Service{repo: repo}
}

// GetActive возвращает активный турнир с контактами для главной страницы.
func (s *Service) GetActive(ctx context.Context) (domain.Tournament, error) {
	return s.repo.GetActive(ctx)
}

// UpdateActive обновляет поля активного турнира. Валидирует входные данные
// (непустой title, допустимые типы и значения контактов, корректность дат
// проведения) и делегирует замену контактов репозиторию.
//
// Правила для дат проведения (см. domain.UpdateInput):
//   - оба поля опциональны;
//   - конец без начала невалиден;
//   - конец должен быть не раньше начала.
func (s *Service) UpdateActive(ctx context.Context, in domain.UpdateInput) (domain.Tournament, error) {
	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" {
		return domain.Tournament{}, domain.ErrInvalidInput
	}
	in.Description = strings.TrimSpace(in.Description)
	in.EmblemURL = strings.TrimSpace(in.EmblemURL)

	// Валидация диапазона дат проведения.
	if in.HasEventEndAt && !in.HasEventStartAt {
		return domain.Tournament{}, domain.ErrInvalidInput
	}
	if in.HasEventStartAt && in.HasEventEndAt && in.EventEndAt.Before(in.EventStartAt) {
		return domain.Tournament{}, domain.ErrInvalidInput
	}

	contacts := make([]domain.ContactInput, 0, len(in.Contacts))
	for _, c := range in.Contacts {
		c.Value = strings.TrimSpace(c.Value)
		if c.Value == "" {
			return domain.Tournament{}, domain.ErrInvalidInput
		}
		if _, ok := domain.ValidContactTypes[c.Type]; !ok {
			return domain.Tournament{}, domain.ErrInvalidInput
		}
		contacts = append(contacts, c)
	}
	in.Contacts = contacts

	return s.repo.UpdateActive(ctx, in)
}