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

// TestArenaRooms_PanelHasNoOrdinalAndYieldsSourceToScoreboard — пока в
// комнате есть хотя бы одно табло, panel-участник всегда this_ordinal=0,
// is_source=false и не считается при вычислении ordinals табло. (Без табло
// панель становится фоллбэк-источником — см.
// TestArenaRooms_PanelIsSourceWhenNoScoreboards.)
func TestArenaRooms_PanelHasNoOrdinalAndYieldsSourceToScoreboard(t *testing.T) {
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

// TestArenaRooms_LastScoreboardLeavingPromotesPanelAndKeepsFrame —
// отключение последнего табло больше НЕ убивает таймер: оставшаяся панель
// становится фоллбэк-источником, закешированный кадр сохраняется (чтобы ей
// было чем засеяться — «время переезжает»), и она получает сигнал о
// повышении. Кадр умирает только вместе с комнатой, когда та пустеет.
func TestArenaRooms_LastScoreboardLeavingPromotesPanelAndKeepsFrame(t *testing.T) {
	r := newArenaRooms()
	scoreboard := r.join("a1", domain.ScoreboardRoleScoreboard)
	panel := r.join("a1", domain.ScoreboardRolePanel)

	r.publishFrame("a1", domain.TimerFrame{Status: domain.TimerStatusRunning, RemainingCS: 1234})
	if _, ok := r.frame("a1"); !ok {
		t.Fatalf("expected cached frame after publishFrame")
	}
	drain(panel.boardCh)

	r.leave("a1", scoreboard)

	got, ok := r.frame("a1")
	if !ok {
		t.Fatalf("expected cached frame to survive the last scoreboard leaving")
	}
	if got.RemainingCS != 1234 {
		t.Errorf("frame after promotion = %+v, want RemainingCS 1234", got)
	}

	v := r.view("a1", panel)
	if v.ScoreboardCount != 0 {
		t.Errorf("ScoreboardCount = %d, want 0", v.ScoreboardCount)
	}
	if !v.ThisIsSource {
		t.Errorf("panel view = %+v, want ThisIsSource after the last scoreboard left", v)
	}
	if v.ThisOrdinal != 0 {
		t.Errorf("panel ThisOrdinal = %d, want 0 even as fallback source", v.ThisOrdinal)
	}
	if !signalled(panel.boardCh) {
		t.Errorf("expected the promoted panel to be signalled")
	}

	r.leave("a1", panel)
	// Комната опустела целиком — view для несуществующей комнаты возвращает
	// нулевое значение, кадр умер вместе с ней.
	v2 := r.view("a1", nil)
	if v2.ScoreboardCount != 0 || v2.SidesSwapped {
		t.Errorf("view after room emptied = %+v, want zero value", v2)
	}
	if _, ok := r.frame("a1"); ok {
		t.Fatalf("expected no cached frame after the room emptied")
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

// TestArenaRooms_PanelIsSourceWhenNoScoreboards — в комнате без табло
// источником становится первая панель (фоллбэк): ordinal у неё по-прежнему
// 0 (нумерация — про табло, FR-12), ScoreboardCount тоже 0, и именно эта
// пара значений кодирует для клиента «таймер идёт на этом экране».
func TestArenaRooms_PanelIsSourceWhenNoScoreboards(t *testing.T) {
	r := newArenaRooms()
	first := r.join("a1", domain.ScoreboardRolePanel)
	second := r.join("a1", domain.ScoreboardRolePanel)

	v1 := r.view("a1", first)
	if !v1.ThisIsSource {
		t.Errorf("first panel view = %+v, want ThisIsSource", v1)
	}
	if v1.ThisOrdinal != 0 || v1.ScoreboardCount != 0 {
		t.Errorf("first panel view = %+v, want ordinal 0 + ScoreboardCount 0", v1)
	}

	v2 := r.view("a1", second)
	if v2.ThisIsSource {
		t.Errorf("second panel view = %+v, want not source", v2)
	}
}

// TestArenaRooms_RelayCommandGoesToPanelWhenNoScoreboards — команда
// доставляется панели-фоллбэку, когда табло в комнате нет (иначе кнопки
// Старт/Пауза/Сброс не работают вообще). Только первой панели; несуществующая
// комната по-прежнему no-op.
func TestArenaRooms_RelayCommandGoesToPanelWhenNoScoreboards(t *testing.T) {
	r := newArenaRooms()
	r.relayCommand("does-not-exist", domain.TimerCommand{Kind: domain.TimerCommandPause})

	first := r.join("a1", domain.ScoreboardRolePanel)
	second := r.join("a1", domain.ScoreboardRolePanel)
	r.relayCommand("a1", domain.TimerCommand{Kind: domain.TimerCommandPause})

	select {
	case got := <-first.cmdCh:
		if got.Kind != domain.TimerCommandPause {
			t.Errorf("first panel got %+v, want PAUSE", got)
		}
	default:
		t.Errorf("expected the fallback source panel to receive the command")
	}
	select {
	case got := <-second.cmdCh:
		t.Errorf("second panel unexpectedly got command: %+v", got)
	default:
	}
}

// TestArenaRooms_ScoreboardJoinTakesOverSourceFromPanel — табло всегда
// главнее: подключившись в комнату, где источником была панель, оно
// перехватывает источник, панель узнаёт об этом сигналом, а закешированный
// кадр переживает перехват (новому источнику есть чем засеяться).
func TestArenaRooms_ScoreboardJoinTakesOverSourceFromPanel(t *testing.T) {
	r := newArenaRooms()
	panel := r.join("a1", domain.ScoreboardRolePanel)
	r.publishFrame("a1", domain.TimerFrame{Status: domain.TimerStatusRunning, RemainingCS: 4500})
	drain(panel.boardCh)

	scoreboard := r.join("a1", domain.ScoreboardRoleScoreboard)

	vPanel := r.view("a1", panel)
	if vPanel.ThisIsSource {
		t.Errorf("panel view = %+v, want demoted once a scoreboard joined", vPanel)
	}
	vScoreboard := r.view("a1", scoreboard)
	if vScoreboard.ThisOrdinal != 1 || !vScoreboard.ThisIsSource {
		t.Errorf("scoreboard view = %+v, want ordinal 1 + source", vScoreboard)
	}
	if !signalled(panel.boardCh) {
		t.Errorf("expected the demoted panel to be signalled about the takeover")
	}
	got, ok := r.frame("a1")
	if !ok || got.RemainingCS != 4500 {
		t.Errorf("frame after takeover = %+v (ok=%v), want RemainingCS 4500", got, ok)
	}
}

// TestArenaRooms_PanelJoinDoesNotSignalOthers — вход панели ничего не
// меняет в чужом view (панели не считаются, источник прежний), поэтому
// сигнала быть не должно: лишний сигнал — это лишний дубль-снапшот в каждом
// открытом стриме.
func TestArenaRooms_PanelJoinDoesNotSignalOthers(t *testing.T) {
	r := newArenaRooms()
	scoreboard := r.join("a1", domain.ScoreboardRoleScoreboard)
	drain(scoreboard.boardCh)

	r.join("a1", domain.ScoreboardRolePanel)

	if signalled(scoreboard.boardCh) {
		t.Errorf("scoreboard unexpectedly signalled by a panel joining")
	}
}

// TestArenaRooms_JoiningScoreboardIsNotSelfSignalled — вошедший сам уже
// получает первый снапшот от WatchArenaBoard; разбудить вдобавок его
// boardCh значило бы немедленно отправить второй идентичный кадр.
func TestArenaRooms_JoiningScoreboardIsNotSelfSignalled(t *testing.T) {
	r := newArenaRooms()
	r.join("a1", domain.ScoreboardRolePanel)

	scoreboard := r.join("a1", domain.ScoreboardRoleScoreboard)

	if signalled(scoreboard.boardCh) {
		t.Errorf("joining scoreboard unexpectedly signalled itself")
	}
}

// TestArenaRooms_SourcePanelLeavingPromotesNextPanel — уход панели-источника
// повышает следующую панель и сигналит ей (без этого она молча считала бы
// себя ведомой).
func TestArenaRooms_SourcePanelLeavingPromotesNextPanel(t *testing.T) {
	r := newArenaRooms()
	first := r.join("a1", domain.ScoreboardRolePanel)
	second := r.join("a1", domain.ScoreboardRolePanel)
	drain(second.boardCh)

	r.leave("a1", first)

	v := r.view("a1", second)
	if !v.ThisIsSource {
		t.Errorf("second panel view = %+v, want promoted to source", v)
	}
	if !signalled(second.boardCh) {
		t.Errorf("expected the promoted panel to be signalled")
	}
}

// TestArenaRooms_NonSourcePanelLeavingDoesNotSignal — уход рядовой панели
// ничей view не меняет, сигналить некого.
func TestArenaRooms_NonSourcePanelLeavingDoesNotSignal(t *testing.T) {
	r := newArenaRooms()
	scoreboard := r.join("a1", domain.ScoreboardRoleScoreboard)
	panel := r.join("a1", domain.ScoreboardRolePanel)
	second := r.join("a1", domain.ScoreboardRolePanel)
	drain(scoreboard.boardCh)
	drain(panel.boardCh)

	r.leave("a1", second)

	if signalled(scoreboard.boardCh) {
		t.Errorf("scoreboard unexpectedly signalled by a non-source panel leaving")
	}
	if signalled(panel.boardCh) {
		t.Errorf("panel unexpectedly signalled by a non-source panel leaving")
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

// drain опустошает канал сигналов, чтобы последующая проверка signalled
// относилась именно к изучаемому действию, а не к предыдущим.
func drain(ch chan struct{}) {
	select {
	case <-ch:
	default:
	}
}

// signalled — был ли сигнал «перечитай ArenaLive» доставлен в этот канал.
func signalled(ch chan struct{}) bool {
	select {
	case <-ch:
		return true
	default:
		return false
	}
}
