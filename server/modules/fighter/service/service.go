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
//
// Seeding/Stage/Bout/Accounts (спека 0040) — межмодульные порты,
// подключаемые composition root'ом (internal/platform, join-волна T30).
// Все четыре допускают nil: конструктор используется и там, где эти
// эффекты не нужны (напр. RegistrationSink, fighter/module.go — только
// RegisterFromApplication, ActiveTournamentProvider/Seeding там не
// вызываются) — service должен работать без паники до того, как composition
// root подключит реальные адаптеры.
type Service struct {
	repo        domain.Repository
	nominations domain.NominationProvider
	tournaments domain.ActiveTournamentProvider
	seeding     domain.SeedingWithdrawalSink
	stage       domain.StageRepointer
	bout        domain.BoutRepointer
	accounts    domain.AccountDirectory
}

// New создаёт сервис fighter.
func New(
	repo domain.Repository,
	nominations domain.NominationProvider,
	tournaments domain.ActiveTournamentProvider,
	seeding domain.SeedingWithdrawalSink,
	stage domain.StageRepointer,
	bout domain.BoutRepointer,
	accounts domain.AccountDirectory,
) *Service {
	return &Service{
		repo:        repo,
		nominations: nominations,
		tournaments: tournaments,
		seeding:     seeding,
		stage:       stage,
		bout:        bout,
		accounts:    accounts,
	}
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

// WithdrawFighter выводит бойца со всего турнира с причиной. После успешной
// смены статуса синхронно, best-effort уведомляет Seeding (спека 0040,
// сценарий 2, FR-4): stage запоминает draft-членства бойца в пулах, чтобы
// ReturnFighter мог попытаться их восстановить. Сбой уведомления не
// откатывает уже закоммиченную смену статуса — тот же приём, что
// application/RegistrationSink (plan.md, «Риски»): каждый шаг идемпотентен,
// повтор безопасен.
func (s *Service) WithdrawFighter(ctx context.Context, fighterID string, reason domain.Reason) (domain.Fighter, error) {
	f, err := s.getFighter(ctx, fighterID)
	if err != nil {
		return domain.Fighter{}, err
	}
	if err := f.Withdraw(reason); err != nil {
		return domain.Fighter{}, err
	}
	updated, err := s.repo.Update(ctx, f)
	if err != nil {
		return domain.Fighter{}, err
	}
	if s.seeding != nil {
		_ = s.seeding.OnFighterWithdrawn(ctx, updated.ID)
	}
	return updated, nil
}

// ReturnFighter возвращает ранее выведенного бойца. После успешной смены
// статуса синхронно, best-effort уведомляет Seeding (спека 0040, сценарий 2,
// FR-5/FR-6): stage пытается восстановить запомненные draft-членства в
// пулах. Сбой уведомления не откатывает уже закоммиченную смену статуса —
// см. WithdrawFighter.
func (s *Service) ReturnFighter(ctx context.Context, fighterID string) (domain.Fighter, error) {
	f, err := s.getFighter(ctx, fighterID)
	if err != nil {
		return domain.Fighter{}, err
	}
	if err := f.Return(); err != nil {
		return domain.Fighter{}, err
	}
	updated, err := s.repo.Update(ctx, f)
	if err != nil {
		return domain.Fighter{}, err
	}
	if s.seeding != nil {
		_ = s.seeding.OnFighterReturned(ctx, updated.ID)
	}
	return updated, nil
}

// FindByAccount ищет бойца турнира по учётке пользователя (спека 0040,
// FR-9) — тонкая обёртка над repo.FindByOrigin, тем же методом, что уже
// использует MyFighter (ADR 0016), но доступная теперь и из admin-хендлера.
// found=false — «у этой учётки нет бойца в этом турнире», не ошибка (тот же
// приём, что MyFighter/GetMyFighter, ADR 0016). Пустой tournamentID
// резолвится в активный турнир, как ListRoster.
func (s *Service) FindByAccount(ctx context.Context, userID, tournamentID string) (domain.Fighter, bool, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return domain.Fighter{}, false, domain.ErrInvalidInput
	}

	tournamentID = strings.TrimSpace(tournamentID)
	if tournamentID == "" {
		activeID, err := s.tournaments.ActiveTournamentID(ctx)
		if err != nil {
			return domain.Fighter{}, false, nil
		}
		tournamentID = activeID
	}

	f, err := s.repo.FindByOrigin(ctx, tournamentID, userID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return domain.Fighter{}, false, nil
		}
		return domain.Fighter{}, false, err
	}
	// Обогащаем LinkedAccountID/LinkedAccountDisplayName так же, как
	// Roster/GetFighter (FR-8) — ответ FighterAdminService для этого RPC
	// остаётся тем же Fighter-сообщением с тем же набором полей.
	enriched, err := s.enrichLinkedAccounts(ctx, []domain.Fighter{f})
	if err != nil {
		return domain.Fighter{}, false, err
	}
	return enriched[0], true, nil
}

