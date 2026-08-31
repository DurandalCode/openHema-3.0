// Тесты заведения встроенного каталога пресетов формата (спека 0047,
// FR-6..FR-10; AC-1, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-13).
package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

// TestSeedBuiltinPresets_T5_EmptyLibrarySeedsAll — AC-1: пустая библиотека →
// заведено 10 записей каталога, журнал содержит 10 ключей.
func TestSeedBuiltinPresets_T5_EmptyLibrarySeedsAll(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()

	report, err := svc.SeedBuiltinPresets(ctx)
	if err != nil {
		t.Fatalf("SeedBuiltinPresets: %v", err)
	}
	if len(report.Restored) != 10 {
		t.Fatalf("Restored len = %d, want 10", len(report.Restored))
	}
	if report.Skipped != 0 {
		t.Fatalf("Skipped = %d, want 0", report.Skipped)
	}

	keys, err := repo.SeededPresetKeys(ctx)
	if err != nil {
		t.Fatalf("SeededPresetKeys: %v", err)
	}
	if len(keys) != 10 {
		t.Fatalf("journal keys len = %d, want 10", len(keys))
	}

	presets, err := svc.ListFormatPresets(ctx)
	if err != nil {
		t.Fatalf("ListFormatPresets: %v", err)
	}
	if len(presets) != 10 {
		t.Fatalf("library presets len = %d, want 10", len(presets))
	}
}

// TestSeedBuiltinPresets_T5_SecondCallSeedsNothing — FR-7: повторный вызов
// после успешного заведения ничего не заводит — журнал уже содержит все
// ключи.
func TestSeedBuiltinPresets_T5_SecondCallSeedsNothing(t *testing.T) {
	svc, _, _, _, _ := newService()
	ctx := context.Background()

	if _, err := svc.SeedBuiltinPresets(ctx); err != nil {
		t.Fatalf("first SeedBuiltinPresets: %v", err)
	}
	report, err := svc.SeedBuiltinPresets(ctx)
	if err != nil {
		t.Fatalf("second SeedBuiltinPresets: %v", err)
	}
	if len(report.Restored) != 0 {
		t.Fatalf("Restored len = %d, want 0 on second call", len(report.Restored))
	}
	if report.Skipped != 0 {
		t.Fatalf("Skipped = %d, want 0 on second call (journal filters, not name conflict)", report.Skipped)
	}
}

// TestSeedBuiltinPresets_T5_DeletedPresetIsNotResurrected — AC-6: ключ уже в
// журнале, а сам пресет удалён (admin удалил встроенный пресет) — повторный
// SeedBuiltinPresets его не воскрешает: журнал — не сверка с существующими
// пресетами, а факт «уже пытались завести этот ключ».
func TestSeedBuiltinPresets_T5_DeletedPresetIsNotResurrected(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()

	if _, err := svc.SeedBuiltinPresets(ctx); err != nil {
		t.Fatalf("first SeedBuiltinPresets: %v", err)
	}
	presets, err := svc.ListFormatPresets(ctx)
	if err != nil {
		t.Fatalf("ListFormatPresets: %v", err)
	}
	if len(presets) != 10 {
		t.Fatalf("library presets len = %d, want 10", len(presets))
	}
	victim := presets[0]
	if err := svc.DeleteFormatPreset(ctx, victim.ID); err != nil {
		t.Fatalf("DeleteFormatPreset: %v", err)
	}

	report, err := svc.SeedBuiltinPresets(ctx)
	if err != nil {
		t.Fatalf("second SeedBuiltinPresets: %v", err)
	}
	if len(report.Restored) != 0 {
		t.Fatalf("Restored len = %d, want 0 — deleted builtin preset must not come back on restart", len(report.Restored))
	}

	after, err := svc.ListFormatPresets(ctx)
	if err != nil {
		t.Fatalf("ListFormatPresets (after): %v", err)
	}
	if len(after) != 9 {
		t.Fatalf("library presets len = %d, want 9 (deleted one stays gone)", len(after))
	}
	for _, p := range after {
		if p.Name == victim.Name {
			t.Fatalf("deleted preset %q reappeared after SeedBuiltinPresets", victim.Name)
		}
	}
	_ = repo
}

