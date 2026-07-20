package service

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/nomination/domain"
	"github.com/hema/server/modules/nomination/testutil"
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
		Title:              "Лонгсворд про",
		Description:        "Основная номинация",
		FighterCapacity:    16,
		HasFighterCapacity: true,
		Metadata:           domain.Metadata{RulesURL: "https://example.com/rules"},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if got.TournamentID != activeTournamentID {
		t.Errorf("TournamentID = %q", got.TournamentID)
	}
	if got.Title != "Лонгсворд про" {
		t.Errorf("Title = %q", got.Title)
	}
	if !got.HasFighterCapacity || got.FighterCapacity != 16 {
		t.Errorf("FighterCapacity = %d (has=%v)", got.FighterCapacity, got.HasFighterCapacity)
	}
	if got.Metadata.RulesURL != "https://example.com/rules" {
		t.Errorf("Metadata.RulesURL = %q", got.Metadata.RulesURL)
	}
	if got.Position != 0 {
		t.Errorf("Position = %d, want 0", got.Position)
	}
}

func TestCreate_PositionIncrementsPerTournament(t *testing.T) {
	svc, _ := testService()

	first, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "A"})
	if err != nil {
		t.Fatalf("Create first: %v", err)
	}
	second, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "B"})
	if err != nil {
		t.Fatalf("Create second: %v", err)
	}
	if first.Position != 0 || second.Position != 1 {
		t.Errorf("positions = %d, %d, want 0, 1", first.Position, second.Position)
	}
}

func TestCreate_EmptyTitle(t *testing.T) {
	svc, _ := testService()

	cases := []string{"", "   ", "\t\n"}
	for _, title := range cases {
		_, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: title})
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Errorf("title %q: expected ErrInvalidInput, got %v", title, err)
		}
	}
}

func TestCreate_NegativeCapacity(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{
		Title:              "T",
		FighterCapacity:    -1,
		HasFighterCapacity: true,
	})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput, got %v", err)
	}
}

func TestCreate_EmptyTournamentID(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Create(context.Background(), "   ", domain.CreateInput{Title: "T"})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput, got %v", err)
	}
}

func TestCreate_NonActiveTournamentID(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Create(context.Background(), "22222222-2222-2222-2222-222222222222", domain.CreateInput{Title: "T"})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestCreate_NoActiveTournament(t *testing.T) {
	svc, _ := testServiceNoActiveTournament()

	_, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "T"})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestCreate_DuplicateTitleCaseInsensitive(t *testing.T) {
	svc, _ := testService()

	if _, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "Сабля"}); err != nil {
		t.Fatalf("Create first: %v", err)
	}
	_, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "сабля"})
	if !errors.Is(err, domain.ErrConflict) {
		t.Errorf("expected ErrConflict, got %v", err)
	}
}

func TestGet_HappyPath(t *testing.T) {
	svc, _ := testService()

	created, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "T"})
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

	a, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "A"})
	if err != nil {
		t.Fatalf("Create A: %v", err)
	}
	b, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "B"})
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

	created, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "Old"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := svc.Update(context.Background(), domain.UpdateInput{
		ID:                 created.ID,
		Title:              "New",
		Description:        "Updated",
		FighterCapacity:    8,
		HasFighterCapacity: true,
		Metadata:           domain.Metadata{RulesURL: "https://example.com/new-rules"},
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if got.Title != "New" || got.Description != "Updated" {
		t.Errorf("got = %+v", got)
	}
	if !got.HasFighterCapacity || got.FighterCapacity != 8 {
		t.Errorf("FighterCapacity = %d (has=%v)", got.FighterCapacity, got.HasFighterCapacity)
	}
	if got.Metadata.RulesURL != "https://example.com/new-rules" {
		t.Errorf("Metadata.RulesURL = %q", got.Metadata.RulesURL)
	}
}

func TestUpdate_NotFound(t *testing.T) {
	svc, _ := testService()

	_, err := svc.Update(context.Background(), domain.UpdateInput{ID: "does-not-exist", Title: "T"})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestUpdate_EmptyTitle(t *testing.T) {
	svc, _ := testService()

	created, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "T"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	_, err = svc.Update(context.Background(), domain.UpdateInput{ID: created.ID, Title: "   "})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput, got %v", err)
	}
}

func TestUpdate_NegativeCapacity(t *testing.T) {
	svc, _ := testService()

	created, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "T"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	_, err = svc.Update(context.Background(), domain.UpdateInput{
		ID:                 created.ID,
		Title:              "T",
		FighterCapacity:    -5,
		HasFighterCapacity: true,
	})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput, got %v", err)
	}
}

