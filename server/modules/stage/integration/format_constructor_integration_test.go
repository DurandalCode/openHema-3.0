//go:build integration

// Package integration — сквозные тесты конструктора схемы и пресетов
// формата (спека 0020, T23): миграция 00004 (уникальность имени пресета без
// учёта регистра), атомарность/каскад ReplaceSchema на реальном PG и полный
// путь «схема из трёх этапов → пресет → применение к другой номинации →
// формирование этапа по 0019» через реальный Connect.
package integration

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/modules/stage/repo"
)

// createNominationTitled — как createNomination, но с явным названием: этот
// файл заводит по несколько номинаций в одном тесте (донор/цель), а
// заголовок номинации уникален в пределах турнира.
func createNominationTitled(t *testing.T, c clients, title string) string {
	t.Helper()
	req := connect.NewRequest(&hemav1.CreateNominationRequest{
		TournamentId: seedTournamentID,
		Title:        title,
	})
	req.Header().Set("Authorization", adminBearer(t))
	res, err := c.nom.CreateNomination(context.Background(), req)
	if err != nil {
		t.Fatalf("CreateNomination(%q): %v", title, err)
	}
	return res.Msg.Nomination.Id
}

// ---------------------------------------------------------------------
// Миграция 00004: уникальность имени пресета (uq_presets_name).
// ---------------------------------------------------------------------

// TestIntegration_FormatPresets_UniqueNameIgnoresCaseAndSpaces проверяет
// uq_presets_name (миграция 00004, FR-12/AC-17) через реальный Connect:
// SaveFormatPreset дважды с именами, различающимися только регистром и
// краевыми пробелами, — второй вызов отклонён AlreadyExists.
func TestIntegration_FormatPresets_UniqueNameIgnoresCaseAndSpaces(t *testing.T) {
	c, _ := setup(t)
	nomA := createNominationTitled(t, c, "Лонгсворд А")
	nomB := createNominationTitled(t, c, "Лонгсворд Б")
	stageIDFor(t, c, nomA)
	stageIDFor(t, c, nomB)

	saveReq1 := connect.NewRequest(&hemav1.SaveFormatPresetRequest{Name: "Формат", NominationId: nomA})
	saveReq1.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.SaveFormatPreset(context.Background(), saveReq1); err != nil {
		t.Fatalf("SaveFormatPreset (first): %v", err)
	}

	saveReq2 := connect.NewRequest(&hemav1.SaveFormatPresetRequest{Name: "  формат  ", NominationId: nomB})
	saveReq2.Header().Set("Authorization", adminBearer(t))
	_, err := c.pool.SaveFormatPreset(context.Background(), saveReq2)
	if connect.CodeOf(err) != connect.CodeAlreadyExists {
		t.Fatalf("expected CodeAlreadyExists (case/space-insensitive unique index), got %v", err)
	}
}

// ---------------------------------------------------------------------
// ApplyFormat/ReplaceSchema: каскад и резолв ссылок на реальном PG.
// ---------------------------------------------------------------------

