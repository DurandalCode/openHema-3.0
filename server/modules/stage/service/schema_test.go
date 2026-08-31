// Тесты юзкейсов конструктора схемы и пресетов формата (спека 0020, ADR
// 0014 §8/§9): редактирование этапа (T10), удаление авто-этапа и каскад
// позиций (T11), пресеты и применение формата (T12), диагностика в чтении
// (T13).
package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

// ---------------------------------------------------------------------
// T10: UpdateStage (FR-2/FR-7).
// ---------------------------------------------------------------------

func TestUpdateStage_T10_RenameWithNonEmptyComposition(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, liveBus := newService()
	fighters.Set("n1", domain.FighterRef{ID: "f1"})

	stageID := repo.SeedBracketStage("n1", 0, "Плейофф", domain.BracketConfig{Size: 4})
	repo.SeedPoolInStage(stageID, 1, "f1")

	updated, err := svc.UpdateStage(ctx, stageID, "Плейофф (переименован)", domain.BracketConfig{Size: 4}, domain.GroupsConfig{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Title != "Плейофф (переименован)" {
		t.Fatalf("expected title updated, got %q", updated.Title)
	}
	if liveBus.PublishedCount("n1") != 1 {
		t.Fatalf("expected PublishNominationChanged called once, got %d", liveBus.PublishedCount("n1"))
	}
}

func TestUpdateStage_T10_ConfigChangeLockedByComposition(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _ := newService()

	stageID := repo.SeedBracketStage("n1", 0, "Плейофф", domain.BracketConfig{Size: 4})
	repo.SeedPoolInStage(stageID, 1, "f1")

	if _, err := svc.UpdateStage(ctx, stageID, "Плейофф", domain.BracketConfig{Size: 8}, domain.GroupsConfig{}); !errors.Is(err, domain.ErrStageLocked) {
		t.Fatalf("expected ErrStageLocked, got %v", err)
	}
}

func TestUpdateStage_T10_ConfigChangeLockedByReadyStatus(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _ := newService()

	stageID := repo.SeedBracketStage("n1", 0, "Плейофф", domain.BracketConfig{Size: 4})
	repo.SeedStageStatus(stageID, domain.LayoutReady)

	if _, err := svc.UpdateStage(ctx, stageID, "Плейофф", domain.BracketConfig{Size: 8}, domain.GroupsConfig{}); !errors.Is(err, domain.ErrStageLocked) {
		t.Fatalf("expected ErrStageLocked for ready stage, got %v", err)
	}
}

func TestUpdateStage_T10_ConfigUnchangedIgnoresLocks(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _ := newService()

	stageID := repo.SeedBracketStage("n1", 0, "Плейофф", domain.BracketConfig{Size: 4})
	repo.SeedPoolInStage(stageID, 1, "f1")
	repo.SeedStageStatus(stageID, domain.LayoutReady)

	updated, err := svc.UpdateStage(ctx, stageID, "Плейофф 2", domain.BracketConfig{Size: 4}, domain.GroupsConfig{})
	if err != nil {
		t.Fatalf("unexpected error renaming a locked stage without config change: %v", err)
	}
	if updated.Title != "Плейофф 2" {
		t.Fatalf("expected title updated, got %q", updated.Title)
	}
}

func TestUpdateStage_T10_GroupCountToZeroWithRuleIsInvalid(t *testing.T) {
	ctx := context.Background()
	svc, _, fighters, _, _ := newService()
	fighters.Set("n1")

	created, _, err := svc.CreateStage(ctx, "n1", domain.StageTypeGroups, "Группа", domain.BracketConfig{}, domain.GroupsConfig{GroupCount: 2}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("unexpected error creating stage: %v", err)
	}
	rule := domain.SeedingRule{SourceKind: domain.SourceKindRoster, Selector: domain.SelectorKindAll, Method: domain.LayoutMethodSnake}
	if _, err := svc.SetStageRule(ctx, created.ID, rule); err != nil {
		t.Fatalf("unexpected error setting rule: %v", err)
	}

	if _, err := svc.UpdateStage(ctx, created.ID, "Группа", domain.BracketConfig{}, domain.GroupsConfig{GroupCount: 0}); !errors.Is(err, domain.ErrInvalidRule) {
		t.Fatalf("expected ErrInvalidRule, got %v", err)
	}
}

func TestUpdateStage_T10_ConfigMismatchesType(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _ := newService()

	bracketID := repo.SeedBracketStage("n1", 0, "Плейофф", domain.BracketConfig{Size: 4})
	if _, err := svc.UpdateStage(ctx, bracketID, "Плейофф", domain.BracketConfig{Size: 4}, domain.GroupsConfig{GroupCount: 2}); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for groups config on a bracket stage, got %v", err)
	}

	groupsID := repo.SeedStage("n1", 1, "Группа", domain.StageTypeGroups)
	if _, err := svc.UpdateStage(ctx, groupsID, "Группа", domain.BracketConfig{Size: 4}, domain.GroupsConfig{}); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for bracket config on a groups stage, got %v", err)
	}
}

