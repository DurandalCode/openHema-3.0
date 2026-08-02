package service

import (
	"sync"
	"testing"

	"github.com/hema/server/modules/stage/domain"
)

// TestArenaRooms_OrdinalsAssignedInJoinOrder — 3 табло подключаются по
// очереди: ordinals 1/2/3, is_source только у первого (спека 0015, T10).
func TestArenaRooms_OrdinalsAssignedInJoinOrder(t *testing.T) {
	r := newArenaRooms()
	m1 := r.join("a1", domain.ScoreboardRoleScoreboard)
	m2 := r.join("a1", domain.ScoreboardRoleScoreboard)
	m3 := r.join("a1", domain.ScoreboardRoleScoreboard)

	v1 := r.view("a1", m1)
	v2 := r.view("a1", m2)
	v3 := r.view("a1", m3)

	if v1.ThisOrdinal != 1 || !v1.ThisIsSource {
		t.Errorf("m1 view = %+v, want ordinal 1 + source", v1)
	}
	if v2.ThisOrdinal != 2 || v2.ThisIsSource {
		t.Errorf("m2 view = %+v, want ordinal 2, not source", v2)
	}
	if v3.ThisOrdinal != 3 || v3.ThisIsSource {
		t.Errorf("m3 view = %+v, want ordinal 3, not source", v3)
	}
	if v1.ScoreboardCount != 3 {
		t.Errorf("ScoreboardCount = %d, want 3", v1.ScoreboardCount)
	}
}

// TestArenaRooms_LeaveReindexesRemaining — отключение табло №1 → у
// оставшихся (были №2/№3) ordinals пересчитываются в 1/2, новый №1
// становится is_source.
func TestArenaRooms_LeaveReindexesRemaining(t *testing.T) {
	r := newArenaRooms()
	m1 := r.join("a1", domain.ScoreboardRoleScoreboard)
	m2 := r.join("a1", domain.ScoreboardRoleScoreboard)
	m3 := r.join("a1", domain.ScoreboardRoleScoreboard)

	r.leave("a1", m1)

	v2 := r.view("a1", m2)
	v3 := r.view("a1", m3)
	if v2.ThisOrdinal != 1 || !v2.ThisIsSource {
		t.Errorf("m2 after leave = %+v, want ordinal 1 + source", v2)
	}
	if v3.ThisOrdinal != 2 || v3.ThisIsSource {
		t.Errorf("m3 after leave = %+v, want ordinal 2, not source", v3)
	}
	if v2.ScoreboardCount != 2 {
		t.Errorf("ScoreboardCount = %d, want 2", v2.ScoreboardCount)
	}
}

// TestArenaRooms_PanelNeverOrdinalOrSource — panel-участник всегда
// this_ordinal=0, is_source=false, не считается при вычислении ordinals
// табло.
func TestArenaRooms_PanelNeverOrdinalOrSource(t *testing.T) {
	r := newArenaRooms()
	scoreboard := r.join("a1", domain.ScoreboardRoleScoreboard)
	panel := r.join("a1", domain.ScoreboardRolePanel)

	vPanel := r.view("a1", panel)
	if vPanel.ThisOrdinal != 0 || vPanel.ThisIsSource {
		t.Errorf("panel view = %+v, want ordinal 0, not source", vPanel)
	}
	if vPanel.ScoreboardCount != 1 {
		t.Errorf("ScoreboardCount (panel view) = %d, want 1 (panel not counted)", vPanel.ScoreboardCount)
	}

	vScoreboard := r.view("a1", scoreboard)
	if vScoreboard.ThisOrdinal != 1 || !vScoreboard.ThisIsSource {
		t.Errorf("scoreboard view = %+v, want ordinal 1 + source", vScoreboard)
	}
}

// TestArenaRooms_LastScoreboardLeavingClearsFrame — отключение последнего
// табло из комнаты → следующий frame() видит отсутствие закешированного
// кадра (таймер «умер»), даже если панель осталась подключена.
func TestArenaRooms_LastScoreboardLeavingClearsFrame(t *testing.T) {
	r := newArenaRooms()
	scoreboard := r.join("a1", domain.ScoreboardRoleScoreboard)
	panel := r.join("a1", domain.ScoreboardRolePanel)

	r.publishFrame("a1", domain.TimerFrame{Status: domain.TimerStatusRunning, RemainingCS: 1234})
	if _, ok := r.frame("a1"); !ok {
		t.Fatalf("expected cached frame after publishFrame")
	}

	r.leave("a1", scoreboard)

	if _, ok := r.frame("a1"); ok {
		t.Fatalf("expected no cached frame after last scoreboard left")
	}

	// Панель ещё в комнате — комната не удалена целиком, но табло 0.
	v := r.view("a1", panel)
	if v.ScoreboardCount != 0 {
		t.Errorf("ScoreboardCount = %d, want 0", v.ScoreboardCount)
	}

	r.leave("a1", panel)
	// Комната опустела целиком — view для несуществующей комнаты возвращает
	// нулевое значение.
	v2 := r.view("a1", nil)
	if v2.ScoreboardCount != 0 || v2.SidesSwapped {
		t.Errorf("view after room emptied = %+v, want zero value", v2)
	}
}

