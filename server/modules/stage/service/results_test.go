// Тесты юзкейсов ЖЦ номинации целиком (спека 0021, T16-T17): статус этапа/
// номинации, наполняемый прогрессом боёв, и итоговый протокол.
package service_test

import (
	"context"
	"testing"

	"github.com/hema/server/modules/stage/domain"
	"github.com/hema/server/modules/stage/service"
	"github.com/hema/server/modules/stage/testutil"
)

// finishPoolBout — тестовый хелпер: ставит пул на арену (если ещё не стоит),
// начинает/задаёт счёт/завершает его текущий бой. Возвращает id завершённого
// боя (для сценариев пересмотра результата).
func finishPoolBout(t *testing.T, ctx context.Context, svc *service.Service, arenas *testutil.FakeArenaProvider, poolID, arenaID string, scoreA, scoreB int) string {
	t.Helper()
	arenas.Set(domain.ArenaRef{ID: arenaID, Name: arenaID, Active: true})
	if _, err := svc.SeatPoolOnArena(ctx, poolID, arenaID); err != nil {
		if _, err2 := svc.GetBoutBoard(ctx, arenaID); err2 != nil {
			t.Fatalf("seat pool %s on %s: %v", poolID, arenaID, err)
		}
	}
	board, err := svc.GetBoutBoard(ctx, arenaID)
	if err != nil {
		t.Fatalf("get board %s: %v", arenaID, err)
	}
	boutID := board.CurrentBoutID
	if _, err := svc.StartCurrentBout(ctx, poolID, "secretary"); err != nil {
		t.Fatalf("start %s: %v", poolID, err)
	}
	if _, err := svc.ScoreCurrentBout(ctx, poolID, "secretary", scoreA, scoreB); err != nil {
		t.Fatalf("score %s: %v", poolID, err)
	}
	if _, err := svc.FinishCurrentBout(ctx, poolID, "secretary"); err != nil {
		t.Fatalf("finish %s: %v", poolID, err)
	}
	return boutID
}

// ---------------------------------------------------------------------
// T16: NominationResults (протокол).
// ---------------------------------------------------------------------

// AC-6/AC-7: сетка на 4 без боя за 3-е место, доиграна целиком — чемпион 1,
// финалист 2, оба полуфиналиста делят 3-4 (формальный диапазон, не делёж
// номером). Попутно проверяет T17: исполнительная ось номинации доходит до
// FINISHED.
func TestNominationResults_T16_BracketFinished_FormalRanges(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, arenas, nominations, _ := newServiceWithNominations()
	fighters.Set("n1",
		domain.FighterRef{ID: "f1", Name: "F1"}, domain.FighterRef{ID: "f2", Name: "F2"},
		domain.FighterRef{ID: "f3", Name: "F3"}, domain.FighterRef{ID: "f4", Name: "F4"},
	)
	stage := seedAndLockBracket4(t, ctx, svc, "n1", fighters)

	pools, err := repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		t.Fatalf("pools by stage: %v", err)
	}
	byNumber := map[int]string{}
	for _, p := range pools {
		byNumber[p.Number] = p.ID
	}
	pool1, pool2, final := byNumber[1], byNumber[2], byNumber[3]

	finishPoolBout(t, ctx, svc, arenas, pool1, "a1", 6, 5) // f1 beats f2
	finishPoolBout(t, ctx, svc, arenas, pool2, "a2", 6, 5) // f3 beats f4
	finishPoolBout(t, ctx, svc, arenas, final, "a3", 6, 5) // f1 beats f3 -> champion

	results, err := svc.NominationResults(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !results.NominationFinished {
		t.Fatalf("expected NominationFinished=true, got %+v", results)
	}
	if len(results.Sections) != 1 {
		t.Fatalf("expected 1 terminal section, got %d: %+v", len(results.Sections), results.Sections)
	}
	section := results.Sections[0]
	if !section.Finished || section.StageID != stage.ID {
		t.Fatalf("unexpected section: %+v", section)
	}
	if section.PlacesFromOverallOrder {
		t.Fatalf("bracket section must not set PlacesFromOverallOrder")
	}
	if len(section.Entries) != 4 {
		t.Fatalf("expected 4 entries, got %d: %+v", len(section.Entries), section.Entries)
	}

	byFighter := map[string]domain.ResultEntry{}
	for _, e := range section.Entries {
		byFighter[e.Fighter.ID] = e
	}
	want := map[string][2]int{
		"f1": {1, 1},
		"f3": {2, 2},
		"f2": {3, 4},
		"f4": {3, 4},
	}
	for id, rng := range want {
		e, ok := byFighter[id]
		if !ok {
			t.Fatalf("missing entry for %s in %+v", id, section.Entries)
		}
		if e.PlaceFrom != rng[0] || e.PlaceTo != rng[1] {
			t.Fatalf("%s: got range [%d,%d], want [%d,%d]", id, e.PlaceFrom, e.PlaceTo, rng[0], rng[1])
		}
	}

	exec, called := nominations.LastExecution("n1")
	if !called || exec != domain.ExecutionFinished {
		t.Fatalf("expected sync to ExecutionFinished, got %v (called=%v)", exec, called)
	}
}