// ---------------------------------------------------------------------
// T11: авто-этап удаляется на общих основаниях, но остаётся защищён, пока
// служит источником другой ветки (спека 0020, FR-5).
// ---------------------------------------------------------------------

func TestDeleteStage_T11_AutoStageAsSourceStillProtected(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")

	auto := stageIDFor(t, repo, "n1")
	if err := repo.UpdateStage(ctx, auto, domain.DefaultStageTitle, domain.BracketConfig{}, domain.GroupsConfig{GroupCount: 2}); err != nil {
		t.Fatalf("seed group count: %v", err)
	}
	if _, _, err := svc.CreateStage(ctx, "n1", domain.StageTypeBracket, "Плейофф", domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, groupPlacesRule(auto, 1, 2)); err != nil {
		t.Fatalf("create bracket sourced from auto stage: %v", err)
	}

	if _, err := svc.DeleteStage(ctx, auto); !errors.Is(err, domain.ErrStageIsSource) {
		t.Fatalf("expected ErrStageIsSource, got %v", err)
	}
}

func TestUpdateStage_T10_NotFoundAndInvalidInput(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newService()

	if _, err := svc.UpdateStage(ctx, "missing", "Title", domain.BracketConfig{}, domain.GroupsConfig{}); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	if _, err := svc.UpdateStage(ctx, "", "Title", domain.BracketConfig{}, domain.GroupsConfig{}); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for empty stage id, got %v", err)
	}
}

// ---------------------------------------------------------------------
// T12: библиотека пресетов (FR-11/FR-12) и применение формата (FR-13/FR-15).
// ---------------------------------------------------------------------

func TestSaveFormatPreset_T12_Basic(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")

	groups := stageIDFor(t, repo, "n1")
	if err := repo.UpdateStage(ctx, groups, domain.DefaultStageTitle, domain.BracketConfig{}, domain.GroupsConfig{GroupCount: 2}); err != nil {
		t.Fatalf("seed group count: %v", err)
	}
	if _, _, err := svc.CreateStage(ctx, "n1", domain.StageTypeBracket, "Плейофф A", domain.BracketConfig{Size: 8}, domain.GroupsConfig{}, groupPlacesRule(groups, 1, 2)); err != nil {
		t.Fatalf("create bracket A: %v", err)
	}
	if _, _, err := svc.CreateStage(ctx, "n1", domain.StageTypeBracket, "Плейофф B", domain.BracketConfig{Size: 8}, domain.GroupsConfig{}, groupPlacesRule(groups, 3, 0)); err != nil {
		t.Fatalf("create bracket B: %v", err)
	}

	preset, err := svc.SaveFormatPreset(ctx, "Группы + двойной плейофф", "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if preset.Name != "Группы + двойной плейофф" {
		t.Fatalf("unexpected preset name: %q", preset.Name)
	}
	if len(preset.Spec.Stages) != 3 {
		t.Fatalf("expected 3 stages in preset, got %d", len(preset.Spec.Stages))
	}
	// Обе сетки — параллельные ветки одного источника (индекс 0, групповой
	// этап — он всегда первый по (Position, Title), FR-16).
	for i := 1; i < 3; i++ {
		if preset.Spec.Stages[i].SourceIndex != 0 {
			t.Fatalf("expected bracket %d to reference groups stage by index 0, got %d", i, preset.Spec.Stages[i].SourceIndex)
		}
	}
}

