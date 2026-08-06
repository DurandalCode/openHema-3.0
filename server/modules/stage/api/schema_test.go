// E2E-тесты юзкейсов конструктора схемы и пресетов формата (спека 0020,
// T15): редактирование этапа, диагностика в ListStages, библиотека
// пресетов, применение формата.
package api

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/modules/stage/domain"
)

const n2 = "22222222-2222-2222-2222-222222222222"

// ---------------------------------------------------------------------
// UpdateStage.
// ---------------------------------------------------------------------

func TestUpdateStage_E2E_HappyPath(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1)

	createReq := connect.NewRequest(&hemav1.CreateStageRequest{
		NominationId: n1, Type: hemav1.StageType_STAGE_TYPE_BRACKET, Title: "Плейофф",
		Bracket: &hemav1.BracketConfig{Size: 4},
	})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := admin.CreateStage(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreateStage: %v", err)
	}

	req := connect.NewRequest(&hemav1.UpdateStageRequest{
		StageId: created.Msg.Created.Id, Title: "Плейофф 2", Bracket: &hemav1.BracketConfig{Size: 8},
	})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.UpdateStage(context.Background(), req)
	if err != nil {
		t.Fatalf("UpdateStage: %v", err)
	}
	if res.Msg.Stage.Title != "Плейофф 2" || res.Msg.Stage.Bracket == nil || res.Msg.Stage.Bracket.Size != 8 {
		t.Fatalf("unexpected stage after update: %+v", res.Msg.Stage)
	}
}

