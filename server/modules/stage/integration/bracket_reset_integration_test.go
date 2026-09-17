//go:build integration

// Сброс состава этапа-сетки на реальной PostgreSQL: контейнеры половин
// первого круга переживают ResetLayout, посев после сброса снова возможен.
//
// Юнит-тесты сервиса ходят в fake-репозиторий и не видят того, что здесь
// принципиально: DeleteAllPoolsByStage сносил строки stage.pools вместе с
// членствами (каскад), а UndoReset восстанавливал снапшот поверх живых
// контейнеров — и упирался бы в uq_pools_stage_number, будь это обычный
// INSERT. Баг с боевого турнира: «после сброса посева в плейоффе нельзя
// больше добавлять бойцов».
package integration

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
)

func TestIntegration_ResetBracketSeeding_KeepsContainersAndAllowsReseeding(t *testing.T) {
	c, _ := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "Клуб А")
	f2 := createFighter(t, c, nomID, "Пётр", "Клуб Б")

	stage := createBracketStage(t, c, nomID, "Плейофф", 4, false)
	seedBracketSlot(t, c, stage.Id, 1, f1)
	seedBracketSlot(t, c, stage.Id, 4, f2)

	resetReq := connect.NewRequest(&hemav1.ResetLayoutRequest{StageId: stage.Id})
	resetReq.Header().Set("Authorization", adminBearer(t))
	reset, err := c.pool.ResetLayout(context.Background(), resetReq)
	if err != nil {
		t.Fatalf("ResetLayout: %v", err)
	}
	// Контейнеры обеих половин остаются — их создаёт CreateStage, они
	// принадлежат этапу, а не составу. Пустыми, но остаются.
	if len(reset.Msg.Layout.Pools) != 2 {
		t.Fatalf("expected both half containers to survive the reset, got %d pools", len(reset.Msg.Layout.Pools))
	}
	for _, p := range reset.Msg.Layout.Pools {
		if len(p.Members) != 0 {
			t.Fatalf("expected container %q emptied by the reset, got %d members", p.Name, len(p.Members))
		}
	}
	if !reset.Msg.Layout.CanUndo {
		t.Fatalf("expected CanUndo=true after reset")
	}

	// Главное: посев снова работает — в обе половины.
	seedBracketSlot(t, c, stage.Id, 2, f1)
	after := seedBracketSlot(t, c, stage.Id, 3, f2)
	filled := 0
	for _, half := range after.Rounds[0].Halves {
		for _, pair := range half.Pairs {
			for _, slot := range []*hemav1.BracketSlot{pair.SlotA, pair.SlotB} {
				if slot.State == hemav1.BracketSlotState_BRACKET_SLOT_STATE_FILLED {
					filled++
				}
			}
		}
	}
	if filled != 2 {
		t.Fatalf("expected 2 seeded slots after reseeding, got %d", filled)
	}
}

func TestIntegration_UndoResetBracket_RestoresSeedingOverLiveContainers(t *testing.T) {
	c, _ := setup(t)
	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "Клуб А")
	f2 := createFighter(t, c, nomID, "Пётр", "Клуб Б")

	stage := createBracketStage(t, c, nomID, "Плейофф", 4, false)
	seedBracketSlot(t, c, stage.Id, 1, f1)
	seedBracketSlot(t, c, stage.Id, 4, f2)

	resetReq := connect.NewRequest(&hemav1.ResetLayoutRequest{StageId: stage.Id})
	resetReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.ResetLayout(context.Background(), resetReq); err != nil {
		t.Fatalf("ResetLayout: %v", err)
	}

	// Снапшот ложится поверх переживших сброс контейнеров — слепой INSERT
	// упёрся бы здесь в uq_pools_stage_number.
	undoReq := connect.NewRequest(&hemav1.UndoRequest{StageId: stage.Id})
	undoReq.Header().Set("Authorization", adminBearer(t))
	undo, err := c.pool.Undo(context.Background(), undoReq)
	if err != nil {
		t.Fatalf("Undo: %v", err)
	}
	if len(undo.Msg.Layout.Pools) != 2 {
		t.Fatalf("expected exactly 2 containers after undo (no duplicates), got %d", len(undo.Msg.Layout.Pools))
	}

	getReq := connect.NewRequest(&hemav1.GetBracketRequest{StageId: stage.Id})
	getReq.Header().Set("Authorization", adminBearer(t))
	got, err := c.pool.GetBracket(context.Background(), getReq)
	if err != nil {
		t.Fatalf("GetBracket: %v", err)
	}
	round1 := got.Msg.Bracket.Rounds[0]
	if slot := round1.Halves[0].Pairs[0].SlotA; slot.Fighter.GetFighterId() != f1 {
		t.Fatalf("expected f1 back at slot 1, got %+v", slot)
	}
	if slot := round1.Halves[1].Pairs[0].SlotB; slot.Fighter.GetFighterId() != f2 {
		t.Fatalf("expected f2 back at slot 4, got %+v", slot)
	}
}
