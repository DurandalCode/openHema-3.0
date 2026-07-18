package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/bout/domain"
	"github.com/hema/server/modules/bout/service"
	"github.com/hema/server/modules/bout/testutil"
)

const n1 = "11111111-1111-1111-1111-111111111111"

func TestGenerateForNomination_CollectsAllPoolsInOneReplaceCall(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)

	pools := []domain.PoolInput{
		{PoolID: "p1", Fighters: []domain.FighterRef{{ID: "a"}, {ID: "b"}, {ID: "c"}}},
		{PoolID: "p2", Fighters: []domain.FighterRef{{ID: "d"}, {ID: "e"}}},
	}

	if err := svc.GenerateForNomination(context.Background(), n1, pools); err != nil {
		t.Fatalf("GenerateForNomination: %v", err)
	}

	calls := repo.ReplaceCalls()
	if len(calls) != 1 {
		t.Fatalf("expected exactly 1 ReplaceForNomination call, got %d", len(calls))
	}
	if calls[0].NominationID != n1 {
		t.Errorf("NominationID = %q, want %q", calls[0].NominationID, n1)
	}
	// p1 (3 fighters) -> 3 bouts, p2 (2 fighters) -> 1 bout = 4 total.
	if len(calls[0].Bouts) != 4 {
		t.Fatalf("expected 4 bouts total, got %d", len(calls[0].Bouts))
	}
	for _, b := range calls[0].Bouts {
		if b.NominationID != n1 {
			t.Errorf("bout NominationID = %q, want %q", b.NominationID, n1)
		}
		if b.PoolID != "p1" && b.PoolID != "p2" {
			t.Errorf("unexpected PoolID %q", b.PoolID)
		}
	}

	list, err := repo.ListByNomination(context.Background(), n1)
	if err != nil {
		t.Fatalf("ListByNomination: %v", err)
	}
	if len(list) != 4 {
		t.Fatalf("expected 4 bouts persisted, got %d", len(list))
	}
}

func TestGenerateForNomination_SkipsPoolsWithFewerThanTwoFighters(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)

	pools := []domain.PoolInput{
		{PoolID: "empty", Fighters: nil},
		{PoolID: "solo", Fighters: []domain.FighterRef{{ID: "a"}}},
	}

	if err := svc.GenerateForNomination(context.Background(), n1, pools); err != nil {
		t.Fatalf("GenerateForNomination: %v", err)
	}

	calls := repo.ReplaceCalls()
	if len(calls) != 1 {
		t.Fatalf("expected exactly 1 ReplaceForNomination call, got %d", len(calls))
	}
	if len(calls[0].Bouts) != 0 {
		t.Fatalf("expected 0 bouts, got %d", len(calls[0].Bouts))
	}
}

func TestGenerateForNomination_EmptyNominationIDReturnsErrInvalidInput(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)

	err := svc.GenerateForNomination(context.Background(), "", []domain.PoolInput{{PoolID: "p1", Fighters: []domain.FighterRef{{ID: "a"}, {ID: "b"}}}})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
	if len(repo.ReplaceCalls()) != 0 {
		t.Fatalf("repo must not be called on invalid input")
	}
}

func TestClearForNomination_CallsReplaceWithNil(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	repo.SeedBouts(n1, domain.Bout{PoolID: "p1", NominationID: n1, RoundNumber: 1, SequenceNumber: 1})

	if err := svc.ClearForNomination(context.Background(), n1); err != nil {
		t.Fatalf("ClearForNomination: %v", err)
	}

	calls := repo.ReplaceCalls()
	if len(calls) != 1 {
		t.Fatalf("expected exactly 1 ReplaceForNomination call, got %d", len(calls))
	}
	if calls[0].NominationID != n1 {
		t.Errorf("NominationID = %q, want %q", calls[0].NominationID, n1)
	}
	if len(calls[0].Bouts) != 0 {
		t.Errorf("expected nil/empty bouts on clear, got %d", len(calls[0].Bouts))
	}

	list, err := repo.ListByNomination(context.Background(), n1)
	if err != nil {
		t.Fatalf("ListByNomination: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("expected bouts cleared, got %d", len(list))
	}
}

func TestClearForNomination_EmptyNominationIDReturnsErrInvalidInput(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)

	if err := svc.ClearForNomination(context.Background(), ""); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}

func TestListByNomination_Passthrough(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)
	repo.SeedBouts(n1,
		domain.Bout{PoolID: "p2", NominationID: n1, RoundNumber: 1, SequenceNumber: 1},
		domain.Bout{PoolID: "p1", NominationID: n1, RoundNumber: 1, SequenceNumber: 1},
	)

	got, err := svc.ListByNomination(context.Background(), n1)
	if err != nil {
		t.Fatalf("ListByNomination: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 bouts, got %d", len(got))
	}
	// Passthrough preserves repo's own ordering (PoolID, SequenceNumber).
	if got[0].PoolID != "p1" || got[1].PoolID != "p2" {
		t.Errorf("unexpected order: %+v", got)
	}
}

func TestListByNomination_EmptyNominationIDReturnsErrInvalidInput(t *testing.T) {
	repo := testutil.NewFakeRepo()
	svc := service.New(repo)

	if _, err := svc.ListByNomination(context.Background(), ""); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}
