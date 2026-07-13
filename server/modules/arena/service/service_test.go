package service

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/arena/domain"
	"github.com/hema/server/modules/arena/testutil"
)

const activeTournamentID = "11111111-1111-1111-1111-111111111111"

func testService() (*Service, *testutil.FakeRepo) {
	repo := testutil.NewFakeRepo()
	provider := testutil.NewFakeActiveTournamentProvider(activeTournamentID)
	return New(repo, provider), repo
}

func testServiceNoActiveTournament() (*Service, *testutil.FakeRepo) {
	repo := testutil.NewFakeRepo()
	provider := testutil.NewFakeActiveTournamentProviderWithError(errors.New("no active tournament"))
	return New(repo, provider), repo
}

func TestCreate_HappyPath(t *testing.T) {
	svc, _ := testService()

	got, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{
		Name:        "Ристалище 1",
		Description: "у входа, ковёр 5×5",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if got.TournamentID != activeTournamentID {
		t.Errorf("TournamentID = %q", got.TournamentID)
	}
	if got.Name != "Ристалище 1" {
		t.Errorf("Name = %q", got.Name)
	}
	if got.Description != "у входа, ковёр 5×5" {
		t.Errorf("Description = %q", got.Description)
	}
	if got.Position != 0 {
		t.Errorf("Position = %d, want 0", got.Position)
	}
	if got.Status != domain.StatusActive {
		t.Errorf("Status = %q, want %q", got.Status, domain.StatusActive)
	}
}

func TestCreate_PositionIncrementsPerTournament(t *testing.T) {
	svc, _ := testService()

	first, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "A"})
	if err != nil {
		t.Fatalf("Create first: %v", err)
	}
	second, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "B"})
	if err != nil {
		t.Fatalf("Create second: %v", err)
	}
	if first.Position != 0 || second.Position != 1 {
		t.Errorf("positions = %d, %d, want 0, 1", first.Position, second.Position)
	}
}

func TestCreate_EmptyName(t *testing.T) {
	svc, _ := testService()

	cases := []string{"", "   ", "\t\n"}
	for _, name := range cases {
		_, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: name})
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Errorf("name %q: expected ErrInvalidInput, got %v", name, err)
		}
	}
}

func TestCreate_TrimsNameAndDescription(t *testing.T) {
	svc, _ := testService()

	got, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{
		Name:        "  Ристалище  ",
		Description: "  описание  ",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if got.Name != "Ристалище" {
		t.Errorf("Name = %q, want trimmed", got.Name)
	}
	if got.Description != "описание" {
		t.Errorf("Description = %q, want trimmed", got.Description)
	}
}

func TestCreate_EmptyTournamentID(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Create(context.Background(), "   ", domain.CreateInput{Name: "T"})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput, got %v", err)
	}
}

func TestCreate_NonActiveTournamentID(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Create(context.Background(), "22222222-2222-2222-2222-222222222222", domain.CreateInput{Name: "T"})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestCreate_NoActiveTournament(t *testing.T) {
	svc, _ := testServiceNoActiveTournament()

	_, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "T"})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestGet_HappyPath(t *testing.T) {
	svc, _ := testService()

	created, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "T"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := svc.Get(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("ID = %q, want %q", got.ID, created.ID)
	}
}

func TestGet_NotFound(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Get(context.Background(), "does-not-exist")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestGet_EmptyID(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Get(context.Background(), "  ")
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput, got %v", err)
	}
}

func TestList_HappyPath(t *testing.T) {
	svc, _ := testService()

	a, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "A"})
	if err != nil {
		t.Fatalf("Create A: %v", err)
	}
	b, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "B"})
	if err != nil {
		t.Fatalf("Create B: %v", err)
	}

	got, err := svc.List(context.Background(), activeTournamentID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("List len = %d, want 2", len(got))
	}
	if got[0].ID != a.ID || got[1].ID != b.ID {
		t.Errorf("order mismatch: %+v", got)
	}
}

func TestList_EmptyTournamentID(t *testing.T) {
	svc, _ := testService()

	_, err := svc.List(context.Background(), "")
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput, got %v", err)
	}
}

