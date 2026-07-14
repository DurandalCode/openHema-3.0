// Package domain описывает сущности, порты и ошибки модуля fighter.
//
// Боец — персона-участник турнира, отвязанная от пользователей системы
// (спека 0007). Агрегат-корень: обычная CRUD-сущность (не event-sourced, в
// отличие от application/domain).
package domain

import (
	"context"
	"errors"
	"strings"
	"time"
)

// Доменные ошибки. Слой api мапит их в connect.Code.
var (
	// ErrNotFound — боец не найден.
	ErrNotFound = errors.New("fighter: not found")
	// ErrEmptyName — имя бойца пусто.
	ErrEmptyName = errors.New("fighter: empty name")
	// ErrInvalidInput — некорректные входные данные (пустой tournament_id,
	// пустой nomination_id, from == to при переводе).
	ErrInvalidInput = errors.New("fighter: invalid input")
	// ErrAlreadyWithdrawn — боец уже выведен с турнира.
	ErrAlreadyWithdrawn = errors.New("fighter: already withdrawn")
	// ErrNotWithdrawn — операция Return применена к не выведенному бойцу.
	ErrNotWithdrawn = errors.New("fighter: not withdrawn")
	// ErrInvalidReason — при выводе не указана причина.
	ErrInvalidReason = errors.New("fighter: invalid withdrawal reason")
	// ErrParticipationNotFound — у бойца нет участия в указанной номинации.
	ErrParticipationNotFound = errors.New("fighter: participation not found")
	// ErrNominationNotFound — указанная номинация не существует, либо
	// принадлежит другому турниру (от NominationProvider).
	ErrNominationNotFound = errors.New("fighter: nomination not found")
	// ErrOriginConflict — гонка при дедупликации: второй боец с уже занятым
	// ключом происхождения (tournament_id, origin_user_id) пытается
	// создаться параллельно (partial-unique индекс БД). Service обрабатывает
	// повторной попыткой (найти существующего и добавить участие).
	ErrOriginConflict = errors.New("fighter: origin already registered in tournament")
)

// Status — статус бойца на уровне всего турнира.
type Status string

const (
	StatusActive    Status = "active"
	StatusWithdrawn Status = "withdrawn"
)

// Reason — причина вывода бойца с турнира. Пусто, пока боец активен.
type Reason string

const (
	ReasonNone   Reason = ""
	ReasonInjury Reason = "injury"
	ReasonBan    Reason = "ban"
	ReasonOther  Reason = "other"
)

// ParticipationStatus — статус участия бойца в конкретной номинации.
type ParticipationStatus string

const (
	ParticipationActive  ParticipationStatus = "active"
	ParticipationRemoved ParticipationStatus = "removed"
)

// Participation — участие бойца в одной номинации.
type Participation struct {
	NominationID string
	Status       ParticipationStatus
}

// Fighter — персона-участник турнира. Имя/клуб — снапшот (из заявки при
// регистрации либо введённые admin), не резолвятся на лету.
type Fighter struct {
	ID           string
	TournamentID string
	Name         string
	Club         string
	// OriginUserID — технический ключ происхождения из заявки
	// (applicant_user_id); nil для бойцов, заведённых вручную. Не владелец,
	// не auth-связь — только для дедупликации (спека 0007, FR-5).
	OriginUserID     *string
	Status           Status
	WithdrawalReason Reason
	Participations   []Participation
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// RosterEntry — элемент публичного состава номинации (проекция, без id).
type RosterEntry struct {
	Name string
	Club string
	// InRoster — true, если боец активен и участие в номинации активно
	// («в составе»); false — выведен/снят («выбыл»).
	InRoster bool
}

// FighterRef — проекция бойца «в составе» номинации с id (для модуля pool,
// спека 0009 FR-12): в отличие от RosterEntry несёт id — нужен для DnD/
// членства в пуле.
type FighterRef struct {
	ID   string
	Name string
	Club string
}

// NewManual создаёт бойца, заведённого admin вручную (без электронной
// заявки): OriginUserID = nil, дедупу не подлежит. Без проверок лимитов и
// дублей (спека 0007, FR-6).
func NewManual(tournamentID, name, club string, nominationIDs []string) (Fighter, error) {
	tournamentID = strings.TrimSpace(tournamentID)
	if tournamentID == "" {
		return Fighter{}, ErrInvalidInput
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return Fighter{}, ErrEmptyName
	}

	f := Fighter{
		TournamentID: tournamentID,
		Name:         name,
		Club:         club,
		Status:       StatusActive,
	}
	for _, nomID := range nominationIDs {
		if err := f.AddParticipation(nomID); err != nil {
			return Fighter{}, err
		}
	}
	return f, nil
}

// NewFromRegistration создаёт бойца из факта регистрации заявки
// (кроссдоменный эффект application → fighter, спека 0007 FR-4). Имя/клуб —
// снапшот на момент вызова.
func NewFromRegistration(tournamentID, originUserID, name, club, nominationID string) (Fighter, error) {
	tournamentID = strings.TrimSpace(tournamentID)
	if tournamentID == "" {
		return Fighter{}, ErrInvalidInput
	}
	originUserID = strings.TrimSpace(originUserID)
	if originUserID == "" {
		return Fighter{}, ErrInvalidInput
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return Fighter{}, ErrEmptyName
	}

	f := Fighter{
		TournamentID: tournamentID,
		Name:         name,
		Club:         club,
		OriginUserID: &originUserID,
		Status:       StatusActive,
	}
	if err := f.AddParticipation(nominationID); err != nil {
		return Fighter{}, err
	}
	return f, nil
}

// Withdraw выводит бойца со всего турнира с причиной (травма/бан/иное).
// Все участия деактивируются вместе с бойцом (статус бойца перекрывает
// участия — «в составе» требует активности обоих). Обратимо (Return).
func (f *Fighter) Withdraw(reason Reason) error {
	if f.Status == StatusWithdrawn {
		return ErrAlreadyWithdrawn
	}
	if reason == ReasonNone {
		return ErrInvalidReason
	}
	f.Status = StatusWithdrawn
	f.WithdrawalReason = reason
	return nil
}

// Return возвращает ранее выведенного бойца в прежний состав участий.
func (f *Fighter) Return() error {
	if f.Status != StatusWithdrawn {
		return ErrNotWithdrawn
	}
	f.Status = StatusActive
	f.WithdrawalReason = ReasonNone
	return nil
}

// AddParticipation добавляет участие в номинации. Идемпотентно: повторный
// вызов для уже активного участия — не ошибка; для снятого — восстанавливает
// его (спека 0007, FR-8).
func (f *Fighter) AddParticipation(nominationID string) error {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return ErrInvalidInput
	}
	for i := range f.Participations {
		if f.Participations[i].NominationID == nominationID {
			f.Participations[i].Status = ParticipationActive
			return nil
		}
	}
	f.Participations = append(f.Participations, Participation{
		NominationID: nominationID,
		Status:       ParticipationActive,
	})
	return nil
}

