// Package service содержит бизнес-логику модуля fighter (юзкейсы).
package service

import (
	"context"
	"errors"
	"strings"

	"github.com/hema/server/modules/fighter/domain"
)

// maxRegisterAttempts — попытки повтора RegisterFromApplication при гонке
// дедупликации (двух одновременных регистраций с одним origin_user_id).
const maxRegisterAttempts = 3

// Service реализует юзкейсы бойцов. Зависит от портов, не от pg/proto.
type Service struct {
	repo        domain.Repository
	nominations domain.NominationProvider
	tournaments domain.ActiveTournamentProvider
}

// New создаёт сервис fighter.
func New(repo domain.Repository, nominations domain.NominationProvider, tournaments domain.ActiveTournamentProvider) *Service {
	return &Service{repo: repo, nominations: nominations, tournaments: tournaments}
}

// RegistrationInput — данные для кроссдоменного создания/дополнения бойца
// при регистрации заявки (application → fighter, спека 0007 FR-4).
type RegistrationInput struct {
	TournamentID string
	NominationID string
	OriginUserID string
	Name         string
	Club         string
}

// RegisterFromApplication дедуплицирует бойца по (tournament_id,
// origin_user_id): если боец уже есть — добавляет участие в номинации, имя/
// клуб существующего бойца не перезаписывает (FR-5); иначе создаёт нового
// бойца со снапшотом имени/клуба. Идемпотентно под гонкой параллельных
// регистраций (retry на ErrOriginConflict).
func (s *Service) RegisterFromApplication(ctx context.Context, in RegistrationInput) (domain.Fighter, error) {
	tournamentID := strings.TrimSpace(in.TournamentID)
	originUserID := strings.TrimSpace(in.OriginUserID)
	if tournamentID == "" || originUserID == "" {
		return domain.Fighter{}, domain.ErrInvalidInput
	}

	for attempt := 0; attempt < maxRegisterAttempts; attempt++ {
		existing, err := s.repo.FindByOrigin(ctx, tournamentID, originUserID)
		if err == nil {
			if err := existing.AddParticipation(in.NominationID); err != nil {
				return domain.Fighter{}, err
			}
			return s.repo.Update(ctx, existing)
		}
		if !errors.Is(err, domain.ErrNotFound) {
			return domain.Fighter{}, err
		}

		f, err := domain.NewFromRegistration(tournamentID, originUserID, in.Name, in.Club, in.NominationID)
		if err != nil {
			return domain.Fighter{}, err
		}
		created, err := s.repo.Create(ctx, f)
		if err != nil {
			if errors.Is(err, domain.ErrOriginConflict) {
				continue // проиграли гонку создания — на следующей итерации найдём и добавим участие
			}
			return domain.Fighter{}, err
		}
		return created, nil
	}
	return domain.Fighter{}, domain.ErrOriginConflict
}

// CreateManual заводит бойца вручную (admin, без электронной заявки) и
// назначает его в переданные номинации. Без проверок лимитов/дублей (FR-6);
// каждая номинация проверяется на существование и принадлежность турниру.
func (s *Service) CreateManual(ctx context.Context, tournamentID, name, club string, nominationIDs []string) (domain.Fighter, error) {
	tournamentID = strings.TrimSpace(tournamentID)
	if tournamentID == "" {
		return domain.Fighter{}, domain.ErrInvalidInput
	}
	for _, nomID := range nominationIDs {
		if err := s.validateNomination(ctx, tournamentID, nomID); err != nil {
			return domain.Fighter{}, err
		}
	}

	f, err := domain.NewManual(tournamentID, name, club, nominationIDs)
	if err != nil {
		return domain.Fighter{}, err
	}
	return s.repo.Create(ctx, f)
}

// EditFighter правит имя и клуб бойца.
func (s *Service) EditFighter(ctx context.Context, fighterID, name, club string) (domain.Fighter, error) {
	f, err := s.getFighter(ctx, fighterID)
	if err != nil {
		return domain.Fighter{}, err
	}
	if err := f.Edit(name, club); err != nil {
		return domain.Fighter{}, err
	}
	return s.repo.Update(ctx, f)
}