// TestSeedBuiltinPresets_T5_OnlyMissingKeyIsSeeded — AC-8: журнал уже
// содержит 9 из 10 ключей каталога (симулирует пополнение каталога новой
// версией, план «Риски» — новая версия добавляет ключ) → заводится только
// недостающий.
func TestSeedBuiltinPresets_T5_OnlyMissingKeyIsSeeded(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()

	all := domain.BuiltinPresets()
	if len(all) != 10 {
		t.Fatalf("expected 10 builtin presets, got %d", len(all))
	}
	var missingKey string
	for i, p := range all {
		if i == len(all)-1 {
			missingKey = p.Key
			continue
		}
		if err := repo.MarkPresetSeeded(ctx, p.Key, ""); err != nil {
			t.Fatalf("MarkPresetSeeded(%q): %v", p.Key, err)
		}
	}

	report, err := svc.SeedBuiltinPresets(ctx)
	if err != nil {
		t.Fatalf("SeedBuiltinPresets: %v", err)
	}
	if len(report.Restored) != 1 {
		t.Fatalf("Restored len = %d, want 1", len(report.Restored))
	}
	if report.Restored[0].Name != findPresetByKey(t, missingKey).Name {
		t.Fatalf("Restored[0].Name = %q, want %q", report.Restored[0].Name, findPresetByKey(t, missingKey).Name)
	}
}

// TestSeedBuiltinPresets_T5_NameConflictIsSkippedNotFailed — AC-9: имя
// записи каталога уже занято своим пресетом библиотеки → запись
// пропускается (Skipped++), чужой пресет не изменён, проход продолжается
// (остальные записи заводятся), ключ всё равно отмечается в журнале.
func TestSeedBuiltinPresets_T5_NameConflictIsSkippedNotFailed(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()

	all := domain.BuiltinPresets()
	conflicting := all[0]
	ownSpec := domain.FormatSpec{Stages: []domain.FormatStageSpec{{
		Title: "Своя схема", Type: domain.StageTypeBracket,
		Bracket: domain.BracketConfig{Size: 4}, SourceKind: domain.SourceKindRoster,
		SourceIndex: -1, Selector: domain.SelectorKindAll, Method: domain.LayoutMethodSeeded,
	}}}
	own, err := repo.InsertFormatPreset(ctx, conflicting.Name, ownSpec)
	if err != nil {
		t.Fatalf("seed own preset with conflicting name: %v", err)
	}

	report, err := svc.SeedBuiltinPresets(ctx)
	if err != nil {
		t.Fatalf("SeedBuiltinPresets: %v", err)
	}
	if report.Skipped != 1 {
		t.Fatalf("Skipped = %d, want 1", report.Skipped)
	}
	if len(report.Restored) != len(all)-1 {
		t.Fatalf("Restored len = %d, want %d (all but the conflicting one)", len(report.Restored), len(all)-1)
	}

	// Чужой пресет не изменён — та же схема, тот же id.
	stillOwn, found, err := repo.GetFormatPreset(ctx, own.ID)
	if err != nil {
		t.Fatalf("GetFormatPreset: %v", err)
	}
	if !found {
		t.Fatalf("own preset %q disappeared", own.ID)
	}
	if len(stillOwn.Spec.Stages) != 1 || stillOwn.Spec.Stages[0].Title != "Своя схема" {
		t.Fatalf("own preset was overwritten: %+v", stillOwn.Spec)
	}

	// Ключ конфликтующей записи всё равно отмечен в журнале (FR-9: не
	// повторять заведомо проваливающуюся попытку при каждом старте).
	keys, err := repo.SeededPresetKeys(ctx)
	if err != nil {
		t.Fatalf("SeededPresetKeys: %v", err)
	}
	seen := make(map[string]bool, len(keys))
	for _, k := range keys {
		seen[k] = true
	}
	if !seen[conflicting.Key] {
		t.Fatalf("expected conflicting key %q to be marked seeded despite the skip", conflicting.Key)
	}
	if len(keys) != len(all) {
		t.Fatalf("journal keys len = %d, want %d (all attempted)", len(keys), len(all))
	}
}