func TestUpdate_DuplicateTitle(t *testing.T) {
	svc, _ := testService()

	if _, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "Сабля"}); err != nil {
		t.Fatalf("Create A: %v", err)
	}
	b, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "Рапира"})
	if err != nil {
		t.Fatalf("Create B: %v", err)
	}

	_, err = svc.Update(context.Background(), domain.UpdateInput{ID: b.ID, Title: "сабля"})
	if !errors.Is(err, domain.ErrConflict) {
		t.Errorf("expected ErrConflict, got %v", err)
	}
}

func TestUpdate_SameTitleAllowed(t *testing.T) {
	svc, _ := testService()

	created, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "T", Description: "old"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := svc.Update(context.Background(), domain.UpdateInput{ID: created.ID, Title: "T", Description: "new"})
	if err != nil {
		t.Fatalf("Update with unchanged title should be allowed: %v", err)
	}
	if got.Description != "new" {
		t.Errorf("Description = %q", got.Description)
	}
}

func TestDelete_HappyPath(t *testing.T) {
	svc, _ := testService()

	created, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "T"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := svc.Delete(context.Background(), created.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := svc.Get(context.Background(), created.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestDelete_NotFound(t *testing.T) {
	svc, _ := testService()

	err := svc.Delete(context.Background(), "does-not-exist")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestReorder_HappyPath(t *testing.T) {
	svc, _ := testService()

	a, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "A"})
	if err != nil {
		t.Fatalf("Create A: %v", err)
	}
	b, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "B"})
	if err != nil {
		t.Fatalf("Create B: %v", err)
	}
	c, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "C"})
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

	a, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "A"})
	if err != nil {
		t.Fatalf("Create A: %v", err)
	}
	if _, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "B"}); err != nil {
		t.Fatalf("Create B: %v", err)
	}

	_, err = svc.Reorder(context.Background(), activeTournamentID, []string{a.ID})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput for partial list, got %v", err)
	}
}

func TestReorder_UnknownID(t *testing.T) {
	svc, _ := testService()

	a, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "A"})
	if err != nil {
		t.Fatalf("Create A: %v", err)
	}
	if _, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "B"}); err != nil {
		t.Fatalf("Create B: %v", err)
	}

	_, err = svc.Reorder(context.Background(), activeTournamentID, []string{a.ID, "does-not-exist"})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput for unknown id, got %v", err)
	}
}

