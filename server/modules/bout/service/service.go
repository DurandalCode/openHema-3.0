// Package service содержит бизнес-логику модуля bout: формирование/очистка
// боёв пулов номинации (спека 0010) и event-sourced жизненный цикл боя
// (спека 0013, ADR 0011). Лайфсайкл-команды идут по циклу load stream →
// rebuild (fold) → decide (доменная команда) → append; конфликт версии —
// один прозрачный повтор, затем ErrConcurrency наружу (ADR 0011 п.3).
package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/hema/server/modules/bout/domain"
)

const maxAppendAttempts = 2

// Service реализует юзкейсы модуля bout. Зависит от порта, не от pg/proto.
// bout ни от кого не зависит (см. plan.md «Обзор решения»).
type Service struct {
	repo domain.Repository
}

// New создаёт сервис bout.
func New(repo domain.Repository) *Service {
	return &Service{repo: repo}
}

// GenerateForStage формирует бои для каждого пула этапа round-robin'ом
// (FR-3, спека 0010) и сохраняет их одним вызовом ReplaceForNomination —
// idempotent replace (spec 0010 «Принятые решения» №3): предыдущие бои
// номинации стираются, новые вставляются со стартовым состоянием
// not_started/0:0 и событием scheduled (version 1, спека 0013). nominationID
// сохраняется не для адресации, а как снапшот-поле payload события
// scheduled (бой по-прежнему принадлежит номинации, спека 0017 план
// «Модуль bout»): в этом инкременте у номинации ровно один этап (FR-4), так
// что номинационный replace здесь эквивалентен этапному.
func (s *Service) GenerateForStage(ctx context.Context, nominationID string, pools []domain.PoolInput) error {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.ErrInvalidInput
	}

	now := time.Now()
	var bouts []domain.Bout
	for _, p := range pools {
		for _, pairing := range domain.GenerateRoundRobin(p.Fighters) {
			ev, err := domain.Scheduled(p.PoolID, nominationID, pairing.RoundNumber, pairing.SequenceNumber, pairing.A, pairing.B, now)
			if err != nil {
				return err
			}
			bt, err := domain.Rebuild("pending", []domain.Event{ev})
			if err != nil {
				return err
			}
			bt.ID = "" // назначается репозиторием при вставке
			bouts = append(bouts, bt)
		}
	}
	return s.repo.ReplaceForNomination(ctx, nominationID, bouts)
}

// ClearForPools удаляет все бои перечисленных пулов (расфиксация этапа,
// спека 0017 FR-5/FR-8) — адресация по пулам этапа, а не по номинации:
// бои пулов других этапов той же номинации не трогаются. Пустой список —
// валидный no-op (нечего расфиксировать без пулов), не ошибка и не «стереть
// всё».
func (s *Service) ClearForPools(ctx context.Context, poolIDs []string) error {
	if len(poolIDs) == 0 {
		return nil
	}
	return s.repo.DeleteBoutsByPools(ctx, poolIDs)
}

// ListByNomination возвращает бои всех пулов номинации (passthrough к
// репозиторию — снапшот, без реконсиляции, см. spec 0010 «Вне скоупа»).
func (s *Service) ListByNomination(ctx context.Context, nominationID string) ([]domain.Bout, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.ListByNomination(ctx, nominationID)
}

