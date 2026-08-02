// Package service содержит бизнес-логику модуля pool (юзкейсы, спека 0009,
// расширено спекой 0011 — постановка пула на арену, спекой 0013 — ведение
// текущего боя).
package service

import (
	"context"
	"sort"
	"strings"

	"github.com/hema/server/modules/stage/domain"
)

// Service реализует юзкейсы раскладки бойцов по пулам. Зависит от портов,
// не от pg/proto.
type Service struct {
	repo        domain.Repository
	fighters    domain.ActiveFightersProvider
	bouts       domain.BoutConductor
	arenas      domain.ArenaProvider
	nominations domain.NominationProvider
	liveBus     domain.LiveBus
	// rooms — реестр живых комнат табло арен (спека 0015, ADR 0013):
	// недоменный таймер-реле, целиком в памяти процесса (эфемерно, без PG).
	// Живёт внутри Service — наружу (Deps/module.go) новых зависимостей не
	// требует, см. arena_room.go.
	rooms *arenaRooms
}

// New создаёт сервис pool. liveBus — порт живой шины (спека 0014, ADR
// 0012): Service — единственный держатель этой зависимости в модуле, api-
// слой обращается к подписке через passthrough-метод Service.SubscribeNomination.
func New(repo domain.Repository, fighters domain.ActiveFightersProvider, bouts domain.BoutConductor, arenas domain.ArenaProvider, nominations domain.NominationProvider, liveBus domain.LiveBus) *Service {
	return &Service{repo: repo, fighters: fighters, bouts: bouts, arenas: arenas, nominations: nominations, liveBus: liveBus, rooms: newArenaRooms()}
}

// GetLayout возвращает раскладку номинации (lazy-init + реконсиляция с
// активным ростером fighter, FR-12/FR-14/FR-15).
func (s *Service) GetLayout(ctx context.Context, nominationID string) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	return s.loadLayout(ctx, nominationID)
}

// CreatePool создаёт пул с наименьшим свободным номером в этапе номинации
// (FR-3). Только в draft. Первый мутирующий вызов на номинации без этапа
// авто-создаёт его (position=0/groups/«Групповой этап», спека 0017, FR-4).
func (s *Service) CreatePool(ctx context.Context, nominationID string) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	stage, err := s.stageForWrite(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	if stage.Status != domain.LayoutDraft {
		return domain.Layout{}, domain.ErrNotDraft
	}
	pools, err := s.repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		return domain.Layout{}, err
	}
	numbers := make([]int, len(pools))
	for i, p := range pools {
		numbers[i] = p.Number
	}
	if _, err := s.repo.CreatePool(ctx, stage.ID, domain.NextPoolNumber(numbers)); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayout(ctx, nominationID)
}

// DeletePool удаляет пул; его бойцы возвращаются в нераспределённые (FR-4).
// Undoable. Только в draft.
func (s *Service) DeletePool(ctx context.Context, poolID string) (domain.Layout, error) {
	poolID = strings.TrimSpace(poolID)
	if poolID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	pool, err := s.repo.GetPool(ctx, poolID)
	if err != nil {
		return domain.Layout{}, err
	}
	if err := s.requireDraft(ctx, pool.NominationID); err != nil {
		return domain.Layout{}, err
	}
	if err := s.repo.DeletePool(ctx, poolID); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayoutAndSync(ctx, pool.NominationID)
}