// MergeFighters сводит дубль source в target (спека 0040, FR-10): участия
// объединяются без дублей по номинации, привязка к учётке снимается у
// source (FR-10a), source помечается объединённым (не удаляется физически),
// денормализованные ссылки на fighter_id в stage/bout репойнтятся с source
// на target — синхронно, best-effort (см. plan.md «Риски»: каждый шаг
// идемпотентен, повторный вызов на уже репойнтнутые строки — no-op).
func (s *Service) MergeFighters(ctx context.Context, sourceID, targetID string) (domain.Fighter, error) {
	sourceID = strings.TrimSpace(sourceID)
	targetID = strings.TrimSpace(targetID)
	if sourceID == "" || targetID == "" {
		return domain.Fighter{}, domain.ErrInvalidInput
	}
	if sourceID == targetID {
		return domain.Fighter{}, domain.ErrSameFighter
	}

	source, err := s.repo.GetByID(ctx, sourceID)
	if err != nil {
		return domain.Fighter{}, err
	}
	target, err := s.repo.GetByID(ctx, targetID)
	if err != nil {
		return domain.Fighter{}, err
	}
	if source.TournamentID != target.TournamentID {
		return domain.Fighter{}, domain.ErrCrossTournamentMerge
	}
	if source.Status == domain.StatusMerged || target.Status == domain.StatusMerged {
		return domain.Fighter{}, domain.ErrAlreadyMerged
	}

	if err := s.repo.MergeParticipations(ctx, sourceID, targetID); err != nil {
		return domain.Fighter{}, err
	}
	if err := s.repo.ClearOriginUserID(ctx, sourceID); err != nil {
		return domain.Fighter{}, err
	}
	if err := s.repo.SetMerged(ctx, sourceID, targetID); err != nil {
		return domain.Fighter{}, err
	}

	if s.stage != nil {
		_ = s.stage.RepointFighter(ctx, sourceID, targetID)
	}
	if s.bout != nil {
		_ = s.bout.RepointFighter(ctx, sourceID, targetID)
	}

	return s.repo.GetByID(ctx, targetID)
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

// GetFighter возвращает одного бойца со всеми участиями, обогащённого
// LinkedAccountID/LinkedAccountDisplayName (спека 0040, FR-8) — обратной
// проекцией «боец → учётка». Обогащение — только для чтения через эту
// проекцию: правка снапшота бойца через неё не появляется (FR-11).
func (s *Service) GetFighter(ctx context.Context, fighterID string) (domain.Fighter, error) {
	f, err := s.getFighter(ctx, fighterID)
	if err != nil {
		return domain.Fighter{}, err
	}
	enriched, err := s.enrichLinkedAccounts(ctx, []domain.Fighter{f})
	if err != nil {
		return domain.Fighter{}, err
	}
	return enriched[0], nil
}

// ListRoster возвращает ростер турнира: бойцов с их участиями и статусами,
// обогащённых LinkedAccountID/LinkedAccountDisplayName (спека 0040, FR-8) —
// один батч-вызов AccountDirectory на весь ростер, не N+1 (тот же приём,
// что application.Service.Get). Пустой tournamentID резолвится в активный
// турнир (MVP — единственный способ существования турнира).
func (s *Service) ListRoster(ctx context.Context, tournamentID string) ([]domain.Fighter, error) {
	tournamentID = strings.TrimSpace(tournamentID)
	if tournamentID == "" {
		activeID, err := s.tournaments.ActiveTournamentID(ctx)
		if err != nil {
			return nil, domain.ErrNotFound
		}
		tournamentID = activeID
	}
	fighters, err := s.repo.ListByTournament(ctx, tournamentID)
	if err != nil {
		return nil, err
	}
	return s.enrichLinkedAccounts(ctx, fighters)
}

// enrichLinkedAccounts заполняет LinkedAccountID/LinkedAccountDisplayName у
// бойцов с непустым OriginUserID батчем через AccountDirectory (спека 0040,
// FR-8). accounts может быть nil (composition root ещё не подключил
// адаптер, либо вызывающий код — RegistrationSink/интеграционные пути,
// которым обогащение не нужно) — в этом случае возвращает бойцов как есть,
// без обогащения.
func (s *Service) enrichLinkedAccounts(ctx context.Context, fighters []domain.Fighter) ([]domain.Fighter, error) {
	if s.accounts == nil || len(fighters) == 0 {
		return fighters, nil
	}

	ids := make([]string, 0, len(fighters))
	seen := make(map[string]bool, len(fighters))
	for _, f := range fighters {
		if f.OriginUserID == nil || *f.OriginUserID == "" || seen[*f.OriginUserID] {
			continue
		}
		seen[*f.OriginUserID] = true
		ids = append(ids, *f.OriginUserID)
	}
	if len(ids) == 0 {
		return fighters, nil
	}

	names, err := s.accounts.DisplayNames(ctx, ids)
	if err != nil {
		return nil, err
	}
	for i := range fighters {
		if fighters[i].OriginUserID == nil {
			continue
		}
		fighters[i].LinkedAccountID = *fighters[i].OriginUserID
		fighters[i].LinkedAccountDisplayName = names[*fighters[i].OriginUserID]
	}
	return fighters, nil
}

// ListNominationRoster возвращает публичный состав номинации.
func (s *Service) ListNominationRoster(ctx context.Context, nominationID string) ([]domain.RosterEntry, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.RosterByNomination(ctx, nominationID)
}

// ActiveFightersByNomination возвращает бойцов «в составе» номинации — для
// межмодульного порта, используемого модулем pool (спека 0009, FR-12).
func (s *Service) ActiveFightersByNomination(ctx context.Context, nominationID string) ([]domain.FighterRef, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.ActiveFightersByNomination(ctx, nominationID)
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
