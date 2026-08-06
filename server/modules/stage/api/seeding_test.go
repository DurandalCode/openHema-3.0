// E2E-тесты юзкейсов переходов между этапами (спека 0019, T13): правило
// отбора, превью формирования, формирование.
package api

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/modules/stage/domain"
)

// canonicalStageID материализует и возвращает id канонического (группового)
// этапа номинации (ListStages, 0017 FR-4) — как на реальном админском пути,
// где работа с составом всегда начинается со списка этапов.
func canonicalStageID(t *testing.T, admin interface {
	ListStages(context.Context, *connect.Request[hemav1.ListStagesRequest]) (*connect.Response[hemav1.ListStagesResponse], error)
}, nominationID string) string {
	t.Helper()
	req := connect.NewRequest(&hemav1.ListStagesRequest{NominationId: nominationID})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.ListStages(context.Background(), req)
	if err != nil {
		t.Fatalf("ListStages: %v", err)
	}
	if len(res.Msg.Stages) == 0 {
		t.Fatalf("expected at least one stage")
	}
	return res.Msg.Stages[0].Id
}

// seedGroupOfThree — заводит пул number этапа stageID с тремя бойцами и
// круговой системой, где fighters[0] занимает 1-е место, fighters[1] — 2-е,
// fighters[2] — 3-е (тот же детерминированный сценарий, что и в service-
// тестах T10/T11).
func seedGroupOfThree(t *testing.T, repo interface {
	SeedPoolInStage(stageID string, number int, fighterIDs ...string) string
}, bouts interface {
	SeedBout(poolID string, b domain.BoutRef)
}, stageID string, number int, fighters [3]string) string {
	t.Helper()
	poolID := repo.SeedPoolInStage(stageID, number, fighters[0], fighters[1], fighters[2])
	ref := func(id string) domain.FighterRef { return domain.FighterRef{ID: id} }
	bouts.SeedBout(poolID, domain.BoutRef{ID: poolID + "-a", FighterA: ref(fighters[0]), FighterB: ref(fighters[1]), State: domain.BoutStateFinished, ScoreA: 5, ScoreB: 2})
	bouts.SeedBout(poolID, domain.BoutRef{ID: poolID + "-b", FighterA: ref(fighters[0]), FighterB: ref(fighters[2]), State: domain.BoutStateFinished, ScoreA: 5, ScoreB: 1})
	bouts.SeedBout(poolID, domain.BoutRef{ID: poolID + "-c", FighterA: ref(fighters[1]), FighterB: ref(fighters[2]), State: domain.BoutStateFinished, ScoreA: 4, ScoreB: 2})
	return poolID
}

// groupPlacesRuleProto — правило «места from..to источника sourceStageID»
// (0 в to — открытая граница). method обязателен: сервер валидирует его
// соответствие типу целевого этапа (SEEDED — сетка, SNAKE — группы).
func groupPlacesRuleProto(sourceStageID string, from, to int32, method hemav1.StageLayoutMethod) *hemav1.SeedingRule {
	return &hemav1.SeedingRule{
		SourceKind: hemav1.StageSourceKind_STAGE_SOURCE_KIND_STAGE, SourceStageId: sourceStageID,
		Selector: hemav1.StageSelectorKind_STAGE_SELECTOR_KIND_GROUP_PLACES, PlaceFrom: from, PlaceTo: to,
		Method: method,
	}
}

// ---------------------------------------------------------------------
// SetStageRule.
// ---------------------------------------------------------------------

func TestSetStageRule_E2E_HappyPath(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1)
	sourceID := canonicalStageID(t, admin, n1)

	createReq := connect.NewRequest(&hemav1.CreateStageRequest{
		NominationId: n1, Type: hemav1.StageType_STAGE_TYPE_BRACKET, Title: "Плейофф",
		Bracket: &hemav1.BracketConfig{Size: 8},
	})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := admin.CreateStage(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreateStage: %v", err)
	}

	req := connect.NewRequest(&hemav1.SetStageRuleRequest{
		StageId: created.Msg.Created.Id, Rule: groupPlacesRuleProto(sourceID, 1, 2, hemav1.StageLayoutMethod_STAGE_LAYOUT_METHOD_SEEDED),
	})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.SetStageRule(context.Background(), req)
	if err != nil {
		t.Fatalf("SetStageRule: %v", err)
	}
	if res.Msg.Stage.Rule == nil || res.Msg.Stage.Rule.SourceStageId != sourceID {
		t.Fatalf("expected rule with source %s, got %+v", sourceID, res.Msg.Stage.Rule)
	}
	if res.Msg.Stage.Position != 1 {
		t.Fatalf("expected position 1 (source.Position(0)+1), got %d", res.Msg.Stage.Position)
	}
}

