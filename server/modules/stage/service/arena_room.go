// Спека 0015 / ADR 0013 — недоменный таймер табло арены: сервер не считает
// таймер сам, а выступает тупым реле. Этот файл реализует «комнату» —
// эфемерную (в памяти процесса, без PG) структуру на одну арену: список
// подключённых табло (SCOREBOARD) и панелей (PANEL), ordinals табло
// (вычисляются на лету из позиции в слайсе — реиндексация при отключении
// получается бесплатно), последний присланный источником TimerFrame (кеш
// реле) и эфемерный swap сторон. Комната живёт, пока в ней есть хотя бы
// один участник (табло или панель), и вместе с ней умирает закешированный
// кадр.
//
// Источник комнаты — первое табло, а если табло нет ни одного — первая
// панель (фоллбэк). Это уточнение ADR 0013 §1/§4, внесённое по итогам
// полевых тестов: раньше панель источником быть не могла в принципе, и
// стоило секретарю закрыть вкладку табло, как кнопки Старт/Пауза/Сброс
// начинали молча улетать в никуда. Табло по-прежнему главнее: подключившись,
// оно перехватывает источник у панели. Кадр при этом переживает и перехват,
// и уход последнего табло — новому источнику есть чем засеяться, и идущий
// отсчёт не обнуляется в момент смены.
package service

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/hema/server/modules/stage/domain"
)

// roomMember — один подключённый участник (табло или панель) живой комнаты
// арены. boardCh — сигнал «перечитай ArenaLive» (буфер 1, неблокирующая
// отправка, коалесинг допустим — как pkg/livebus: подписчику важно только
// «что-то изменилось», а не сколько раз). cmdCh — команды панели,
// адресованные табло-источнику (буфер 8, неблокирующая отправка): команды —
// редкие нажатия кнопок человеком, коалесинг тут недопустим по смыслу (нельзя
// потерять отдельное нажатие), но при разумном буфере переполнение
// практически недостижимо — осознанный компромисс, не строгая гарантия
// доставки (см. relayCommand).
type roomMember struct {
	role    domain.ScoreboardRole
	boardCh chan struct{}
	cmdCh   chan domain.TimerCommand
}

// arenaRoom — состояние живой комнаты одной арены (спека 0015).
// scoreboards — упорядоченный слайс подключённых табло: позиция+1 = ordinal.
// panels — подключённые панели управления: в нумерации табло не участвуют
// (всегда this_ordinal=0), но первая из них становится источником, если
// табло в комнате нет вовсе (см. source).
type arenaRoom struct {
	scoreboards      []*roomMember
	panels           []*roomMember
	lastFrame        *domain.TimerFrame
	sidesSwapped     bool
	revealGeneration int32
}

// source — текущий источник таймера комнаты: первое табло, иначе первая
// панель (фоллбэк), иначе nil (комната пуста). Единственное место, где
// выражен приоритет ролей — view/relayCommand/сигналы читают только его,
// чтобы условие «есть ли табло» не размножилось по файлу.
func (room *arenaRoom) source() *roomMember {
	if len(room.scoreboards) > 0 {
		return room.scoreboards[0]
	}
	if len(room.panels) > 0 {
		return room.panels[0]
	}
	return nil
}

// arenaRooms — реестр живых комнат по arenaID (спека 0015, ADR 0013):
// комната создаётся лениво при первом Join и удаляется, когда пустеет
// (эфемерно, никакого PG). Единый мьютекс на весь реестр — участников одной
// арены обычно единицы (пара табло + панель), контеншн не проблема; так
// проще избежать двухуровневых гонок между удалением комнаты и join,
// подключающимся к ней же в этот момент.
type arenaRooms struct {
	mu    sync.Mutex
	rooms map[string]*arenaRoom
}

// newArenaRooms создаёт пустой реестр живых комнат табло арен.
func newArenaRooms() *arenaRooms {
	return &arenaRooms{rooms: make(map[string]*arenaRoom)}
}

