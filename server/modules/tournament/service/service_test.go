package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/hema/server/modules/tournament/domain"
	"github.com/hema/server/modules/tournament/testutil"
)

func testService() (*Service, *testutil.FakeRepo) {
	repo := testutil.NewFakeRepo()
	return New(repo, nil, nil), repo
}

func testServiceWithActive() (*Service, *testutil.FakeRepo) {
	t := domain.Tournament{
		ID:          "00000000-0000-0000-0000-000000000001",
		Title:       "Seeded Cup",
		Description: "Initial",
		Contacts: []domain.Contact{
			{ID: "c1", Type: domain.ContactTypeTelegram, Value: "@seed", Position: 0},
		},
		CreatedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	}
	repo := testutil.NewFakeRepoWithActive(t)
	return New(repo, nil, nil), repo
}

func TestGetActive_HappyPath(t *testing.T) {
	svc, _ := testServiceWithActive()

	got, err := svc.GetActive(context.Background())
	if err != nil {
		t.Fatalf("GetActive: %v", err)
	}
	if got.Title != "Seeded Cup" {
		t.Errorf("Title = %q", got.Title)
	}
	if len(got.Contacts) != 1 {
		t.Fatalf("Contacts len = %d, want 1", len(got.Contacts))
	}
	if got.Contacts[0].Value != "@seed" {
		t.Errorf("Contact value = %q", got.Contacts[0].Value)
	}
	if !got.IsActive {
		t.Error("IsActive should be true")
	}
}

func TestGetActive_NotFound(t *testing.T) {
	svc, _ := testService()

	_, err := svc.GetActive(context.Background())
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestUpdateActive_HappyPath(t *testing.T) {
	svc, _ := testServiceWithActive()

	start := time.Date(2026, 12, 1, 10, 0, 0, 0, time.UTC)
	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:           "New Title",
		Description:     "New Description",
		EventStartAt:    start,
		HasEventStartAt: true,
		EmblemURL:       "https://cdn.example.com/logo.png",
		Contacts: []domain.ContactInput{
			{Type: domain.ContactTypeTelegram, Value: "@org"},
			{Type: domain.ContactTypeWebsite, Value: "https://example.com"},
		},
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if got.Title != "New Title" {
		t.Errorf("Title = %q", got.Title)
	}
	if got.Description != "New Description" {
		t.Errorf("Description = %q", got.Description)
	}
	if !got.HasEventStartAt || !got.EventStartAt.Equal(start) {
		t.Errorf("EventStartAt = %v (has=%v)", got.EventStartAt, got.HasEventStartAt)
	}
	if got.HasEventEndAt {
		t.Errorf("EventEndAt should be unset for single-day, has=%v", got.HasEventEndAt)
	}
	if got.EmblemURL != "https://cdn.example.com/logo.png" {
		t.Errorf("EmblemURL = %q", got.EmblemURL)
	}
	if len(got.Contacts) != 2 {
		t.Fatalf("Contacts len = %d, want 2", len(got.Contacts))
	}
	if got.Contacts[0].Position != 0 || got.Contacts[1].Position != 1 {
		t.Errorf("positions = %d, %d", got.Contacts[0].Position, got.Contacts[1].Position)
	}
	if got.Contacts[0].Type != domain.ContactTypeTelegram || got.Contacts[0].Value != "@org" {
		t.Errorf("contact[0] = %+v", got.Contacts[0])
	}
	if got.Contacts[1].Type != domain.ContactTypeWebsite {
		t.Errorf("contact[1] type = %v", got.Contacts[1].Type)
	}
}

func TestUpdateActive_MultiDayEventRange(t *testing.T) {
	svc, _ := testServiceWithActive()

	start := time.Date(2026, 12, 1, 10, 0, 0, 0, time.UTC)
	end := time.Date(2026, 12, 3, 18, 0, 0, 0, time.UTC)
	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:           "Multi-day Cup",
		EventStartAt:    start,
		HasEventStartAt: true,
		EventEndAt:      end,
		HasEventEndAt:   true,
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if !got.HasEventStartAt || !got.EventStartAt.Equal(start) {
		t.Errorf("EventStartAt = %v (has=%v)", got.EventStartAt, got.HasEventStartAt)
	}
	if !got.HasEventEndAt || !got.EventEndAt.Equal(end) {
		t.Errorf("EventEndAt = %v (has=%v)", got.EventEndAt, got.HasEventEndAt)
	}
}

func TestUpdateActive_EventEndWithoutStart(t *testing.T) {
	svc, _ := testServiceWithActive()

	end := time.Date(2026, 12, 3, 18, 0, 0, 0, time.UTC)
	_, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:         "T",
		EventEndAt:    end,
		HasEventEndAt: true,
	})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput for end without start, got %v", err)
	}
}