func TestUpdateStage_E2E_NotFound(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1)

	req := connect.NewRequest(&hemav1.UpdateStageRequest{StageId: "00000000-0000-0000-0000-000000000000", Title: "X"})
	req.Header().Set("Authorization", adminBearer(t))
	_, err := admin.UpdateStage(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

// FR-2: конфиг правится, только пока состав пуст.
func TestUpdateStage_E2E_ConfigChangeLockedReturnsFailedPrecondition(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"})

	createReq := connect.NewRequest(&hemav1.CreateStageRequest{
		NominationId: n1, Type: hemav1.StageType_STAGE_TYPE_BRACKET, Title: "Плейофф",
		Bracket: &hemav1.BracketConfig{Size: 4},
	})
	createReq.Header().Set("Authorization", adminBearer(t))
	created, err := admin.CreateStage(context.Background(), createReq)
	if err != nil {
		t.Fatalf("CreateStage: %v", err)
	}
	repo.SeedPoolInStage(created.Msg.Created.Id, 1, "f1")

	req := connect.NewRequest(&hemav1.UpdateStageRequest{
		StageId: created.Msg.Created.Id, Title: "Плейофф", Bracket: &hemav1.BracketConfig{Size: 8},
	})
	req.Header().Set("Authorization", adminBearer(t))
	_, err = admin.UpdateStage(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("expected CodeFailedPrecondition, got %v", connect.CodeOf(err))
	}
}

// ---------------------------------------------------------------------
// ListStages: диагностика схемы (FR-8).
// ---------------------------------------------------------------------

func TestListStages_E2E_IncludesIssues(t *testing.T) {
	admin, _, repo, fighters, _, _, bouts, _ := setupFull(t)
	fighters.Set(n1, domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"}, domain.FighterRef{ID: "f3"})
	sourceID := canonicalStageID(t, admin, n1)
	seedGroupOfThree(t, repo, bouts, sourceID, 1, [3]string{"f1", "f2", "f3"})

	mk := func(title string, from, to int32) {
		req := connect.NewRequest(&hemav1.CreateStageRequest{
			NominationId: n1, Type: hemav1.StageType_STAGE_TYPE_BRACKET, Title: title,
			Bracket: &hemav1.BracketConfig{Size: 4},
			Rule:    groupPlacesRuleProto(sourceID, from, to, hemav1.StageLayoutMethod_STAGE_LAYOUT_METHOD_SEEDED),
		})
		req.Header().Set("Authorization", adminBearer(t))
		if _, err := admin.CreateStage(context.Background(), req); err != nil {
			t.Fatalf("CreateStage(%s): %v", title, err)
		}
	}
	mk("Сетка A", 1, 2)
	mk("Сетка B", 2, 3)

	listReq := connect.NewRequest(&hemav1.ListStagesRequest{NominationId: n1})
	listReq.Header().Set("Authorization", adminBearer(t))
	res, err := admin.ListStages(context.Background(), listReq)
	if err != nil {
		t.Fatalf("ListStages: %v", err)
	}
	found := false
	for _, iss := range res.Msg.Issues {
		if iss.Code == hemav1.SchemaIssueCode_SCHEMA_ISSUE_CODE_SELECTOR_OVERLAP {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a SELECTOR_OVERLAP issue, got %+v", res.Msg.Issues)
	}
}

// ---------------------------------------------------------------------
// Библиотека пресетов (FR-11/FR-12).
// ---------------------------------------------------------------------

func TestFormatPresetLibrary_E2E_SaveListRenameDelete(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1)
	stageIDFor(t, repo, n1)

	saveReq := connect.NewRequest(&hemav1.SaveFormatPresetRequest{Name: "Формат", NominationId: n1})
	saveReq.Header().Set("Authorization", adminBearer(t))
	saved, err := admin.SaveFormatPreset(context.Background(), saveReq)
	if err != nil {
		t.Fatalf("SaveFormatPreset: %v", err)
	}
	if saved.Msg.Preset.Name != "Формат" || len(saved.Msg.Preset.Stages) != 1 {
		t.Fatalf("unexpected preset: %+v", saved.Msg.Preset)
	}

	listReq := connect.NewRequest(&hemav1.ListFormatPresetsRequest{})
	listReq.Header().Set("Authorization", adminBearer(t))
	list, err := admin.ListFormatPresets(context.Background(), listReq)
	if err != nil {
		t.Fatalf("ListFormatPresets: %v", err)
	}
	if len(list.Msg.Presets) != 1 {
		t.Fatalf("expected 1 preset, got %+v", list.Msg.Presets)
	}

	renameReq := connect.NewRequest(&hemav1.RenameFormatPresetRequest{PresetId: saved.Msg.Preset.Id, Name: "Формат 2"})
	renameReq.Header().Set("Authorization", adminBearer(t))
	renamed, err := admin.RenameFormatPreset(context.Background(), renameReq)
	if err != nil {
		t.Fatalf("RenameFormatPreset: %v", err)
	}
	if renamed.Msg.Preset.Name != "Формат 2" {
		t.Fatalf("expected renamed preset, got %q", renamed.Msg.Preset.Name)
	}

	deleteReq := connect.NewRequest(&hemav1.DeleteFormatPresetRequest{PresetId: saved.Msg.Preset.Id})
	deleteReq.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.DeleteFormatPreset(context.Background(), deleteReq); err != nil {
		t.Fatalf("DeleteFormatPreset: %v", err)
	}

	list2, err := admin.ListFormatPresets(context.Background(), listReq)
	if err != nil {
		t.Fatalf("ListFormatPresets after delete: %v", err)
	}
	if len(list2.Msg.Presets) != 0 {
		t.Fatalf("expected empty library, got %+v", list2.Msg.Presets)
	}
}

func TestSaveFormatPreset_E2E_NameTakenReturnsAlreadyExists(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1)
	fighters.Set(n2)
	stageIDFor(t, repo, n1)
	stageIDFor(t, repo, n2)

	req1 := connect.NewRequest(&hemav1.SaveFormatPresetRequest{Name: "Формат", NominationId: n1})
	req1.Header().Set("Authorization", adminBearer(t))
	if _, err := admin.SaveFormatPreset(context.Background(), req1); err != nil {
		t.Fatalf("SaveFormatPreset: %v", err)
	}

	req2 := connect.NewRequest(&hemav1.SaveFormatPresetRequest{Name: "Формат", NominationId: n2})
	req2.Header().Set("Authorization", adminBearer(t))
	_, err := admin.SaveFormatPreset(context.Background(), req2)
	if connect.CodeOf(err) != connect.CodeAlreadyExists {
		t.Errorf("expected CodeAlreadyExists, got %v", connect.CodeOf(err))
	}
}

func TestRenameFormatPreset_E2E_NotFound(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1)

	req := connect.NewRequest(&hemav1.RenameFormatPresetRequest{PresetId: "00000000-0000-0000-0000-000000000000", Name: "X"})
	req.Header().Set("Authorization", adminBearer(t))
	_, err := admin.RenameFormatPreset(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

func TestDeleteFormatPreset_E2E_NotFound(t *testing.T) {
	admin, _, fighters := setup(t)
	fighters.Set(n1)

	req := connect.NewRequest(&hemav1.DeleteFormatPresetRequest{PresetId: "00000000-0000-0000-0000-000000000000"})
	req.Header().Set("Authorization", adminBearer(t))
	_, err := admin.DeleteFormatPreset(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("expected CodeNotFound, got %v", connect.CodeOf(err))
	}
}

// ---------------------------------------------------------------------
// ApplyFormat (FR-13/FR-14/FR-15).
// ---------------------------------------------------------------------

func TestApplyFormat_E2E_FromPresetHappyPath(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1)
	fighters.Set(n2)
	stageIDFor(t, repo, n1)
	stageIDFor(t, repo, n2)

	saveReq := connect.NewRequest(&hemav1.SaveFormatPresetRequest{Name: "F", NominationId: n1})
	saveReq.Header().Set("Authorization", adminBearer(t))
	saved, err := admin.SaveFormatPreset(context.Background(), saveReq)
	if err != nil {
		t.Fatalf("SaveFormatPreset: %v", err)
	}

	req := connect.NewRequest(&hemav1.ApplyFormatRequest{
		NominationId: n2,
		Source:       &hemav1.ApplyFormatRequest_PresetId{PresetId: saved.Msg.Preset.Id},
	})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.ApplyFormat(context.Background(), req)
	if err != nil {
		t.Fatalf("ApplyFormat: %v", err)
	}
	if len(res.Msg.Stages) != 1 {
		t.Fatalf("expected 1 stage applied, got %+v", res.Msg.Stages)
	}
}

func TestApplyFormat_E2E_FromNominationHappyPath(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1)
	fighters.Set(n2)
	stageIDFor(t, repo, n1)
	stageIDFor(t, repo, n2)

	req := connect.NewRequest(&hemav1.ApplyFormatRequest{
		NominationId: n2,
		Source:       &hemav1.ApplyFormatRequest_SourceNominationId{SourceNominationId: n1},
	})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := admin.ApplyFormat(context.Background(), req)
	if err != nil {
		t.Fatalf("ApplyFormat: %v", err)
	}
	if len(res.Msg.Stages) != 1 {
		t.Fatalf("expected 1 stage copied, got %+v", res.Msg.Stages)
	}
}