// WithdrawFighter выводит бойца со всего турнира с причиной.
func (s *Service) WithdrawFighter(ctx context.Context, fighterID string, reason domain.Reason) (domain.Fighter, error) {
	f, err := s.getFighter(ctx, fighterID)
	if err != nil {
		return domain.Fighter{}, err
	}
	if err := f.Withdraw(reason); err != nil {
		return domain.Fighter{}, err
	}
	return s.repo.Update(ctx, f)
}

// ReturnFighter возвращает ранее выведенного бойца.
func (s *Service) ReturnFighter(ctx context.Context, fighterID string) (domain.Fighter, error) {
	f, err := s.getFighter(ctx, fighterID)
	if err != nil {
		return domain.Fighter{}, err
	}
	if err := f.Return(); err != nil {
		return domain.Fighter{}, err
	}
	return s.repo.Update(ctx, f)
}

// AddToNomination добавляет бойцу участие в номинации (идемпотентно).
func (s *Service) AddToNomination(ctx context.Context, fighterID, nominationID string) (domain.Fighter, error) {
	f, err := s.getFighter(ctx, fighterID)
	if err != nil {
		return domain.Fighter{}, err
	}
	if err := s.validateNomination(ctx, f.TournamentID, nominationID); err != nil {
		return domain.Fighter{}, err
	}
	if err := f.AddParticipation(nominationID); err != nil {
		return domain.Fighter{}, err
	}
	return s.repo.Update(ctx, f)
}

// RemoveFromNomination снимает бойца с одной номинации (обратимо).
func (s *Service) RemoveFromNomination(ctx context.Context, fighterID, nominationID string) (domain.Fighter, error) {
	f, err := s.getFighter(ctx, fighterID)
	if err != nil {
		return domain.Fighter{}, err
	}
	if err := f.RemoveParticipation(nominationID); err != nil {
		return domain.Fighter{}, err
	}
	return s.repo.Update(ctx, f)
}

// MoveFighter переводит бойца из одной номинации в другую.
func (s *Service) MoveFighter(ctx context.Context, fighterID, from, to string) (domain.Fighter, error) {
	f, err := s.getFighter(ctx, fighterID)
	if err != nil {
		return domain.Fighter{}, err
	}
	if err := s.validateNomination(ctx, f.TournamentID, to); err != nil {
		return domain.Fighter{}, err
	}
	if err := f.Move(from, to); err != nil {
		return domain.Fighter{}, err
	}
	return s.repo.Update(ctx, f)
}

// GetFighter возвращает одного бойца со всеми участиями.
func (s *Service) GetFighter(ctx context.Context, fighterID string) (domain.Fighter, error) {
	return s.getFighter(ctx, fighterID)
}

// ListRoster возвращает ростер турнира: бойцов с их участиями и статусами.
// Пустой tournamentID резолвится в активный турнир (MVP — единственный
// способ существования турнира).
func (s *Service) ListRoster(ctx context.Context, tournamentID string) ([]domain.Fighter, error) {
	tournamentID = strings.TrimSpace(tournamentID)
	if tournamentID == "" {
		activeID, err := s.tournaments.ActiveTournamentID(ctx)
		if err != nil {
			return nil, domain.ErrNotFound
		}
		tournamentID = activeID
	}
	return s.repo.ListByTournament(ctx, tournamentID)
}

// ListNominationRoster возвращает публичный состав номинации.
func (s *Service) ListNominationRoster(ctx context.Context, nominationID string) ([]domain.RosterEntry, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.RosterByNomination(ctx, nominationID)
}

func (s *Service) getFighter(ctx context.Context, fighterID string) (domain.Fighter, error) {
	fighterID = strings.TrimSpace(fighterID)
	if fighterID == "" {
		return domain.Fighter{}, domain.ErrInvalidInput
	}
	return s.repo.GetByID(ctx, fighterID)
}

// validateNomination проверяет, что номинация существует и принадлежит
// турниру бойца (через NominationProvider, ADR 0002).
func (s *Service) validateNomination(ctx context.Context, tournamentID, nominationID string) error {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.ErrInvalidInput
	}
	info, err := s.nominations.Nomination(ctx, nominationID)
	if err != nil {
		return err
	}
	if info.TournamentID != tournamentID {
		return domain.ErrNominationNotFound
	}
	return nil
}
