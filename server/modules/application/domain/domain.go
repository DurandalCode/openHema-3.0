// Package domain описывает сущности, порты и ошибки модуля application.
//
// Заявка — event-sourced агрегат (ADR 0011): источник истины — журнал
// событий (Event), а не хранимая строка. Application реконструируется
// сверткой потока (Rebuild). Команды (DeclarePayment/ConfirmPayment/
// Register/Withdraw) — чистые доменные решения: по текущему агрегату и
// инициатору возвращают новое событие либо доменную ошибку; сама запись в
// хранилище — задача repo/service.
package domain

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Доменные ошибки. Слой api мапит их в connect.Code.
var (
	// ErrNotFound — заявка (поток событий) не найдена.
	ErrNotFound = errors.New("application: not found")
	// ErrForbidden — действие требует, чтобы вызывающий был владельцем заявки.
	ErrForbidden = errors.New("application: forbidden")
	// ErrInvalidTransition — недопустимый переход из текущего состояния
	// (в т.ч. любое действие над терминальной заявкой) или невалидные входные
	// данные для нового потока.
	ErrInvalidTransition = errors.New("application: invalid transition")
	// ErrDuplicateActive — у заявителя уже есть активная (нетерминальная)
	// заявка в эту номинацию.
	ErrDuplicateActive = errors.New("application: duplicate active application")
	// ErrNominationNotFound — указанная номинация не существует.
	ErrNominationNotFound = errors.New("application: nomination not found")
	// ErrConcurrency — конфликт версии потока при добавлении события
	// (оптимистичная конкуренция).
	ErrConcurrency = errors.New("application: concurrent modification")
	// ErrRegistrationClosed — приём заявок в номинацию закрыт (спека 0012,
	// FR-7). Гейтит только новую подачу (Submit, AC-6); уже поданные заявки
	// продолжают обычный флоу без изменений (AC-15).
	ErrRegistrationClosed = errors.New("application: nomination registration is closed")
)

// State — состояние заявки, вычисленное сверткой потока событий.
type State string

const (
	StateSubmitted                   State = "submitted"
	StateAwaitingPaymentConfirmation State = "awaiting_payment_confirmation"
	StatePaid                        State = "paid"
	StateRegistered                  State = "registered"
	StateWithdrawn                   State = "withdrawn"
)

// IsTerminal — из терминального состояния переходов нет.
func (s State) IsTerminal() bool {
	return s == StateRegistered || s == StateWithdrawn
}

// IsActive — нетерминальное состояние («тут существует заявка»).
func (s State) IsActive() bool {
	return !s.IsTerminal()
}

// valid — известное состояние заявки (для валидации ручной установки статуса
// при админской правке, спека 0006).
func (s State) valid() bool {
	switch s {
	case StateSubmitted, StateAwaitingPaymentConfirmation, StatePaid, StateRegistered, StateWithdrawn:
		return true
	default:
		return false
	}
}

// EventType — тип доменного события в журнале заявки. Именование — в
// прошедшем времени, доменный факт (ADR 0011).
type EventType string

const (
	EventSubmitted         EventType = "submitted"
	EventPaymentDeclared   EventType = "payment_declared"
	EventPaymentConfirmed  EventType = "payment_confirmed"
	EventFighterRegistered EventType = "fighter_registered"
	EventWithdrawn         EventType = "withdrawn"
	EventAmended           EventType = "amended"
)

// Payload — полезная нагрузка события.
//
// Для EventSubmitted значимы: NominationID/TournamentID/ApplicantUserID
// (идентичность потока) и Club/NeedsEquipment (детали, заданные бойцом).
//
// Для EventAmended (админская правка, спека 0006) поля — патч поверх текущего
// агрегата: Club/NeedsEquipment/ApplicantNameOverride — всегда полный
// желаемый снапшот этих атрибутов; NominationID — пусто ⇒ номинацию не
// менять, непусто ⇒ перенос (сопровождается TournamentID); NewState — пусто
// ⇒ статус не менять, непусто ⇒ ручная установка статуса.
type Payload struct {
	NominationID    string
	TournamentID    string
	ApplicantUserID string
	// Club — клуб бойца (может быть пустым).
	Club string
	// NeedsEquipment — нужна ли бойцу экипировка.
	NeedsEquipment bool
	// ApplicantNameOverride — переопределение отображаемого имени (только
	// EventAmended); «» = имя резолвится из auth.
	ApplicantNameOverride string
	// NewState — целевое состояние при ручной правке (только EventAmended).
	NewState State
}

