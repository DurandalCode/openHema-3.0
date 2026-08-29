// Package domain описывает сущности, порты и ошибки модуля tournament.
package domain

import (
	"context"
	"errors"
	"time"

	"github.com/hema/server/pkg/filestore"
)

// Доменные ошибки. Слой api мапит их в connect.Code.
var (
	// ErrNotFound — активный турнир не найден (система не
	// инициализирована). В MVP индикатор рассинхрона с сид-миграцией.
	ErrNotFound = errors.New("tournament: active tournament not found")
	// ErrInvalidInput — некорректные входные данные обновления (пустой
	// title, недопустимый тип/пустое значение контакта).
	ErrInvalidInput = errors.New("tournament: invalid input")
	// ErrFileTooLarge — загружаемый файл превышает FilePolicy.MaxBytes
	// своего вида (спека 0042, FR-32).
	ErrFileTooLarge = errors.New("tournament: file too large")
	// ErrUnsupportedFileType — тип файла (по сигнатуре содержимого, см.
	// filestore.Sniff, NFR-9) не входит в FilePolicy.AllowedTypes своего
	// вида, либо сигнатура не опознана вовсе.
	ErrUnsupportedFileType = errors.New("tournament: unsupported file type")
	// ErrStorageUnavailable — файловое хранилище не настроено (nil Store,
	// ADR 0019 п.2, NFR-4). Ссылки (regulations_url/emblem_url)
	// продолжают работать без него.
	ErrStorageUnavailable = errors.New("tournament: storage unavailable")
)

// FileStore — порт файлового хранилища, которым пользуется модуль
// tournament (регламент и эмблема турнира). Алиас на filestore.Store
// (ADR 0019 п.1): пакет pkg/filestore общий, не принадлежит другому
// модулю, поэтому переиспользуется напрямую вместо дублирования
// интерфейса. nil — легальное значение («хранилище не настроено»);
// проверка на nil — обязанность service (см. ErrStorageUnavailable).
type FileStore = filestore.Store

// StoredFile — файл, загруженный на наш диск (в отличие от EmblemURL/
// RegulationsURL — ссылки на сторонний хостинг). Пустой ID означает «файла
// нет» — «файл ⊕ ссылка» на каждое из двух полей поддерживается сервисом
// (FR-34).
type StoredFile struct {
	ID   string
	Name string
	Size int64
}

// NotificationSettings — глобальные переключатели видов почтовых
// уведомлений турнира (спека 0042, FR-19). Зеркалит proto
// hema.v1.NotificationSettings; та же форма используется и для личных
// настроек пользователя в модуле auth — письмо уходит, только когда оба
// уровня разрешают один и тот же вид.
type NotificationSettings struct {
	ApplicationState bool
	PoolSeated       bool
}

// FileKind — вид файла профиля турнира.
type FileKind string

const (
	FileKindRegulations FileKind = "regulations"
	FileKindEmblem      FileKind = "emblem"
)

// FilePolicy — допустимые типы (по сигнатуре, см. filestore.Sniff) и
// пороговый размер для одного вида файла (FR-32). Значения не хардкодятся
// в домене — конструктор service получает map[FileKind]FilePolicy
// параметром (пороги — из конфигурации, допустимые типы — константы
// политики модуля, см. ADR 0019 п.4).
type FilePolicy struct {
	AllowedTypes []string
	MaxBytes     int64
}

// ContactType — канал связи с организаторами. Хранится в БД как TEXT с
// CHECK-ограничением (строковые константы ниже).
type ContactType string

