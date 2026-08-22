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

	"github.com/google/uuid"

	"github.com/hema/server/modules/bout/domain"
)

const maxAppendAttempts = 2

// Клэмп лимита ListEventsForPools (спека 0033, FR-33 / plan.md "service/
// service.go"): 0 (не задан клиентом) → дефолт, > max → max.
const (
	defaultEventsForPoolsLimit = 50
	maxEventsForPoolsLimit     = 200
)

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
// (FR-3, спека 0010) и сохраняет их одним вызовом ReplaceForPools —
// idempotent replace (spec 0010 «Принятые решения» №3): прежние бои
// перечисленных пулов стираются, новые вставляются со стартовым состоянием
// not_started/0:0 и событием scheduled (version 1, спека 0013). Адресация
// удаления — явный список пулов этапа (все p.PoolID из pools), а не
// номинация целиком (спека 0018): бои пулов другого этапа той же номинации
// не трогаются — это регресс латентного бага 0017, где номинационный
// replace стёр бы их при фиксации второго этапа. nominationID сохраняется
// не для адресации, а как снапшот-поле payload события scheduled (бой
// по-прежнему принадлежит номинации, спека 0017 план «Модуль bout»).
func (s *Service) GenerateForStage(ctx context.Context, nominationID string, pools []domain.PoolInput) error {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.ErrInvalidInput
	}

	now := time.Now()
	poolIDs := make([]string, 0, len(pools))
	var bouts []domain.Bout
	for _, p := range pools {
		poolIDs = append(poolIDs, p.PoolID)
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
	return s.repo.ReplaceForPools(ctx, poolIDs, bouts)
}

// ScheduleBout материализует единичный бой (пару сетки, спека 0018, FR-14)
// без удаления чего-либо — в отличие от GenerateForStage/ReplaceForPools,
// это точечная вставка, а не замена состава контейнера. Совместим по смыслу
// с портом modules/stage/domain.BoutConductor.ScheduleBout (round/sequence —
// координаты пары внутри своего контейнера, как у GenerateForStage).
// Возвращает id созданного боя.
func (s *Service) ScheduleBout(ctx context.Context, nominationID, poolID string, round, sequence int, a, b domain.FighterRef) (string, error) {
	nominationID = strings.TrimSpace(nominationID)
	poolID = strings.TrimSpace(poolID)
	if nominationID == "" || poolID == "" {
		return "", domain.ErrInvalidInput
	}

	ev, err := domain.Scheduled(poolID, nominationID, round, sequence, a, b, time.Now())
	if err != nil {
		return "", err
	}
	bt, err := domain.Rebuild("pending", []domain.Event{ev})
	if err != nil {
		return "", err
	}
	bt.ID = uuid.NewString() // назначается здесь, а не репозиторием: id нужен вызывающему сразу

	if err := s.repo.ScheduleBouts(ctx, []domain.Bout{bt}); err != nil {
		return "", err
	}
	return bt.ID, nil
}

// DeleteBouts точечно удаляет перечисленные бои (снятие продвижения при
// пересмотре результата, спека 0018, FR-16). Тонкая обёртка над репо —
// валидация состояния (например, что следующий бой ещё не начат) — забота
// вызывающего модуля (stage).
func (s *Service) DeleteBouts(ctx context.Context, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	return s.repo.DeleteBouts(ctx, ids)
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

// ListEventsForPools возвращает журнал боёв перечисленных пулов (спека
// 0033, FR-33) — для будущего RPC GetArenaJournal модуля stage. Клэмпит
// лимит (0 → defaultEventsForPoolsLimit, > max → maxEventsForPoolsLimit) и
// защищает от пустого списка пулов: пустой срез без обращения к репозиторию
// (тот же приём, что AnyStartedInPools/ClearForPools) — площадка без пула
// (AC-20) не должна порождать запрос к хранилищу.
func (s *Service) ListEventsForPools(ctx context.Context, poolIDs []string, limit int) ([]domain.EventRecord, error) {
	if len(poolIDs) == 0 {
		return nil, nil
	}
	switch {
	case limit <= 0:
		limit = defaultEventsForPoolsLimit
	case limit > maxEventsForPoolsLimit:
		limit = maxEventsForPoolsLimit
	}
	return s.repo.EventsForPools(ctx, poolIDs, limit)
}

// TimesForPools возвращает фактическое время начала/завершения каждого боя
// перечисленных пулов (спека 0034, FR-16) — источник для публичной ленты
// турнира модуля stage. Гейтит пустой список пулов так же, как
// ListEventsForPools/AnyStartedInPools: без обращения к репозиторию.
func (s *Service) TimesForPools(ctx context.Context, poolIDs []string) (map[string]domain.BoutTimes, error) {
	if len(poolIDs) == 0 {
		return map[string]domain.BoutTimes{}, nil
	}
	return s.repo.BoutTimesForPools(ctx, poolIDs)
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
