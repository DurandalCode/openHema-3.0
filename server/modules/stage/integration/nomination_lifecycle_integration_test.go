//go:build integration

// Package integration — спека 0021, T22: сквозной сценарий ЖЦ номинации
// целиком через реальный Connect-путь × реальный PG (см. ADR 0010). Группы →
// доиграть → сформировать плейофф (посев вручную, спека 0018) → доиграть →
// номинация FINISHED + итоговый протокол; пересмотр результата возвращает
// ACTIVE.
package integration

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
)

// bracketFinalPool находит контейнер финала (номер 3 — две половины первого
// круга размера 4 занимают 1/2, финал материализуется отдельным пулом при
// фиксации, план bracket.go lockBracket) среди пулов этапа-сетки.
func bracketFinalPool(t *testing.T, c clients, stageID string) *hemav1.Pool {
	t.Helper()
	req := connect.NewRequest(&hemav1.GetLayoutRequest{StageId: stageID})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.pool.GetLayout(context.Background(), req)
	if err != nil {
		t.Fatalf("GetLayout(%s): %v", stageID, err)
	}
	for _, p := range res.Msg.Layout.Pools {
		if p.Number == 3 {
			return p
		}
	}
	t.Fatalf("no final container (number 3) found among %+v", res.Msg.Layout.Pools)
	return nil
}