// TestArenaRooms_PublishFrameCachesAndSignalsAll — PublishTimerFrame от
// любого участника кладёт кадр в кеш комнаты и сигналит всем boardCh.
func TestArenaRooms_PublishFrameCachesAndSignalsAll(t *testing.T) {
	r := newArenaRooms()
	scoreboard := r.join("a1", domain.ScoreboardRoleScoreboard)
	panel := r.join("a1", domain.ScoreboardRolePanel)

	frame := domain.TimerFrame{Status: domain.TimerStatusPaused, RemainingCS: 500, DefaultCS: 9000}
	r.publishFrame("a1", frame)

	got, ok := r.frame("a1")
	if !ok || got != frame {
		t.Fatalf("frame() = %+v, %v, want %+v, true", got, ok, frame)
	}

	select {
	case <-scoreboard.boardCh:
	default:
		t.Errorf("expected scoreboard.boardCh signaled")
	}
	select {
	case <-panel.boardCh:
	default:
		t.Errorf("expected panel.boardCh signaled")
	}
}

// TestArenaRooms_RelayCommandGoesOnlyToSource — команда приходит только
// текущему источнику через его cmdCh, не другим табло/панелям.
func TestArenaRooms_RelayCommandGoesOnlyToSource(t *testing.T) {
	r := newArenaRooms()
	source := r.join("a1", domain.ScoreboardRoleScoreboard)
	follower := r.join("a1", domain.ScoreboardRoleScoreboard)
	panel := r.join("a1", domain.ScoreboardRolePanel)

	cmd := domain.TimerCommand{Kind: domain.TimerCommandStart}
	r.relayCommand("a1", cmd)

	select {
	case got := <-source.cmdCh:
		if got != cmd {
			t.Errorf("source got %+v, want %+v", got, cmd)
		}
	default:
		t.Fatalf("expected command delivered to source")
	}
	select {
	case got := <-follower.cmdCh:
		t.Errorf("follower unexpectedly got command: %+v", got)
	default:
	}
	select {
	case got := <-panel.cmdCh:
		t.Errorf("panel unexpectedly got command: %+v", got)
	default:
	}
}

// TestArenaRooms_RelayCommandNoScoreboardsIsNoop — нет табло в комнате →
// no-op, ничего не паникует (в т.ч. для несуществующей комнаты).
func TestArenaRooms_RelayCommandNoScoreboardsIsNoop(t *testing.T) {
	r := newArenaRooms()
	r.relayCommand("does-not-exist", domain.TimerCommand{Kind: domain.TimerCommandPause})

	panel := r.join("a1", domain.ScoreboardRolePanel)
	r.relayCommand("a1", domain.TimerCommand{Kind: domain.TimerCommandPause})
	select {
	case got := <-panel.cmdCh:
		t.Errorf("panel unexpectedly got command: %+v", got)
	default:
	}
}

// TestArenaRooms_SetSwappedSavesAndSignals — сохраняет swapped, сигналит
// всех.
func TestArenaRooms_SetSwappedSavesAndSignals(t *testing.T) {
	r := newArenaRooms()
	scoreboard := r.join("a1", domain.ScoreboardRoleScoreboard)

	r.setSwapped("a1", true)

	v := r.view("a1", scoreboard)
	if !v.SidesSwapped {
		t.Errorf("SidesSwapped = %v, want true", v.SidesSwapped)
	}
	select {
	case <-scoreboard.boardCh:
	default:
		t.Errorf("expected scoreboard.boardCh signaled")
	}
}

func TestArenaRooms_RevealCurrentBoutIncrementsAndSignalsAll(t *testing.T) {
	r := newArenaRooms()
	scoreboard := r.join("a1", domain.ScoreboardRoleScoreboard)
	panel := r.join("a1", domain.ScoreboardRolePanel)

	if v := r.view("a1", scoreboard); v.RevealGeneration != 0 {
		t.Fatalf("initial RevealGeneration = %d, want 0", v.RevealGeneration)
	}

	r.revealCurrentBout("a1")

	if v := r.view("a1", scoreboard); v.RevealGeneration != 1 {
		t.Errorf("RevealGeneration after one reveal = %d, want 1", v.RevealGeneration)
	}
	select {
	case <-scoreboard.boardCh:
	default:
		t.Errorf("expected scoreboard.boardCh signaled")
	}
	select {
	case <-panel.boardCh:
	default:
		t.Errorf("expected panel.boardCh signaled too (broadcast, like sides_swapped)")
	}

	r.revealCurrentBout("a1")
	if v := r.view("a1", scoreboard); v.RevealGeneration != 2 {
		t.Errorf("RevealGeneration after second reveal = %d, want 2 (monotonic)", v.RevealGeneration)
	}
}

func TestArenaRooms_RevealCurrentBoutNoRoomIsNoop(t *testing.T) {
	r := newArenaRooms()
	// No panic, no-op: no room exists for this arena yet.
	r.revealCurrentBout("no-such-arena")
}

// TestArenaRooms_ConcurrentJoinLeavePublish — конкурентный join/leave/publish
// под go test -race не должен падать/гонки.
func TestArenaRooms_ConcurrentJoinLeavePublish(t *testing.T) {
	r := newArenaRooms()
	const n = 50
	var wg sync.WaitGroup

	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			role := domain.ScoreboardRoleScoreboard
			if i%2 == 0 {
				role = domain.ScoreboardRolePanel
			}
			m := r.join("arena-race", role)
			r.publishFrame("arena-race", domain.TimerFrame{Status: domain.TimerStatusRunning, RemainingCS: int32(i)})
			r.relayCommand("arena-race", domain.TimerCommand{Kind: domain.TimerCommandAdjust, AmountSeconds: int32(i)})
			r.setSwapped("arena-race", i%2 == 0)
			_ = r.view("arena-race", m)
			_, _ = r.frame("arena-race")
			r.leave("arena-race", m)
		}(i)
	}
	wg.Wait()
}