// join подключает участника к комнате арены, создавая её лениво при первом
// участнике. Вход ТАБЛО сигналит остальных: меняется scoreboard_count у
// всех, а если источником была панель — ещё и this_is_source (перехват).
// Вход панели ничей view не меняет и потому не сигналит. Сам вошедший
// намеренно не сигналится: WatchArenaBoard и так шлёт ему первый снапшот
// сразу после join, и разбуженный boardCh дал бы немедленный дубль.
func (r *arenaRooms) join(arenaID string, role domain.ScoreboardRole) *roomMember {
	r.mu.Lock()
	defer r.mu.Unlock()

	room, ok := r.rooms[arenaID]
	if !ok {
		room = &arenaRoom{}
		r.rooms[arenaID] = room
	}
	m := &roomMember{
		role:    role,
		boardCh: make(chan struct{}, 1),
		cmdCh:   make(chan domain.TimerCommand, 8),
	}
	if role == domain.ScoreboardRoleScoreboard {
		room.scoreboards = append(room.scoreboards, m)
		signalOthers(room, m)
	} else {
		room.panels = append(room.panels, m)
	}
	return m
}

// leave отключает участника от комнаты арены. Сигналим оставшихся, если у
// них могло измениться видимое состояние: уход ТАБЛО меняет
// scoreboard_count (и часто источник), уход панели-источника повышает
// следующую панель. Уход рядовой панели не меняет ничего — молчим.
// Закешированный кадр при этом НЕ сбрасывается: повышаемому источнику надо
// чем-то засеяться, иначе идущий отсчёт обнулился бы ровно в момент, когда
// оператор закрыл табло. Кадр умирает вместе с комнатой — когда та опустела
// целиком (ни табло, ни панелей) и удаляется из реестра (эфемерность,
// ADR 0013).
func (r *arenaRooms) leave(arenaID string, m *roomMember) {
	r.mu.Lock()
	defer r.mu.Unlock()

	room, ok := r.rooms[arenaID]
	if !ok {
		return
	}
	sourceBefore := room.source()
	switch m.role {
	case domain.ScoreboardRoleScoreboard:
		room.scoreboards = removeMember(room.scoreboards, m)
	default:
		room.panels = removeMember(room.panels, m)
	}
	if len(room.scoreboards) == 0 && len(room.panels) == 0 {
		delete(r.rooms, arenaID)
		return
	}
	if m.role == domain.ScoreboardRoleScoreboard || sourceBefore != room.source() {
		// Уходящий уже удалён из слайса, поэтому signalAll его не задевает.
		signalAll(room)
	}
}

// publishFrame кеширует присланный источником кадр таймера и сигналит всех
// участников комнаты (спека 0015, ADR 0013: сервер не проверяет, что
// вызывающий действительно источник — proto PublishTimerFrame физически не
// несёт id конкретного stream-соединения; дисциплина «публикует только
// табло №1» — ответственность клиента). No-op, если у арены сейчас нет
// комнаты (никто не подключён к WatchArenaBoard).
func (r *arenaRooms) publishFrame(arenaID string, frame domain.TimerFrame) {
	r.mu.Lock()
	defer r.mu.Unlock()

	room, ok := r.rooms[arenaID]
	if !ok {
		return
	}
	f := frame
	room.lastFrame = &f
	signalAll(room)
}

// relayCommand доставляет команду ТОЛЬКО текущему источнику комнаты (см.
// source: табло ordinal 1, иначе первая панель). No-op, если комнаты нет —
// некому передать команду. Если источник — сама панель, приславшая команду,
// получается замкнутая петля «панель → сервер → та же панель»: так и
// задумано, путь применения команд один для любой роли.
func (r *arenaRooms) relayCommand(arenaID string, cmd domain.TimerCommand) {
	r.mu.Lock()
	defer r.mu.Unlock()

	room, ok := r.rooms[arenaID]
	if !ok {
		return
	}
	src := room.source()
	if src == nil {
		return
	}
	select {
	case src.cmdCh <- cmd:
	default:
		// Буфер (8) переполнен — с учётом частоты нажатий кнопок человеком
		// практически недостижимо; роняем команду, не блокируя вызывающего
		// (см. комментарий у roomMember.cmdCh).
	}
}

