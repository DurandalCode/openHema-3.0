package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

// TestUnseatPool_MarksArenaFreed — успешное снятие пула зовёт
// ArenaProvider.MarkFreed ровно один раз с id арены, с которой сняли пул
// (спека 0043, FR-27: снятие — единственное действие, освобождающее
// площадку).
func TestUnseatPool_MarksArenaFreed(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, arenas, _ := newServiceWithArenas()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})
	poolID := repo.SeedPool("n1", 1, "f1")
	repo.SeedStatus("n1", domain.LayoutReady)
	arenas.Set(domain.ArenaRef{ID: "a1", Name: "R1", Active: true})
	if _, err := svc.SeatPoolOnArena(ctx, poolID, "a1"); err != nil {
		t.Fatalf("seat: %v", err)
	}

	if _, err := svc.UnseatPool(ctx, poolID); err != nil {
		t.Fatalf("unseat: %v", err)
	}

	if calls := arenas.MarkFreedCalls; len(calls) != 1 || calls[0] != "a1" {
		t.Fatalf("MarkFreedCalls = %v, want exactly one call with %q", calls, "a1")
	}
}

// TestUnseatPool_UnknownPool_DoesNotMarkFreed — отказ снятия (пул не
// найден) не зовёт MarkFreed вовсе: площадка, с которой ничего не сняли,
// не должна считаться освободившейся.
func TestUnseatPool_UnknownPool_DoesNotMarkFreed(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, arenas, _ := newServiceWithArenas()

	_, err := svc.UnseatPool(ctx, "does-not-exist")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	if len(arenas.MarkFreedCalls) != 0 {
		t.Errorf("MarkFreedCalls = %v, want none after a failed unseat", arenas.MarkFreedCalls)
	}
}