func TestSetStageRule_E2E_NotFoundReturnsCodeNotFound(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1)

	req := connect.NewRequest(&hemav1.SetStageRuleRequest{
		StageId: "00000000-0000-0000-0000-000000000000",
		Rule: &hemav1.SeedingRule{
			SourceKind: hemav1.StageSourceKind_STAGE_SOURCE_KIND_ROSTER,
			Selector:   hemav1.StageSelectorKind_STAGE_SELECTOR_KIND_ALL,
		},
	})
	req.Header().Set("Authorization", adminBearer(t))
	_, err := admin.SetStageRule(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestSetStageRule_E2E_SourceIsBracketReturnsInvalidArgument(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1)

	createReq := connect.NewRequest(&hemav1.CreateStageRequest{
		NominationId: n1, Type: hemav1.StageType_STAGE_TYPE_BRACKET, Title: "Сетка",
		Bracket: &hemav1.BracketConfig{Size: 8},
	})
	createReq.Header().Set("Authorization", adminBearer(t))
	bracket, err := admin.CreateStage(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreateStage: %v", err)
	}
	targetReq := connect.NewRequest(&hemav1.CreateStageRequest{
		NominationId: n1, Type: hemav1.StageType_STAGE_TYPE_BRACKET, Title: "Цель",
		Bracket: &hemav1.BracketConfig{Size: 4},
	})
	targetReq.Header().Set("Authorization", adminBearer(t))
	target, err := admin.CreateStage(context.Background(), targetReq)
	if err != nil {
		t.Fatalf("CreateStage target: %v", err)
	}

	req := connect.NewRequest(&hemav1.SetStageRuleRequest{
		StageId: target.Msg.Created.Id, Rule: groupPlacesRuleProto(bracket.Msg.Created.Id, 1, 2, hemav1.StageLayoutMethod_STAGE_LAYOUT_METHOD_SEEDED),
	})
	req.Header().Set("Authorization", adminBearer(t))
	_, err = admin.SetStageRule(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument (ErrSourceNotAllowed — source is not groups), got %v", connect.CodeOf(err))
	}
}

// ---------------------------------------------------------------------
// PreviewStageBuild / BuildStage.
// ---------------------------------------------------------------------

func TestPreviewAndBuildStage_E2E_BracketHappyPath(t *testing.T) {
	admin, _, repo, fighters, _, _, bouts, _ := setupFull(t)

	fighters.Set(n1,
		domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"}, domain.FighterRef{ID: "f3"},
		domain.FighterRef{ID: "f4"}, domain.FighterRef{ID: "f5"}, domain.FighterRef{ID: "f6"},
	)
	sourceID := canonicalStageID(t, admin, n1)
	seedGroupOfThree(t, repo, bouts, sourceID, 1, [3]string{"f1", "f2", "f3"})
	seedGroupOfThree(t, repo, bouts, sourceID, 2, [3]string{"f4", "f5", "f6"})

	createReq := connect.NewRequest(&hemav1.CreateStageRequest{
		NominationId: n1, Type: hemav1.StageType_STAGE_TYPE_BRACKET, Title: "Плейофф",
		Bracket: &hemav1.BracketConfig{Size: 4}, Rule: groupPlacesRuleProto(sourceID, 1, 2, hemav1.StageLayoutMethod_STAGE_LAYOUT_METHOD_SEEDED),
	})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := admin.CreateStage(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreateStage: %v", err)
	}

	previewReq := connect.NewRequest(&hemav1.PreviewStageBuildRequest{StageId: created.Msg.Created.Id})
	previewReq.Header().Set("Authorization", adminBearer(t))
	preview, err := admin.PreviewStageBuild(context.Background(), previewReq)
	if err != nil {
		t.Fatalf("PreviewStageBuild: %v", err)
	}
	if len(preview.Msg.Preview.Entries) != 4 || preview.Msg.Preview.Capacity != 4 {
		t.Fatalf("expected 4 entries/capacity 4, got %+v", preview.Msg.Preview)
	}
	for _, e := range preview.Msg.Preview.Entries {
		if e.TargetSlot < 1 || e.TargetSlot > 4 {
			t.Fatalf("expected valid target slot in entry, got %+v", e)
		}
	}

	buildReq := connect.NewRequest(&hemav1.BuildStageRequest{StageId: created.Msg.Created.Id})
	buildReq.Header().Set("Authorization", adminBearer(t))
	build, err := admin.BuildStage(context.Background(), buildReq)
	if err != nil {
		t.Fatalf("BuildStage: %v", err)
	}
	bracketResult, ok := build.Msg.Result.(*hemav1.BuildStageResponse_Bracket)
	if !ok || bracketResult.Bracket == nil {
		t.Fatalf("expected Bracket result, got %+v", build.Msg.Result)
	}

	// Повторное формирование поверх непустого состава отклоняется (FR-18).
	if _, err := admin.BuildStage(context.Background(), buildReq); connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("expected CodeFailedPrecondition on rebuild, got %v", connect.CodeOf(err))
	}
}