func TestUpdateActive_EventEndBeforeStart(t *testing.T) {
	svc, _ := testServiceWithActive()

	start := time.Date(2026, 12, 3, 18, 0, 0, 0, time.UTC)
	end := time.Date(2026, 12, 1, 10, 0, 0, 0, time.UTC)
	_, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:           "T",
		EventStartAt:    start,
		HasEventStartAt: true,
		EventEndAt:      end,
		HasEventEndAt:   true,
	})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput for end before start, got %v", err)
	}
}

func TestUpdateActive_ReplacesContactsNotAppends(t *testing.T) {
	svc, _ := testServiceWithActive()

	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title: "T",
		Contacts: []domain.ContactInput{
			{Type: domain.ContactTypeEmail, Value: "a@b.test"},
		},
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if len(got.Contacts) != 1 {
		t.Fatalf("Contacts should be fully replaced, len = %d", len(got.Contacts))
	}
	if got.Contacts[0].Value != "a@b.test" {
		t.Errorf("contact value = %q", got.Contacts[0].Value)
	}
}

func TestUpdateActive_NoEventDatesPreserved(t *testing.T) {
	svc, _ := testServiceWithActive()

	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title: "T",
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if got.HasEventStartAt {
		t.Error("HasEventStartAt should be false when not provided")
	}
	if got.HasEventEndAt {
		t.Error("HasEventEndAt should be false when not provided")
	}
}

func TestUpdateActive_EmptyContactsAllowed(t *testing.T) {
	svc, _ := testServiceWithActive()

	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:    "T",
		Contacts: nil,
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if len(got.Contacts) != 0 {
		t.Errorf("Contacts should be empty, len = %d", len(got.Contacts))
	}
}

func TestUpdateActive_EmptyTitle(t *testing.T) {
	svc, _ := testServiceWithActive()

	cases := []string{"", "   ", "\t\n"}
	for _, title := range cases {
		_, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
			Title: title,
		})
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Errorf("title %q: expected ErrInvalidInput, got %v", title, err)
		}
	}
}

func TestUpdateActive_InvalidContactType(t *testing.T) {
	svc, _ := testServiceWithActive()

	_, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title: "T",
		Contacts: []domain.ContactInput{
			{Type: domain.ContactType("bogus"), Value: "x"},
		},
	})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput, got %v", err)
	}
}

func TestUpdateActive_EmptyContactValue(t *testing.T) {
	svc, _ := testServiceWithActive()

	cases := []string{"", "   "}
	for _, val := range cases {
		_, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
			Title: "T",
			Contacts: []domain.ContactInput{
				{Type: domain.ContactTypeTelegram, Value: val},
			},
		})
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Errorf("value %q: expected ErrInvalidInput, got %v", val, err)
		}
	}
}

func TestUpdateActive_ProfileExtras_HappyPath(t *testing.T) {
	svc, _ := testServiceWithActive()

	fee := int64(50000)
	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:            "T",
		ChiefJudge:       "Иванов Иван",
		RegulationsURL:   "https://example.com/regulations.pdf",
		VenueName:        "Дворец спорта",
		VenueAddress:     "г. Москва, ул. Спортивная, 1",
		EntryFeeMinor:    &fee,
		EntryFeeCurrency: "RUB",
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if got.ChiefJudge != "Иванов Иван" {
		t.Errorf("ChiefJudge = %q", got.ChiefJudge)
	}
	if got.RegulationsURL != "https://example.com/regulations.pdf" {
		t.Errorf("RegulationsURL = %q", got.RegulationsURL)
	}
	if got.VenueName != "Дворец спорта" {
		t.Errorf("VenueName = %q", got.VenueName)
	}
	if got.VenueAddress != "г. Москва, ул. Спортивная, 1" {
		t.Errorf("VenueAddress = %q", got.VenueAddress)
	}
	if got.EntryFeeMinor == nil || *got.EntryFeeMinor != 50000 {
		t.Errorf("EntryFeeMinor = %v", got.EntryFeeMinor)
	}
	if got.EntryFeeCurrency != "RUB" {
		t.Errorf("EntryFeeCurrency = %q", got.EntryFeeCurrency)
	}
}