// setSwapped сохраняет эфемерный swap сторон комнаты и сигналит всех
// участников. No-op, если у арены сейчас нет комнаты.
func (r *arenaRooms) setSwapped(arenaID string, swapped bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	room, ok := r.rooms[arenaID]
	if !ok {
		return
	}
	room.sidesSwapped = swapped
	signalAll(room)
}

// revealCurrentBout инкрементирует эфемерный счётчик «покажи текущий бой»
// комнаты и сигналит всех участников (спека 0015, RevealCurrentBout):
// табло, увидев рост счётчика, снимает удержание прошлого боя независимо
// от его состояния (см. domain-комментарий у ScoreboardRoom). Чисто
// отображенческий сигнал — домен не трогает. No-op, если у арены сейчас
// нет комнаты.
func (r *arenaRooms) revealCurrentBout(arenaID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	room, ok := r.rooms[arenaID]
	if !ok {
		return
	}
	room.revealGeneration++
	signalAll(room)
}

// signalBoardChanged сигналит всех участников комнаты (доска/бой могли
// измениться — вызывается сервисом рядом с liveBus.PublishNominationChanged
// у board-мутирующих методов, T11). No-op, если у арены сейчас нет комнаты.
func (r *arenaRooms) signalBoardChanged(arenaID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	room, ok := r.rooms[arenaID]
	if !ok {
		return
	}
	signalAll(room)
}

// view возвращает ScoreboardRoom с точки зрения участника m: nil — сторонний
// наблюдатель (unary-вызов PublishTimerFrame/ControlArenaTimer/
// SetScoreboardSides — не участник стрима), this_ordinal=0/this_is_source=
// false, но scoreboard_count/sides_swapped — реальные значения комнаты.
func (r *arenaRooms) view(arenaID string, m *roomMember) domain.ScoreboardRoom {
	r.mu.Lock()
	defer r.mu.Unlock()

	room, ok := r.rooms[arenaID]
	if !ok {
		return domain.ScoreboardRoom{}
	}
	out := domain.ScoreboardRoom{
		ScoreboardCount:  len(room.scoreboards),
		SidesSwapped:     room.sidesSwapped,
		RevealGeneration: room.revealGeneration,
	}
	if m != nil && m.role == domain.ScoreboardRoleScoreboard {
		for i, x := range room.scoreboards {
			if x == m {
				out.ThisOrdinal = i + 1
				break
			}
		}
	}
	// Источник считается одинаково для обеих ролей (см. source), а ordinal
	// остаётся нумерацией табло: у панели-фоллбэка он 0. Пара
	// (ScoreboardCount == 0, ThisIsSource) — это и есть код «табло не
	// подключено, таймер идёт на этом экране».
	out.ThisIsSource = m != nil && room.source() == m
	return out
}

// frame возвращает закешированный кадр комнаты и признак его наличия
// (false, если комнаты нет или источник ещё ничего не прислал).
func (r *arenaRooms) frame(arenaID string) (domain.TimerFrame, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	room, ok := r.rooms[arenaID]
	if !ok || room.lastFrame == nil {
		return domain.TimerFrame{}, false
	}
	return *room.lastFrame, true
}

// removeMember удаляет m из упорядоченного списка участников, сохраняя
// порядок оставшихся (ordinal остальных пересчитывается на лету при
// следующем чтении — см. view).
func removeMember(list []*roomMember, m *roomMember) []*roomMember {
	for i, x := range list {
		if x == m {
			return append(list[:i:i], list[i+1:]...)
		}
	}
	return list
}

// signalAll неблокирующе сигналит boardCh всех участников комнаты (табло и
// панелей).
func signalAll(room *arenaRoom) {
	signalOthers(room, nil)
}

// signalOthers — то же, но минуя skip (nil — никого не пропускать). Нужен
// на join: вошедшему WatchArenaBoard и так шлёт первый снапшот сам, и
// разбуженный boardCh заставил бы стрим немедленно отправить второй,
// идентичный.
func signalOthers(room *arenaRoom, skip *roomMember) {
	for _, m := range room.scoreboards {
		if m != skip {
			trySignal(m.boardCh)
		}
	}
	for _, m := range room.panels {
		if m != skip {
			trySignal(m.boardCh)
		}
	}
}