// TestRestoreBuiltinPresets_T5_RestoresOnlyDeleted — AC-10: восстановление
// пропускает ключи, чей пресет ещё жив (LiveSeededPresetKeys), а не весь
// журнал заведения (SeededPresetKeys) — в отличие от SeedBuiltinPresets. Три
// удалённых пресета теряют живую ссылку в журнале (DeleteFormatPreset)
// и заводятся заново.
func TestRestoreBuiltinPresets_T5_RestoresOnlyDeleted(t *testing.T) {
	svc, _, _, _, _ := newService()
	ctx := context.Background()

	if _, err := svc.SeedBuiltinPresets(ctx); err != nil {
		t.Fatalf("initial SeedBuiltinPresets: %v", err)
	}
	presets, err := svc.ListFormatPresets(ctx)
	if err != nil {
		t.Fatalf("ListFormatPresets: %v", err)
	}
	// Admin удаляет три встроенных пресета.
	deleted := presets[:3]
	for _, p := range deleted {
		if err := svc.DeleteFormatPreset(ctx, p.ID); err != nil {
			t.Fatalf("DeleteFormatPreset(%q): %v", p.ID, err)
		}
	}

	report, err := svc.RestoreBuiltinPresets(ctx)
	if err != nil {
		t.Fatalf("RestoreBuiltinPresets: %v", err)
	}
	if len(report.Restored) != 3 {
		t.Fatalf("Restored len = %d, want 3", len(report.Restored))
	}

	after, err := svc.ListFormatPresets(ctx)
	if err != nil {
		t.Fatalf("ListFormatPresets (after restore): %v", err)
	}
	if len(after) != 10 {
		t.Fatalf("library presets len = %d, want 10 after restore", len(after))
	}
}

// TestRestoreBuiltinPresets_T5_NeverOverwritesExisting — AC-11:
// восстановление, вызванное когда все записи каталога на месте (в т.ч.
// одна применена к номинации и её схема на номинации правилась), ничего не
// меняет — библиотека не тронута. Skipped остаётся 0: живые записи
// пропускаются фильтром ДО попытки вставки (LiveSeededPresetKeys), а не
// через конфликт имени при вставке — Skipped считает только реально
// провалившиеся попытки (FR-9), не «уже присутствующие».
func TestRestoreBuiltinPresets_T5_NeverOverwritesExisting(t *testing.T) {
	svc, _, _, _, _ := newService()
	ctx := context.Background()

	if _, err := svc.SeedBuiltinPresets(ctx); err != nil {
		t.Fatalf("initial SeedBuiltinPresets: %v", err)
	}
	before, err := svc.ListFormatPresets(ctx)
	if err != nil {
		t.Fatalf("ListFormatPresets (before): %v", err)
	}

	report, err := svc.RestoreBuiltinPresets(ctx)
	if err != nil {
		t.Fatalf("RestoreBuiltinPresets: %v", err)
	}
	if len(report.Restored) != 0 {
		t.Fatalf("Restored len = %d, want 0 — nothing missing", len(report.Restored))
	}
	if report.Skipped != 0 {
		t.Fatalf("Skipped = %d, want 0 — every catalogue entry is still live, none was even attempted", report.Skipped)
	}

	after, err := svc.ListFormatPresets(ctx)
	if err != nil {
		t.Fatalf("ListFormatPresets (after): %v", err)
	}
	if len(after) != len(before) {
		t.Fatalf("library changed size: before=%d after=%d", len(before), len(after))
	}
	for i := range before {
		if before[i].ID != after[i].ID || before[i].UpdatedAt != after[i].UpdatedAt {
			t.Fatalf("preset %q was touched by RestoreBuiltinPresets: before=%+v after=%+v", before[i].Name, before[i], after[i])
		}
	}
}