func TestApplyFormat_E2E_NoSourceReturnsInvalidArgument(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1)
	stageIDFor(t, repo, n1)

	req := connect.NewRequest(&hemav1.ApplyFormatRequest{NominationId: n1})
	req.Header().Set("Authorization", adminBearer(t))
	_, err := admin.ApplyFormat(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}

func TestApplyFormat_E2E_SchemaNotEmptyReturnsFailedPrecondition(t *testing.T) {
	admin, repo, fighters := setup(t)
	fighters.Set(n1)
	fighters.Set(n2)
	stageIDFor(t, repo, n1)
	targetStage := stageIDFor(t, repo, n2)
	repo.SeedPoolInStage(targetStage, 1, "f1")

	saveReq := connect.NewRequest(&hemav1.SaveFormatPresetRequest{Name: "F2", NominationId: n1})
	saveReq.Header().Set("Authorization", adminBearer(t))
	saved, err := admin.SaveFormatPreset(context.Background(), saveReq)
	if err != nil {
		t.Fatalf("SaveFormatPreset: %v", err)
	}

	req := connect.NewRequest(&hemav1.ApplyFormatRequest{
		NominationId: n2,
		Source:       &hemav1.ApplyFormatRequest_PresetId{PresetId: saved.Msg.Preset.Id},
	})
	req.Header().Set("Authorization", adminBearer(t))
	_, err = admin.ApplyFormat(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("expected CodeFailedPrecondition, got %v", connect.CodeOf(err))
	}
}