const (
	ContactTypeTelegram ContactType = "telegram"
	ContactTypeVK       ContactType = "vk"
	ContactTypeFacebook ContactType = "facebook"
	ContactTypeWebsite  ContactType = "website"
	ContactTypeEmail    ContactType = "email"
	ContactTypeOther    ContactType = "other"
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

// ProgramItem — один пункт программы дня: время + короткий текст
// («9:00 — сбор участников», спека 0040, FR-14). Используется и при чтении,
// и при вводе (позиция — порядок в срезе, id не хранится на уровне домена).
type ProgramItem struct {
	TimeLabel string
	Text      string
}

// ProgramDay — один день программы турнира: дата + упорядоченный список
// пунктов. Дни задаются organizer вручную, без жёсткой привязки к
// EventStartAt/EventEndAt турнира (FR-14a).
type ProgramDay struct {
	Date  time.Time
	Items []ProgramItem
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
	EmblemURL     string
	IsActive      bool
	Contacts      []Contact
	CreatedAt     time.Time
	UpdatedAt     time.Time
	// ChiefJudge — главный судья турнира (ФИО свободной строкой). Опционально.
	ChiefJudge string
	// RegulationsURL — веб-адрес регламента (обычно PDF). Только http/https.
	// Опционально.
	RegulationsURL string
	// VenueName / VenueAddress — место проведения: название площадки и
	// почтовый адрес. Опциональны независимо друг от друга.
	VenueName    string
	VenueAddress string
	// EntryFeeMinor — взнос за участие в ОДНОЙ номинации, в минорных единицах
	// валюты (копейки). nil означает «не задан» (публично не показывается);
	// указатель на 0 — участие бесплатное (FR-21). Задан ⇒ EntryFeeCurrency
	// непустой.
	EntryFeeMinor *int64
	// EntryFeeCurrency — код валюты ISO-4217 (например "RUB").
	EntryFeeCurrency string
	// Program — программа турнира по дням (спека 0040, FR-14/FR-15). Пустой
	// срез — программа не задана, публично раздел не показывается (FR-16).
	Program []ProgramDay
	// RegulationsFile / EmblemFile — загруженные файлы (спека 0042,
	// FR-30/FR-31). Пустой ID — файла нет. Взаимоисключающи со своей
	// ссылкой (RegulationsURL/EmblemURL) — инвариант поддерживает service
	// (FR-34), а не эта структура.
	RegulationsFile StoredFile
	EmblemFile      StoredFile
	// Notifications — глобальные переключатели видов почтовых уведомлений
	// турнира (FR-19).
	Notifications NotificationSettings
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
	HasEventEndAt   bool
	EmblemURL       string
	Contacts        []ContactInput
	// ChiefJudge / RegulationsURL / VenueName / VenueAddress — см. Tournament.
	// Опциональны, без обязательности; сохраняются как есть после trim.
	ChiefJudge     string
	RegulationsURL string
	VenueName      string
	VenueAddress   string
	// EntryFeeMinor — nil означает «не задан»; указатель на 0 — бесплатно
	// (FR-21). См. Tournament.EntryFeeMinor.
	EntryFeeMinor    *int64
	EntryFeeCurrency string
	// Program — полная замена программы по дням (спека 0040, FR-14), тем же
	// приёмом, что Contacts: старый набор дней/пунктов заменяется новым,
	// позиция дня и пункта внутри дня определяется порядком в срезе.
	Program []ProgramDay
	// Notifications — глобальные переключатели видов уведомлений (FR-19).
	Notifications NotificationSettings
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
	// набор контактов. Возвращает обновлённый агрегат. Если RegulationsURL/
	// EmblemURL заданы непустыми, соответствующий StoredFile атомарно
	// обнуляется в той же записи (инвариант «файл ⊕ ссылка», FR-34) —
	// вызывающий (service) отвечает за освобождение объекта в filestore
	// после успешного вызова.
	UpdateActive(ctx context.Context, in UpdateInput) (Tournament, error)
	// SetFile записывает новый файл для kind и атомарно очищает ссылку
	// того же вида (FR-34). Возвращает обновлённый агрегат; освобождение
	// прежнего объекта в filestore — на вызывающем (ADR 0019 п.5).
	SetFile(ctx context.Context, kind FileKind, file StoredFile) (Tournament, error)
	// ClearFile обнуляет файл для kind, не трогая ссылку/остальные поля.
	// Возвращает обновлённый агрегат.
	ClearFile(ctx context.Context, kind FileKind) (Tournament, error)
}