func TestSaveFormatPreset_T12_NameTaken(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")
	fighters.Set("n2")
	stageIDFor(t, repo, "n1")
	stageIDFor(t, repo, "n2")

	if _, err := svc.SaveFormatPreset(ctx, "Формат", "n1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Без учёта регистра и краевых пробелов (AC-17).
	if _, err := svc.SaveFormatPreset(ctx, " формат ", "n2"); !errors.Is(err, domain.ErrPresetNameTaken) {
		t.Fatalf("expected ErrPresetNameTaken, got %v", err)
	}
}

// Номинация без единого материализованного этапа (виртуальный авто-этап,
// 0017 FR-4) даёт пустую спецификацию — сохранять как пресет нечего.
func TestSaveFormatPreset_T12_EmptySchemaIsInvalid(t *testing.T) {
	ctx := context.Background()
	svc, _, fighters, _, _ := newService()
	fighters.Set("n1")

	if _, err := svc.SaveFormatPreset(ctx, "Пусто", "n1"); !errors.Is(err, domain.ErrInvalidSpec) {
		t.Fatalf("expected ErrInvalidSpec, got %v", err)
	}
}

func TestFormatPresetLibrary_T12_RenameAndDelete(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("n1")
	stageIDFor(t, repo, "n1")

	preset, err := svc.SaveFormatPreset(ctx, "Формат", "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	list, err := svc.ListFormatPresets(ctx)
	if err != nil || len(list) != 1 {
		t.Fatalf("unexpected list: %+v, err=%v", list, err)
	}

	renamed, err := svc.RenameFormatPreset(ctx, preset.ID, "Формат 2")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if renamed.Name != "Формат 2" {
		t.Fatalf("expected renamed preset, got %q", renamed.Name)
	}

	if err := svc.DeleteFormatPreset(ctx, preset.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	list2, err := svc.ListFormatPresets(ctx)
	if err != nil || len(list2) != 0 {
		t.Fatalf("expected empty library after delete, got %+v, err=%v", list2, err)
	}
}

func TestRenameFormatPreset_T12_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newService()

	if _, err := svc.RenameFormatPreset(ctx, "missing", "Name"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestDeleteFormatPreset_T12_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newService()

	if err := svc.DeleteFormatPreset(ctx, "missing"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

// AC-13: применение пресета к пустой номинации восстанавливает связи
// «источник → ветка» внутренними индексами, разрешает применение и
// синхронизирует побочные эффекты (ClearForPools/SyncRegistrationState/
// PublishNominationChanged), как любая другая мутация состава.
func TestApplyFormat_T12_FromPresetRestoresLinks(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _, nominations, liveBus := newServiceWithNominations()
	fighters.Set("donor")
	fighters.Set("target")

	groups := stageIDFor(t, repo, "donor")
	if err := repo.UpdateStage(ctx, groups, domain.DefaultStageTitle, domain.BracketConfig{}, domain.GroupsConfig{GroupCount: 2}); err != nil {
		t.Fatalf("seed group count: %v", err)
	}
	if _, _, err := svc.CreateStage(ctx, "donor", domain.StageTypeBracket, "Плейофф", domain.BracketConfig{Size: 8}, domain.GroupsConfig{}, groupPlacesRule(groups, 1, 2)); err != nil {
		t.Fatalf("create bracket: %v", err)
	}
	preset, err := svc.SaveFormatPreset(ctx, "Двойной формат", "donor")
	if err != nil {
		t.Fatalf("save preset: %v", err)
	}

	stageIDFor(t, repo, "target") // пустой авто-этап — заменится целиком

	newStages, err := svc.ApplyFormat(ctx, "target", preset.ID, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(newStages) != 2 {
		t.Fatalf("expected 2 stages applied, got %d", len(newStages))
	}
	var groupsNew, bracketNew domain.Stage
	for _, st := range newStages {
		if st.Type == domain.StageTypeGroups {
			groupsNew = st
		} else {
			bracketNew = st
		}
	}
	if groupsNew.ID == "" || bracketNew.ID == "" {
		t.Fatalf("expected one groups and one bracket stage, got %+v", newStages)
	}
	if bracketNew.Rule.SourceStageID != groupsNew.ID {
		t.Fatalf("expected bracket rule to reference the NEW groups stage id, got %+v", bracketNew.Rule)
	}
	if bracketNew.Position != groupsNew.Position+1 {
		t.Fatalf("expected bracket positioned after groups, got %d vs %d", bracketNew.Position, groupsNew.Position)
	}

	if len(bouts.ClearCalls) == 0 {
		t.Fatalf("expected ClearForPools called at least once")
	}
	if val, called := nominations.LastSynced("target"); !called || val {
		t.Fatalf("expected SyncRegistrationState(target, false) called, got called=%v value=%v", called, val)
	}
	if liveBus.PublishedCount("target") != 1 {
		t.Fatalf("expected PublishNominationChanged called once, got %d", liveBus.PublishedCount("target"))
	}
}

// AC-15: копирование схемы из другой номинации — тот же механизм, источник
// — номинация, а не запись библиотеки.
func TestApplyFormat_T12_FromNomination(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _, _, _ := newServiceWithNominations()
	fighters.Set("donor")
	fighters.Set("target")

	stageIDFor(t, repo, "donor")
	stageIDFor(t, repo, "target")

	newStages, err := svc.ApplyFormat(ctx, "target", "", "donor")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(newStages) != 1 {
		t.Fatalf("expected 1 stage copied, got %d", len(newStages))
	}
}

func TestApplyFormat_T12_RejectsBothOrNeitherSource(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _, _, _ := newServiceWithNominations()
	fighters.Set("target")
	stageIDFor(t, repo, "target")

	if _, err := svc.ApplyFormat(ctx, "target", "", ""); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for no source, got %v", err)
	}
	if _, err := svc.ApplyFormat(ctx, "target", "preset-id", "donor"); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for both sources, got %v", err)
	}
}

func TestApplyFormat_T12_RejectsSelfCopy(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _, _, _ := newServiceWithNominations()
	fighters.Set("n1")
	stageIDFor(t, repo, "n1")

	if _, err := svc.ApplyFormat(ctx, "n1", "", "n1"); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for self-copy, got %v", err)
	}
}

func TestApplyFormat_T12_GateMembersNotEmpty(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _, _, _ := newServiceWithNominations()
	fighters.Set("donor")
	fighters.Set("target")
	stageIDFor(t, repo, "donor")
	targetStage := stageIDFor(t, repo, "target")
	repo.SeedPoolInStage(targetStage, 1, "f1")

	preset, err := svc.SaveFormatPreset(ctx, "F1", "donor")
	if err != nil {
		t.Fatalf("save preset: %v", err)
	}
	if _, err := svc.ApplyFormat(ctx, "target", preset.ID, ""); !errors.Is(err, domain.ErrSchemaNotEmpty) {
		t.Fatalf("expected ErrSchemaNotEmpty, got %v", err)
	}
}

func TestApplyFormat_T12_GateSeatedOnArena(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _, _, _ := newServiceWithNominations()
	fighters.Set("donor")
	fighters.Set("target")
	stageIDFor(t, repo, "donor")
	targetStage := stageIDFor(t, repo, "target")
	poolID := repo.SeedPoolInStage(targetStage, 1) // без бойцов, но на арене
	if err := repo.SeatPool(ctx, poolID, "arena-1"); err != nil {
		t.Fatalf("seat pool: %v", err)
	}

	preset, err := svc.SaveFormatPreset(ctx, "F2", "donor")
	if err != nil {
		t.Fatalf("save preset: %v", err)
	}
	if _, err := svc.ApplyFormat(ctx, "target", preset.ID, ""); !errors.Is(err, domain.ErrSchemaNotEmpty) {
		t.Fatalf("expected ErrSchemaNotEmpty for a seated pool, got %v", err)
	}
}

func TestApplyFormat_T12_GateStartedBouts(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _, _, _ := newServiceWithNominations()
	fighters.Set("donor")
	fighters.Set("target")
	stageIDFor(t, repo, "donor")
	targetStage := stageIDFor(t, repo, "target")
	poolID := repo.SeedPoolInStage(targetStage, 1)
	bouts.SetAnyStartedForPool(poolID, true)

	preset, err := svc.SaveFormatPreset(ctx, "F3", "donor")
	if err != nil {
		t.Fatalf("save preset: %v", err)
	}
	if _, err := svc.ApplyFormat(ctx, "target", preset.ID, ""); !errors.Is(err, domain.ErrSchemaNotEmpty) {
		t.Fatalf("expected ErrSchemaNotEmpty for started bouts, got %v", err)
	}
}

// AC-22/FR-8a: пресет «группы → три параллельные сетки → завершающий этап
// БЕЗ правила» (финал трёх из победителей сеток, посев вручную) — этап без
// правила обязан встать последним уровнем, а не параллельно сеткам.
func TestApplyFormat_T12_NoRuleStageGoesLast(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _, _, _ := newServiceWithNominations()
	fighters.Set("donor")
	fighters.Set("target")

	groups := stageIDFor(t, repo, "donor")
	if err := repo.UpdateStage(ctx, groups, domain.DefaultStageTitle, domain.BracketConfig{}, domain.GroupsConfig{GroupCount: 4}); err != nil {
		t.Fatalf("seed group count: %v", err)
	}
	if _, _, err := svc.CreateStage(ctx, "donor", domain.StageTypeBracket, "Сетка 1", domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, groupPlacesRule(groups, 1, 2)); err != nil {
		t.Fatalf("create bracket 1: %v", err)
	}
	if _, _, err := svc.CreateStage(ctx, "donor", domain.StageTypeBracket, "Сетка 2", domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, groupPlacesRule(groups, 3, 3)); err != nil {
		t.Fatalf("create bracket 2: %v", err)
	}
	if _, _, err := svc.CreateStage(ctx, "donor", domain.StageTypeBracket, "Сетка 3", domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, groupPlacesRule(groups, 4, 0)); err != nil {
		t.Fatalf("create bracket 3: %v", err)
	}
	// Завершающий этап без правила — ручной посев финалистов сеток (вне
	// скоупа 0020: отбор по итогам сетки не реализован).
	if _, _, err := svc.CreateStage(ctx, "donor", domain.StageTypeGroups, "Финал трёх", domain.BracketConfig{}, domain.GroupsConfig{GroupCount: 1}, domain.SeedingRule{}); err != nil {
		t.Fatalf("create final stage: %v", err)
	}

	preset, err := svc.SaveFormatPreset(ctx, "Тройная сетка + финал", "donor")
	if err != nil {
		t.Fatalf("save preset: %v", err)
	}

	stageIDFor(t, repo, "target")
	newStages, err := svc.ApplyFormat(ctx, "target", preset.ID, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(newStages) != 5 {
		t.Fatalf("expected 5 stages (groups + 3 brackets + final), got %d", len(newStages))
	}

	var groupsPos, finalPos int
	minBracketPos, maxBracketPos := -1, -1
	for _, st := range newStages {
		switch {
		case st.Type == domain.StageTypeGroups && st.Groups.GroupCount == 4:
			groupsPos = st.Position
		case st.Type == domain.StageTypeBracket:
			if minBracketPos == -1 || st.Position < minBracketPos {
				minBracketPos = st.Position
			}
			if st.Position > maxBracketPos {
				maxBracketPos = st.Position
			}
		case st.Type == domain.StageTypeGroups && st.Groups.GroupCount == 1:
			finalPos = st.Position
		}
	}
	if minBracketPos != groupsPos+1 || maxBracketPos != groupsPos+1 {
		t.Fatalf("expected all 3 brackets parallel at groupsPos+1=%d, got [%d..%d]", groupsPos+1, minBracketPos, maxBracketPos)
	}
	if finalPos <= maxBracketPos {
		t.Fatalf("expected the no-rule final stage positioned AFTER the brackets (got %d, brackets at %d)", finalPos, maxBracketPos)
	}
}

// ---------------------------------------------------------------------
// T13: диагностика в ListStages (FR-8/FR-9).
// ---------------------------------------------------------------------

// «Схема с ошибкой ⇒ формирование отклонено тем же гейтом» (FR-9):
// ListStages сообщает о пересечении селекторов заранее (по схеме — окна мест
// 1-2 и 2-3 пересекаются по месту 2, независимо от реальных данных), а
// BuildStage на РЕАЛЬНЫХ результатах группы независимо отклоняет
// формирование той же самой доменной ошибкой — оба пути проверяют один и
// тот же факт, диагностика ничего не подменяет.
func TestListStages_T13_IncludesDiagnosticsMatchingBuildGate(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _ := newService()

	f1, f2, f3 := fref("f1"), fref("f2"), fref("f3")
	fighters.Set("n1", f1, f2, f3)

	groups := stageIDFor(t, repo, "n1")
	seedGroupOfThree(repo, bouts, groups, 1, [3]domain.FighterRef{f1, f2, f3})

	if _, _, err := svc.CreateStage(ctx, "n1", domain.StageTypeBracket, "Сетка A", domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, groupPlacesRule(groups, 1, 2)); err != nil {
		t.Fatalf("create bracket A: %v", err)
	}
	if _, _, err := svc.CreateStage(ctx, "n1", domain.StageTypeBracket, "Сетка B", domain.BracketConfig{Size: 4}, domain.GroupsConfig{}, groupPlacesRule(groups, 2, 3)); err != nil {
		t.Fatalf("create bracket B: %v", err)
	}

	stages, issues, err := svc.ListStages(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(stages) != 3 {
		t.Fatalf("expected 3 stages, got %d", len(stages))
	}
	overlapFound := false
	for _, iss := range issues {
		if iss.Code == domain.SchemaIssueCodeSelectorOverlap {
			overlapFound = true
		}
	}
	if !overlapFound {
		t.Fatalf("expected a SelectorOverlap issue, got %+v", issues)
	}

	var bracketA domain.Stage
	for _, st := range stages {
		if st.Title == "Сетка A" {
			bracketA = st
		}
	}
	if bracketA.ID == "" {
		t.Fatalf("bracket A not found among stages: %+v", stages)
	}
	if _, _, err := svc.BuildStage(ctx, bracketA.ID, nil); !errors.Is(err, domain.ErrSelectorOverlap) {
		t.Fatalf("expected ErrSelectorOverlap from BuildStage, got %v", err)
	}
}

// Валидная непротиворечивая схема не даёт ни одной диагностической строки.
func TestListStages_T13_NoIssuesForValidSchema(t *testing.T) {
	ctx := context.Background()
	svc, _, fighters, _, _ := newService()
	fighters.Set("n1")

	_, issues, err := svc.ListStages(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(issues) != 0 {
		t.Fatalf("expected no issues for a freshly materialized auto-stage, got %+v", issues)
	}
}

// ---------------------------------------------------------------------
// T6 (спека 0047, FR-11; AC-2/AC-3): применимость целевой записи каталога
// (groups-double-playoff-16) — тот же путь ApplyFormat, что и любой другой
// пресет; диагностика применённой схемы не содержит проблем класса ERROR.
// ---------------------------------------------------------------------

func TestApplyFormat_T6_BuiltinTargetSchemaAppliesCleanly(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, _ := newService()
	fighters.Set("target")

	var catalogue domain.BuiltinPreset
	for _, p := range domain.BuiltinPresets() {
		if p.Key == "groups-double-playoff-16" {
			catalogue = p
		}
	}
	if catalogue.Key == "" {
		t.Fatalf("catalogue entry groups-double-playoff-16 not found")
	}

	preset, err := repo.InsertFormatPreset(ctx, catalogue.Name, catalogue.Spec)
	if err != nil {
		t.Fatalf("InsertFormatPreset: %v", err)
	}
	stageIDFor(t, repo, "target") // материализует пустой авто-этап — заменится целиком

	newStages, err := svc.ApplyFormat(ctx, "target", preset.ID, "")
	if err != nil {
		t.Fatalf("ApplyFormat: %v", err)
	}
	if len(newStages) != 3 {
		t.Fatalf("expected 3 stages applied, got %d", len(newStages))
	}

	var groups, main, consolation domain.Stage
	for _, st := range newStages {
		switch {
		case st.Type == domain.StageTypeGroups:
			groups = st
		case st.Title == "Основная сетка":
			main = st
		case st.Title == "Утешительная сетка":
			consolation = st
		}
	}
	if groups.ID == "" || main.ID == "" || consolation.ID == "" {
		t.Fatalf("expected groups + main bracket + consolation bracket, got %+v", newStages)
	}
	if groups.Groups.GroupCount != 4 {
		t.Fatalf("expected 4 groups, got %d", groups.Groups.GroupCount)
	}
	for _, b := range []domain.Stage{main, consolation} {
		if b.Rule.SourceStageID != groups.ID {
			t.Fatalf("expected bracket %q to source from the new groups stage, got %+v", b.Title, b.Rule)
		}
		if b.Bracket.Size != 8 {
			t.Fatalf("expected bracket size 8, got %d", b.Bracket.Size)
		}
	}
	if main.Rule.PlaceFrom != 1 || main.Rule.PlaceTo != 2 {
		t.Fatalf("expected main bracket window 1-2, got %d-%d", main.Rule.PlaceFrom, main.Rule.PlaceTo)
	}
	if consolation.Rule.PlaceFrom != 3 || consolation.Rule.PlaceTo != 0 {
		t.Fatalf("expected consolation bracket window 3-open, got %d-%d", consolation.Rule.PlaceFrom, consolation.Rule.PlaceTo)
	}

	issues := domain.DiagnoseSchema(newStages)
	for _, iss := range issues {
		if iss.Severity == domain.SchemaIssueSeverityError {
			t.Fatalf("expected no ERROR-class diagnostic issues for the builtin target schema, got %+v", issues)
		}
	}
}