// TestIntegration_ApplyFormat_ReplacesSchemaAndCascadesOldPools проверяет,
// что ReplaceSchema (спека 0020, FR-13/NFR-1) на реальном PG: (1) удаляет
// старые этапы номинации вместе с их (пустыми, гейт FR-13 не пропустил бы
// иначе) пулами — каскад ON DELETE CASCADE, не осиротевшие строки; (2) новые
// этапы получают реально резолвленный source_stage_id (не индекс) —
// самоссылающийся FK с ON DELETE RESTRICT (миграция 00003) не мешает
// bulk-удалению источника вместе с его веткой в одном операторе.
func TestIntegration_ApplyFormat_ReplacesSchemaAndCascadesOldPools(t *testing.T) {
	c, pool := setup(t)
	nomID := createNominationTitled(t, c, "Цель")

	// Старая схема: групповой этап с одним пустым пулом (без бойцов — гейт
	// FR-13 требует нулевых членств, но не нулевых пулов, план «Риски»).
	oldGroupsID := stageIDFor(t, c, nomID)
	createPoolReq := connect.NewRequest(&hemav1.CreatePoolRequest{StageId: oldGroupsID})
	createPoolReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.CreatePool(context.Background(), createPoolReq); err != nil {
		t.Fatalf("CreatePool (old schema): %v", err)
	}
	oldBracket := createBracketStage(t, c, nomID, "Старая сетка", 4, false)

	var oldPoolCount int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM stage.pools WHERE nomination_id = $1`, nomID,
	).Scan(&oldPoolCount); err != nil {
		t.Fatalf("count old pools: %v", err)
	}
	if oldPoolCount == 0 {
		t.Fatal("expected old schema to have pools before ApplyFormat (group pool + 2 bracket containers)")
	}

	// Донор: групповой этап (2 группы) → сетка на 8, сохранённый пресетом.
	donorID := createNominationTitled(t, c, "Донор")
	donorGroups := stageIDFor(t, c, donorID)
	updateReq := connect.NewRequest(&hemav1.UpdateStageRequest{
		StageId: donorGroups, Title: "Групповой этап", Groups: &hemav1.GroupsConfig{GroupCount: 2},
	})
	updateReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.UpdateStage(context.Background(), updateReq); err != nil {
		t.Fatalf("UpdateStage (donor groups config): %v", err)
	}
	donorBracketReq := connect.NewRequest(&hemav1.CreateStageRequest{
		NominationId: donorID, Type: hemav1.StageType_STAGE_TYPE_BRACKET, Title: "Плейофф",
		Bracket: &hemav1.BracketConfig{Size: 8},
		Rule: &hemav1.SeedingRule{
			SourceKind: hemav1.StageSourceKind_STAGE_SOURCE_KIND_STAGE, SourceStageId: donorGroups,
			Selector: hemav1.StageSelectorKind_STAGE_SELECTOR_KIND_GROUP_PLACES, PlaceFrom: 1, PlaceTo: 2,
			Method: hemav1.StageLayoutMethod_STAGE_LAYOUT_METHOD_SEEDED,
		},
	})
	donorBracketReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.CreateStage(context.Background(), donorBracketReq); err != nil {
		t.Fatalf("CreateStage (donor bracket): %v", err)
	}

	saveReq := connect.NewRequest(&hemav1.SaveFormatPresetRequest{Name: "Каскад-тест", NominationId: donorID})
	saveReq.Header().Set("Authorization", adminBearer(t))
	preset, err := c.pool.SaveFormatPreset(context.Background(), saveReq)
	if err != nil {
		t.Fatalf("SaveFormatPreset: %v", err)
	}

	applyReq := connect.NewRequest(&hemav1.ApplyFormatRequest{
		NominationId: nomID,
		Source:       &hemav1.ApplyFormatRequest_PresetId{PresetId: preset.Msg.Preset.Id},
	})
	applyReq.Header().Set("Authorization", adminBearer(t))
	applied, err := c.pool.ApplyFormat(context.Background(), applyReq)
	if err != nil {
		t.Fatalf("ApplyFormat: %v", err)
	}
	if len(applied.Msg.Stages) != 2 {
		t.Fatalf("expected 2 stages applied (groups + bracket), got %d", len(applied.Msg.Stages))
	}

	// Старые строки (этапы и их пулы) действительно ушли — не просто не
	// видны через API, а физически удалены (каскад БД).
	for _, oldID := range []string{oldGroupsID, oldBracket.Id} {
		var exists bool
		if err := pool.QueryRow(context.Background(),
			`SELECT EXISTS(SELECT 1 FROM stage.stages WHERE id = $1)`, oldID,
		).Scan(&exists); err != nil {
			t.Fatalf("check old stage gone: %v", err)
		}
		if exists {
			t.Fatalf("expected old stage %s to be deleted by ReplaceSchema", oldID)
		}
	}
	var orphanedPools int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM stage.pools p LEFT JOIN stage.stages s ON s.id = p.stage_id WHERE p.nomination_id = $1 AND s.id IS NULL`,
		nomID,
	).Scan(&orphanedPools); err != nil {
		t.Fatalf("count orphaned pools: %v", err)
	}
	if orphanedPools != 0 {
		t.Fatalf("expected no orphaned pools after ReplaceSchema, got %d", orphanedPools)
	}

	// Новые этапы: sourceStageId у сетки резолвлен в РЕАЛЬНЫЙ id нового
	// группового этапа (не индекс спецификации, не id старого/донорского
	// этапа).
	var newGroups, newBracket *hemav1.Stage
	for _, s := range applied.Msg.Stages {
		switch s.Type {
		case hemav1.StageType_STAGE_TYPE_GROUPS:
			newGroups = s
		case hemav1.StageType_STAGE_TYPE_BRACKET:
			newBracket = s
		default:
		}
	}
	if newGroups == nil || newBracket == nil {
		t.Fatalf("expected one groups and one bracket stage, got %+v", applied.Msg.Stages)
	}
	if newGroups.Id == donorGroups || newGroups.Id == oldGroupsID {
		t.Fatalf("expected a freshly created groups stage id, got %s", newGroups.Id)
	}
	if newBracket.Rule == nil || newBracket.Rule.SourceStageId != newGroups.Id {
		t.Fatalf("expected bracket rule to reference the NEW groups stage id %s, got %+v", newGroups.Id, newBracket.Rule)
	}
	if newBracket.Position != newGroups.Position+1 {
		t.Fatalf("expected bracket positioned after groups, got %d vs %d", newBracket.Position, newGroups.Position)
	}

	// Новая сетка получила два контейнера первого круга (0018, FR-6a) — как
	// service.CreateStage.
	var newBracketPools int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM stage.pools WHERE stage_id = $1`, newBracket.Id,
	).Scan(&newBracketPools); err != nil {
		t.Fatalf("count new bracket pools: %v", err)
	}
	if newBracketPools != 2 {
		t.Fatalf("expected 2 first-round containers for the new bracket, got %d", newBracketPools)
	}
}

// ---------------------------------------------------------------------
// Полный путь: схема из трёх этапов → пресет → применение к другой
// номинации → формирование этапа по 0019.
// ---------------------------------------------------------------------

// TestIntegration_FullPath_ThreeStageSchemaPresetApplyThenBuild — сквозной
// сценарий: номинация-донор с группами (2) и двумя параллельными сетками
// (двойной плейофф, AC-2 спеки 0019) сохраняется пресетом; пресет
// применяется к другой номинации; в применённой схеме реально формируются
// группы и одна из сеток через существующий путь 0019 (SetStageRule уже не
// нужен — правило пришло с пресетом; PreviewStageBuild → BuildStage), с
// посевом в БД.
func TestIntegration_FullPath_ThreeStageSchemaPresetApplyThenBuild(t *testing.T) {
	c, pool := setup(t)

	// --- Донор: группы (2) → сетка A (места 1-2) + сетка B (места 3 и ниже). ---
	donorID := createNominationTitled(t, c, "Донор с двойным плейоффом")
	donorGroups := stageIDFor(t, c, donorID)
	updateReq := connect.NewRequest(&hemav1.UpdateStageRequest{
		StageId: donorGroups, Title: "Групповой этап", Groups: &hemav1.GroupsConfig{GroupCount: 2},
	})
	updateReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.UpdateStage(context.Background(), updateReq); err != nil {
		t.Fatalf("UpdateStage (donor groups config): %v", err)
	}
	for _, spec := range []struct {
		title    string
		from, to int32
	}{
		{"Сетка A", 1, 2},
		{"Сетка B", 3, 0},
	} {
		req := connect.NewRequest(&hemav1.CreateStageRequest{
			NominationId: donorID, Type: hemav1.StageType_STAGE_TYPE_BRACKET, Title: spec.title,
			Bracket: &hemav1.BracketConfig{Size: 4},
			Rule: &hemav1.SeedingRule{
				SourceKind: hemav1.StageSourceKind_STAGE_SOURCE_KIND_STAGE, SourceStageId: donorGroups,
				Selector: hemav1.StageSelectorKind_STAGE_SELECTOR_KIND_GROUP_PLACES, PlaceFrom: spec.from, PlaceTo: spec.to,
				Method: hemav1.StageLayoutMethod_STAGE_LAYOUT_METHOD_SEEDED,
			},
		})
		req.Header().Set("Authorization", adminBearer(t))
		if _, err := c.pool.CreateStage(context.Background(), req); err != nil {
			t.Fatalf("CreateStage(%s): %v", spec.title, err)
		}
	}

	saveReq := connect.NewRequest(&hemav1.SaveFormatPresetRequest{Name: "Двойной плейофф", NominationId: donorID})
	saveReq.Header().Set("Authorization", adminBearer(t))
	preset, err := c.pool.SaveFormatPreset(context.Background(), saveReq)
	if err != nil {
		t.Fatalf("SaveFormatPreset: %v", err)
	}
	if len(preset.Msg.Preset.Stages) != 3 {
		t.Fatalf("expected 3 stages in preset, got %d", len(preset.Msg.Preset.Stages))
	}

	// --- Применяем пресет к целевой номинации. ---
	targetID := createNominationTitled(t, c, "Цель применения")
	f1 := createFighter(t, c, targetID, "Боец 1", "")
	f2 := createFighter(t, c, targetID, "Боец 2", "")
	f3 := createFighter(t, c, targetID, "Боец 3", "")
	f4 := createFighter(t, c, targetID, "Боец 4", "")
	stageIDFor(t, c, targetID) // материализует авто-этап, чтобы схема была нетронутой, но не пустой при чтении

	applyReq := connect.NewRequest(&hemav1.ApplyFormatRequest{
		NominationId: targetID,
		Source:       &hemav1.ApplyFormatRequest_PresetId{PresetId: preset.Msg.Preset.Id},
	})
	applyReq.Header().Set("Authorization", adminBearer(t))
	applied, err := c.pool.ApplyFormat(context.Background(), applyReq)
	if err != nil {
		t.Fatalf("ApplyFormat: %v", err)
	}
	if len(applied.Msg.Stages) != 3 {
		t.Fatalf("expected 3 stages applied, got %d", len(applied.Msg.Stages))
	}

	var groups *hemav1.Stage
	brackets := make([]*hemav1.Stage, 0, 2)
	for _, s := range applied.Msg.Stages {
		if s.Type == hemav1.StageType_STAGE_TYPE_GROUPS {
			groups = s
		} else {
			brackets = append(brackets, s)
		}
	}
	if groups == nil || len(brackets) != 2 {
		t.Fatalf("expected 1 groups + 2 brackets, got %+v", applied.Msg.Stages)
	}
	// AC-2 спеки 0019: обе сетки параллельны — общая позиция, оба
	// правила ссылаются на один и тот же (новый) групповой этап.
	if brackets[0].Position != brackets[1].Position {
		t.Fatalf("expected parallel brackets to share a position, got %d vs %d", brackets[0].Position, brackets[1].Position)
	}
	for _, b := range brackets {
		if b.Rule == nil || b.Rule.SourceStageId != groups.Id {
			t.Fatalf("expected bracket %q to source from the applied groups stage, got %+v", b.Title, b.Rule)
		}
	}

	// --- Доигрываем: набираем группу и формируем «Сетку A» по 0019. ---
	poolID := createPoolWithFighters(t, c, groups.Id, f1, f2, f3, f4)
	arenaID := createArena(t, c, "Ристалище")
	setLayoutStatus(t, c, targetID, hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY)
	seatPoolOnArena(t, c, poolID, arenaID)

	rank := map[string]int{f1: 4, f2: 3, f3: 2, f4: 1}
	conductAllBouts(t, c, arenaID, poolID, func(aID, bID string) (int32, int32) {
		if rank[aID] > rank[bID] {
			return 5, 1
		}
		return 1, 5
	})

	sideA := brackets[0]
	previewReq := connect.NewRequest(&hemav1.PreviewStageBuildRequest{StageId: sideA.Id})
	previewReq.Header().Set("Authorization", adminBearer(t))
	preview, err := c.pool.PreviewStageBuild(context.Background(), previewReq)
	if err != nil {
		t.Fatalf("PreviewStageBuild: %v", err)
	}
	if len(preview.Msg.Preview.Entries) != 2 {
		t.Fatalf("expected 2 entries (places 1-2), got %+v", preview.Msg.Preview)
	}

	buildReq := connect.NewRequest(&hemav1.BuildStageRequest{StageId: sideA.Id})
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
		sideA.Id,
	).Scan(&seededCount); err != nil {
		t.Fatalf("count seeded members: %v", err)
	}
	if seededCount != 2 {
		t.Fatalf("expected 2 rows with a slot in the DB (top-2 seeded into Сетка A), got %d", seededCount)
	}
}

// ---------------------------------------------------------------------
// Миграция 00006: журнал заведения встроенного каталога пресетов формата
// (спека 0047, FR-7).
// ---------------------------------------------------------------------

// TestIntegration_BuiltinPresetSeeds_MigrationApplies проверяет, что
// миграция 00006 действительно создала таблицу stage.builtin_preset_seeds
// и что репозиторий читает из неё пустой список на свежей БД.
func TestIntegration_BuiltinPresetSeeds_MigrationApplies(t *testing.T) {
	_, pool := setup(t)
	r := repo.New(pool)

	keys, err := r.SeededPresetKeys(context.Background())
	if err != nil {
		t.Fatalf("SeededPresetKeys: %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("expected no seeded keys on a fresh database, got %v", keys)
	}

	var exists bool
	if err := pool.QueryRow(context.Background(),
		`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'stage' AND table_name = 'builtin_preset_seeds')`,
	).Scan(&exists); err != nil {
		t.Fatalf("check table exists: %v", err)
	}
	if !exists {
		t.Fatal("expected migration 00006 to create stage.builtin_preset_seeds")
	}
}

// TestIntegration_BuiltinPresetSeeds_SurvivesPresetDeletion — ключевое
// свойство выбора отдельной таблицы вместо колонки на format_presets
// (план «Server», FR-7/FR-10): журнал заведения переживает удаление самого
// пресета (ON DELETE SET NULL, миграция 00006) — иначе удалённая встроенная
// запись заводилась бы заново при каждом старте сервера. Ключ остаётся в
// SeededPresetKeys (весь журнал), но выпадает из LiveSeededPresetKeys —
// именно на этой разнице держится RestoreBuiltinPresets (спека 0047, план
// «Риски»).
func TestIntegration_BuiltinPresetSeeds_SurvivesPresetDeletion(t *testing.T) {
	c, pool := setup(t)
	r := repo.New(pool)
	ctx := context.Background()

	nomID := createNominationTitled(t, c, "Журнал переживает удаление")
	stageIDFor(t, c, nomID)

	saveReq := connect.NewRequest(&hemav1.SaveFormatPresetRequest{Name: "Каталог-жертва", NominationId: nomID})
	saveReq.Header().Set("Authorization", adminBearer(t))
	preset, err := c.pool.SaveFormatPreset(ctx, saveReq)
	if err != nil {
		t.Fatalf("SaveFormatPreset: %v", err)
	}

	const key = "test-builtin-preset-seeds-survives-deletion"
	if err := r.MarkPresetSeeded(ctx, key, preset.Msg.Preset.Id); err != nil {
		t.Fatalf("MarkPresetSeeded: %v", err)
	}

	live, err := r.LiveSeededPresetKeys(ctx)
	if err != nil {
		t.Fatalf("LiveSeededPresetKeys (before delete): %v", err)
	}
	if !containsKey(live, key) {
		t.Fatalf("expected journal key %q to be live before deletion, got %v", key, live)
	}

	deleteReq := connect.NewRequest(&hemav1.DeleteFormatPresetRequest{PresetId: preset.Msg.Preset.Id})
	deleteReq.Header().Set("Authorization", adminBearer(t))
	if _, err := c.pool.DeleteFormatPreset(ctx, deleteReq); err != nil {
		t.Fatalf("DeleteFormatPreset: %v", err)
	}

	keys, err := r.SeededPresetKeys(ctx)
	if err != nil {
		t.Fatalf("SeededPresetKeys: %v", err)
	}
	if !containsKey(keys, key) {
		t.Fatalf("expected journal key %q to survive preset deletion, got %v", key, keys)
	}

	liveAfter, err := r.LiveSeededPresetKeys(ctx)
	if err != nil {
		t.Fatalf("LiveSeededPresetKeys (after delete): %v", err)
	}
	if containsKey(liveAfter, key) {
		t.Fatalf("expected journal key %q to drop out of LiveSeededPresetKeys once its preset is deleted (ON DELETE SET NULL), got %v", key, liveAfter)
	}
}

// TestIntegration_BuiltinPresetSeeds_MarkIsIdempotent — upsert
// (миграция 00006/запрос MarkPresetSeeded): пометить ключ дважды — не
// ошибка, ключ остаётся ровно один раз в журнале, а повторная отметка с
// реальным preset_id переводит его из «пропущен» в «живой».
func TestIntegration_BuiltinPresetSeeds_MarkIsIdempotent(t *testing.T) {
	c, pool := setup(t)
	r := repo.New(pool)
	ctx := context.Background()

	const key = "test-builtin-preset-seeds-idempotent"
	if err := r.MarkPresetSeeded(ctx, key, ""); err != nil {
		t.Fatalf("MarkPresetSeeded (first, no preset): %v", err)
	}
	if err := r.MarkPresetSeeded(ctx, key, ""); err != nil {
		t.Fatalf("MarkPresetSeeded (second, no preset): %v", err)
	}

	keys, err := r.SeededPresetKeys(ctx)
	if err != nil {
		t.Fatalf("SeededPresetKeys: %v", err)
	}
	count := 0
	for _, k := range keys {
		if k == key {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected key %q to appear exactly once after two MarkPresetSeeded calls, got %d", key, count)
	}

	live, err := r.LiveSeededPresetKeys(ctx)
	if err != nil {
		t.Fatalf("LiveSeededPresetKeys: %v", err)
	}
	if containsKey(live, key) {
		t.Fatalf("expected key %q with no preset_id to be absent from LiveSeededPresetKeys, got %v", key, live)
	}

	nomID := createNominationTitled(t, c, "Журнал: апдейт ссылки")
	stageIDFor(t, c, nomID)
	saveReq := connect.NewRequest(&hemav1.SaveFormatPresetRequest{Name: "Каталог-апдейт", NominationId: nomID})
	saveReq.Header().Set("Authorization", adminBearer(t))
	preset, err := c.pool.SaveFormatPreset(ctx, saveReq)
	if err != nil {
		t.Fatalf("SaveFormatPreset: %v", err)
	}
	if err := r.MarkPresetSeeded(ctx, key, preset.Msg.Preset.Id); err != nil {
		t.Fatalf("MarkPresetSeeded (upsert with preset id): %v", err)
	}
	liveAfter, err := r.LiveSeededPresetKeys(ctx)
	if err != nil {
		t.Fatalf("LiveSeededPresetKeys (after upsert): %v", err)
	}
	if !containsKey(liveAfter, key) {
		t.Fatalf("expected key %q to become live after MarkPresetSeeded upserted a real preset id, got %v", key, liveAfter)
	}
}

func containsKey(keys []string, key string) bool {
	for _, k := range keys {
		if k == key {
			return true
		}
	}
	return false
}
