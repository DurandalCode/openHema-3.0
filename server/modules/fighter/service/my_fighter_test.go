package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/fighter/domain"
	"github.com/hema/server/modules/fighter/service"
	"github.com/hema/server/modules/fighter/testutil"
)

func TestMyFighter(t *testing.T) {
	ctx := context.Background()

	t.Run("empty userID is invalid input", func(t *testing.T) {
		svc, _, _ := newService()
		_, err := svc.MyFighter(ctx, "", "t1")
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Fatalf("expected ErrInvalidInput, got %v", err)
		}
	})

	t.Run("empty tournamentID resolves via active tournament provider", func(t *testing.T) {
		repo := testutil.NewFakeRepo()
		noms := testutil.NewFakeNominationProvider()
		tournaments := testutil.NewFakeActiveTournamentProvider("t1")
		svc := service.New(repo, noms, tournaments, nil, nil, nil, nil)

		created, err := svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n1", OriginUserID: "u1", Name: "Ivan", Club: "Club X",
		})
		if err != nil {
			t.Fatalf("unexpected error preparing fighter: %v", err)
		}

		f, err := svc.MyFighter(ctx, "u1", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if f.ID != created.ID {
			t.Fatalf("expected fighter %s, got %s", created.ID, f.ID)
		}
	})

	t.Run("found fighter returned with participations", func(t *testing.T) {
		repo := testutil.NewFakeRepo()
		noms := testutil.NewFakeNominationProvider()
		tournaments := testutil.NewFakeActiveTournamentProvider("t1")
		svc := service.New(repo, noms, tournaments, nil, nil, nil, nil)

		created, err := svc.RegisterFromApplication(ctx, service.RegistrationInput{
			TournamentID: "t1", NominationID: "n1", OriginUserID: "u1", Name: "Ivan", Club: "Club X",
		})
		if err != nil {
			t.Fatalf("unexpected error preparing fighter: %v", err)
		}

		f, err := svc.MyFighter(ctx, "u1", "t1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if f.ID != created.ID {
			t.Fatalf("expected fighter %s, got %s", created.ID, f.ID)
		}
		if len(f.Participations) != 1 || f.Participations[0].NominationID != "n1" {
			t.Fatalf("expected participation n1, got %+v", f.Participations)
		}
	})

	t.Run("fighter not found", func(t *testing.T) {
		svc, _, _ := newService()
		_, err := svc.MyFighter(ctx, "u-no-fighter", "t1")
		if !errors.Is(err, domain.ErrNotFound) {
			t.Fatalf("expected ErrNotFound, got %v", err)
		}
	})

	t.Run("active tournament provider fails resolves to not found", func(t *testing.T) {
		repo := testutil.NewFakeRepo()
		noms := testutil.NewFakeNominationProvider()
		tournaments := testutil.NewFakeActiveTournamentProviderWithError(errors.New("no active tournament"))
		svc := service.New(repo, noms, tournaments, nil, nil, nil, nil)

		_, err := svc.MyFighter(ctx, "u1", "")
		if !errors.Is(err, domain.ErrNotFound) {
			t.Fatalf("expected ErrNotFound, got %v", err)
		}
	})
}