// ResetLayout удаляет все пулы этапа номинации и возвращает всех бойцов в
// нераспределённые (FR-4a). Записывает undo-снапшот всех пулов с их членствами
// (undoable — FR-7a). Только в draft. Если пулов нет — no-op (без undo).
func (s *Service) ResetLayout(ctx context.Context, nominationID string) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	stage, err := s.stageForWrite(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	if stage.Status != domain.LayoutDraft {
		return domain.Layout{}, domain.ErrNotDraft
	}
	layout, err := s.loadLayout(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	if len(layout.Pools) == 0 {
		return layout, nil // no-op: пулов нет — нечего сбрасывать, undo не пишется
	}
	if err := s.repo.ResetLayout(ctx, stage.ID); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayoutAndSync(ctx, nominationID)
}

// AssignFighter кладёт бойца в пул этапа номинации: из нераспределённых либо
// из другого пула ЭТОГО ЖЕ этапа (move одним действием, FR-5; спека 0017,
// FR-7: членство в пуле другого этапа той же номинации не трогается).
// Только в draft.
func (s *Service) AssignFighter(ctx context.Context, nominationID, fighterID, poolID string) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	fighterID = strings.TrimSpace(fighterID)
	poolID = strings.TrimSpace(poolID)
	if nominationID == "" || fighterID == "" || poolID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	stage, err := s.stageForWrite(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	if stage.Status != domain.LayoutDraft {
		return domain.Layout{}, domain.ErrNotDraft
	}
	if err := s.repo.AssignFighter(ctx, stage.ID, fighterID, poolID); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayoutAndSync(ctx, nominationID)
}

// UnassignFighter возвращает бойца из пула этапа в нераспределённые (FR-5).
// Только в draft.
func (s *Service) UnassignFighter(ctx context.Context, nominationID, fighterID string) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	fighterID = strings.TrimSpace(fighterID)
	if nominationID == "" || fighterID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	stage, err := s.stageForWrite(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	if stage.Status != domain.LayoutDraft {
		return domain.Layout{}, domain.ErrNotDraft
	}
	if err := s.repo.UnassignFighter(ctx, stage.ID, fighterID); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayoutAndSync(ctx, nominationID)
}

// AutoDistribute раскладывает нераспределённых бойцов этапа по существующим
// его пулам, минимизируя одноклубников (FR-6/FR-7). Уже расставленные бойцы
// не трогаются. Undoable. Только в draft.
func (s *Service) AutoDistribute(ctx context.Context, nominationID string) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	stage, err := s.stageForWrite(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	if stage.Status != domain.LayoutDraft {
		return domain.Layout{}, domain.ErrNotDraft
	}
	layout, err := s.loadLayout(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	if len(layout.Pools) == 0 {
		return domain.Layout{}, domain.ErrNoPools
	}
	if len(layout.Unassigned) == 0 {
		return layout, nil // AC-9: no-op, состояние не меняется
	}
	assignments := domain.AutoDistribute(layout.Pools, layout.Unassigned)
	if err := s.repo.ApplyAutoDistribute(ctx, stage.ID, assignments); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayoutAndSync(ctx, nominationID)
}

// Undo откатывает последнее mutating-действие среди трёх классов:
// автораспределение, удаление пула или сброс раскладки (FR-7a). Только в draft.
func (s *Service) Undo(ctx context.Context, nominationID string) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	stage, err := s.stageForWrite(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	if stage.Status != domain.LayoutDraft {
		return domain.Layout{}, domain.ErrNotDraft
	}
	switch stage.Undo.Kind {
	case domain.UndoAuto:
		if err := s.repo.UndoAuto(ctx, stage.ID, stage.Undo.FighterIDs); err != nil {
			return domain.Layout{}, err
		}
	case domain.UndoDeletePool:
		if err := s.repo.UndoDeletePool(ctx, stage.ID, stage.Undo.PoolNumber, stage.Undo.FighterIDs); err != nil {
			return domain.Layout{}, err
		}
	case domain.UndoReset:
		if err := s.repo.UndoReset(ctx, stage.ID, stage.Undo.Pools); err != nil {
			return domain.Layout{}, err
		}
	default:
		return domain.Layout{}, domain.ErrNothingToUndo
	}
	return s.loadLayoutAndSync(ctx, nominationID)
}

// SetStatus переключает статус раскладки этапа draft↔ready (FR-9). Другие
// целевые статусы отклоняются — переходы в active/finished не реализованы.
//
// Переход draft → ready формирует бои каждого пула этапа (спека 0010, FR-2);
// переход ready → draft удаляет ранее сформированные бои этапа (FR-5), но
// только если ни один пул ЭТОГО этапа не стоит на арене (спека 0011, FR-3,
// AC-3: ErrPoolSeated) и ни один бой ЭТОГО этапа ещё не начат/проведён
// (спека 0013, FR-13, AC-12: ErrHasResults — пересборка состава не должна
// стирать результаты). Занятость арены и результаты боёв другого этапа той
// же номинации не блокируют (спека 0017, FR-8, AC-5). Проверка результатов
// идёт первой (план «Модуль pool»): даже если пул уже снят с арены (снятие
// результаты сохраняет, FR-11), но у него есть проведённые бои, расфиксация
// всё равно отклоняется. Порядок для собственно перехода — сначала эффект в
// bout (generate/clear), только потом статус в stage (план «Обзор
// решения»): если bout-шаг упал, статус раскладки не меняется. Повторный
// вызов с уже текущим статусом (draft→draft, ready→ready) — не переход,
// BoutConductor не вызывается.
func (s *Service) SetStatus(ctx context.Context, nominationID string, status domain.LayoutStatus) (domain.Layout, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	if status != domain.LayoutDraft && status != domain.LayoutReady {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	stage, err := s.stageForWrite(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	current, err := s.loadLayout(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	transitioned := false
	switch {
	case current.Status == domain.LayoutDraft && status == domain.LayoutReady:
		if err := s.bouts.GenerateForStage(ctx, nominationID, toBoutPools(current.Pools)); err != nil {
			return domain.Layout{}, err
		}
		transitioned = true
	case current.Status == domain.LayoutReady && status == domain.LayoutDraft:
		poolIDs := poolIDsOf(current.Pools)
		started, err := s.bouts.AnyStartedInPools(ctx, poolIDs)
		if err != nil {
			return domain.Layout{}, err
		}
		if started {
			return domain.Layout{}, domain.ErrHasResults
		}
		seated, err := s.repo.AnySeatedInStage(ctx, stage.ID)
		if err != nil {
			return domain.Layout{}, err
		}
		if seated {
			return domain.Layout{}, domain.ErrPoolSeated
		}
		if err := s.bouts.ClearForPools(ctx, poolIDs); err != nil {
			return domain.Layout{}, err
		}
		transitioned = true
	}
	if err := s.repo.SetStatus(ctx, stage.ID, status); err != nil {
		return domain.Layout{}, err
	}
	// Публикуем только на реальном переходе (draft→ready/ready→draft) — не
	// на no-op (draft→draft/ready→ready), см. mapError и комментарий выше
	// метода (спека 0014, задача T5).
	if transitioned {
		s.liveBus.PublishNominationChanged(nominationID)
	}
	return s.loadLayout(ctx, nominationID)
}

// poolIDsOf извлекает id пулов (для адресации ClearForPools/AnyStartedInPools
// списком пулов этапа, спека 0017).
func poolIDsOf(pools []domain.Pool) []string {
	out := make([]string, len(pools))
	for i, p := range pools {
		out[i] = p.ID
	}
	return out
}

// SeatPoolOnArena ставит готовый пул на активную площадку целиком, вместе с
// его боями (готовыми и уже упорядоченными, спека 0010) — арена ничего не
// пересчитывает (спека 0011, FR-7). Пул переходит «готов → готовится к
// запуску».
//
// Отклоняется: пул не найден (ErrNotFound); пул уже стоит на (какой-то)
// арене — сначала снять (ErrAlreadySeated, AC-7); раскладка пула не ready —
// пул не готов (ErrNotReady, AC-5); арена не резолвится или архивна
// (ErrArenaNotAvailable, AC-9); арена уже занята другим пулом — проверка
// заранее (AC-6) и на гонке через unique-index в repo (ErrArenaBusy).
func (s *Service) SeatPoolOnArena(ctx context.Context, poolID, arenaID string) (domain.Layout, error) {
	poolID = strings.TrimSpace(poolID)
	arenaID = strings.TrimSpace(arenaID)
	if poolID == "" || arenaID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}

	pool, err := s.repo.GetPool(ctx, poolID)
	if err != nil {
		return domain.Layout{}, err
	}
	if pool.ArenaID != "" {
		return domain.Layout{}, domain.ErrAlreadySeated
	}
	// Этап резолвится от пула (pool.StageID), не от номинации (план «Модуль
	// stage»): в будущем (спека 0018) пулы одной номинации смогут
	// принадлежать разным этапам с разным статусом.
	stage, found, err := s.repo.StageByID(ctx, pool.StageID)
	if err != nil {
		return domain.Layout{}, err
	}
	if !found || stage.Status != domain.LayoutReady {
		return domain.Layout{}, domain.ErrNotReady
	}

	arena, err := s.arenas.ArenaByID(ctx, arenaID)
	if err != nil {
		return domain.Layout{}, domain.ErrArenaNotAvailable
	}
	if !arena.Active {
		return domain.Layout{}, domain.ErrArenaNotAvailable
	}

	// repo.SeatPool — источник истины «арена свободна» (AC-6): и в PG (partial
	// unique index uq_pools_arena, NFR-4), и в FakeRepo эта проверка уже
	// встроена — отдельный пред-запрос здесь избыточен и вносил бы гонку.
	if err := s.repo.SeatPool(ctx, poolID, arenaID); err != nil {
		return domain.Layout{}, err
	}
	s.liveBus.PublishNominationChanged(pool.NominationID)
	s.signalArenaBoard(arenaID)
	return s.loadLayout(ctx, pool.NominationID)
}

// UnseatPool снимает пул с площадки (готовится к запуску → готов, спека
// 0011, FR-8). Привязка к арене очищается, площадка освобождается. Бои
// пула сохраняются (ClearForNomination не вызывается — постановка/снятие
// не трогает бои, только их исполнение на арене, вне скоупа этого
// инкремента). Идемпотентно: пул, не стоящий на арене, — no-op.
func (s *Service) UnseatPool(ctx context.Context, poolID string) (domain.Layout, error) {
	poolID = strings.TrimSpace(poolID)
	if poolID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	pool, err := s.repo.GetPool(ctx, poolID)
	if err != nil {
		return domain.Layout{}, err
	}
	// arenaID читаем ДО репозиторного UnseatPool: после снятия привязка пула
	// к арене уже очищена (спека 0015, T11) — сигналить нужно ту арену, с
	// которой пул только что сняли.
	arenaID := pool.ArenaID
	if err := s.repo.UnseatPool(ctx, poolID); err != nil {
		return domain.Layout{}, err
	}
	s.liveBus.PublishNominationChanged(pool.NominationID)
	s.signalArenaBoard(arenaID)
	return s.loadLayout(ctx, pool.NominationID)
}

// ---------------------------------------------------------------------
// Спека 0013: ведение текущего боя пула на арене (доска ведения).
// ---------------------------------------------------------------------

// GetBoutBoard возвращает доску ведения боёв арены (FR-14): пул, стоящий
// на ней (обогащённый, со статусом), его бои по порядку и эффективный
// текущий бой. Пустая доска (нулевое значение), если на арене никто не
// стоит — не ошибка (экран арены показывает плейсхолдер).
func (s *Service) GetBoutBoard(ctx context.Context, arenaID string) (domain.BoutBoard, error) {
	arenaID = strings.TrimSpace(arenaID)
	if arenaID == "" {
		return domain.BoutBoard{}, domain.ErrInvalidInput
	}
	seated, found, err := s.repo.PoolsForArena(ctx, arenaID)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	if !found {
		return domain.BoutBoard{}, nil
	}
	return s.boardForPool(ctx, seated.ID)
}

// SetCurrentBout назначает текущим любой бой пула — циркуляция (FR-8),
// включая уже завершённые бои (AC-6). Как и остальные действия ведения,
// требует, чтобы пул стоял на арене (FR-12).
func (s *Service) SetCurrentBout(ctx context.Context, poolID, boutID string) (domain.BoutBoard, error) {
	poolID = strings.TrimSpace(poolID)
	boutID = strings.TrimSpace(boutID)
	if poolID == "" || boutID == "" {
		return domain.BoutBoard{}, domain.ErrInvalidInput
	}
	pool, err := s.repo.GetPool(ctx, poolID)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	if strings.TrimSpace(pool.ArenaID) == "" {
		return domain.BoutBoard{}, domain.ErrPoolNotSeated
	}
	bouts, err := s.bouts.BoutsByPool(ctx, poolID)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	found := false
	for _, b := range bouts {
		if b.ID == boutID {
			found = true
			break
		}
	}
	if !found {
		return domain.BoutBoard{}, domain.ErrNotFound
	}
	if err := s.repo.SetCurrentBout(ctx, poolID, boutID); err != nil {
		return domain.BoutBoard{}, err
	}
	s.liveBus.PublishNominationChanged(pool.NominationID)
	s.signalArenaBoard(pool.ArenaID)
	return s.boardForPool(ctx, poolID)
}

// StartCurrentBout переводит текущий бой пула не начат → идёт (FR-4).
func (s *Service) StartCurrentBout(ctx context.Context, poolID, actorID string) (domain.BoutBoard, error) {
	poolID = strings.TrimSpace(poolID)
	if poolID == "" {
		return domain.BoutBoard{}, domain.ErrInvalidInput
	}
	pool, _, currentID, err := s.currentBoutFor(ctx, poolID)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	if err := s.bouts.StartBout(ctx, currentID, actorID); err != nil {
		return domain.BoutBoard{}, err
	}
	s.liveBus.PublishNominationChanged(pool.NominationID)
	s.signalArenaBoard(pool.ArenaID)
	return s.boardForPool(ctx, poolID)
}

// ScoreCurrentBout задаёт абсолютный счёт текущего боя (FR-2/FR-2a: быстрые
// шаги и ручной ввод — арифметика клиента поверх счёта из доски). Допустимо
// только пока бой идёт — гейт на стороне BoutConductor (AC-4).
func (s *Service) ScoreCurrentBout(ctx context.Context, poolID, actorID string, scoreA, scoreB int) (domain.BoutBoard, error) {
	poolID = strings.TrimSpace(poolID)
	if poolID == "" {
		return domain.BoutBoard{}, domain.ErrInvalidInput
	}
	pool, _, currentID, err := s.currentBoutFor(ctx, poolID)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	if err := s.bouts.ScoreBout(ctx, currentID, actorID, scoreA, scoreB); err != nil {
		return domain.BoutBoard{}, err
	}
	s.liveBus.PublishNominationChanged(pool.NominationID)
	s.signalArenaBoard(pool.ArenaID)
	return s.boardForPool(ctx, poolID)
}

// FinishCurrentBout переводит текущий бой идёт → завершён (FR-5) и
// автоматически продвигает текущий указатель пула на следующий
// непроведённый бой по порядку после только что завершённого (FR-9,
// AC-5); если такого нет (последний бой пула, AC-10) — указатель
// очищается, эффективный текущий бой резолвится в пустоту при следующем
// чтении доски.
func (s *Service) FinishCurrentBout(ctx context.Context, poolID, actorID string) (domain.BoutBoard, error) {
	poolID = strings.TrimSpace(poolID)
	if poolID == "" {
		return domain.BoutBoard{}, domain.ErrInvalidInput
	}
	pool, bouts, currentID, err := s.currentBoutFor(ctx, poolID)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	if err := s.bouts.FinishBout(ctx, currentID, actorID); err != nil {
		return domain.BoutBoard{}, err
	}
	next := nextUnfinishedAfter(bouts, currentID)
	if err := s.repo.SetCurrentBout(ctx, poolID, next); err != nil {
		return domain.BoutBoard{}, err
	}
	s.liveBus.PublishNominationChanged(pool.NominationID)
	s.signalArenaBoard(pool.ArenaID)
	return s.boardForPool(ctx, poolID)
}

// ReopenCurrentBout переводит текущий бой завершён → идёт для правки счёта
// (FR-6).
func (s *Service) ReopenCurrentBout(ctx context.Context, poolID, actorID string) (domain.BoutBoard, error) {
	poolID = strings.TrimSpace(poolID)
	if poolID == "" {
		return domain.BoutBoard{}, domain.ErrInvalidInput
	}
	pool, _, currentID, err := s.currentBoutFor(ctx, poolID)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	if err := s.bouts.ReopenBout(ctx, currentID, actorID); err != nil {
		return domain.BoutBoard{}, err
	}
	s.liveBus.PublishNominationChanged(pool.NominationID)
	s.signalArenaBoard(pool.ArenaID)
	return s.boardForPool(ctx, poolID)
}

// ResetCurrentBout переводит текущий бой идёт → не начат, счёт обнуляется
// (FR-6).
func (s *Service) ResetCurrentBout(ctx context.Context, poolID, actorID string) (domain.BoutBoard, error) {
	poolID = strings.TrimSpace(poolID)
	if poolID == "" {
		return domain.BoutBoard{}, domain.ErrInvalidInput
	}
	pool, _, currentID, err := s.currentBoutFor(ctx, poolID)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	if err := s.bouts.ResetBout(ctx, currentID, actorID); err != nil {
		return domain.BoutBoard{}, err
	}
	s.liveBus.PublishNominationChanged(pool.NominationID)
	s.signalArenaBoard(pool.ArenaID)
	return s.boardForPool(ctx, poolID)
}

// currentBoutFor гейтит «вести можно только на арене» (ErrPoolNotSeated,
// FR-12, AC-13), резолвит эффективный текущий бой пула (ErrNoCurrentBout,
// если у пула нет боёв) — общая часть всех действий ведения кроме
// SetCurrentBout/GetBoutBoard (у них своя форма гейта/резолва).
func (s *Service) currentBoutFor(ctx context.Context, poolID string) (domain.Pool, []domain.BoutRef, string, error) {
	pool, err := s.repo.GetPool(ctx, poolID)
	if err != nil {
		return domain.Pool{}, nil, "", err
	}
	if strings.TrimSpace(pool.ArenaID) == "" {
		return domain.Pool{}, nil, "", domain.ErrPoolNotSeated
	}
	bouts, err := s.bouts.BoutsByPool(ctx, poolID)
	if err != nil {
		return domain.Pool{}, nil, "", err
	}
	currentID := effectiveCurrentBoutID(pool, bouts)
	if currentID == "" {
		return domain.Pool{}, nil, "", domain.ErrNoCurrentBout
	}
	return pool, bouts, currentID, nil
}

// boardForPool собирает BoutBoard для пула: обогащённый пул (через
// enrichPools — Members/Status/ArenaName/NominationName, с прогрессом
// боёв), его бои по порядку и эффективный текущий бой.
func (s *Service) boardForPool(ctx context.Context, poolID string) (domain.BoutBoard, error) {
	pool, err := s.repo.GetPool(ctx, poolID)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	bouts, err := s.bouts.BoutsByPool(ctx, poolID)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	enriched, err := s.enrichPools(ctx, []domain.Pool{pool})
	if err != nil {
		return domain.BoutBoard{}, err
	}
	sorted := sortedBySequence(bouts)
	current := effectiveCurrentBoutID(pool, sorted)
	return domain.BoutBoard{Pool: enriched[0], Bouts: sorted, CurrentBoutID: current}, nil
}

// effectiveCurrentBoutID резолвит текущий бой пула (спека 0013, FR-7/FR-9):
// если pool.CurrentBoutID задан и принадлежит списку боёв пула — он;
// иначе — первый непроведённый (state ≠ finished) по порядку (sequence);
// если такого нет (все завершены или боёв нет) — пусто.
func effectiveCurrentBoutID(pool domain.Pool, bouts []domain.BoutRef) string {
	if pool.CurrentBoutID != "" {
		for _, b := range bouts {
			if b.ID == pool.CurrentBoutID {
				return pool.CurrentBoutID
			}
		}
	}
	for _, b := range sortedBySequence(bouts) {
		if b.State != domain.BoutStateFinished {
			return b.ID
		}
	}
	return ""
}

// nextUnfinishedAfter — первый непроведённый (state ≠ finished) бой по
// sequence строго после boutID (авто-продвижение при завершении, FR-9,
// AC-5); пусто, если такого нет (boutID — последний непроведённый, AC-10)
// или boutID не найден в списке.
func nextUnfinishedAfter(bouts []domain.BoutRef, boutID string) string {
	sorted := sortedBySequence(bouts)
	idx := -1
	for i, b := range sorted {
		if b.ID == boutID {
			idx = i
			break
		}
	}
	if idx == -1 {
		return ""
	}
	for _, b := range sorted[idx+1:] {
		if b.State != domain.BoutStateFinished {
			return b.ID
		}
	}
	return ""
}

// sortedBySequence возвращает копию bouts, отсортированную по
// SequenceNumber (порядок проведения, спека 0010, FR-3a/FR-3b) — не
// полагается на порядок, в котором BoutConductor.BoutsByPool вернул срез.
func sortedBySequence(bouts []domain.BoutRef) []domain.BoutRef {
	out := make([]domain.BoutRef, len(bouts))
	copy(out, bouts)
	sort.Slice(out, func(i, j int) bool { return out[i].SequenceNumber < out[j].SequenceNumber })
	return out
}

// GetPoolsForArena возвращает данные для страницы конкретной арены (спека
// 0011, FR-9): пул, стоящий на ней сейчас (если есть), и список готовых
// пулов (любых номинаций), доступных для постановки.
func (s *Service) GetPoolsForArena(ctx context.Context, arenaID string) (domain.ArenaPools, error) {
	arenaID = strings.TrimSpace(arenaID)
	if arenaID == "" {
		return domain.ArenaPools{}, domain.ErrInvalidInput
	}

	seated, found, err := s.repo.PoolsForArena(ctx, arenaID)
	if err != nil {
		return domain.ArenaPools{}, err
	}
	available, err := s.repo.ReadyUnseatedPools(ctx)
	if err != nil {
		return domain.ArenaPools{}, err
	}

	all := make([]domain.Pool, 0, len(available)+1)
	if found {
		all = append(all, seated)
	}
	all = append(all, available...)
	enriched, err := s.enrichPools(ctx, all)
	if err != nil {
		return domain.ArenaPools{}, err
	}

	result := domain.ArenaPools{}
	offset := 0
	if found {
		result.Seated = &enriched[0]
		offset = 1
	}
	result.Available = enriched[offset:]
	if result.Available == nil {
		result.Available = []domain.Pool{}
	}
	return result, nil
}

// ListPublicPools возвращает пулы НОМИНАЦИИ ЦЕЛИКОМ — по всем её этапам
// (спека 0017, FR-9), с составом, боями (см. модуль bout — публичное чтение
// отдельным сервисом) и, если пул на арене — площадкой (спека 0011, FR-11).
// Только для готовой (ready) раскладки — пока раскладка draft
// (составляется), пулы публично не показываются (FR-11, AC-14): пустой
// список. Намеренно не переиспользует loadLayout (тот — один этап, экран
// админа); источник пулов — PoolsByNomination/MembersByNomination.
func (s *Service) ListPublicPools(ctx context.Context, nominationID string) ([]domain.Pool, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return nil, domain.ErrInvalidInput
	}
	stage, err := s.stageForRead(ctx, nominationID)
	if err != nil {
		return nil, err
	}
	rawPools, err := s.combinedPoolsByNomination(ctx, nominationID)
	if err != nil {
		return nil, err
	}
	layout, err := s.assembleLayout(ctx, nominationID, stage, rawPools)
	if err != nil {
		return nil, err
	}
	if layout.Status != domain.LayoutReady {
		return []domain.Pool{}, nil
	}
	return layout.Pools, nil
}

// ---------------------------------------------------------------------
// Спека 0014: публичный живой снапшот номинации (bout state/score/outcome +
// исполнительный статус пула, экран номинации).
// ---------------------------------------------------------------------

// NominationLive собирает живой снапшот НОМИНАЦИИ ЦЕЛИКОМ (FR-1..FR-3, спека
// 0017 FR-9 — по всем её этапам, не одному): для каждого пула — обогащённая
// композиция (enrichPools, как у GetPoolsForArena/GetBoutBoard), его бои по
// порядку проведения и эффективный текущий бой; Stages — этапы номинации
// (спека 0017, FR-11 — публичный экран подписывает состав именем этапа).
// Пока раскладка draft — пустой список пулов (FR-12), как и ListPublicPools
// (публично нечего показывать, пока раскладка составляется).
func (s *Service) NominationLive(ctx context.Context, nominationID string) (domain.NominationSnapshot, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.NominationSnapshot{}, domain.ErrInvalidInput
	}
	stages, err := s.stagesForRead(ctx, nominationID)
	if err != nil {
		return domain.NominationSnapshot{}, err
	}
	stage := stages[0]
	if stage.Status != domain.LayoutReady {
		return domain.NominationSnapshot{NominationID: nominationID, Stages: stages, Pools: []domain.LivePool{}}, nil
	}
	rawPools, err := s.combinedPoolsByNomination(ctx, nominationID)
	if err != nil {
		return domain.NominationSnapshot{}, err
	}
	enriched, err := s.enrichPools(ctx, rawPools)
	if err != nil {
		return domain.NominationSnapshot{}, err
	}
	livePools := make([]domain.LivePool, 0, len(enriched))
	for _, pool := range enriched {
		bouts, err := s.bouts.BoutsByPool(ctx, pool.ID)
		if err != nil {
			return domain.NominationSnapshot{}, err
		}
		// Standings (спека 0016, FR-6): переиспользуем уже прочитанные бои —
		// без дополнительного вызова порта.
		pool.Standings = domain.ComputeStandings(pool.Members, bouts)
		sorted := sortedBySequence(bouts)
		current := effectiveCurrentBoutID(pool, sorted)
		livePools = append(livePools, domain.LivePool{Pool: pool, Bouts: sorted, CurrentBoutID: current})
	}
	return domain.NominationSnapshot{NominationID: nominationID, Pools: livePools}, nil
}

// SubscribeNomination — тонкий passthrough к LiveSubscriber (спека 0014,
// ADR 0012): api-слой (WatchNominationLive) подписывается через сервис, не
// держа собственной ссылки на шину (Service — единственный держатель
// LiveBus в модуле, см. New).
func (s *Service) SubscribeNomination(nominationID string) (<-chan struct{}, func()) {
	return s.liveBus.SubscribeNomination(nominationID)
}

// toBoutPools маппит пулы раскладки во вход генерации боёв: loadLayout уже
// отдаёт Pool.Members обогащёнными и отфильтрованными до активных (FR-12,
// спека 0009) — ровно то, что нужно на вход BoutConductor.GenerateForStage.
func toBoutPools(pools []domain.Pool) []domain.BoutPoolInput {
	out := make([]domain.BoutPoolInput, len(pools))
	for i, p := range pools {
		out[i] = domain.BoutPoolInput{PoolID: p.ID, Fighters: p.Members}
	}
	return out
}

// requireDraft проверяет, что раскладка этапа номинации в статусе draft
// (FR-10/FR-11), не создавая строку этапа и не загружая пулы целиком
// (read-only, спека 0017: единственный вызывающий — DeletePool, чей пул уже
// существует, а значит его этап уже существует — EnsureStage не нужен).
func (s *Service) requireDraft(ctx context.Context, nominationID string) error {
	stage, err := s.stageForRead(ctx, nominationID)
	if err != nil {
		return err
	}
	if stage.Status != domain.LayoutDraft {
		return domain.ErrNotDraft
	}
	return nil
}

// stageForWrite резолвит этап номинации для мутирующих путей (спека 0017,
// FR-4): get-or-create через repo.EnsureStage. Используется в начале
// CreatePool/ResetLayout/AssignFighter/UnassignFighter/AutoDistribute/Undo/
// SetStatus.
func (s *Service) stageForWrite(ctx context.Context, nominationID string) (domain.Stage, error) {
	return s.repo.EnsureStage(ctx, nominationID)
}

// stageForRead резолвит этап номинации для read-путей — НЕ создаёт строку
// (спека 0017): при отсутствии строки в БД возвращает виртуальный этап
// (virtualStage). Используется в loadLayout/requireDraft/публичных чтениях.
// Это разделение важно: GetLayout обязан остаться read-only, иначе открытие
// экрана раскладки стало бы записью в БД.
func (s *Service) stageForRead(ctx context.Context, nominationID string) (domain.Stage, error) {
	stage, found, err := s.repo.StageByNomination(ctx, nominationID)
	if err != nil {
		return domain.Stage{}, err
	}
	if !found {
		return virtualStage(nominationID), nil
	}
	return stage, nil
}

// stagesForRead возвращает этапы номинации для публичных ответов (repeated
// stages, спека 0017, FR-11): реальные строки, либо singleton виртуального
// этапа, если строк ещё нет — не менее одного элемента.
func (s *Service) stagesForRead(ctx context.Context, nominationID string) ([]domain.Stage, error) {
	stages, err := s.repo.StagesByNomination(ctx, nominationID)
	if err != nil {
		return nil, err
	}
	if len(stages) == 0 {
		return []domain.Stage{virtualStage(nominationID)}, nil
	}
	return stages, nil
}

// StagesForNomination — passthrough к stagesForRead для api-слоя
// (ListPublicPools возвращает bare []Pool без обёртки — api собирает поле
// stages ответа отдельным вызовом этого метода, спека 0017).
func (s *Service) StagesForNomination(ctx context.Context, nominationID string) ([]domain.Stage, error) {
	return s.stagesForRead(ctx, nominationID)
}

// virtualStage — этап-заглушка для номинации без строки в stage.stages
// (спека 0017, план «Риски»): те же дефолты, что материализует EnsureStage
// (position=0/groups/DefaultStageTitle/draft), но с пустым ID — ровно как
// сегодня отсутствие строки раскладки трактуется как пустой draft (спека
// 0009, решение №9). Не пишет в БД — только для read-путей.
func virtualStage(nominationID string) domain.Stage {
	return domain.Stage{
		NominationID: nominationID,
		Position:     0,
		Title:        domain.DefaultStageTitle,
		Type:         domain.StageTypeGroups,
		Status:       domain.LayoutDraft,
	}
}

// loadLayoutAndSync — loadLayout плюс синхронизация «есть ли у номинации
// распределённые бойцы» с модулем nomination (спека 0012, FR-5/FR-6/FR-10).
// Вызывается вместо loadLayout из шести pool-мутирующих методов, реально
// меняющих членство (DeletePool/ResetLayout/AssignFighter/UnassignFighter/
// AutoDistribute/Undo) — после того, как мутация уже применена в repo, чтобы
// вычислить hasDistributed по результирующему состоянию, а не по имени RPC.
// Синхронизация считает распределённых бойцов ПО ВСЕМ ЭТАПАМ номинации
// (спека 0017, FR-9) — не по одному, даже если сам loadLayout стал
// этапным: приём заявок открывается обратно, только когда ни в одном этапе
// номинации не осталось распределённых бойцов.
func (s *Service) loadLayoutAndSync(ctx context.Context, nominationID string) (domain.Layout, error) {
	layout, err := s.loadLayout(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	distributed, err := s.hasDistributedAcrossStages(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	if err := s.nominations.SyncRegistrationState(ctx, nominationID, distributed); err != nil {
		return domain.Layout{}, err
	}
	return layout, nil
}

// hasDistributedAcrossStages — есть ли у номинации, по ВСЕМ её этапам, хотя
// бы один активный боец, распределённый по пулам (спека 0012, FR-5/FR-6;
// спека 0017, FR-9: триггер перехода OPEN↔CLOSED номинации считается по
// номинации целиком, не по одному этапу). Читает сырые членства
// (MembersByNomination, все этапы) и фильтрует по активному ростеру — не
// распределённым считается и осиротевшее (выведенный/снятый боец) членство,
// ещё не подчищенное PruneMembers.
func (s *Service) hasDistributedAcrossStages(ctx context.Context, nominationID string) (bool, error) {
	members, err := s.repo.MembersByNomination(ctx, nominationID)
	if err != nil {
		return false, err
	}
	if len(members) == 0 {
		return false, nil
	}
	active, err := s.fighters.ActiveFightersByNomination(ctx, nominationID)
	if err != nil {
		return false, err
	}
	activeIDs := make(map[string]bool, len(active))
	for _, f := range active {
		activeIDs[f.ID] = true
	}
	for _, m := range members {
		if activeIDs[m.FighterID] {
			return true, nil
		}
	}
	return false, nil
}

// loadLayout собирает Layout ОДНОГО этапа номинации (админ-экран раскладки,
// мутирующие юзкейсы) — не путать с ListPublicPools/NominationLive
// (номинация целиком, по всем этапам, спека 0017 FR-9). Read-only:
// использует stageForRead, ничего не пишет при отсутствии строки этапа
// (виртуальный этап, GetLayout обязан оставаться чтением).
func (s *Service) loadLayout(ctx context.Context, nominationID string) (domain.Layout, error) {
	stage, err := s.stageForRead(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	var rawPools []domain.Pool
	if stage.ID != "" {
		rawPools, err = s.combinedPoolsByStage(ctx, stage.ID)
		if err != nil {
			return domain.Layout{}, err
		}
	}
	return s.assembleLayout(ctx, nominationID, stage, rawPools)
}

// combinedPoolsByStage объединяет bare-пулы этапа (PoolsByStage) с их
// сырыми членствами (MembersByStage) — аналог того, как repo раньше сам
// объединял ListPoolsByNomination + ListMembersByNomination.
func (s *Service) combinedPoolsByStage(ctx context.Context, stageID string) ([]domain.Pool, error) {
	pools, err := s.repo.PoolsByStage(ctx, stageID)
	if err != nil {
		return nil, err
	}
	members, err := s.repo.MembersByStage(ctx, stageID)
	if err != nil {
		return nil, err
	}
	return combinePoolsAndMembers(pools, members), nil
}

// combinedPoolsByNomination — как combinedPoolsByStage, но по номинации
// целиком (все этапы, спека 0017 FR-9): используется ListPublicPools/
// NominationLive.
func (s *Service) combinedPoolsByNomination(ctx context.Context, nominationID string) ([]domain.Pool, error) {
	pools, err := s.repo.PoolsByNomination(ctx, nominationID)
	if err != nil {
		return nil, err
	}
	members, err := s.repo.MembersByNomination(ctx, nominationID)
	if err != nil {
		return nil, err
	}
	return combinePoolsAndMembers(pools, members), nil
}

// combinePoolsAndMembers комбинирует bare-пулы с их сырыми членствами по
// PoolID.
func combinePoolsAndMembers(pools []domain.Pool, members []domain.PoolMember) []domain.Pool {
	byPool := make(map[string][]domain.FighterRef, len(pools))
	for _, m := range members {
		byPool[m.PoolID] = append(byPool[m.PoolID], domain.FighterRef{ID: m.FighterID})
	}
	out := make([]domain.Pool, len(pools))
	for i, p := range pools {
		p.Members = byPool[p.ID]
		out[i] = p
	}
	return out
}

// assembleLayout — общее ядро обогащения Layout: обогащает сырые членства
// пулов данными из ActiveFightersProvider (имя/клуб), скрывает выведенных/
// снятых бойцов (FR-12), в draft — лениво удаляет их осиротевшие членства
// (FR-15; в ready раскладка фиксирована — только read-only фильтрация, без
// записи). Дополнительно (спека 0011): заполняет по каждому пулу
// ArenaID/ArenaName (резолв через ArenaProvider) и вычисляемый Status.
// Общая часть loadLayout (rawPools одного этапа) и ListPublicPools (rawPools
// номинации целиком, спека 0017 FR-9) — stage передаётся вызывающим,
// разница только в источнике rawPools.
func (s *Service) assembleLayout(ctx context.Context, nominationID string, stage domain.Stage, rawPools []domain.Pool) (domain.Layout, error) {
	active, err := s.fighters.ActiveFightersByNomination(ctx, nominationID)
	if err != nil {
		return domain.Layout{}, err
	}
	activeByID := make(map[string]domain.FighterRef, len(active))
	activeIDs := make([]string, len(active))
	for i, f := range active {
		activeByID[f.ID] = f
		activeIDs[i] = f.ID
	}

	pooled := make(map[string]bool)
	orphaned := false
	pools := make([]domain.Pool, 0, len(rawPools))
	for _, p := range rawPools {
		enriched := domain.Pool{ID: p.ID, StageID: p.StageID, NominationID: p.NominationID, Number: p.Number, ArenaID: p.ArenaID}
		for _, m := range p.Members {
			if ref, ok := activeByID[m.ID]; ok {
				enriched.Members = append(enriched.Members, ref)
				pooled[ref.ID] = true
			} else {
				orphaned = true
			}
		}
		pools = append(pools, enriched)
	}

	if stage.Status == domain.LayoutDraft && orphaned {
		if err := s.repo.PruneMembers(ctx, nominationID, activeIDs); err != nil {
			return domain.Layout{}, err
		}
	}

	pools, err = s.applyArenaAndStatus(ctx, pools, stage.Status)
	if err != nil {
		return domain.Layout{}, err
	}

	unassigned := make([]domain.FighterRef, 0, len(active))
	for _, f := range active {
		if !pooled[f.ID] {
			unassigned = append(unassigned, f)
		}
	}

	return domain.Layout{
		NominationID: nominationID,
		Stage:        stage,
		Status:       stage.Status,
		Unassigned:   unassigned,
		Pools:        pools,
		CanUndo:      stage.Undo.Kind != domain.UndoNone,
	}, nil
}

// applyArenaAndStatus заполняет ArenaName (батч-резолв через ArenaProvider)
// и Status (ComputePoolStatus, с прогрессом боёв — спека 0013, FR-10) для
// пулов, чей LayoutStatus уже известен (спека 0017: все пулы одного этапа
// либо, для ListPublicPools, номинации в этом инкременте — они совпадают,
// т.к. этап один). Дополнительно резолвит имя номинации (NominationName) —
// резолв идёт одним батчем. PoolProgress вызывается по одному разу на пул
// (пулы уже уникальны по ID в списке одной раскладки) — не N+1 относительно
// бойцов.
//
// Standings (спека 0016, FR-5/FR-7) заполняется только когда у пула есть
// хотя бы один завершённый бой (finished > 0 из уже полученного
// PoolProgress) — тогда дополнительно читаем сами бои (BoutsByPool) и
// считаем итоговую таблицу; для пулов без результатов лишний вызов порта не
// делаем (Standings остаётся nil, FR-7). Путь используется assembleLayout
// (GetLayout admin и ListPublicPools public) — GetPoolsForArena к этой
// функции не обращается, её пулы Standings осознанно не несут.
func (s *Service) applyArenaAndStatus(ctx context.Context, pools []domain.Pool, layoutStatus domain.LayoutStatus) ([]domain.Pool, error) {
	arenaNames, err := s.resolveArenaNames(ctx, pools)
	if err != nil {
		return nil, err
	}
	nomNames, err := s.resolveNominationNames(ctx, pools)
	if err != nil {
		return nil, err
	}
	for i := range pools {
		total, started, finished, err := s.bouts.PoolProgress(ctx, pools[i].ID)
		if err != nil {
			return nil, err
		}
		pools[i].Status = domain.ComputePoolStatus(layoutStatus, pools[i].ArenaID, started, finished, total)
		if pools[i].ArenaID != "" {
			pools[i].ArenaName = arenaNames[pools[i].ArenaID].Name
		}
		pools[i].NominationName = nomNames[pools[i].NominationID].Title
		if finished > 0 {
			poolBouts, err := s.bouts.BoutsByPool(ctx, pools[i].ID)
			if err != nil {
				return nil, err
			}
			pools[i].Standings = domain.ComputeStandings(pools[i].Members, poolBouts)
		}
	}
	return pools, nil
}

// enrichPools обогащает произвольный список пулов (возможно, разных
// номинаций и разных статусов раскладки — GetPoolsForArena, спека 0011):
// членов через ActiveFightersProvider (по номинациям, батчем), Status и
// ArenaName. Используется, когда пулы уже пришли из repo с «сырыми»
// членствами (в отличие от loadLayout, который читает статус целиком по
// одной номинации).
func (s *Service) enrichPools(ctx context.Context, rawPools []domain.Pool) ([]domain.Pool, error) {
	if len(rawPools) == 0 {
		return []domain.Pool{}, nil
	}

	fightersByNom := make(map[string]map[string]domain.FighterRef)
	statusByNom := make(map[string]domain.LayoutStatus)

	out := make([]domain.Pool, len(rawPools))
	for i, p := range rawPools {
		activeByID, ok := fightersByNom[p.NominationID]
		if !ok {
			active, err := s.fighters.ActiveFightersByNomination(ctx, p.NominationID)
			if err != nil {
				return nil, err
			}
			activeByID = make(map[string]domain.FighterRef, len(active))
			for _, f := range active {
				activeByID[f.ID] = f
			}
			fightersByNom[p.NominationID] = activeByID
		}
		layoutStatus, ok := statusByNom[p.NominationID]
		if !ok {
			stage, err := s.stageForRead(ctx, p.NominationID)
			if err != nil {
				return nil, err
			}
			layoutStatus = stage.Status
			statusByNom[p.NominationID] = layoutStatus
		}

		enriched := domain.Pool{
			ID: p.ID, StageID: p.StageID, NominationID: p.NominationID, Number: p.Number, ArenaID: p.ArenaID,
			CurrentBoutID: p.CurrentBoutID,
		}
		for _, m := range p.Members {
			if ref, ok := activeByID[m.ID]; ok {
				enriched.Members = append(enriched.Members, ref)
			}
		}
		total, started, finished, err := s.bouts.PoolProgress(ctx, p.ID)
		if err != nil {
			return nil, err
		}
		enriched.Status = domain.ComputePoolStatus(layoutStatus, p.ArenaID, started, finished, total)
		out[i] = enriched
	}

	arenaNames, err := s.resolveArenaNames(ctx, out)
	if err != nil {
		return nil, err
	}
	nomNames, err := s.resolveNominationNames(ctx, out)
	if err != nil {
		return nil, err
	}
	for i := range out {
		if out[i].ArenaID != "" {
			out[i].ArenaName = arenaNames[out[i].ArenaID].Name
		}
		out[i].NominationName = nomNames[out[i].NominationID].Title
	}
	return out, nil
}

// resolveNominationNames собирает уникальные NominationID пулов и
// батч-резолвит их названия через NominationProvider. Пулы с дублирующимся
// nominationID не увеличивают запрос. Отсутствующие id просто не попадают
// в карту — NominationName остаётся пустым (не падаем).
func (s *Service) resolveNominationNames(ctx context.Context, pools []domain.Pool) (map[string]domain.NominationRef, error) {
	seen := make(map[string]bool)
	ids := make([]string, 0, len(pools))
	for _, p := range pools {
		if p.NominationID == "" || seen[p.NominationID] {
			continue
		}
		seen[p.NominationID] = true
		ids = append(ids, p.NominationID)
	}
	if len(ids) == 0 {
		return map[string]domain.NominationRef{}, nil
	}
	return s.nominations.NominationsByIDs(ctx, ids)
}

// resolveArenaNames собирает уникальные ArenaID пулов и батч-резолвит их
// имена через ArenaProvider (спека 0011, план «резолв имени арены — live,
// не снапшот»). Пулы без арены не увеличивают запрос.
func (s *Service) resolveArenaNames(ctx context.Context, pools []domain.Pool) (map[string]domain.ArenaRef, error) {
	seen := make(map[string]bool)
	ids := make([]string, 0, len(pools))
	for _, p := range pools {
		if p.ArenaID == "" || seen[p.ArenaID] {
			continue
		}
		seen[p.ArenaID] = true
		ids = append(ids, p.ArenaID)
	}
	if len(ids) == 0 {
		return map[string]domain.ArenaRef{}, nil
	}
	return s.arenas.ArenasByIDs(ctx, ids)
}
