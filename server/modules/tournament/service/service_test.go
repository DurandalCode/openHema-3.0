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
	return New(repo), repo
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
	return New(repo), repo
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
		HasEventEndAt:  true,
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
		HasEventEndAt:  true,
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

func TestUpdateActive_NoActiveTournament(t *testing.T) {
	svc, _ := testService()

	_, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title: "T",
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}