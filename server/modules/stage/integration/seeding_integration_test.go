//go:build integration

// Package integration — сквозные тесты переходов между этапами (спека
// 0019, T13): миграция 00003, CHECK/FK на реальном PG, полный путь «группы
// с боями → BuildStage сетки → посев в БД» через реальный Connect.
package integration

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
)

// ---------------------------------------------------------------------
// Миграция 00003 и её констрейнты (CHECK/FK на реальном PG).
// ---------------------------------------------------------------------

// TestIntegration_ChkStagesRule_RejectsPartialRule проверяет chk_stages_rule
// (миграция 00003): правило либо задано целиком (все шесть полей), либо не
// задано вовсе — наполовину заполненная строка отклоняется на уровне данных.
func TestIntegration_ChkStagesRule_RejectsPartialRule(t *testing.T) {
	c, pool := setup(t)
	nomID := createNomination(t, c)

	// source_kind задан, но selector_kind/layout_method — нет: нарушает
	// chk_stages_rule.
	_, err := pool.Exec(context.Background(),
		`INSERT INTO stage.stages (nomination_id, position, title, type, status, source_kind)
		 VALUES ($1, 1, 'Невалидное правило', 'groups', 'draft', 'roster')`,
		nomID,
	)
	if err == nil {
		t.Fatal("expected chk_stages_rule to reject a partially-filled rule")
	}

	// Полностью заполненное правило — проходит.
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO stage.stages (nomination_id, position, title, type, status, group_count,
		                           source_kind, selector_kind, layout_method)
		 VALUES ($1, 1, 'Валидное правило', 'groups', 'draft', 2, 'roster', 'all', 'snake')`,
		nomID,
	); err != nil {
		t.Fatalf("expected a fully-filled rule to be accepted, got error: %v", err)
	}
}

// TestIntegration_ChkStagesSourceStage_RequiresSourceStageID проверяет
// chk_stages_source_stage (миграция 00003): source_kind='stage' обязан
// нести source_stage_id, и наоборот.
func TestIntegration_ChkStagesSourceStage_RequiresSourceStageID(t *testing.T) {
	c, pool := setup(t)
	nomID := createNomination(t, c)

	_, err := pool.Exec(context.Background(),
		`INSERT INTO stage.stages (nomination_id, position, title, type, status, group_count,
		                           source_kind, selector_kind, layout_method)
		 VALUES ($1, 1, 'Источник без id', 'groups', 'draft', 2, 'stage', 'all', 'snake')`,
		nomID,
	)
	if err == nil {
		t.Fatal("expected chk_stages_source_stage to reject source_kind='stage' without source_stage_id")
	}
}

// TestIntegration_SourceStageID_OnDeleteRestrict проверяет FK
// stages_source_stage_id_fkey (миграция 00003, ON DELETE RESTRICT, спека
// 0019 FR-7a): пока правило другого этапа ссылается на этап как на
// источник, удалить его нельзя на уровне данных — тот же инвариант, что и
// доменный ErrStageIsSource, но на уровне БД.
func TestIntegration_SourceStageID_OnDeleteRestrict(t *testing.T) {
	c, pool := setup(t)
	nomID := createNomination(t, c)

	var sourceID string
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO stage.stages (nomination_id, position, title, type, status, group_count)
		 VALUES ($1, 1, 'Источник', 'groups', 'draft', 2) RETURNING id`,
		nomID,
	).Scan(&sourceID); err != nil {
		t.Fatalf("insert source stage: %v", err)
	}
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO stage.stages (nomination_id, position, title, type, status, bracket_size,
		                           source_kind, source_stage_id, selector_kind, place_from, place_to, layout_method)
		 VALUES ($1, 2, 'Ветка', 'bracket', 'draft', 4, 'stage', $2, 'group_places', 1, 2, 'seeded')`,
		nomID, sourceID,
	); err != nil {
		t.Fatalf("insert dependent stage: %v", err)
	}

	if _, err := pool.Exec(context.Background(), `DELETE FROM stage.stages WHERE id = $1`, sourceID); err == nil {
		t.Fatal("expected ON DELETE RESTRICT to block deleting a stage that is a rule source")
	}
}

// ---------------------------------------------------------------------
// Полный путь: группы с боями → BuildStage сетки → посев в БД.
// ---------------------------------------------------------------------

// conductAllBouts проводит все бои текущего пула на арене до конца
// (авто-продвижение, спека 0013 FR-9), выставляя счёт через scoreFor(A,B) —
// пара id бойцов текущего боя.
func conductAllBouts(t *testing.T, c clients, arenaID, poolID string, scoreFor func(aID, bID string) (int32, int32)) {
	t.Helper()
	for {
		boardReq := connect.NewRequest(&hemav1.GetBoutBoardRequest{ArenaId: arenaID})
		boardReq.Header().Set("Authorization", adminBearer(t))
		res, err := c.pool.GetBoutBoard(context.Background(), boardReq)
		if err != nil {
			t.Fatalf("GetBoutBoard: %v", err)
		}
		board := res.Msg.Board
		if board.CurrentBoutId == "" {
			return
		}
		var current *hemav1.BoardBout
		for _, b := range board.Bouts {
			if b.Id == board.CurrentBoutId {
				current = b
				break
			}
		}
		if current == nil {
			t.Fatalf("current bout %s not found among board bouts", board.CurrentBoutId)
		}

		startReq := connect.NewRequest(&hemav1.StartCurrentBoutRequest{PoolId: poolID})
		startReq.Header().Set("Authorization", adminBearer(t))
		if _, err := c.pool.StartCurrentBout(context.Background(), startReq); err != nil {
			t.Fatalf("StartCurrentBout: %v", err)
		}

		scoreA, scoreB := scoreFor(current.FighterA.FighterId, current.FighterB.FighterId)
		scoreReq := connect.NewRequest(&hemav1.ScoreCurrentBoutRequest{PoolId: poolID, ScoreA: scoreA, ScoreB: scoreB})
		scoreReq.Header().Set("Authorization", adminBearer(t))
		if _, err := c.pool.ScoreCurrentBout(context.Background(), scoreReq); err != nil {
			t.Fatalf("ScoreCurrentBout: %v", err)
		}

		finishReq := connect.NewRequest(&hemav1.FinishCurrentBoutRequest{PoolId: poolID})
		finishReq.Header().Set("Authorization", adminBearer(t))
		if _, err := c.pool.FinishCurrentBout(context.Background(), finishReq); err != nil {
			t.Fatalf("FinishCurrentBout: %v", err)
		}
	}
}

// TestIntegration_BuildStage_GroupsWithResults_SeedsBracket — сценарий
// AC-1: групповой этап из двух пулов доигран до конца (реальные бои через
// Connect × PG), admin создаёт этап-сетку с правилом «места 1-2 каждой
// группы», формирует его — посев реально лежит в stage.pool_members со
// слотами.
func TestIntegration_BuildStage_GroupsWithResults_SeedsBracket(t *testing.T) {
	c, pool := setup(t)
	arenaA := createArena(t, c, "Ристалище А")
	arenaB := createArena(t, c, "Ристалище Б")

	nomID := createNomination(t, c)
	f1 := createFighter(t, c, nomID, "Боец 1", "")
	f2 := createFighter(t, c, nomID, "Боец 2", "")
	f3 := createFighter(t, c, nomID, "Боец 3", "")
	f4 := createFighter(t, c, nomID, "Боец 4", "")
	f5 := createFighter(t, c, nomID, "Боец 5", "")
	f6 := createFighter(t, c, nomID, "Боец 6", "")

	sourceStageID := stageIDFor(t, c, nomID)

	pool1ID := createPoolWithFighters(t, c, sourceStageID, f1, f2, f3)
	pool2ID := createPoolWithFighters(t, c, sourceStageID, f4, f5, f6)

	setLayoutStatus(t, c, nomID, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY)

	seatPoolOnArena(t, c, pool1ID, arenaA)
	seatPoolOnArena(t, c, pool2ID, arenaB)

	// Ранг определяет исход: чем выше ранг, тем чаще боец побеждает; f1/f4
	// выигрывают оба своих боя (места 1), f2/f5 — один из двух (места 2),
	// f3/f6 — ни одного (места 3).
	rank := map[string]int{f1: 3, f2: 2, f3: 1, f4: 3, f5: 2, f6: 1}
	scoreFor := func(aID, bID string) (int32, int32) {
		if rank[aID] > rank[bID] {
			return 5, 2
		}
		return 2, 5
	}
	conductAllBouts(t, c, arenaA, pool1ID, scoreFor)
	conductAllBouts(t, c, arenaB, pool2ID, scoreFor)

	bracket := createBracketStage(t, c, nomID, "Плейофф", 4, false)

	ruleReq := connect.NewRequest(&hemav1.SetStageRuleRequest{
		StageId: bracket.Id,
		Rule: &hemav1.SeedingRule{
			SourceKind: hemav1.StageSourceKind_STAGE_SOURCE_KIND_STAGE, SourceStageId: sourceStageID,
			Selector: hemav1.StageSelectorKind_STAGE_SELECTOR_KIND_GROUP_PLACES, PlaceFrom: 1, PlaceTo: 2,
			Method: hemav1.StageLayoutMethod_STAGE_LAYOUT_METHOD_SEEDED,
		},
	})
	ruleReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.SetStageRule(context.Background(), ruleReq); err != nil {
		t.Fatalf("SetStageRule: %v", err)
	}

	previewReq := connect.NewRequest(&hemav1.PreviewStageBuildRequest{StageId: bracket.Id})
	previewReq.Header().Set("Authorization", adminBearer(t))
	preview, err := c.pool.PreviewStageBuild(context.Background(), previewReq)
	if err != nil {
		t.Fatalf("PreviewStageBuild: %v", err)
	}
	if len(preview.Msg.Preview.Entries) != 4 || preview.Msg.Preview.Capacity != 4 {
		t.Fatalf("expected 4 entries/capacity 4 (top-2 of each pool), got %+v", preview.Msg.Preview)
	}
	if len(preview.Msg.Preview.Ties) != 0 || len(preview.Msg.Preview.Overlaps) != 0 {
		t.Fatalf("expected no ties/overlaps, got %+v", preview.Msg.Preview)
	}

	buildReq := connect.NewRequest(&hemav1.BuildStageRequest{StageId: bracket.Id})
	buildReq.Header().Set("Authorization", adminBearer(t))
	build, err := c.pool.BuildStage(context.Background(), buildReq)
	if err != nil {
		t.Fatalf("BuildStage: %v", err)
	}
	if build.Msg.GetBracket() == nil {
		t.Fatalf("expected Bracket result, got %+v", build.Msg.Result)
	}

	var seededCount int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM stage.pool_members WHERE stage_id = $1 AND slot IS NOT NULL`,
		bracket.Id,
	).Scan(&seededCount); err != nil {
		t.Fatalf("count seeded members: %v", err)
	}
	if seededCount != 4 {
		t.Fatalf("expected 4 rows with a slot in the DB, got %d", seededCount)
	}

	var f3Seeded bool
	if err := pool.QueryRow(context.Background(),
		`SELECT EXISTS(SELECT 1 FROM stage.pool_members WHERE stage_id = $1 AND fighter_id = $2 AND slot IS NOT NULL)`,
		bracket.Id, f3,
	).Scan(&f3Seeded); err != nil {
		t.Fatalf("check f3 not seeded: %v", err)
	}
	if f3Seeded {
		t.Fatal("expected the 3rd-place fighter not to be seeded (selector = places 1-2)")
	}

	// Повторное формирование поверх непустого состава отклоняется (FR-18).
	if _, err := c.pool.BuildStage(context.Background(), buildReq); connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("expected CodeFailedPrecondition on rebuild, got %v", connect.CodeOf(err))
	}
}

func createPoolWithFighters(t *testing.T, c clients, stageID string, fighterIDs ...string) string {
	t.Helper()
	createReq := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: stageID})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := c.pool.CreatePool(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreatePool: %v", err)
	}
	poolID := created.Msg.Layout.Pools[len(created.Msg.Layout.Pools)-1].Id
	for _, fid := range fighterIDs {
		assignReq := connect.NewRequest(&hemav1.AssignFighterRequest{StageId: stageID, FighterId: fid, PoolId: poolID})
		assignReq.Header().Set("Authorization", adminBearer(t))
		if _, err := c.pool.AssignFighter(context.Background(), assignReq); err != nil {
			t.Fatalf("AssignFighter(%s): %v", fid, err)
		}
	}
	return poolID
}

func seatPoolOnArena(t *testing.T, c clients, poolID, arenaID string) {
	t.Helper()
	req := connect.NewRequest(&hemav1.SeatPoolOnArenaRequest{PoolId: poolID, ArenaId: arenaID})
	req.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.SeatPoolOnArena(context.Background(), req); err != nil {
		t.Fatalf("SeatPoolOnArena: %v", err)
	}
}