// TestRestoreBuiltinPresets_T5_RenamedNotDuplicatedUnderOldName — AC-10:
// admin удаляет три записи каталога и переименовывает четвёртую;
// восстановление заводит заново ровно три удалённых (Restored == 3,
// Skipped == 0), переименованная не тронута И не задублирована под
// освободившимся старым именем. Это работает потому, что фильтр пропуска
// RestoreBuiltinPresets — LiveSeededPresetKeys (живая ссылка в журнале по
// id пресета), а не проверка занятости имени: переименование id не меняет,
// поэтому запись остаётся «живой» и восстановление её не касается вовсе —
// ни втихую переименовывает назад, ни заводит рядом дубликат содержимого.
func TestRestoreBuiltinPresets_T5_RenamedNotDuplicatedUnderOldName(t *testing.T) {
	svc, _, _, _, _ := newService()
	ctx := context.Background()

	if _, err := svc.SeedBuiltinPresets(ctx); err != nil {
		t.Fatalf("initial SeedBuiltinPresets: %v", err)
	}
	presets, err := svc.ListFormatPresets(ctx)
	if err != nil {
		t.Fatalf("ListFormatPresets: %v", err)
	}

	target := presets[0]
	originalName := target.Name
	renamed, err := svc.RenameFormatPreset(ctx, target.ID, "Пулька")
	if err != nil {
		t.Fatalf("RenameFormatPreset: %v", err)
	}

	deleted := presets[1:4]
	for _, p := range deleted {
		if err := svc.DeleteFormatPreset(ctx, p.ID); err != nil {
			t.Fatalf("DeleteFormatPreset(%q): %v", p.ID, err)
		}
	}

	report, err := svc.RestoreBuiltinPresets(ctx)
	if err != nil {
		t.Fatalf("RestoreBuiltinPresets: %v", err)
	}
	if len(report.Restored) != 3 {
		t.Fatalf("Restored len = %d, want 3 (only the deleted ones)", len(report.Restored))
	}
	if report.Skipped != 0 {
		t.Fatalf("Skipped = %d, want 0 — the renamed/live entry was never even attempted", report.Skipped)
	}

	after, err := svc.ListFormatPresets(ctx)
	if err != nil {
		t.Fatalf("ListFormatPresets (after): %v", err)
	}
	if len(after) != 10 {
		t.Fatalf("library presets len = %d, want 10 (7 untouched + 3 restored)", len(after))
	}
	var renamedStillThere bool
	for _, p := range after {
		if p.ID == renamed.ID {
			if p.Name != "Пулька" {
				t.Fatalf("renamed preset name changed: got %q", p.Name)
			}
			renamedStillThere = true
		}
		if p.Name == originalName {
			t.Fatalf("found a preset named %q — renamed builtin was duplicated under its old name", originalName)
		}
	}
	if !renamedStillThere {
		t.Fatalf("renamed preset disappeared")
	}
}

// TestSeedBuiltinPresets_T5_NonNameConflictErrorAbortsAndPropagates —
// AC-13: ошибка репозитория, отличная от ErrPresetNameTaken, прерывает
// проход заведения каталога и возвращается наверх (в бутстрапе — только в
// лог, NFR-2, вне скоупа этого юнит-теста).
func TestSeedBuiltinPresets_T5_NonNameConflictErrorAbortsAndPropagates(t *testing.T) {
	svc, repo, _, _, _ := newService()
	ctx := context.Background()

	boom := errors.New("boom: repo unavailable")
	repo.InsertFormatPresetErr = boom

	report, err := svc.SeedBuiltinPresets(ctx)
	if !errors.Is(err, boom) {
		t.Fatalf("expected error to propagate, got %v", err)
	}
	if len(report.Restored) != 0 || report.Skipped != 0 {
		t.Fatalf("expected zero-value report on abort, got %+v", report)
	}

	keys, err := repo.SeededPresetKeys(ctx)
	if err != nil {
		t.Fatalf("SeededPresetKeys: %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("expected no journal entries — the failing insert must abort before marking the key, got %d", len(keys))
	}
}

func findPresetByKey(t *testing.T, key string) domain.BuiltinPreset {
	t.Helper()
	for _, p := range domain.BuiltinPresets() {
		if p.Key == key {
			return p
		}
	}
	t.Fatalf("builtin preset with key %q not found", key)
	return domain.BuiltinPreset{}
}
