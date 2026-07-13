package domain_test

import (
	"errors"
	"testing"

	"github.com/hema/server/modules/fighter/domain"
)

func TestNewManual(t *testing.T) {
	t.Run("happy path with multiple nominations", func(t *testing.T) {
		f, err := domain.NewManual("t1", "Ivan Petrov", "Club X", []string{"n1", "n2"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if f.OriginUserID != nil {
			t.Fatalf("expected nil OriginUserID for manual fighter")
		}
		if f.Status != domain.StatusActive {
			t.Fatalf("expected active status, got %v", f.Status)
		}
		if len(f.Participations) != 2 {
			t.Fatalf("expected 2 participations, got %d", len(f.Participations))
		}
	})

	t.Run("empty name rejected", func(t *testing.T) {
		_, err := domain.NewManual("t1", "  ", "Club X", nil)
		if !errors.Is(err, domain.ErrEmptyName) {
			t.Fatalf("expected ErrEmptyName, got %v", err)
		}
	})

	t.Run("empty tournament rejected", func(t *testing.T) {
		_, err := domain.NewManual("", "Ivan", "Club X", nil)
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Fatalf("expected ErrInvalidInput, got %v", err)
		}
	})

	t.Run("no nominations allowed", func(t *testing.T) {
		f, err := domain.NewManual("t1", "Ivan", "", nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(f.Participations) != 0 {
			t.Fatalf("expected 0 participations")
		}
	})
}

func TestNewFromRegistration(t *testing.T) {
	t.Run("happy path sets origin key", func(t *testing.T) {
		f, err := domain.NewFromRegistration("t1", "user-1", "Ivan Petrov", "Club X", "n1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if f.OriginUserID == nil || *f.OriginUserID != "user-1" {
			t.Fatalf("expected OriginUserID user-1, got %v", f.OriginUserID)
		}
		if len(f.Participations) != 1 || f.Participations[0].NominationID != "n1" {
			t.Fatalf("expected single participation n1, got %+v", f.Participations)
		}
	})

	t.Run("empty origin user id rejected", func(t *testing.T) {
		_, err := domain.NewFromRegistration("t1", "", "Ivan", "Club X", "n1")
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Fatalf("expected ErrInvalidInput, got %v", err)
		}
	})
}

func TestFighterWithdrawReturn(t *testing.T) {
	t.Run("withdraw requires reason", func(t *testing.T) {
		f, _ := domain.NewManual("t1", "Ivan", "", nil)
		if err := f.Withdraw(domain.ReasonNone); !errors.Is(err, domain.ErrInvalidReason) {
			t.Fatalf("expected ErrInvalidReason, got %v", err)
		}
	})

	t.Run("withdraw active fighter", func(t *testing.T) {
		f, _ := domain.NewManual("t1", "Ivan", "", nil)
		if err := f.Withdraw(domain.ReasonInjury); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if f.Status != domain.StatusWithdrawn || f.WithdrawalReason != domain.ReasonInjury {
			t.Fatalf("unexpected state after withdraw: %+v", f)
		}
	})

	t.Run("withdraw already withdrawn rejected", func(t *testing.T) {
		f, _ := domain.NewManual("t1", "Ivan", "", nil)
		_ = f.Withdraw(domain.ReasonBan)
		if err := f.Withdraw(domain.ReasonInjury); !errors.Is(err, domain.ErrAlreadyWithdrawn) {
			t.Fatalf("expected ErrAlreadyWithdrawn, got %v", err)
		}
	})

	t.Run("return withdrawn fighter", func(t *testing.T) {
		f, _ := domain.NewManual("t1", "Ivan", "", nil)
		_ = f.Withdraw(domain.ReasonInjury)
		if err := f.Return(); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if f.Status != domain.StatusActive || f.WithdrawalReason != domain.ReasonNone {
			t.Fatalf("unexpected state after return: %+v", f)
		}
	})

	t.Run("return active fighter rejected", func(t *testing.T) {
		f, _ := domain.NewManual("t1", "Ivan", "", nil)
		if err := f.Return(); !errors.Is(err, domain.ErrNotWithdrawn) {
			t.Fatalf("expected ErrNotWithdrawn, got %v", err)
		}
	})
}

func TestFighterParticipations(t *testing.T) {
	t.Run("add participation is idempotent", func(t *testing.T) {
		f, _ := domain.NewManual("t1", "Ivan", "", []string{"n1"})
		if err := f.AddParticipation("n1"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(f.Participations) != 1 {
			t.Fatalf("expected still 1 participation, got %d", len(f.Participations))
		}
	})

	t.Run("add participation restores removed", func(t *testing.T) {
		f, _ := domain.NewManual("t1", "Ivan", "", []string{"n1"})
		_ = f.RemoveParticipation("n1")
		if f.Participations[0].Status != domain.ParticipationRemoved {
			t.Fatalf("expected removed status")
		}
		if err := f.AddParticipation("n1"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if f.Participations[0].Status != domain.ParticipationActive {
			t.Fatalf("expected active status after re-add")
		}
	})

	t.Run("remove participation not found", func(t *testing.T) {
		f, _ := domain.NewManual("t1", "Ivan", "", nil)
		if err := f.RemoveParticipation("nope"); !errors.Is(err, domain.ErrParticipationNotFound) {
			t.Fatalf("expected ErrParticipationNotFound, got %v", err)
		}
	})

	t.Run("remove other nomination unaffected", func(t *testing.T) {
		f, _ := domain.NewManual("t1", "Ivan", "", []string{"n1", "n2"})
		_ = f.RemoveParticipation("n1")
		var n2Status domain.ParticipationStatus
		for _, p := range f.Participations {
			if p.NominationID == "n2" {
				n2Status = p.Status
			}
		}
		if n2Status != domain.ParticipationActive {
			t.Fatalf("expected n2 still active, got %v", n2Status)
		}
	})
}

func TestFighterMove(t *testing.T) {
	t.Run("happy path moves participation", func(t *testing.T) {
		f, _ := domain.NewManual("t1", "Ivan", "", []string{"n1"})
		if err := f.Move("n1", "n2"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var n1Status, n2Status domain.ParticipationStatus
		for _, p := range f.Participations {
			switch p.NominationID {
			case "n1":
				n1Status = p.Status
			case "n2":
				n2Status = p.Status
			}
		}
		if n1Status != domain.ParticipationRemoved {
			t.Fatalf("expected n1 removed, got %v", n1Status)
		}
		if n2Status != domain.ParticipationActive {
			t.Fatalf("expected n2 active, got %v", n2Status)
		}
	})

	t.Run("same nomination rejected", func(t *testing.T) {
		f, _ := domain.NewManual("t1", "Ivan", "", []string{"n1"})
		if err := f.Move("n1", "n1"); !errors.Is(err, domain.ErrInvalidInput) {
			t.Fatalf("expected ErrInvalidInput, got %v", err)
		}
	})

	t.Run("move from nonexistent nomination rejected", func(t *testing.T) {
		f, _ := domain.NewManual("t1", "Ivan", "", nil)
		if err := f.Move("n1", "n2"); !errors.Is(err, domain.ErrParticipationNotFound) {
			t.Fatalf("expected ErrParticipationNotFound, got %v", err)
		}
	})
}

func TestFighterEdit(t *testing.T) {
	t.Run("happy path", func(t *testing.T) {
		f, _ := domain.NewManual("t1", "Ivan", "Club X", nil)
		if err := f.Edit("Ivan Petrov", "Club Y"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if f.Name != "Ivan Petrov" || f.Club != "Club Y" {
			t.Fatalf("unexpected fields after edit: %+v", f)
		}
	})

	t.Run("empty name rejected", func(t *testing.T) {
		f, _ := domain.NewManual("t1", "Ivan", "Club X", nil)
		if err := f.Edit("  ", "Club Y"); !errors.Is(err, domain.ErrEmptyName) {
			t.Fatalf("expected ErrEmptyName, got %v", err)
		}
	})
}