func TestBuildStage_E2E_GroupsHappyPath(t *testing.T) {
	admin, _, repo, fighters, _, _, bouts, _ := setupFull(t)
	fighters.Set(n1,
		domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"}, domain.FighterRef{ID: "f3"},
	)
	sourceID := canonicalStageID(t, admin, n1)
	seedGroupOfThree(t, repo, bouts, sourceID, 1, [3]string{"f1", "f2", "f3"})

	createReq := connect.NewRequest(&hemav1.CreateStageRequest{
		NominationId: n1, Type: hemav1.StageType_STAGE_TYPE_GROUPS, Title: "Слабые",
		Groups: &hemav1.GroupsConfig{GroupCount: 1},
		Rule:   groupPlacesRuleProto(sourceID, 2, 0, hemav1.StageLayoutMethod_STAGE_LAYOUT_METHOD_SNAKE),
	})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := admin.CreateStage(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreateStage: %v", err)
	}

	buildReq := connect.NewRequest(&hemav1.BuildStageRequest{StageId: created.Msg.Created.Id})
	buildReq.Header().Set("Authorization", adminBearer(t))
	build, err := admin.BuildStage(context.Background(), buildReq)
	if err != nil {
		t.Fatalf("BuildStage: %v", err)
	}
	layoutResult, ok := build.Msg.Result.(*hemav1.BuildStageResponse_Layout)
	if !ok || layoutResult.Layout == nil {
		t.Fatalf("expected Layout result, got %+v", build.Msg.Result)
	}
	if len(layoutResult.Layout.Pools) != 1 || len(layoutResult.Layout.Pools[0].Members) != 2 {
		t.Fatalf("expected 1 pool with 2 members (places 2-3), got %+v", layoutResult.Layout.Pools)
	}
}

func TestPreviewStageBuild_E2E_NoRuleReturnsFailedPrecondition(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1)
	stageID := canonicalStageID(t, admin, n1)

	req := connect.NewRequest(&hemav1.PreviewStageBuildRequest{StageId: stageID})
	req.Header().Set("Authorization", adminBearer(t))
	_, err := admin.PreviewStageBuild(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("expected CodeFailedPrecondition (no seeding rule), got %v", connect.CodeOf(err))
	}
}

// ---------------------------------------------------------------------
// CreateStage: type = GROUPS (спека 0019, FR-7).
// ---------------------------------------------------------------------

func TestCreateStage_E2E_GroupsHappyPath(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1)

	req := connect.NewRequest(&hemav1.CreateStageRequest{
		NominationId: n1, Type: hemav1.StageType_STAGE_TYPE_GROUPS, Title: "Отбор",
		Groups: &hemav1.GroupsConfig{GroupCount: 2},
	})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.CreateStage(context.Background(), req)
	if err != nil {
		t.Fatalf("CreateStage: %v", err)
	}
	if res.Msg.Created.Type != hemav1.StageType_STAGE_TYPE_GROUPS {
		t.Fatalf("expected GROUPS type, got %v", res.Msg.Created.Type)
	}
	if res.Msg.Created.Groups == nil || res.Msg.Created.Groups.GroupCount != 2 {
		t.Fatalf("expected groups config with count 2, got %+v", res.Msg.Created.Groups)
	}
}

func TestCreateStage_E2E_GroupsWithoutGroupCountReturnsInvalidArgument(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1)

	req := connect.NewRequest(&hemav1.CreateStageRequest{
		NominationId: n1, Type: hemav1.StageType_STAGE_TYPE_GROUPS, Title: "Группа",
	})
	req.Header().Set("Authorization", adminBearer(t))
	_, err := admin.CreateStage(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}