func TestUpdateActive_RegulationsURL_HttpAllowed(t *testing.T) {
	svc, _ := testServiceWithActive()

	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:          "T",
		RegulationsURL: "http://example.com/regulations.pdf",
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if got.RegulationsURL != "http://example.com/regulations.pdf" {
		t.Errorf("RegulationsURL = %q", got.RegulationsURL)
	}
}

func TestUpdateActive_RegulationsURL_EmptyAllowed(t *testing.T) {
	svc, _ := testServiceWithActive()

	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:          "T",
		RegulationsURL: "   ",
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if got.RegulationsURL != "" {
		t.Errorf("RegulationsURL = %q, want empty", got.RegulationsURL)
	}
}

func TestUpdateActive_RegulationsURL_InvalidScheme_Rejected(t *testing.T) {
	svc, _ := testServiceWithActive()

	cases := []string{
		"ftp://example.com/regulations.pdf",
		"not a url at all",
		"javascript:alert(1)",
		"//example.com/regulations.pdf",
	}
	for _, url := range cases {
		_, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
			Title:          "T",
			RegulationsURL: url,
		})
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Errorf("url %q: expected ErrInvalidInput, got %v", url, err)
		}
	}
}

func TestUpdateActive_EntryFee_NotSetDiffersFromZero(t *testing.T) {
	svc, _ := testServiceWithActive()

	// Не задан.
	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title: "T",
	})
	if err != nil {
		t.Fatalf("UpdateActive (unset): %v", err)
	}
	if got.EntryFeeMinor != nil {
		t.Errorf("EntryFeeMinor should be nil (unset), got %v", got.EntryFeeMinor)
	}
	if got.EntryFeeCurrency != "" {
		t.Errorf("EntryFeeCurrency should be cleared when fee unset, got %q", got.EntryFeeCurrency)
	}

	// Ноль — бесплатное участие, отличается от «не задан».
	zero := int64(0)
	got2, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:         "T",
		EntryFeeMinor: &zero,
	})
	if err != nil {
		t.Fatalf("UpdateActive (zero): %v", err)
	}
	if got2.EntryFeeMinor == nil || *got2.EntryFeeMinor != 0 {
		t.Errorf("EntryFeeMinor should be pointer-to-zero, got %v", got2.EntryFeeMinor)
	}
}

func TestUpdateActive_EntryFee_Negative_Rejected(t *testing.T) {
	svc, _ := testServiceWithActive()

	fee := int64(-100)
	_, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:         "T",
		EntryFeeMinor: &fee,
	})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput for negative fee, got %v", err)
	}
}

func TestUpdateActive_EntryFee_DefaultsCurrencyToRUB(t *testing.T) {
	svc, _ := testServiceWithActive()

	fee := int64(1000)
	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:         "T",
		EntryFeeMinor: &fee,
		// EntryFeeCurrency не указана.
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if got.EntryFeeCurrency != "RUB" {
		t.Errorf("EntryFeeCurrency = %q, want default RUB", got.EntryFeeCurrency)
	}
}

func TestUpdateActive_EntryFee_NotSet_ClearsCurrency(t *testing.T) {
	svc, _ := testServiceWithActive()

	// Сначала задаём взнос с валютой.
	fee := int64(1000)
	_, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:            "T",
		EntryFeeMinor:    &fee,
		EntryFeeCurrency: "USD",
	})
	if err != nil {
		t.Fatalf("UpdateActive (set): %v", err)
	}

	// Затем очищаем взнос — валюта должна затереться в пустую строку, а не
	// остаться от предыдущего значения (полная замена профиля, FR-22).
	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:            "T",
		EntryFeeCurrency: "USD",
	})
	if err != nil {
		t.Fatalf("UpdateActive (unset): %v", err)
	}
	if got.EntryFeeMinor != nil {
		t.Errorf("EntryFeeMinor should be nil, got %v", got.EntryFeeMinor)
	}
	if got.EntryFeeCurrency != "" {
		t.Errorf("EntryFeeCurrency should be cleared to empty, got %q", got.EntryFeeCurrency)
	}
}