func TestReorder_DuplicateID(t *testing.T) {
	svc, _ := testService()

	a, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "A"})
	if err != nil {
		t.Fatalf("Create A: %v", err)
	}
	if _, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "B"}); err != nil {
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

// --- Спека 0012: статусная модель номинации ---

func TestCreate_DefaultStatusOpen(t *testing.T) {
	svc, _ := testService()

	got, err := svc.Create(context.Background(), activeTournamentID, domain.CreateInput{Title: "T"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if got.Status != domain.StatusOpen {
		t.Errorf("Status = %q, want %q (AC-1)", got.Status, domain.StatusOpen)
	}
}

// seedWithState создаёт fake-репо с одной номинацией в заданном состоянии
// статусной модели (спека 0012), минуя Create (который всегда ставит open).
func seedWithState(id string, status domain.Status, reason domain.ClosedReason, hasDistributed bool) (*Service, *testutil.FakeRepo) {
	repo := testutil.NewFakeRepoWithNominations(domain.Nomination{
		ID:                     id,
		TournamentID:           activeTournamentID,
		Title:                  "T",
		Status:                 status,
		ClosedReason:           reason,
		HasDistributedFighters: hasDistributed,
	})
	provider := testutil.NewFakeActiveTournamentProvider(activeTournamentID)
	return New(repo, provider), repo
}

func TestCloseRegistration_OpenToClosedManual(t *testing.T) {
	svc, _ := seedWithState("n1", domain.StatusOpen, domain.ClosedReasonNone, false)

	got, err := svc.CloseRegistration(context.Background(), "n1")
	if err != nil {
		t.Fatalf("CloseRegistration: %v", err)
	}
	if got.Status != domain.StatusClosed {
		t.Errorf("Status = %q, want closed (AC-3)", got.Status)
	}
	if got.ClosedReason != domain.ClosedReasonManual {
		t.Errorf("ClosedReason = %q, want manual", got.ClosedReason)
	}
}

func TestCloseRegistration_IdempotentOnAlreadyClosedManual(t *testing.T) {
	svc, _ := seedWithState("n1", domain.StatusClosed, domain.ClosedReasonManual, false)

	got, err := svc.CloseRegistration(context.Background(), "n1")
	if err != nil {
		t.Fatalf("CloseRegistration: %v", err)
	}
	if got.Status != domain.StatusClosed || got.ClosedReason != domain.ClosedReasonManual {
		t.Errorf("got = %+v, want unchanged closed/manual", got)
	}
}

// Регрессия из «Риски» plan.md: CloseRegistration на уже closed(drawing) —
// идемпотентный no-op, ClosedReason не перезаписывается в manual.
func TestCloseRegistration_IdempotentOnAlreadyClosedDrawing_ReasonNotOverwritten(t *testing.T) {
	svc, _ := seedWithState("n1", domain.StatusClosed, domain.ClosedReasonDrawing, true)

	got, err := svc.CloseRegistration(context.Background(), "n1")
	if err != nil {
		t.Fatalf("CloseRegistration: %v", err)
	}
	if got.Status != domain.StatusClosed {
		t.Errorf("Status = %q, want closed", got.Status)
	}
	if got.ClosedReason != domain.ClosedReasonDrawing {
		t.Errorf("ClosedReason = %q, want drawing (not overwritten to manual)", got.ClosedReason)
	}
}

func TestCloseRegistration_NotFound(t *testing.T) {
	svc, _ := testService()

	_, err := svc.CloseRegistration(context.Background(), "does-not-exist")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestReopenRegistration_ManualNotDistributed_ToOpen(t *testing.T) {
	svc, _ := seedWithState("n1", domain.StatusClosed, domain.ClosedReasonManual, false)

	got, err := svc.ReopenRegistration(context.Background(), "n1")
	if err != nil {
		t.Fatalf("ReopenRegistration: %v", err)
	}
	if got.Status != domain.StatusOpen {
		t.Errorf("Status = %q, want open (AC-4)", got.Status)
	}
	if got.ClosedReason != domain.ClosedReasonNone {
		t.Errorf("ClosedReason = %q, want none", got.ClosedReason)
	}
}

func TestReopenRegistration_IdempotentOnAlreadyOpen(t *testing.T) {
	svc, _ := seedWithState("n1", domain.StatusOpen, domain.ClosedReasonNone, false)

	got, err := svc.ReopenRegistration(context.Background(), "n1")
	if err != nil {
		t.Fatalf("ReopenRegistration: %v", err)
	}
	if got.Status != domain.StatusOpen {
		t.Errorf("Status = %q, want open", got.Status)
	}
}

// AC-9: закрыто от раскладки — Reopen заблокирован.
func TestReopenRegistration_ErrCannotReopen_ClosedDrawing(t *testing.T) {
	svc, _ := seedWithState("n1", domain.StatusClosed, domain.ClosedReasonDrawing, true)

	_, err := svc.ReopenRegistration(context.Background(), "n1")
	if !errors.Is(err, domain.ErrCannotReopen) {
		t.Errorf("expected ErrCannotReopen, got %v", err)
	}
}

// AC-16 (ключевой тест ревалидации): закрыто вручную, но раскладка всё же
// началась (HasDistributedFighters=true) — Reopen заблокирован, несмотря на
// причину "manual".
func TestReopenRegistration_ErrCannotReopen_ManualButDistributed(t *testing.T) {
	svc, _ := seedWithState("n1", domain.StatusClosed, domain.ClosedReasonManual, true)

	_, err := svc.ReopenRegistration(context.Background(), "n1")
	if !errors.Is(err, domain.ErrCannotReopen) {
		t.Errorf("expected ErrCannotReopen, got %v", err)
	}
}

func TestReopenRegistration_NotFound(t *testing.T) {
	svc, _ := testService()

	_, err := svc.ReopenRegistration(context.Background(), "does-not-exist")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// AC-7 (серверная часть): первый посад бойца в пул переводит открытую
// номинацию в closed(drawing).
func TestSyncRegistrationState_OpenTrueToClosedDrawing(t *testing.T) {
	svc, repo := seedWithState("n1", domain.StatusOpen, domain.ClosedReasonNone, false)

	if err := svc.SyncRegistrationState(context.Background(), "n1", true); err != nil {
		t.Fatalf("SyncRegistrationState: %v", err)
	}
	got, err := repo.GetByID(context.Background(), "n1")
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got.Status != domain.StatusClosed || got.ClosedReason != domain.ClosedReasonDrawing {
		t.Errorf("got = %+v, want closed(drawing)", got)
	}
	if !got.HasDistributedFighters {
		t.Errorf("HasDistributedFighters = false, want true")
	}
}

// AC-10: раскладка полностью удалена (0 распределённых) — авто-откат
// closed(drawing) -> open.
func TestSyncRegistrationState_ClosedDrawingFalseToOpen(t *testing.T) {
	svc, repo := seedWithState("n1", domain.StatusClosed, domain.ClosedReasonDrawing, true)

	if err := svc.SyncRegistrationState(context.Background(), "n1", false); err != nil {
		t.Fatalf("SyncRegistrationState: %v", err)
	}
	got, err := repo.GetByID(context.Background(), "n1")
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got.Status != domain.StatusOpen || got.ClosedReason != domain.ClosedReasonNone {
		t.Errorf("got = %+v, want open/none", got)
	}
	if got.HasDistributedFighters {
		t.Errorf("HasDistributedFighters = true, want false")
	}
}

// AC-11: ручное закрытие не откатывается пустой раскладкой — статус/причина
// не меняются, но HasDistributedFighters всё равно обновляется.
func TestSyncRegistrationState_ClosedManualFalse_StatusUnchangedFlagUpdated(t *testing.T) {
	svc, repo := seedWithState("n1", domain.StatusClosed, domain.ClosedReasonManual, true)

	if err := svc.SyncRegistrationState(context.Background(), "n1", false); err != nil {
		t.Fatalf("SyncRegistrationState: %v", err)
	}
	got, err := repo.GetByID(context.Background(), "n1")
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got.Status != domain.StatusClosed || got.ClosedReason != domain.ClosedReasonManual {
		t.Errorf("got = %+v, want closed/manual unchanged", got)
	}
	if got.HasDistributedFighters {
		t.Errorf("HasDistributedFighters = true, want false (updated)")
	}
}

// AC-16 сценарий (серверная часть): номинация уже закрыта вручную, раскладка
// всё же началась (hasDistributed=true застаёт уже Closed) — no-op для
// status/reason (не апгрейдится в drawing), но флаг обновляется — нужен для
// гейта ReopenRegistration.
func TestSyncRegistrationState_ClosedManualTrue_StatusUnchangedFlagUpdated(t *testing.T) {
	svc, repo := seedWithState("n1", domain.StatusClosed, domain.ClosedReasonManual, false)

	if err := svc.SyncRegistrationState(context.Background(), "n1", true); err != nil {
		t.Fatalf("SyncRegistrationState: %v", err)
	}
	got, err := repo.GetByID(context.Background(), "n1")
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got.Status != domain.StatusClosed || got.ClosedReason != domain.ClosedReasonManual {
		t.Errorf("got = %+v, want closed/manual unchanged (no upgrade to drawing)", got)
	}
	if !got.HasDistributedFighters {
		t.Errorf("HasDistributedFighters = false, want true (updated)")
	}
}

func TestSyncRegistrationState_NotFound(t *testing.T) {
	svc, _ := testService()

	err := svc.SyncRegistrationState(context.Background(), "does-not-exist", true)
	if !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}
