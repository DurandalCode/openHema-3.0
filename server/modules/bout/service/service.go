// Package service содержит бизнес-логику модуля bout (спека 0010):
// формирование/очистка боёв пулов номинации, чтение.
package service

import (
	"context"
	"strings"

	"github.com/hema/server/modules/bout/domain"
)

// Service реализует юзкейсы формирования боёв. Зависит от порта, не от
// pg/proto. bout ни от кого не зависит (см. plan.md «Обзор решения»).
type Service struct {
	repo domain.Repository
}

// New создаёт сервис bout.
func New(repo domain.Repository) *Service {
	return &Service{repo: repo}
}

// GenerateForNomination формирует бои для каждого пула номинации
// round-robin'ом (FR-3) и сохраняет их одним вызовом
// ReplaceForNomination — idempotent replace (spec «Принятые решения» №3):
// предыдущие бои номинации стираются, новые вставляются.
func (s *Service) GenerateForNomination(ctx context.Context, nominationID string, pools []domain.PoolInput) error {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.ErrInvalidInput
	}

	var bouts []domain.Bout
	for _, p := range pools {
		for _, pairing := range domain.GenerateRoundRobin(p.Fighters) {
			bouts = append(bouts, domain.Bout{
				PoolID:         p.PoolID,
				NominationID:   nominationID,
				RoundNumber:    pairing.RoundNumber,
				SequenceNumber: pairing.SequenceNumber,
				FighterA:       pairing.A,
				FighterB:       pairing.B,
			})
		}
	}
	return s.repo.ReplaceForNomination(ctx, nominationID, bouts)
}

// ClearForNomination удаляет все бои номинации (FR-5) — тот же
// ReplaceForNomination с пустым списком.
func (s *Service) ClearForNomination(ctx context.Context, nominationID string) error {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.ErrInvalidInput
	}
	return s.repo.ReplaceForNomination(ctx, nominationID, nil)
}

// ListByNomination возвращает бои всех пулов номинации (passthrough к
// репозиторию — снапшот, без реконсиляции, см. spec «Вне скоупа»).
func (s *Service) ListByNomination(ctx context.Context, nominationID string) ([]domain.Bout, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.ListByNomination(ctx, nominationID)
}