// Event — один факт в журнале заявки. Неизменяем после записи (ADR 0011).
type Event struct {
	Type       EventType
	ActorID    string
	OccurredAt time.Time
	// Sequence — версия события в потоке, 1-based.
	Sequence int
	Payload  Payload
}

// Application — заявка, реконструированная сверткой своего потока событий.
type Application struct {
	ID              string
	NominationID    string
	TournamentID    string
	ApplicantUserID string
	State           State
	// Club — клуб бойца (может быть пустым).
	Club string
	// NeedsEquipment — нужна ли бойцу экипировка.
	NeedsEquipment bool
	// ApplicantNameOverride — переопределение отображаемого имени, заданное
	// админом; «» = имя резолвится из auth (спека 0006).
	ApplicantNameOverride string
	// Version — версия потока = номер последнего применённого события.
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ApplicationView — плоское текущее состояние агрегата для инлайн-проекции
// (read-model). Обновляется атомарно с записью события (ADR 0011).
type ApplicationView struct {
	ID                    string
	NominationID          string
	TournamentID          string
	ApplicantUserID       string
	State                 State
	Club                  string
	NeedsEquipment        bool
	ApplicantNameOverride string
	Version               int
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

// Submit создаёт первое событие нового потока заявки. Не проверяет
// существование номинации/дубли — это задача service (через порты). club и
// needsEquipment — детали, указанные бойцом при подаче (FR-1, спека 0006).
func Submit(nominationID, tournamentID, applicantUserID, club string, needsEquipment bool, now time.Time) (Event, error) {
	if nominationID == "" || tournamentID == "" || applicantUserID == "" {
		return Event{}, ErrInvalidTransition
	}
	return Event{
		Type:       EventSubmitted,
		ActorID:    applicantUserID,
		OccurredAt: now,
		Sequence:   1,
		Payload: Payload{
			NominationID:    nominationID,
			TournamentID:    tournamentID,
			ApplicantUserID: applicantUserID,
			Club:            club,
			NeedsEquipment:  needsEquipment,
		},
	}, nil
}

// DeclarePayment — боец отмечает оплату собственной заявки. Допустимо только
// из StateSubmitted; вызывающий должен быть владельцем заявки.
func (a Application) DeclarePayment(actorID string, now time.Time) (Event, error) {
	if a.ApplicantUserID != actorID {
		return Event{}, ErrForbidden
	}
	if a.State != StateSubmitted {
		return Event{}, ErrInvalidTransition
	}
	return a.nextEvent(EventPaymentDeclared, actorID, now), nil
}

// ConfirmPayment — секретарь подтверждает оплату. Допустимо только из
// StateAwaitingPaymentConfirmation. Права (только admin) проверяются вне
// домена (RBAC-интерсептор).
func (a Application) ConfirmPayment(actorID string, now time.Time) (Event, error) {
	if a.State != StateAwaitingPaymentConfirmation {
		return Event{}, ErrInvalidTransition
	}
	return a.nextEvent(EventPaymentConfirmed, actorID, now), nil
}

// Register — секретарь регистрирует оплаченную заявку (терминальный шаг).
// Допустимо только из StatePaid.
func (a Application) Register(actorID string, now time.Time) (Event, error) {
	if a.State != StatePaid {
		return Event{}, ErrInvalidTransition
	}
	return a.nextEvent(EventFighterRegistered, actorID, now), nil
}

// Withdraw — боец отзывает собственную заявку из любого нетерминального
// состояния (включая StatePaid). Вызывающий должен быть владельцем заявки.
func (a Application) Withdraw(actorID string, now time.Time) (Event, error) {
	if a.ApplicantUserID != actorID {
		return Event{}, ErrForbidden
	}
	if a.State.IsTerminal() {
		return Event{}, ErrInvalidTransition
	}
	return a.nextEvent(EventWithdrawn, actorID, now), nil
}

// AmendPatch — желаемые значения полей при админской правке заявки
// (спека 0006, FR-3). Club/NeedsEquipment/ApplicantNameOverride — всегда
// полный снапшот (форма шлёт текущее значение). NominationID/NewState —
// опциональны: nil = не менять.
type AmendPatch struct {
	Club                  string
	NeedsEquipment        bool
	ApplicantNameOverride string
	// NominationID — непусто ⇒ перенос в другую номинацию; должен
	// сопровождаться TournamentID (резолвится service через NominationProvider).
	NominationID *string
	TournamentID string
	// NewState — непусто ⇒ ручная установка статуса в обход обычного флоу.
	NewState *State
}

// Amend — админ правит заявку: детали (клуб/экипировка/имя), перенос в
// другую номинацию и/или ручную смену статуса (FR-3..FR-9). Формирует новое
// событие журнала, не переписывая прошлое (0005, FR-10). Допустимо над
// заявкой в любом состоянии, включая терминальные (FR-9) — в отличие от
// пользовательских переходов, терминальность не проверяется. Существование
// целевой номинации и инвариант «нет активного дубля» — ответственность
// service (через порты и Append).
func (a Application) Amend(actorID string, patch AmendPatch, now time.Time) (Event, error) {
	payload := Payload{
		Club:                  patch.Club,
		NeedsEquipment:        patch.NeedsEquipment,
		ApplicantNameOverride: patch.ApplicantNameOverride,
	}
	if patch.NominationID != nil {
		if *patch.NominationID == "" || patch.TournamentID == "" {
			return Event{}, ErrInvalidTransition
		}
		payload.NominationID = *patch.NominationID
		payload.TournamentID = patch.TournamentID
	}
	if patch.NewState != nil {
		if !patch.NewState.valid() {
			return Event{}, ErrInvalidTransition
		}
		payload.NewState = *patch.NewState
	}
	return Event{
		Type:       EventAmended,
		ActorID:    actorID,
		OccurredAt: now,
		Sequence:   a.Version + 1,
		Payload:    payload,
	}, nil
}

func (a Application) nextEvent(t EventType, actorID string, now time.Time) Event {
	return Event{
		Type:       t,
		ActorID:    actorID,
		OccurredAt: now,
		Sequence:   a.Version + 1,
	}
}

// Rebuild реконструирует агрегат сверткой (fold) потока событий. Пустой поток
// — ErrNotFound (заявки не существует).
func Rebuild(appID string, events []Event) (Application, error) {
	if len(events) == 0 {
		return Application{}, ErrNotFound
	}
	app := Application{ID: appID}
	for _, ev := range events {
		if err := app.apply(ev); err != nil {
			return Application{}, err
		}
	}
	return app, nil
}

// apply переводит агрегат в новое состояние согласно событию. Это чистая
// свёртка: события уже являются записанными фактами и не перепроверяются на
// допустимость (эту проверку делают команды-решения до записи).
func (a *Application) apply(ev Event) error {
	switch ev.Type {
	case EventSubmitted:
		a.NominationID = ev.Payload.NominationID
		a.TournamentID = ev.Payload.TournamentID
		a.ApplicantUserID = ev.Payload.ApplicantUserID
		a.Club = ev.Payload.Club
		a.NeedsEquipment = ev.Payload.NeedsEquipment
		a.State = StateSubmitted
		a.CreatedAt = ev.OccurredAt
	case EventPaymentDeclared:
		a.State = StateAwaitingPaymentConfirmation
	case EventPaymentConfirmed:
		a.State = StatePaid
	case EventFighterRegistered:
		a.State = StateRegistered
	case EventWithdrawn:
		a.State = StateWithdrawn
	case EventAmended:
		a.Club = ev.Payload.Club
		a.NeedsEquipment = ev.Payload.NeedsEquipment
		a.ApplicantNameOverride = ev.Payload.ApplicantNameOverride
		if ev.Payload.NominationID != "" {
			a.NominationID = ev.Payload.NominationID
			a.TournamentID = ev.Payload.TournamentID
		}
		if ev.Payload.NewState != "" {
			a.State = ev.Payload.NewState
		}
	default:
		return fmt.Errorf("application: unknown event type %q", ev.Type)
	}
	a.Version = ev.Sequence
	a.UpdatedAt = ev.OccurredAt
	return nil
}

// Repository — порт event store + инлайн-проекции модуля application.
// Реализуется в слое repo; service зависит от этого интерфейса, не от pg.
type Repository interface {
	// Load возвращает полный поток событий заявки, упорядоченный по версии.
	Load(ctx context.Context, appID string) ([]Event, error)
	// Append атомарно вставляет событие с version = expectedVersion+1 и
	// обновляет инлайн-проекцию. expectedVersion=0 — новый поток. Конфликт
	// версии → ErrConcurrency; нарушение инварианта «нет активного дубля» →
	// ErrDuplicateActive.
	Append(ctx context.Context, appID string, expectedVersion int, ev Event, view ApplicationView) error
	// ActiveExists — есть ли уже активная (нетерминальная) заявка пользователя
	// в номинацию. Быстрая предпроверка перед Submit; финальный арбитр гонки —
	// partial unique index в Append.
	ActiveExists(ctx context.Context, userID, nominationID string) (bool, error)
	// ListByApplicant возвращает заявки пользователя («мои заявки»).
	ListByApplicant(ctx context.Context, userID string) ([]ApplicationView, error)
	// ListByNomination возвращает все заявки номинации.
	ListByNomination(ctx context.Context, nominationID string) ([]ApplicationView, error)
	// ListByTournament — сводный экран заявок турнира с опциональными
	// фильтрами по статусу и/или номинации. nil-фильтр = без ограничения.
	ListByTournament(ctx context.Context, tournamentID string, status *State, nominationID *string) ([]ApplicationView, error)
	// ParticipantsByNomination возвращает неотозванные заявки номинации
	// (стартовый лист).
	ParticipantsByNomination(ctx context.Context, nominationID string) ([]ApplicationView, error)
	// CountRegistered возвращает число зарегистрированных заявок номинации
	// (для мягкого предупреждения о переполнении).
	CountRegistered(ctx context.Context, nominationID string) (int, error)
	// CountsByNomination возвращает «заявлено» (неотозванные) и
	// «подтверждено» (оплачена + зарегистрирована) для счётчика номинации.
	CountsByNomination(ctx context.Context, nominationID string) (applied int, confirmed int, err error)
}

// NominationInfo — сведения о номинации, нужные модулю application.
type NominationInfo struct {
	TournamentID string
	// FighterCapacity — soft cap номинации; nil = не задан.
	FighterCapacity *int32
	// RegistrationOpen — приём заявок в номинацию открыт (спека 0012, FR-7).
	// Гейтит только Submit; остальной флоу существующей заявки (оплата,
	// регистрация, отзыв) на это поле не смотрит (AC-15).
	RegistrationOpen bool
}

// NominationProvider — межмодульная зависимость: резолв сведений о номинации
// через API модуля nomination (без прямого доступа к его PG-схеме, ADR 0002).
type NominationProvider interface {
	Nomination(ctx context.Context, nominationID string) (NominationInfo, error)
}

// UserProvider — межмодульная зависимость: батч-резолв отображаемых имён
// пользователей через API модуля auth (ADR 0002). Имя недоступного
// пользователя может отсутствовать в результирующей map — это не ошибка.
type UserProvider interface {
	DisplayNames(ctx context.Context, ids []string) (map[string]string, error)
}

// RegisteredFighter — снапшот данных заявки на момент регистрации, нужный
// для кроссдоменного создания/дополнения бойца (спека 0007).
type RegisteredFighter struct {
	TournamentID string
	NominationID string
	// OriginUserID — applicant_user_id заявки; в домене fighter становится
	// техническим ключом происхождения (дедупликация), не auth-связью.
	OriginUserID string
	// Name — эффективное отображаемое имя на момент регистрации (override
	// или имя из auth), снапшот.
	Name string
	Club string
}

// FighterRegistrationSink — межмодульная зависимость: кроссдоменный эффект
// регистрации заявки в домен бойцов (application → fighter, ADR 0002, спека
// 0007). Синхронный in-process вызов (событийной шины пока нет, ADR 0011
// EDD ещё не принят для этого перехода); идемпотентность на стороне fighter
// обеспечивает дедуп по (tournament_id, origin_user_id).
type FighterRegistrationSink interface {
	OnRegistered(ctx context.Context, in RegisteredFighter) error
}