func TestIntegration_NominationLifecycle_GroupsThenBracket_FinishesAndReopens(t *testing.T) {
	c, _ := setup(t)
	arenaGroups := createArena(t, c, "Ристалище — группа")
	arenaFinal := createArena(t, c, "Ристалище — финал")

	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Иван", "Клуб А")
	f2 := createFighter(t, c, nomID, "Пётр", "Клуб Б")
	f3 := createFighter(t, c, nomID, "Сидор", "Клуб В")
	f4 := createFighter(t, c, nomID, "Егор", "Клуб Г")

	// --- Групповой этап: один пул, один бой, доиграть до конца. ---
	groupsStageID := stageIDFor(t, c, nomID)
	createPoolReq := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: groupsStageID})
	createPoolReq.Header().Set("Authorization", adminBearer(t))
	createdPool, err := c.pool.CreatePool(context.Background(), createPoolReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	groupPoolID := createdPool.Msg.Layout.Pools[0].Id
	for _, fid := range []string{f1, f2} {
		assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{StageId: groupsStageID, FighterId: fid, PoolId: groupPoolID})
		assignReq.Header().Set("Authorization", adminBearer(t))
		if _, err := c.pool.AssignFighter(context.Background(), assignReq); err != nil {
			t.Fatalf("AssignFighter(%s): %v", fid, err)
		}
	}
	setLayoutStatus(t, c, nomID, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY)

	seatReq := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: groupPoolID, ArenaId: arenaGroups})
	seatReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.SeatPoolOnArena(context.Background(), seatReq); err != nil {
		t.Fatalf("SeatPoolOnArena(groups): %v", err)
	}
	if _, err := c.pool.StartCurrentBout(context.Background(), authedReq(t, &hemav1.StartCurrentBoutRequest{PoolId: groupPoolID})); err != nil {
		t.Fatalf("StartCurrentBout(groups): %v", err)
	}
	if _, err := c.pool.ScoreCurrentBout(context.Background(), authedReq(t, &hemav1.ScoreCurrentBoutRequest{PoolId: groupPoolID, ScoreA: 6, ScoreB: 4})); err != nil {
		t.Fatalf("ScoreCurrentBout(groups): %v", err)
	}
	if _, err := c.pool.FinishCurrentBout(context.Background(), authedReq(t, &hemav1.FinishCurrentBoutRequest{PoolId: groupPoolID})); err != nil {
		t.Fatalf("FinishCurrentBout(groups): %v", err)
	}

	// Единственный (пока) этап номинации доиграл целиком — номинация уже
	// FINISHED (FR-4: есть хотя бы один этап, и каждый её этап завершён).
	nomStatus := func() hemav1.NominationStatus {
		res, err := c.nomPublic.GetNomination(context.Background(), connect.NewRequest(&hemav1.GetNominationRequest{Id: nomID}))
		if err != nil {
			t.Fatalf("GetNomination: %v", err)
		}
		return res.Msg.Nomination.Status
	}
	if got := nomStatus(); got != hemav1.NominationStatus_NOMINATION_STATUS_FINISHED {
		t.Fatalf("after finishing the only group bout, status = %v, want FINISHED", got)
	}

	// --- Плейофф: сетка на 4, посев вручную (спека 0018) — f3/f4 в
	// противоположные половины дают два бая, финал материализуется сразу.
	// Появление нового черновика возвращает номинацию в ACTIVE (FR-4/FR-6):
	// незавершённая/несформированная схема держит её незавершённой. ---
	createStageReq := connect.NewRequest(&hemav1.CreateStageRequest{
		NominationId: nomID,
		Type:         hemav1.StageType_STAGE_TYPE_BRACKET,
		Title:        "Плейофф",
		Bracket:      &hemav1.BracketConfig{Size: 4},
	})
	createStageReq.Header().Set("Authorization", adminBearer(t))
	createdStage, err := c.pool.CreateStage(context.Background(), createStageReq)
	if err != nil {
		t.Fatalf("CreateStage(bracket): %v", err)
	}
	bracketStageID := createdStage.Msg.Created.Id
	if got := nomStatus(); got != hemav1.NominationStatus_NOMINATION_STATUS_ACTIVE {
		t.Fatalf("after creating a new draft stage, status = %v, want ACTIVE", got)
	}

	if _, err := c.pool.SeedBracketSlot(context.Background(), authedReq(t, &hemav1.SeedBracketSlotRequest{StageId: bracketStageID, Slot: 1, FighterId: f3})); err != nil {
		t.Fatalf("SeedBracketSlot(1,f3): %v", err)
	}
	if _, err := c.pool.SeedBracketSlot(context.Background(), authedReq(t, &hemav1.SeedBracketSlotRequest{StageId: bracketStageID, Slot: 3, FighterId: f4})); err != nil {
		t.Fatalf("SeedBracketSlot(3,f4): %v", err)
	}
	lockReq := connect.NewRequest(&hemav1.SetLayoutStatusRequest{StageId: bracketStageID, Status: hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY})
	lockReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.SetLayoutStatus(context.Background(), lockReq); err != nil {
		t.Fatalf("SetLayoutStatus(bracket, ready): %v", err)
	}

	finalPool := bracketFinalPool(t, c, bracketStageID)
	if _, err := c.pool.SeatPoolOnArena(context.Background(), authedReq(t, &hemav1.SeatPoolOnArenaRequest{PoolId: finalPool.Id, ArenaId: arenaFinal})); err != nil {
		t.Fatalf("SeatPoolOnArena(final): %v", err)
	}
	boardRes, err := c.pool.GetBoutBoard(context.Background(), authedReq(t, &hemav1.GetBoutBoardRequest{ArenaId: arenaFinal}))
	if err != nil {
		t.Fatalf("GetBoutBoard(final): %v", err)
	}
	finalBoutID := boardRes.Msg.Board.CurrentBoutId
	if finalBoutID == "" {
		t.Fatalf("expected a current bout on the final container, got %+v", boardRes.Msg.Board)
	}
	if _, err := c.pool.StartCurrentBout(context.Background(), authedReq(t, &hemav1.StartCurrentBoutRequest{PoolId: finalPool.Id})); err != nil {
		t.Fatalf("StartCurrentBout(final): %v", err)
	}
	if _, err := c.pool.ScoreCurrentBout(context.Background(), authedReq(t, &hemav1.ScoreCurrentBoutRequest{PoolId: finalPool.Id, ScoreA: 5, ScoreB: 3})); err != nil {
		t.Fatalf("ScoreCurrentBout(final): %v", err)
	}
	if _, err := c.pool.FinishCurrentBout(context.Background(), authedReq(t, &hemav1.FinishCurrentBoutRequest{PoolId: finalPool.Id})); err != nil {
		t.Fatalf("FinishCurrentBout(final): %v", err)
	}

	// --- Оба этапа доиграны — номинация FINISHED. ---
	if got := nomStatus(); got != hemav1.NominationStatus_NOMINATION_STATUS_FINISHED {
		t.Fatalf("after finishing the final, status = %v, want FINISHED", got)
	}

	listReq := connect.NewRequest(&hemav1.ListStagesRequest{NominationId: nomID})
	listReq.Header().Set("Authorization", adminBearer(t))
	stagesRes, err := c.pool.ListStages(context.Background(), listReq)
	if err != nil {
		t.Fatalf("ListStages: %v", err)
	}
	for _, s := range stagesRes.Msg.Stages {
		if s.ExecutionStatus != hemav1.StageStatus_STAGE_STATUS_FINISHED {
			t.Fatalf("stage %s (%v) ExecutionStatus = %v, want FINISHED", s.Id, s.Type, s.ExecutionStatus)
		}
	}

	// --- Итоговый протокол: секция на каждый терминальный этап. ---
	resultsRes, err := c.poolPublic.GetNominationResults(context.Background(), connect.NewRequest(&hemav1.GetNominationResultsRequest{NominationId: nomID}))
	if err != nil {
		t.Fatalf("GetNominationResults: %v", err)
	}
	results := resultsRes.Msg.Results
	if !results.NominationFinished {
		t.Fatalf("expected NominationFinished=true, got %+v", results)
	}
	if len(results.Sections) != 2 {
		t.Fatalf("expected 2 terminal sections (groups + bracket), got %+v", results.Sections)
	}
	for _, sec := range results.Sections {
		if !sec.Finished {
			t.Fatalf("section %s not finished: %+v", sec.StageId, sec)
		}
		switch sec.StageType {
		case hemav1.StageType_STAGE_TYPE_GROUPS:
			if len(sec.Entries) != 2 {
				t.Fatalf("groups section: expected 2 entries, got %+v", sec.Entries)
			}
		case hemav1.StageType_STAGE_TYPE_BRACKET:
			if len(sec.Entries) != 2 {
				t.Fatalf("bracket section: expected 2 entries (champion+runner-up), got %+v", sec.Entries)
			}
			byFighter := map[string]*hemav1.NominationResultEntry{}
			for _, e := range sec.Entries {
				byFighter[e.Fighter.FighterId] = e
			}
			champ, ok := byFighter[f3]
			if !ok || champ.PlaceFrom != 1 || champ.PlaceTo != 1 {
				t.Fatalf("expected f3 (winner) at place 1, got %+v", sec.Entries)
			}
			runnerUp, ok := byFighter[f4]
			if !ok || runnerUp.PlaceFrom != 2 || runnerUp.PlaceTo != 2 {
				t.Fatalf("expected f4 (loser) at place 2, got %+v", sec.Entries)
			}
		}
	}

	// --- Пересмотр результата финала возвращает номинацию в ACTIVE.
	// Авто-продвижение после последнего боя очистило указатель — возвращаем
	// его явно (как и в юнит-тестах ведения, 0013). ---
	if _, err := c.pool.SetCurrentBout(context.Background(), authedReq(t, &hemav1.SetCurrentBoutRequest{PoolId: finalPool.Id, BoutId: finalBoutID})); err != nil {
		t.Fatalf("SetCurrentBout(final): %v", err)
	}
	if _, err := c.pool.ReopenCurrentBout(context.Background(), authedReq(t, &hemav1.ReopenCurrentBoutRequest{PoolId: finalPool.Id})); err != nil {
		t.Fatalf("ReopenCurrentBout(final): %v", err)
	}
	if got := nomStatus(); got != hemav1.NominationStatus_NOMINATION_STATUS_ACTIVE {
		t.Fatalf("after reopening the final, status = %v, want ACTIVE", got)
	}
}

// authedReq — тестовый хелпер: оборачивает сообщение в connect.Request с
// admin-Bearer-токеном (сокращает однотипные PoolId-only запросы ведения
// боя, где заголовок нужен на каждый вызов).
func authedReq[T any](t *testing.T, msg *T) *connect.Request[T] {
	t.Helper()
	req := connect.NewRequest(msg)
	req.Header().Set("Authorization", adminBearer(t))
	return req
}