func trySignal(ch chan struct{}) {
	select {
	case ch <- struct{}{}:
	default:
	}
}

// ---------------------------------------------------------------------
// Публичный API сервиса (вызывается api-слоем, спека 0015 T12).
// ---------------------------------------------------------------------

// ArenaBoardMember — хендл подключённого участника комнаты арены (спека
// 0015): держит канал сигналов «доска/таймер/комната могли измениться» и
// канал команд таймера (заполняется только если участник — текущий
// источник). Возвращается Service.JoinArenaBoard; вызывающий (api-слой,
// WatchArenaBoard) обязан вызвать Leave() по завершении стрима — иначе
// участник останется в комнате навсегда (утечка).
type ArenaBoardMember struct {
	arenaID string
	member  *roomMember
	rooms   *arenaRooms
}

// BoardChanged — канал сигналов «перечитай ArenaLive» (доска/таймер/состав
// комнаты/swap могли измениться).
func (m *ArenaBoardMember) BoardChanged() <-chan struct{} { return m.member.boardCh }

// Commands — канал команд таймера, адресованных этому участнику (реально
// наполняется только если участник — текущий источник, ordinal 1 среди
// табло; для панелей и не-источников остаётся пустым).
func (m *ArenaBoardMember) Commands() <-chan domain.TimerCommand { return m.member.cmdCh }

// Leave отключает участника от комнаты арены. Вызывающий (api-слой) вызывает
// её ровно один раз через defer по завершении стрима.
func (m *ArenaBoardMember) Leave() { m.rooms.leave(m.arenaID, m.member) }

// JoinArenaBoard подключает нового участника к живой комнате арены (спека
// 0015): роль SCOREBOARD — табло (участвует в ordinal/source), PANEL —
// панель управления (this_ordinal всегда 0, никогда не источник). Комната
// создаётся лениво при первом участнике. Вызывающий (api-слой,
// WatchArenaBoard) обязан вызвать member.Leave() по завершении стрима.
func (s *Service) JoinArenaBoard(arenaID string, role domain.ScoreboardRole) *ArenaBoardMember {
	arenaID = strings.TrimSpace(arenaID)
	m := s.rooms.join(arenaID, role)
	return &ArenaBoardMember{arenaID: arenaID, member: m, rooms: s.rooms}
}

// ArenaLive собирает живой снапшот табло арены целиком (спека 0015): board —
// как GetBoutBoard (переиспользуется как есть, не дублирует логику сборки
// доски); timer — последний закешированный кадр комнаты, либо синтетическое
// значение (STOPPED, remaining=default), если источник ещё ничего не
// прислал; room — состав комнаты с точки зрения member (nil — сторонний
// наблюдатель, не участник стрима — например unary-вызовы
// PublishTimerFrame/ControlArenaTimer/SetScoreboardSides);
// default_duration_seconds — персистентный дефолт арены (модуль arena,
// через ArenaProvider — вызывается всегда, не только при пустом кадре);
// server_now_unix_ms — опора клиентской синхронизации часов.
func (s *Service) ArenaLive(ctx context.Context, arenaID string, member *ArenaBoardMember) (domain.ArenaLiveSnapshot, error) {
	arenaID = strings.TrimSpace(arenaID)
	if arenaID == "" {
		return domain.ArenaLiveSnapshot{}, domain.ErrInvalidInput
	}
	board, err := s.GetBoutBoard(ctx, arenaID)
	if err != nil {
		return domain.ArenaLiveSnapshot{}, err
	}
	defaultSeconds, err := s.arenas.DefaultDurationSeconds(ctx, arenaID)
	if err != nil {
		return domain.ArenaLiveSnapshot{}, err
	}
	defaultCS := int32(defaultSeconds) * 100

	timer, ok := s.rooms.frame(arenaID)
	if !ok {
		timer = domain.TimerFrame{Status: domain.TimerStatusStopped, RemainingCS: defaultCS, DefaultCS: defaultCS}
	}

	var rm *roomMember
	if member != nil {
		rm = member.member
	}
	room := s.rooms.view(arenaID, rm)

	return domain.ArenaLiveSnapshot{
		Board:                  board,
		Timer:                  timer,
		Room:                   room,
		DefaultDurationSeconds: int32(defaultSeconds),
		ServerNowUnixMS:        time.Now().UnixMilli(),
	}, nil
}