// Групповой терминальный этап из одной группы — протокол воспроизводит
// порядок итоговой таблицы (0016), делёж выражен диапазоном.
func TestNominationResults_T16_SingleGroupStage(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _ := newService()
	fighters.Set("n1",
		domain.FighterRef{ID: "f1", Name: "F1"}, domain.FighterRef{ID: "f2", Name: "F2"},
		domain.FighterRef{ID: "f3", Name: "F3"},
	)
	poolID := repo.SeedPool("n1", 1, "f1", "f2", "f3")
	repo.SeedStatus("n1", domain.LayoutReady)

	// f1 бьёт f2 и f3 (2 победы) — 1-е место безусловно; f2 и f3 по одной
	// победе/поражению с равным счётом (5:5 друг с другом эквивалент — делают
	// это через счёт против f1, подобранный так, чтобы f2/f3 были равны).
	bouts.SeedBout(poolID, domain.BoutRef{
		ID: "b1", RoundNumber: 1, SequenceNumber: 1,
		FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f2"},
		State: domain.BoutStateFinished, ScoreA: 6, ScoreB: 2,
	})
	bouts.SeedBout(poolID, domain.BoutRef{
		ID: "b2", RoundNumber: 1, SequenceNumber: 2,
		FighterA: domain.FighterRef{ID: "f1"}, FighterB: domain.FighterRef{ID: "f3"},
		State: domain.BoutStateFinished, ScoreA: 6, ScoreB: 2,
	})
	bouts.SeedBout(poolID, domain.BoutRef{
		ID: "b3", RoundNumber: 1, SequenceNumber: 3,
		FighterA: domain.FighterRef{ID: "f2"}, FighterB: domain.FighterRef{ID: "f3"},
		State: domain.BoutStateFinished, ScoreA: 5, ScoreB: 5,
	})

	results, err := svc.NominationResults(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !results.NominationFinished {
		t.Fatalf("expected NominationFinished=true, got %+v", results)
	}
	if len(results.Sections) != 1 {
		t.Fatalf("expected 1 section, got %+v", results.Sections)
	}
	section := results.Sections[0]
	if section.PlacesFromOverallOrder {
		t.Fatalf("single-group section must not set PlacesFromOverallOrder")
	}
	if len(section.Entries) != 3 {
		t.Fatalf("expected 3 entries, got %+v", section.Entries)
	}
	byFighter := map[string]domain.ResultEntry{}
	for _, e := range section.Entries {
		byFighter[e.Fighter.ID] = e
	}
	if e := byFighter["f1"]; e.PlaceFrom != 1 || e.PlaceTo != 1 {
		t.Fatalf("f1: got [%d,%d], want [1,1]", e.PlaceFrom, e.PlaceTo)
	}
	if e := byFighter["f2"]; e.PlaceFrom != 2 || e.PlaceTo != 3 {
		t.Fatalf("f2: got [%d,%d], want [2,3]", e.PlaceFrom, e.PlaceTo)
	}
	if e := byFighter["f3"]; e.PlaceFrom != 2 || e.PlaceTo != 3 {
		t.Fatalf("f3: got [%d,%d], want [2,3]", e.PlaceFrom, e.PlaceTo)
	}
}

// AC-12 (частично): терминальный этап, который ещё не доиграли, — секция с
// Finished=false и пустыми Entries, номинация не завершена.
func TestNominationResults_T16_UnfinishedTerminalStageShown(t *testing.T) {
	ctx := context.Background()
	svc, _, fighters, _, _, nominations, _ := newServiceWithNominations()
	fighters.Set("n1",
		domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"},
		domain.FighterRef{ID: "f3"}, domain.FighterRef{ID: "f4"},
	)
	stage := seedAndLockBracket4(t, ctx, svc, "n1", fighters)

	results, err := svc.NominationResults(ctx, "n1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if results.NominationFinished {
		t.Fatalf("expected NominationFinished=false, got %+v", results)
	}
	if len(results.Sections) != 1 {
		t.Fatalf("expected 1 section, got %+v", results.Sections)
	}
	section := results.Sections[0]
	if section.Finished || len(section.Entries) != 0 || section.StageID != stage.ID {
		t.Fatalf("expected unfinished empty section for %s, got %+v", stage.ID, section)
	}

	// Фиксация посева (draft→ready) — реальный переход, syncNomination
	// вызывается (как и на любой фиксации/расфиксации, спека 0021 FR-1), но
	// без единого начатого боя исполнительная ось остаётся none.
	if exec, called := nominations.LastExecution("n1"); !called || exec != domain.ExecutionNone {
		t.Fatalf("expected ExecutionNone synced after locking with no bouts played, got %v (called=%v)", exec, called)
	}
}

// ---------------------------------------------------------------------
// T17: синхронизация исполнительной оси номинации (FR-4/FR-5).
// ---------------------------------------------------------------------

// AC-1/AC-4: старт первого боя переводит номинацию в ACTIVE; доигрывание
// всех боёв единственного этапа — в FINISHED; пересмотр результата (reopen)
// возвращает в ACTIVE, без ручного отката.
func TestSyncNomination_T17_BoutLifecycleDrivesExecutionAxis(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, bouts, _, nominations, _ := newServiceWithNominations()
	fighters.Set("n1", domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"})
	poolID := seedBoutBoardPool(t, repo, bouts, "arena-1")

	if _, called := nominations.LastExecution("n1"); called {
		t.Fatalf("expected no sync before any mutation")
	}

	if _, err := svc.StartCurrentBout(ctx, poolID, "admin-1"); err != nil {
		t.Fatalf("start b1: %v", err)
	}
	if exec, called := nominations.LastExecution("n1"); !called || exec != domain.ExecutionActive {
		t.Fatalf("expected ExecutionActive after first bout start, got %v (called=%v)", exec, called)
	}

	playRemaining := func(scoreA, scoreB int) {
		t.Helper()
		if _, err := svc.ScoreCurrentBout(ctx, poolID, "admin-1", scoreA, scoreB); err != nil {
			t.Fatalf("score: %v", err)
		}
		if _, err := svc.FinishCurrentBout(ctx, poolID, "admin-1"); err != nil {
			t.Fatalf("finish: %v", err)
		}
	}
	playRemaining(5, 3) // b1
	if _, err := svc.StartCurrentBout(ctx, poolID, "admin-1"); err != nil {
		t.Fatalf("start b2: %v", err)
	}
	playRemaining(4, 2) // b2
	if _, err := svc.StartCurrentBout(ctx, poolID, "admin-1"); err != nil {
		t.Fatalf("start b3: %v", err)
	}
	playRemaining(6, 1) // b3, последний бой пула/этапа/номинации

	if exec, called := nominations.LastExecution("n1"); !called || exec != domain.ExecutionFinished {
		t.Fatalf("expected ExecutionFinished after all bouts finished, got %v (called=%v)", exec, called)
	}

	// AC-4: пересмотр b3 — указатель на текущий бой пуст (авто-продвижение
	// после последнего боя), возвращаем его явно, затем reopen.
	if _, err := svc.SetCurrentBout(ctx, poolID, "b3"); err != nil {
		t.Fatalf("set current to b3: %v", err)
	}
	if _, err := svc.ReopenCurrentBout(ctx, poolID, "admin-1"); err != nil {
		t.Fatalf("reopen b3: %v", err)
	}
	if exec, called := nominations.LastExecution("n1"); !called || exec != domain.ExecutionActive {
		t.Fatalf("expected ExecutionActive after reopen, got %v (called=%v)", exec, called)
	}
}

// AC-5: создание нового (черновик) этапа на уже завершённой номинации
// возвращает её в ACTIVE; удаление этого лишнего этапа — снова в FINISHED.
func TestSyncNomination_T17_CreateAndDeleteStage_AC5(t *testing.T) {
	ctx := context.Background()
	svc, repo, fighters, _, arenas, nominations, _ := newServiceWithNominations()
	fighters.Set("n1",
		domain.FighterRef{ID: "f1"}, domain.FighterRef{ID: "f2"},
		domain.FighterRef{ID: "f3"}, domain.FighterRef{ID: "f4"},
	)
	stage := seedAndLockBracket4(t, ctx, svc, "n1", fighters)
	pools, err := repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		t.Fatalf("pools by stage: %v", err)
	}
	byNumber := map[int]string{}
	for _, p := range pools {
		byNumber[p.Number] = p.ID
	}
	finishPoolBout(t, ctx, svc, arenas, byNumber[1], "a1", 6, 5)
	finishPoolBout(t, ctx, svc, arenas, byNumber[2], "a2", 6, 5)
	finishPoolBout(t, ctx, svc, arenas, byNumber[3], "a3", 6, 5)

	if exec, called := nominations.LastExecution("n1"); !called || exec != domain.ExecutionFinished {
		t.Fatalf("setup: expected ExecutionFinished, got %v (called=%v)", exec, called)
	}

	created, _, err := svc.CreateStage(ctx, "n1", domain.StageTypeGroups, "Утешительный", domain.BracketConfig{}, domain.GroupsConfig{GroupCount: 1}, domain.SeedingRule{})
	if err != nil {
		t.Fatalf("create stage: %v", err)
	}
	if exec, called := nominations.LastExecution("n1"); !called || exec != domain.ExecutionActive {
		t.Fatalf("expected ExecutionActive after creating a new draft stage, got %v (called=%v)", exec, called)
	}

	if _, err := svc.DeleteStage(ctx, created.ID); err != nil {
		t.Fatalf("delete stage: %v", err)
	}
	if exec, called := nominations.LastExecution("n1"); !called || exec != domain.ExecutionFinished {
		t.Fatalf("expected ExecutionFinished again after removing the leftover stage, got %v (called=%v)", exec, called)
	}
}