// BoutsByPool возвращает бои одного пула (состояние/счёт), по sequence —
// для доски ведения пула (вызывается модулем pool через порт).
func (s *Service) BoutsByPool(ctx context.Context, poolID string) ([]domain.Bout, error) {
	poolID = strings.TrimSpace(poolID)
	if poolID == "" {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.BoutsByPool(ctx, poolID)
}

// GetBout возвращает проекцию одного боя.
func (s *Service) GetBout(ctx context.Context, boutID string) (domain.Bout, error) {
	boutID = strings.TrimSpace(boutID)
	if boutID == "" {
		return domain.Bout{}, domain.ErrNotFound
	}
	return s.repo.GetBout(ctx, boutID)
}

// PoolProgress возвращает total/started/finished боёв пула (FR-10 — статус
// пула вычисляется в модуле pool из этих чисел).
func (s *Service) PoolProgress(ctx context.Context, poolID string) (int, int, int, error) {
	poolID = strings.TrimSpace(poolID)
	if poolID == "" {
		return 0, 0, 0, domain.ErrInvalidInput
	}
	return s.repo.PoolProgress(ctx, poolID)
}

// AnyStartedInPools — есть ли среди боёв перечисленных пулов хотя бы один
// со state ≠ not_started (гейт расфиксации этапа, спека 0017 FR-8/FR-13).
// Пустой список — валидный no-op: false, без ошибки — не «есть начатые
// бои везде».
func (s *Service) AnyStartedInPools(ctx context.Context, poolIDs []string) (bool, error) {
	if len(poolIDs) == 0 {
		return false, nil
	}
	return s.repo.AnyStartedInPools(ctx, poolIDs)
}

// StartBout переводит бой не начат → идёт (FR-4).
func (s *Service) StartBout(ctx context.Context, boutID, actorID string, now time.Time) (domain.Bout, error) {
	return s.act(ctx, boutID, func(b domain.Bout) (domain.Event, error) {
		return b.Start(actorID, now)
	})
}

// ScoreBout вводит/правит счёт боя — абсолютная установка (FR-2/FR-2a).
func (s *Service) ScoreBout(ctx context.Context, boutID, actorID string, scoreA, scoreB int, now time.Time) (domain.Bout, error) {
	return s.act(ctx, boutID, func(b domain.Bout) (domain.Event, error) {
		return b.Score(actorID, scoreA, scoreB, now)
	})
}

// FinishBout переводит идёт → завершён (FR-5).
func (s *Service) FinishBout(ctx context.Context, boutID, actorID string, now time.Time) (domain.Bout, error) {
	return s.act(ctx, boutID, func(b domain.Bout) (domain.Event, error) {
		return b.Finish(actorID, now)
	})
}

// ReopenBout возвращает завершённый бой в ход (FR-6).
func (s *Service) ReopenBout(ctx context.Context, boutID, actorID string, now time.Time) (domain.Bout, error) {
	return s.act(ctx, boutID, func(b domain.Bout) (domain.Event, error) {
		return b.Reopen(actorID, now)
	})
}

// ResetBout возвращает начатый бой в исходное состояние (FR-6).
func (s *Service) ResetBout(ctx context.Context, boutID, actorID string, now time.Time) (domain.Bout, error) {
	return s.act(ctx, boutID, func(b domain.Bout) (domain.Event, error) {
		return b.Reset(actorID, now)
	})
}

// act реализует общий цикл load → rebuild → decide → append (ADR 0011) для
// лайфсайкл-команд боя. Конфликт версии — один прозрачный повтор
// (reload → redecide → reappend), затем ErrConcurrency наружу (не слепой
// ретрай-цикл, ADR 0011 п.3).
func (s *Service) act(ctx context.Context, boutID string, decide func(domain.Bout) (domain.Event, error)) (domain.Bout, error) {
	boutID = strings.TrimSpace(boutID)
	if boutID == "" {
		return domain.Bout{}, domain.ErrNotFound
	}

	var lastErr error
	for attempt := 0; attempt < maxAppendAttempts; attempt++ {
		events, err := s.repo.Load(ctx, boutID)
		if err != nil {
			return domain.Bout{}, err
		}
		current, err := domain.Rebuild(boutID, events)
		if err != nil {
			return domain.Bout{}, err
		}

		ev, err := decide(current)
		if err != nil {
			return domain.Bout{}, err
		}

		next, err := domain.Rebuild(boutID, append(events, ev))
		if err != nil {
			return domain.Bout{}, err
		}

		if err := s.repo.Append(ctx, boutID, current.Version, ev, next); err != nil {
			if errors.Is(err, domain.ErrConcurrency) {
				lastErr = err
				continue
			}
			return domain.Bout{}, err
		}
		return next, nil
	}
	return domain.Bout{}, lastErr
}