func TestUpdateActive_NoActiveTournament(t *testing.T) {
	svc, _ := testService()

	_, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title: "T",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// TestUpdateActive_Program_HappyPath — спека 0040 (T21, сценарий 5): дни
// программы с непустыми пунктами сохраняются и возвращаются в заданном
// порядке.
func TestUpdateActive_Program_HappyPath(t *testing.T) {
	svc, _ := testServiceWithActive()

	day1 := time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)
	day2 := time.Date(2026, 12, 2, 0, 0, 0, 0, time.UTC)
	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title: "T",
		Program: []domain.ProgramDay{
			{Date: day1, Items: []domain.ProgramItem{
				{TimeLabel: "9:00", Text: "Сбор участников"},
				{TimeLabel: "10:00", Text: "Начало номинаций"},
			}},
			{Date: day2, Items: []domain.ProgramItem{
				{TimeLabel: "9:00", Text: "Финалы"},
			}},
		},
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if len(got.Program) != 2 {
		t.Fatalf("Program len = %d, want 2", len(got.Program))
	}
	if !got.Program[0].Date.Equal(day1) {
		t.Errorf("Program[0].Date = %v, want %v", got.Program[0].Date, day1)
	}
	if len(got.Program[0].Items) != 2 || got.Program[0].Items[0].Text != "Сбор участников" {
		t.Errorf("Program[0].Items = %+v", got.Program[0].Items)
	}
	if len(got.Program[1].Items) != 1 || got.Program[1].Items[0].Text != "Финалы" {
		t.Errorf("Program[1].Items = %+v", got.Program[1].Items)
	}
}

// TestUpdateActive_Program_ReplacesNotAppends — full-replace: второй
// UpdateActive с другим набором дней полностью замещает первый (тот же
// приём, что и Contacts).
func TestUpdateActive_Program_ReplacesNotAppends(t *testing.T) {
	svc, _ := testServiceWithActive()

	day1 := time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)
	if _, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:   "T",
		Program: []domain.ProgramDay{{Date: day1, Items: []domain.ProgramItem{{Text: "A"}}}},
	}); err != nil {
		t.Fatalf("UpdateActive (first): %v", err)
	}

	day2 := time.Date(2026, 12, 5, 0, 0, 0, 0, time.UTC)
	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:   "T",
		Program: []domain.ProgramDay{{Date: day2, Items: []domain.ProgramItem{{Text: "B"}}}},
	})
	if err != nil {
		t.Fatalf("UpdateActive (second): %v", err)
	}
	if len(got.Program) != 1 {
		t.Fatalf("Program should be fully replaced, len = %d", len(got.Program))
	}
	if !got.Program[0].Date.Equal(day2) || got.Program[0].Items[0].Text != "B" {
		t.Errorf("Program[0] = %+v", got.Program[0])
	}
}

// TestUpdateActive_Program_EmptyAllowed — турнир без программы (FR-16):
// пустой Program допустим (не ошибка).
func TestUpdateActive_Program_EmptyAllowed(t *testing.T) {
	svc, _ := testServiceWithActive()

	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:   "T",
		Program: nil,
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if len(got.Program) != 0 {
		t.Errorf("Program should be empty, len = %d", len(got.Program))
	}
}

// TestUpdateActive_Program_EmptyItemTextRejected — спека 0040 (T21):
// непустой Text каждого пункта программы валидируется в сервисе, до похода
// в БД (chk_program_items_text дублируется ради читаемой ошибки).
func TestUpdateActive_Program_EmptyItemTextRejected(t *testing.T) {
	svc, _ := testServiceWithActive()

	day1 := time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)
	cases := []string{"", "   ", "\t\n"}
	for _, text := range cases {
		_, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
			Title: "T",
			Program: []domain.ProgramDay{
				{Date: day1, Items: []domain.ProgramItem{{TimeLabel: "9:00", Text: text}}},
			},
		})
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Errorf("text %q: expected ErrInvalidInput, got %v", text, err)
		}
	}
}

// TestUpdateActive_Program_TrimsTextAndTimeLabel — символьный мусор по
// краям обрезается перед сохранением (тот же приём, что Contacts.Value).
func TestUpdateActive_Program_TrimsTextAndTimeLabel(t *testing.T) {
	svc, _ := testServiceWithActive()

	day1 := time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)
	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title: "T",
		Program: []domain.ProgramDay{
			{Date: day1, Items: []domain.ProgramItem{{TimeLabel: "  9:00  ", Text: "  Сбор  "}}},
		},
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if got.Program[0].Items[0].TimeLabel != "9:00" || got.Program[0].Items[0].Text != "Сбор" {
		t.Errorf("Program[0].Items[0] = %+v", got.Program[0].Items[0])
	}
}