// PublishTimerFrame — авторитетное табло присылает полное состояние таймера
// (спека 0015, ADR 0013 «сервер — тупое реле»): кешируется и
// ретранслируется всем подписчикам комнаты без проверки личности вызывающего
// (см. arenaRooms.publishFrame). Возвращает актуальный снапшот (глазами
// стороннего наблюдателя — вызов unary, не стрима).
func (s *Service) PublishTimerFrame(ctx context.Context, arenaID string, frame domain.TimerFrame) (domain.ArenaLiveSnapshot, error) {
	arenaID = strings.TrimSpace(arenaID)
	if arenaID == "" {
		return domain.ArenaLiveSnapshot{}, domain.ErrInvalidInput
	}
	s.rooms.publishFrame(arenaID, frame)
	return s.ArenaLive(ctx, arenaID, nil)
}

// ControlArenaTimer ретранслирует команду панели текущему источнику таймера
// (табло ordinal 1); само значение таймера сервер не меняет. No-op, если в
// комнате нет ни одного табло (см. arenaRooms.relayCommand).
func (s *Service) ControlArenaTimer(ctx context.Context, arenaID string, cmd domain.TimerCommand) (domain.ArenaLiveSnapshot, error) {
	arenaID = strings.TrimSpace(arenaID)
	if arenaID == "" {
		return domain.ArenaLiveSnapshot{}, domain.ErrInvalidInput
	}
	s.rooms.relayCommand(arenaID, cmd)
	return s.ArenaLive(ctx, arenaID, nil)
}

// SetScoreboardSides — эфемерный swap синий/красный комнаты арены (спека
// 0015, FR-6): не персистится, сбрасывается вместе с комнатой (когда та
// опустевает).
func (s *Service) SetScoreboardSides(ctx context.Context, arenaID string, swapped bool) (domain.ArenaLiveSnapshot, error) {
	arenaID = strings.TrimSpace(arenaID)
	if arenaID == "" {
		return domain.ArenaLiveSnapshot{}, domain.ErrInvalidInput
	}
	s.rooms.setSwapped(arenaID, swapped)
	return s.ArenaLive(ctx, arenaID, nil)
}

// RevealCurrentBout — секретарь явно показывает на всех подключённых табло
// текущий бой пула (спека 0015, UX-уточнение): развязывает «оглашение
// результата» (FinishCurrentBout) и «переход к следующему бою на табло» на
// разные действия панели. Инкрементирует эфемерный счётчик комнаты и
// сигналит всех участников; сам bout/pool/board не трогает (не домен).
func (s *Service) RevealCurrentBout(ctx context.Context, arenaID string) (domain.ArenaLiveSnapshot, error) {
	arenaID = strings.TrimSpace(arenaID)
	if arenaID == "" {
		return domain.ArenaLiveSnapshot{}, domain.ErrInvalidInput
	}
	s.rooms.revealCurrentBout(arenaID)
	return s.ArenaLive(ctx, arenaID, nil)
}

// signalArenaBoard сигналит комнату арены (спека 0015): вызывается рядом с
// s.liveBus.PublishNominationChanged в каждом board-мутирующем методе
// (SeatPoolOnArena/UnseatPool/SetCurrentBout/StartCurrentBout/
// ScoreCurrentBout/FinishCurrentBout/ReopenCurrentBout/ResetCurrentBout,
// T11). No-op, если arenaID пуст или у арены сейчас нет комнаты — сигналить
// некого.
func (s *Service) signalArenaBoard(arenaID string) {
	arenaID = strings.TrimSpace(arenaID)
	if arenaID == "" {
		return
	}
	s.rooms.signalBoardChanged(arenaID)
}