// RemoveParticipation снимает бойца с одной номинации (обратимо —
// AddParticipation восстанавливает). Не затрагивает другие номинации.
func (f *Fighter) RemoveParticipation(nominationID string) error {
	nominationID = strings.TrimSpace(nominationID)
	for i := range f.Participations {
		if f.Participations[i].NominationID == nominationID {
			f.Participations[i].Status = ParticipationRemoved
			return nil
		}
	}
	return ErrParticipationNotFound
}

// Move переводит бойца из одной номинации в другую (снять с одной + добавить
// в другую). Не затрагивает заявку (0006) — операция ростера.
func (f *Fighter) Move(from, to string) error {
	from = strings.TrimSpace(from)
	to = strings.TrimSpace(to)
	if from == "" || to == "" || from == to {
		return ErrInvalidInput
	}
	if err := f.RemoveParticipation(from); err != nil {
		return err
	}
	return f.AddParticipation(to)
}

// Edit правит имя и клуб бойца независимо от заявки/профиля пользователя.
func (f *Fighter) Edit(name, club string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return ErrEmptyName
	}
	f.Name = name
	f.Club = club
	return nil
}

// Repository — порт доступа к хранилищу бойцов. Реализуется в слое repo;
// service зависит от этого интерфейса, не от pg.
type Repository interface {
	// Create вставляет нового бойца (с участиями) в одной транзакции и
	// возвращает его с присвоенным ID.
	Create(ctx context.Context, f Fighter) (Fighter, error)
	// Update сохраняет полное состояние существующего бойца (статус,
	// причину, имя/клуб, полный набор участий) в одной транзакции.
	Update(ctx context.Context, f Fighter) (Fighter, error)
	// GetByID возвращает бойца со всеми участиями.
	GetByID(ctx context.Context, id string) (Fighter, error)
	// FindByOrigin ищет бойца по ключу происхождения в пределах турнира
	// (дедупликация, FR-5). ErrNotFound — такого бойца ещё нет.
	FindByOrigin(ctx context.Context, tournamentID, originUserID string) (Fighter, error)
	// ListByTournament возвращает ростер турнира: бойцов с их участиями.
	ListByTournament(ctx context.Context, tournamentID string) ([]Fighter, error)
	// RosterByNomination возвращает публичный состав номинации: по каждому
	// бойцу, у которого есть (или было) участие в этой номинации — имя, клуб
	// и признак «в составе» (выведенные/снятые не скрываются, FR-12).
	RosterByNomination(ctx context.Context, nominationID string) ([]RosterEntry, error)
	// ActiveFightersByNomination возвращает бойцов «в составе» номинации
	// (FighterStatus=active И ParticipationStatus=active) с id — для модуля
	// pool (спека 0009, FR-12). Выведенные/снятые не включаются.
	ActiveFightersByNomination(ctx context.Context, nominationID string) ([]FighterRef, error)
}

// NominationInfo — сведения о номинации, нужные модулю fighter.
type NominationInfo struct {
	TournamentID string
}

// NominationProvider — межмодульная зависимость: резолв сведений о номинации
// через API модуля nomination (без прямого доступа к его PG-схеме, ADR 0002).
type NominationProvider interface {
	Nomination(ctx context.Context, nominationID string) (NominationInfo, error)
}

// ActiveTournamentProvider — межмодульная зависимость: резолв идентификатора
// активного турнира через API модуля tournament (ADR 0002). Используется при
// ListRoster, если tournament_id не передан клиентом явно (MVP — единственный
// активный турнир).
type ActiveTournamentProvider interface {
	ActiveTournamentID(ctx context.Context) (string, error)
}
