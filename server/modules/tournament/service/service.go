// Package service содержит бизнес-логику модуля tournament (юзкейсы).
package service

import (
	"context"
	"net/url"
	"strings"

	"github.com/hema/server/modules/tournament/domain"
)

// defaultEntryFeeCurrency — валюта по умолчанию, если взнос задан, а валюта
// клиентом не прислана (см. plan.md, модуль tournament).
const defaultEntryFeeCurrency = "RUB"

// Service реализует юзкейсы турнира. Зависит от порта, не от pg/proto.
type Service struct {
	repo     domain.Repository
	files    domain.FileStore
	policies map[domain.FileKind]domain.FilePolicy
}

// New создаёт сервис tournament. files может быть nil — «хранилище не
// настроено» (ADR 0019 п.2); UploadFile тогда возвращает
// domain.ErrStorageUnavailable вместо паники. policies может быть nil —
// тогда никакой kind не пройдёт валидацию (domain.ErrUnsupportedFileType),
// что безопасно эквивалентно «загрузка файлов выключена».
func New(repo domain.Repository, files domain.FileStore, policies map[domain.FileKind]domain.FilePolicy) *Service {
	return &Service{repo: repo, files: files, policies: policies}
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
	in.ChiefJudge = strings.TrimSpace(in.ChiefJudge)
	in.VenueName = strings.TrimSpace(in.VenueName)
	in.VenueAddress = strings.TrimSpace(in.VenueAddress)

	// regulations_url: пусто — «не задан»; непусто — только http/https
	// (FR-20, AC-15).
	in.RegulationsURL = strings.TrimSpace(in.RegulationsURL)
	if in.RegulationsURL != "" {
		u, err := url.Parse(in.RegulationsURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return domain.Tournament{}, domain.ErrInvalidInput
		}
	}

	// entry_fee_minor: не задан ⇒ валюта затирается в пустую строку;
	// задан ⇒ должен быть неотрицательным, валюта по умолчанию — RUB, если
	// клиент прислал сумму без валюты (FR-21).
	if in.EntryFeeMinor == nil {
		in.EntryFeeCurrency = ""
	} else {
		if *in.EntryFeeMinor < 0 {
			return domain.Tournament{}, domain.ErrInvalidInput
		}
		in.EntryFeeCurrency = strings.TrimSpace(in.EntryFeeCurrency)
		if in.EntryFeeCurrency == "" {
			in.EntryFeeCurrency = defaultEntryFeeCurrency
		}
	}

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

	// program: непустой Text каждого пункта (chk_program_items_text
	// дублируется на уровне домена ради читаемой ошибки до похода в БД);
	// position не передаётся наружу explicit — репозиторий проставляет по
	// индексу среза (FR-14/FR-14a).
	program := make([]domain.ProgramDay, 0, len(in.Program))
	for _, d := range in.Program {
		items := make([]domain.ProgramItem, 0, len(d.Items))
		for _, it := range d.Items {
			it.TimeLabel = strings.TrimSpace(it.TimeLabel)
			it.Text = strings.TrimSpace(it.Text)
			if it.Text == "" {
				return domain.Tournament{}, domain.ErrInvalidInput
			}
			items = append(items, it)
		}
		d.Items = items
		program = append(program, d)
	}
	in.Program = program

	// Инвариант «файл ⊕ ссылка» (FR-34, ADR 0019 п.5): если организатор
	// задаёт непустую ссылку, ранее загруженный файл того же вида
	// освобождается. repo.UpdateActive обнуляет StoredFile атомарно вместе
	// с записью новой ссылки (см. domain.Repository.UpdateActive); здесь
	// же — только определить, какой объект (если был) освободить в
	// filestore ПОСЛЕ успешного UPDATE (порядок put→update→delete, ADR
	// 0019 п.5). GetActive вызывается только когда действительно может
	// понадобиться удаление — обычная правка профиля без URL не платит за
	// лишний поход в БД.
	var prevRegulations, prevEmblem domain.StoredFile
	if in.RegulationsURL != "" || in.EmblemURL != "" {
		current, err := s.repo.GetActive(ctx)
		if err != nil {
			return domain.Tournament{}, err
		}
		if in.RegulationsURL != "" {
			prevRegulations = current.RegulationsFile
		}
		if in.EmblemURL != "" {
			prevEmblem = current.EmblemFile
		}
	}

	updated, err := s.repo.UpdateActive(ctx, in)
	if err != nil {
		return domain.Tournament{}, err
	}

	if s.files != nil {
		if prevRegulations.ID != "" {
			_ = s.files.Delete(ctx, prevRegulations.ID)
		}
		if prevEmblem.ID != "" {
			_ = s.files.Delete(ctx, prevEmblem.ID)
		}
	}
	return updated, nil
}

// NotificationsFor возвращает текущие глобальные переключатели уведомлений
// активного турнира (FR-19). Межмодульная точка входа для
// адаптера-нотификатора (см. plan.md, `internal/platform`): читается перед
// отправкой письма — выключенный вид не уходит.
func (s *Service) NotificationsFor(ctx context.Context) (domain.NotificationSettings, error) {
	t, err := s.repo.GetActive(ctx)
	if err != nil {
		return domain.NotificationSettings{}, err
	}
	return t.Notifications, nil
}