func TestList_NonActiveTournamentID(t *testing.T) {
	svc, _ := testService()

	_, err := svc.List(context.Background(), "22222222-2222-2222-2222-222222222222")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestUpdate_HappyPath(t *testing.T) {
	svc, _ := testService()

	created, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "Old"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := svc.Update(context.Background(), domain.UpdateInput{
		ID:          created.ID,
		Name:        "New",
		Description: "Updated",
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if got.Name != "New" || got.Description != "Updated" {
		t.Errorf("got = %+v", got)
	}
}

func TestUpdate_NotFound(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Update(context.Background(), domain.UpdateInput{ID: "does-not-exist", Name: "T"})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestUpdate_EmptyName(t *testing.T) {
	svc, _ := testService()

	created, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "T"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	_, err = svc.Update(context.Background(), domain.UpdateInput{ID: created.ID, Name: "   "})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput, got %v", err)
	}
}

func TestUpdate_EmptyID(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Update(context.Background(), domain.UpdateInput{ID: "  ", Name: "T"})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput, got %v", err)
	}
}

func TestArchive_HappyPath(t *testing.T) {
	svc, _ := testService()

	created, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "T"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := svc.Archive(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("Archive: %v", err)
	}
	if got.Status != domain.StatusArchived {
		t.Errorf("Status = %q, want %q", got.Status, domain.StatusArchived)
	}
}

func TestArchive_Idempotent(t *testing.T) {
	svc, _ := testService()

	created, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "T"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if _, err := svc.Archive(context.Background(), created.ID); err != nil {
		t.Fatalf("first Archive: %v", err)
	}
	got, err := svc.Archive(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("second Archive: %v", err)
	}
	if got.Status != domain.StatusArchived {
		t.Errorf("Status = %q, want %q", got.Status, domain.StatusArchived)
	}
}

func TestArchive_NotFound(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Archive(context.Background(), "does-not-exist")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestArchive_EmptyID(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Archive(context.Background(), "  ")
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput, got %v", err)
	}
}

func TestRestore_HappyPath(t *testing.T) {
	svc, _ := testService()

	created, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "T"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := svc.Archive(context.Background(), created.ID); err != nil {
		t.Fatalf("Archive: %v", err)
	}

	got, err := svc.Restore(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("Restore: %v", err)
	}
	if got.Status != domain.StatusActive {
		t.Errorf("Status = %q, want %q", got.Status, domain.StatusActive)
	}
}

func TestRestore_Idempotent(t *testing.T) {
	svc, _ := testService()

	created, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "T"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	got, err := svc.Restore(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("Restore on active arena: %v", err)
	}
	if got.Status != domain.StatusActive {
		t.Errorf("Status = %q, want %q", got.Status, domain.StatusActive)
	}
}

func TestRestore_NotFound(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Restore(context.Background(), "does-not-exist")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestReorder_HappyPath(t *testing.T) {
	svc, _ := testService()

	a, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "A"})
	if err != nil {
		t.Fatalf("Create A: %v", err)
	}
	b, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "B"})
	if err != nil {
		t.Fatalf("Create B: %v", err)
	}
	c, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "C"})
	if err != nil {
		t.Fatalf("Create C: %v", err)
	}

	got, err := svc.Reorder(context.Background(), activeTournamentID, []string{c.ID, a.ID, b.ID})
	if err != nil {
		t.Fatalf("Reorder: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("Reorder len = %d, want 3", len(got))
	}
	if got[0].ID != c.ID || got[0].Position != 0 {
		t.Errorf("got[0] = %+v", got[0])
	}
	if got[1].ID != a.ID || got[1].Position != 1 {
		t.Errorf("got[1] = %+v", got[1])
	}
	if got[2].ID != b.ID || got[2].Position != 2 {
		t.Errorf("got[2] = %+v", got[2])
	}

	list, err := svc.List(context.Background(), activeTournamentID)
	if err != nil {
		t.Fatalf("List after reorder: %v", err)
	}
	if list[0].ID != c.ID || list[1].ID != a.ID || list[2].ID != b.ID {
		t.Errorf("persisted order mismatch: %+v", list)
	}
}

func TestReorder_WrongLength(t *testing.T) {
	svc, _ := testService()

	a, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "A"})
	if err != nil {
		t.Fatalf("Create A: %v", err)
	}
	if _, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "B"}); err != nil {
		t.Fatalf("Create B: %v", err)
	}

	_, err = svc.Reorder(context.Background(), activeTournamentID, []string{a.ID})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput for partial list, got %v", err)
	}
}

func TestReorder_UnknownID(t *testing.T) {
	svc, _ := testService()

	a, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "A"})
	if err != nil {
		t.Fatalf("Create A: %v", err)
	}
	if _, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "B"}); err != nil {
		t.Fatalf("Create B: %v", err)
	}

	_, err = svc.Reorder(context.Background(), activeTournamentID, []string{a.ID, "does-not-exist"})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput for unknown id, got %v", err)
	}
}

func TestReorder_DuplicateID(t *testing.T) {
	svc, _ := testService()

	a, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "A"})
	if err != nil {
		t.Fatalf("Create A: %v", err)
	}
	if _, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Name: "B"}); err != nil {
		t.Fatalf("Create B: %v", err)
	}

	_, err = svc.Reorder(context.Background(), activeTournamentID, []string{a.ID, a.ID})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput for duplicate id, got %v", err)
	}
}

func TestReorder_EmptyTournamentID(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Reorder(context.Background(), "  ", nil)
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput, got %v", err)
	}
}