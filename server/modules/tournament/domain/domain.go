// Package domain описывает сущности, порты и ошибки модуля tournament.
package domain

import (
	"context"
	"errors"
	"time"
)

// Доменные ошибки. Слой api мапит их в connect.Code.
var (
	// ErrNotFound — активный турнир не найден (система не
	// инициализирована). В MVP индикатор рассинхрона с сид-миграцией.
	ErrNotFound = errors.New("tournament: active tournament not found")
	// ErrInvalidInput — некорректные входные данные обновления (пустой
	// title, недопустимый тип/пустое значение контакта).
	ErrInvalidInput = errors.New("tournament: invalid input")
)

// ContactType — канал связи с организаторами. Хранится в БД как TEXT с
// CHECK-ограничением (строковые константы ниже).
type ContactType string

const (
	ContactTypeTelegram  ContactType = "telegram"
	ContactTypeVK        ContactType = "vk"
	ContactTypeFacebook  ContactType = "facebook"
	ContactTypeWebsite   ContactType = "website"
	ContactTypeEmail     ContactType = "email"
	ContactTypeOther     ContactType = "other"
)

// ValidContactTypes — допустимые строковые значения типа контакта (для
// валидации в service и CHECK в миграции).
var ValidContactTypes = map[ContactType]struct{}{
	ContactTypeTelegram: {},
	ContactTypeVK:       {},
	ContactTypeFacebook: {},
	ContactTypeWebsite:  {},
	ContactTypeEmail:    {},
	ContactTypeOther:    {},
}

// Contact — один канал связи турнира.
type Contact struct {
	ID       string
	Type     ContactType
	Value    string
	Position int32
}

// Tournament — доменная сущность турнира.
type Tournament struct {
	ID          string
	Title       string
	Description string
	// EventStartAt — дата и время начала проведения с временной зоной.
	// Опционально (нулевое HasEventStartAt означает «не задано»).
	// Однодневный турнир: только EventStartAt; многодневный: start + end.
	EventStartAt    time.Time
	HasEventStartAt bool
	// EventEndAt — дата и время окончания (многодневные). Опционально.
	EventEndAt    time.Time
	HasEventEndAt bool
	EmblemURL string
	IsActive  bool
	Contacts  []Contact
	CreatedAt time.Time
	UpdatedAt time.Time
}

// UpdateInput — новые значения полей активного турнира при обновлении.
// Контакты передаются целиком (старый набор заменяется новым); позиция
// определяется порядком в срезе (0-индекс).
//
// Правила для дат проведения:
//   - оба поля опциональны (турнир без даты допустим);
//   - если задан конец (HasEventEndAt), то начало (HasEventStartAt) обязательно;
//   - конец должен быть не раньше начала (end >= start).
type UpdateInput struct {
	Title           string
	Description     string
	EventStartAt    time.Time
	HasEventStartAt bool
	EventEndAt      time.Time
	HasEventEndAt  bool
	EmblemURL       string
	Contacts        []ContactInput
}

// ContactInput — контакт при вводе (без id и без position).
type ContactInput struct {
	Type  ContactType
	Value string
}

// Repository — порт доступа к хранилищу турнира.
// Реализуется в слое repo; service зависит от этого интерфейса, не от pg.
type Repository interface {
	// GetActive возвращает активный турнир вместе с его контактами.
	GetActive(ctx context.Context) (Tournament, error)
	// UpdateActive обновляет поля активного турнира и атомарно заменяет
	// набор контактов. Возвращает обновлённый агрегат.
	UpdateActive(ctx context.Context, in UpdateInput) (Tournament, error)
}