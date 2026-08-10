// Package service содержит бизнес-логику модуля pool (юзкейсы, спека 0009,
// расширено спекой 0011 — постановка пула на арену, спекой 0013 — ведение
// текущего боя, спекой 0018 — этап-сетка, см. bracket.go). Адресация
// раскладки — этапом (stage_id), не номинацией (спека 0018, FR-18: закрывает
// долг 0017, где адресация оставалась номинационной, пока этап был один).
package service

import (
	"context"
	"fmt"
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

// GetLayout возвращает раскладку этапа (спека 0018, FR-18 — адресация
// переехала с номинации на этап; реконсиляция с активным ростером fighter,
// FR-12/FR-14/FR-15).
func (s *Service) GetLayout(ctx context.Context, stageID string) (domain.Layout, error) {
	stageID = strings.TrimSpace(stageID)
	if stageID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	return s.loadLayout(ctx, stageID)
}

// CreatePool создаёт пул с наименьшим свободным номером в этапе (FR-3).
// Только в draft группового этапа — на сетке отклоняется (спека 0018,
// ErrStageTypeMismatch): контейнеры сетки заводит CreateStage/lockBracket.
func (s *Service) CreatePool(ctx context.Context, stageID string) (domain.Layout, error) {
	stageID = strings.TrimSpace(stageID)
	if stageID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	stage, err := s.stageForWrite(ctx, stageID)
	if err != nil {
		return domain.Layout{}, err
	}
	if stage.Type != domain.StageTypeGroups {
		return domain.Layout{}, domain.ErrStageTypeMismatch
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
	return s.loadLayout(ctx, stage.ID)
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
	if err := s.requireDraft(ctx, pool.StageID); err != nil {
		return domain.Layout{}, err
	}
	if err := s.repo.DeletePool(ctx, poolID); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayoutAndSync(ctx, pool.StageID)
}

// ResetLayout удаляет все пулы этапа и возвращает всех бойцов в
// нераспределённые (FR-4a). Записывает undo-снапшот всех пулов с их
// членствами, включая слоты посева (undoable — FR-7a; спека 0018, FR-8).
// Работает и для группового этапа, и для сетки (план «service/bracket.go»,
// T13). Только в draft. Если пулов нет — no-op (без undo).
func (s *Service) ResetLayout(ctx context.Context, stageID string) (domain.Layout, error) {
	stageID = strings.TrimSpace(stageID)
	if stageID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	stage, err := s.stageForWrite(ctx, stageID)
	if err != nil {
		return domain.Layout{}, err
	}
	if stage.Status != domain.LayoutDraft {
		return domain.Layout{}, domain.ErrNotDraft
	}
	layout, err := s.loadLayout(ctx, stageID)
	if err != nil {
		return domain.Layout{}, err
	}
	if len(layout.Pools) == 0 {
		return layout, nil // no-op: пулов нет — нечего сбрасывать, undo не пишется
	}
	if err := s.repo.ResetLayout(ctx, stage.ID); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayoutAndSync(ctx, stageID)
}

// AssignFighter кладёт бойца в пул этапа: из нераспределённых либо из
// другого пула ЭТОГО ЖЕ этапа (move одним действием, FR-5; спека 0017,
// FR-7: членство в пуле другого этапа той же номинации не трогается).
// Только в draft. Слот сетки этим RPC не адресуется (посев — отдельный
// SeedBracketSlot, спека 0018) — слот всегда 0.
func (s *Service) AssignFighter(ctx context.Context, stageID, fighterID, poolID string) (domain.Layout, error) {
	stageID = strings.TrimSpace(stageID)
	fighterID = strings.TrimSpace(fighterID)
	poolID = strings.TrimSpace(poolID)
	if stageID == "" || fighterID == "" || poolID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	stage, err := s.stageForWrite(ctx, stageID)
	if err != nil {
		return domain.Layout{}, err
	}
	if stage.Status != domain.LayoutDraft {
		return domain.Layout{}, domain.ErrNotDraft
	}
	if err := s.repo.AssignFighter(ctx, stage.ID, fighterID, poolID, 0); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayoutAndSync(ctx, stageID)
}

// UnassignFighter возвращает бойца из пула этапа в нераспределённые (FR-5).
// Только в draft.
func (s *Service) UnassignFighter(ctx context.Context, stageID, fighterID string) (domain.Layout, error) {
	stageID = strings.TrimSpace(stageID)
	fighterID = strings.TrimSpace(fighterID)
	if stageID == "" || fighterID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	stage, err := s.stageForWrite(ctx, stageID)
	if err != nil {
		return domain.Layout{}, err
	}
	if stage.Status != domain.LayoutDraft {
		return domain.Layout{}, domain.ErrNotDraft
	}
	if err := s.repo.UnassignFighter(ctx, stage.ID, fighterID); err != nil {
		return domain.Layout{}, err
	}
	return s.loadLayoutAndSync(ctx, stageID)
}

// AutoDistribute раскладывает нераспределённых бойцов этапа по существующим
// его пулам, минимизируя одноклубников (FR-6/FR-7). Уже расставленные бойцы
// не трогаются. Undoable. Только в draft группового этапа — на сетке
// отклоняется (спека 0018, ErrStageTypeMismatch): у сетки нет «пулов» в
// этом смысле, посев только вручную по слотам (FR-7).
func (s *Service) AutoDistribute(ctx context.Context, stageID string) (domain.Layout, error) {
	stageID = strings.TrimSpace(stageID)
	if stageID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	stage, err := s.stageForWrite(ctx, stageID)
	if err != nil {
		return domain.Layout{}, err
	}
	if stage.Type != domain.StageTypeGroups {
		return domain.Layout{}, domain.ErrStageTypeMismatch
	}
	if stage.Status != domain.LayoutDraft {
		return domain.Layout{}, domain.ErrNotDraft
	}
	layout, err := s.loadLayout(ctx, stageID)
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
	return s.loadLayoutAndSync(ctx, stageID)
}

// Undo откатывает последнее mutating-действие среди четырёх классов:
// автораспределение, удаление пула, сброс раскладки или формирование этапа
// (FR-7a; спека 0019, FR-21). Только в draft. Работает и для группового
// этапа, и для сетки (undo reset несёт слоты посева, спека 0018).
func (s *Service) Undo(ctx context.Context, stageID string) (domain.Layout, error) {
	stageID = strings.TrimSpace(stageID)
	if stageID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	stage, err := s.stageForWrite(ctx, stageID)
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
	case domain.UndoBuild:
		if err := s.undoBuild(ctx, stage); err != nil {
			return domain.Layout{}, err
		}
	default:
		return domain.Layout{}, domain.ErrNothingToUndo
	}
	return s.loadLayoutAndSync(ctx, stageID)
}

// undoBuild откатывает формирование этапа (спека 0019, FR-21): состояние до
// формирования гарантированно пустое (FR-18 — повторное формирование поверх
// непустого состава отклоняется), поэтому откат сводится к очистке состава.
// Групповой этап: свежесозданные ApplyStageBuild пулы удаляются целиком
// (repo.ResetLayout) — они существуют только с этого формирования. Сетка:
// контейнеры первого круга (number 1/2) созданы CreateStage'ом и не
// принадлежат конкретному формированию — удалять их нельзя, поэтому
// снимается только сам посев, слот за слотом (repo.UnassignFighter, как
// ClearBracketSlot), контейнеры остаются пустыми и готовы к повторному
// формированию/ручному посеву.
func (s *Service) undoBuild(ctx context.Context, stage domain.Stage) error {
	if stage.Type != domain.StageTypeBracket {
		return s.repo.ResetLayout(ctx, stage.ID)
	}
	seeds, err := s.repo.SeedsByStage(ctx, stage.ID)
	if err != nil {
		return err
	}
	for _, sd := range seeds {
		if err := s.repo.UnassignFighter(ctx, stage.ID, sd.Fighter.ID); err != nil {
			return err
		}
	}
	return nil
}

// SetStatus переключает статус раскладки этапа draft↔ready (FR-9). Другие
// целевые статусы отклоняются — переходы в active/finished не реализованы.
//
// Групповой этап: переход draft → ready формирует бои каждого пула (спека
// 0010, FR-2); переход ready → draft удаляет ранее сформированные бои
// (FR-5). Этап-сетка (спека 0018): draft → ready — lockBracket (гейт «посеяно
// >= 2», FR-11; создание контейнеров кругов >= 2; материализация боёв только
// полных пар, баи продвигаются без боя, FR-9/FR-14); ready → draft —
// unlockBracket (удаление боёв + контейнеров кругов >= 2, посев остаётся,
// FR-10). Общие гейты расфиксации для обоих типов: ни один пул ЭТОГО этапа
// не стоит на арене (спека 0011, FR-3, AC-3: ErrPoolSeated) и ни один бой
// ЭТОГО этапа ещё не начат/проведён (спека 0013, FR-13, AC-12:
// ErrHasResults). Занятость арены и результаты боёв другого этапа той же
// номинации не блокируют (спека 0017, FR-8, AC-5). Порядок для перехода —
// сначала эффект в bout/контейнерах, только потом статус в stage: если шаг
// упал, статус раскладки не меняется. Повторный вызов с уже текущим статусом
// — не переход, BoutConductor/lockBracket/unlockBracket не вызываются.
func (s *Service) SetStatus(ctx context.Context, stageID string, status domain.LayoutStatus) (domain.Layout, error) {
	stageID = strings.TrimSpace(stageID)
	if stageID == "" {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	if status != domain.LayoutDraft && status != domain.LayoutReady {
		return domain.Layout{}, domain.ErrInvalidInput
	}
	stage, err := s.stageForWrite(ctx, stageID)
	if err != nil {
		return domain.Layout{}, err
	}
	current, err := s.loadLayout(ctx, stageID)
	if err != nil {
		return domain.Layout{}, err
	}
	transitioned := false
	switch {
	case current.Status == domain.LayoutDraft && status == domain.LayoutReady:
		if stage.Type == domain.StageTypeBracket {
			if err := s.lockBracket(ctx, stage); err != nil {
				return domain.Layout{}, err
			}
		} else {
			if err := s.bouts.GenerateForStage(ctx, stage.NominationID, toBoutPools(current.Pools)); err != nil {
				return domain.Layout{}, err
			}
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
		if stage.Type == domain.StageTypeBracket {
			if err := s.unlockBracket(ctx, stage, current.Pools); err != nil {
				return domain.Layout{}, err
			}
		} else {
			if err := s.bouts.ClearForPools(ctx, poolIDs); err != nil {
				return domain.Layout{}, err
			}
		}
		transitioned = true
	}
	if err := s.repo.SetStatus(ctx, stage.ID, status); err != nil {
		return domain.Layout{}, err
	}
	// Публикуем и синхронизируем номинацию только на реальном переходе
	// (draft→ready/ready→draft) — не на no-op (draft→draft/ready→ready), см.
	// mapError и комментарий выше метода (спека 0014, задача T5; спека 0021,
	// FR-1 — фиксация/расфиксация меняет исполнительный статус этапа).
	if transitioned {
		s.liveBus.PublishNominationChanged(stage.NominationID)
		if err := s.syncNomination(ctx, stage.NominationID); err != nil {
			return domain.Layout{}, err
		}
	}
	return s.loadLayout(ctx, stageID)
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
	// stage»): пулы одной номинации могут принадлежать разным этапам с
	// разным статусом (спека 0018).
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
	return s.loadLayout(ctx, pool.StageID)
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
	return s.loadLayout(ctx, pool.StageID)
}

// ---------------------------------------------------------------------
// Спека 0013: ведение текущего боя пула на арене (доска ведения). Спека
// 0018 расширяет: ничья недопустима в сетке (FR-15), пересмотр гейтится
// продвижением следующего круга (FR-16), завершение/пересмотр
// материализуют/снимают следующую пару через syncBracket.
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
	if err := s.syncNomination(ctx, pool.NominationID); err != nil {
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
	if err := s.syncNomination(ctx, pool.NominationID); err != nil {
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
// чтении доски. В сетке (спека 0018): ничья отклоняется (FR-15,
// ErrDrawNotAllowed), завершение материализует следующую пару через
// syncBracket, как только известны обе её стороны (FR-14).
func (s *Service) FinishCurrentBout(ctx context.Context, poolID, actorID string) (domain.BoutBoard, error) {
	poolID = strings.TrimSpace(poolID)
	if poolID == "" {
		return domain.BoutBoard{}, domain.ErrInvalidInput
	}
	pool, bouts, currentID, err := s.currentBoutFor(ctx, poolID)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	stage, err := s.ownerStage(ctx, pool)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	if stage.Type == domain.StageTypeBracket {
		current, ok := boutByID(bouts, currentID)
		if ok && current.ScoreA == current.ScoreB {
			return domain.BoutBoard{}, domain.ErrDrawNotAllowed
		}
	}
	if err := s.bouts.FinishBout(ctx, currentID, actorID); err != nil {
		return domain.BoutBoard{}, err
	}
	if stage.Type == domain.StageTypeBracket {
		if err := s.syncBracket(ctx, stage); err != nil {
			return domain.BoutBoard{}, err
		}
	}
	next := nextUnfinishedAfter(bouts, currentID)
	if err := s.repo.SetCurrentBout(ctx, poolID, next); err != nil {
		return domain.BoutBoard{}, err
	}
	if err := s.syncNomination(ctx, pool.NominationID); err != nil {
		return domain.BoutBoard{}, err
	}
	s.liveBus.PublishNominationChanged(pool.NominationID)
	s.signalArenaBoard(pool.ArenaID)
	return s.boardForPool(ctx, poolID)
}

// ReopenCurrentBout переводит текущий бой завершён → идёт для правки счёта
// (FR-6). В сетке (спека 0018, FR-16): отклоняется, если следующий бой
// победителя уже начат (ErrDownstreamStarted, гейт СТРОГО до действия) —
// иначе снимает продвижение через syncBracket (несформированный бой
// следующего круга исчезает).
func (s *Service) ReopenCurrentBout(ctx context.Context, poolID, actorID string) (domain.BoutBoard, error) {
	poolID = strings.TrimSpace(poolID)
	if poolID == "" {
		return domain.BoutBoard{}, domain.ErrInvalidInput
	}
	pool, _, currentID, err := s.currentBoutFor(ctx, poolID)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	stage, err := s.ownerStage(ctx, pool)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	if stage.Type == domain.StageTypeBracket {
		if err := s.gateDownstream(ctx, stage, pool, currentID); err != nil {
			return domain.BoutBoard{}, err
		}
	}
	if err := s.bouts.ReopenBout(ctx, currentID, actorID); err != nil {
		return domain.BoutBoard{}, err
	}
	if stage.Type == domain.StageTypeBracket {
		if err := s.syncBracket(ctx, stage); err != nil {
			return domain.BoutBoard{}, err
		}
	}
	if err := s.syncNomination(ctx, pool.NominationID); err != nil {
		return domain.BoutBoard{}, err
	}
	s.liveBus.PublishNominationChanged(pool.NominationID)
	s.signalArenaBoard(pool.ArenaID)
	return s.boardForPool(ctx, poolID)
}

// ResetCurrentBout переводит текущий бой идёт → не начат, счёт обнуляется
// (FR-6). В сетке (спека 0018, FR-16) — тот же гейт/пересинхронизация, что
// у Reopen (план «service/service.go»): в норме нет-op (бой ещё не решён,
// downstream не мог начаться), но проверяется единообразно.
func (s *Service) ResetCurrentBout(ctx context.Context, poolID, actorID string) (domain.BoutBoard, error) {
	poolID = strings.TrimSpace(poolID)
	if poolID == "" {
		return domain.BoutBoard{}, domain.ErrInvalidInput
	}
	pool, _, currentID, err := s.currentBoutFor(ctx, poolID)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	stage, err := s.ownerStage(ctx, pool)
	if err != nil {
		return domain.BoutBoard{}, err
	}
	if stage.Type == domain.StageTypeBracket {
		if err := s.gateDownstream(ctx, stage, pool, currentID); err != nil {
			return domain.BoutBoard{}, err
		}
	}
	if err := s.bouts.ResetBout(ctx, currentID, actorID); err != nil {
		return domain.BoutBoard{}, err
	}
	if stage.Type == domain.StageTypeBracket {
		if err := s.syncBracket(ctx, stage); err != nil {
			return domain.BoutBoard{}, err
		}
	}
	if err := s.syncNomination(ctx, pool.NominationID); err != nil {
		return domain.BoutBoard{}, err
	}
	s.liveBus.PublishNominationChanged(pool.NominationID)
	s.signalArenaBoard(pool.ArenaID)
	return s.boardForPool(ctx, poolID)
}

// ownerStage резолвит этап-владелец пула (pool.StageID) — общая часть
// FinishCurrentBout/ReopenCurrentBout/ResetCurrentBout (спека 0018): нужно
// знать тип этапа, чтобы решить, применять ли гейты сетки.
func (s *Service) ownerStage(ctx context.Context, pool domain.Pool) (domain.Stage, error) {
	stage, found, err := s.repo.StageByID(ctx, pool.StageID)
	if err != nil {
		return domain.Stage{}, err
	}
	if !found {
		return domain.Stage{}, domain.ErrNotFound
	}
	return stage, nil
}

// boutByID ищет бой по id в срезе (общий хелпер для гейта ничьей — спека
// 0018, FR-15).
func boutByID(bouts []domain.BoutRef, id string) (domain.BoutRef, bool) {
	for _, b := range bouts {
		if b.ID == id {
			return b, true
		}
	}
	return domain.BoutRef{}, false
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
// пулов (любых номинаций, любых типов этапа — группа или половина круга
// сетки, спека 0018 FR-19a), доступных для постановки.
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

// ListPublicPools возвращает контейнеры только ГРУППОВЫХ этапов номинации
// (спека 0018): сетка публикуется отдельно через NominationLive.Brackets, а
// не как список безымянных пулов. Только для готовой (ready) раскладки
// каждого группового этапа — пока раскладка draft (составляется), контейнеры
// публично не показываются (FR-11, AC-14).
func (s *Service) ListPublicPools(ctx context.Context, nominationID string) ([]domain.Pool, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return nil, domain.ErrInvalidInput
	}
	stages, err := s.stagesForRead(ctx, nominationID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Pool, 0)
	for _, stage := range stages {
		if stage.ID == "" || stage.Type != domain.StageTypeGroups || stage.Status != domain.LayoutReady {
			continue
		}
		rawPools, err := s.combinedPoolsByStage(ctx, stage.ID)
		if err != nil {
			return nil, err
		}
		layout, err := s.assembleLayout(ctx, nominationID, stage, rawPools)
		if err != nil {
			return nil, err
		}
		out = append(out, layout.Pools...)
	}
	return out, nil
}

// ---------------------------------------------------------------------
// Спека 0014: публичный живой снапшот номинации (bout state/score/outcome +
// исполнительный статус пула, экран номинации). Спека 0018: pools — только
// групповые контейнеры, brackets — резолв каждой зафиксированной сетки.
// ---------------------------------------------------------------------

// NominationLive собирает живой снапшот НОМИНАЦИИ ЦЕЛИКОМ (FR-1..FR-3, спека
// 0017 FR-9 — по всем её этапам, не одному): для каждого готового группового
// этапа — обогащённые пулы (enrichPools, как у GetPoolsForArena/
// GetBoutBoard) с боями и текущим боем; для каждого зафиксированного
// bracket-этапа — резолв сетки (без unassigned, FR-19). Stages — этапы
// номинации (спека 0017, FR-11). Пока раскладка draft — этап не участвует в
// снапшоте (FR-12), как и ListPublicPools.
func (s *Service) NominationLive(ctx context.Context, nominationID string) (domain.NominationSnapshot, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return domain.NominationSnapshot{}, domain.ErrInvalidInput
	}
	stages, err := s.stagesForRead(ctx, nominationID)
	if err != nil {
		return domain.NominationSnapshot{}, err
	}

	livePools := make([]domain.LivePool, 0)
	brackets := make([]domain.Bracket, 0)
	for _, stage := range stages {
		if stage.ID == "" || stage.Status != domain.LayoutReady {
			continue
		}
		switch stage.Type {
		case domain.StageTypeGroups:
			pools, err := s.groupLivePools(ctx, stage)
			if err != nil {
				return domain.NominationSnapshot{}, err
			}
			livePools = append(livePools, pools...)
		case domain.StageTypeBracket:
			bracket, err := s.buildBracket(ctx, stage, false)
			if err != nil {
				return domain.NominationSnapshot{}, err
			}
			brackets = append(brackets, bracket)
		}
	}
	results, err := s.resultsFromStages(ctx, nominationID, stages)
	if err != nil {
		return domain.NominationSnapshot{}, err
	}
	return domain.NominationSnapshot{NominationID: nominationID, Stages: stages, Pools: livePools, Brackets: brackets, Results: results}, nil
}

// groupLivePools собирает LivePool для всех контейнеров одного готового
// группового этапа (общая часть NominationLive) — обогащение как
// GetPoolsForArena/GetBoutBoard плюс итоговая таблица (спека 0016, FR-6:
// переиспользуем уже прочитанные бои, без дополнительного вызова порта).
func (s *Service) groupLivePools(ctx context.Context, stage domain.Stage) ([]domain.LivePool, error) {
	rawPools, err := s.combinedPoolsByStage(ctx, stage.ID)
	if err != nil {
		return nil, err
	}
	enriched, err := s.enrichPools(ctx, rawPools)
	if err != nil {
		return nil, err
	}
	out := make([]domain.LivePool, 0, len(enriched))
	for _, pool := range enriched {
		bouts, err := s.bouts.BoutsByPool(ctx, pool.ID)
		if err != nil {
			return nil, err
		}
		pool.Standings = domain.ComputeStandings(pool.Members, bouts)
		sorted := sortedBySequence(bouts)
		current := effectiveCurrentBoutID(pool, sorted)
		out = append(out, domain.LivePool{Pool: pool, Bouts: sorted, CurrentBoutID: current})
	}
	return out, nil
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

// requireDraft проверяет, что раскладка этапа в статусе draft (FR-10/FR-11)
// — единственный вызывающий (DeletePool) уже знает stageID через
// pool.StageID (пул существует ⇒ его этап существует), поэтому резолвится
// напрямую по id, без виртуального фолбэка.
func (s *Service) requireDraft(ctx context.Context, stageID string) error {
	stage, found, err := s.repo.StageByID(ctx, stageID)
	if err != nil {
		return err
	}
	if !found {
		return domain.ErrNotFound
	}
	if stage.Status != domain.LayoutDraft {
		return domain.ErrNotDraft
	}
	return nil
}

// stageForWrite резолвит этап для мутирующих путей раскладки (спека 0018,
// FR-18): просто StageByID + проверка существования — в отличие от 0017,
// больше не создаёт этап неявно (EnsureStage остался только в ListStages,
// план «service/service.go»). Используется в начале CreatePool/ResetLayout/
// AssignFighter/UnassignFighter/AutoDistribute/Undo/SetStatus.
func (s *Service) stageForWrite(ctx context.Context, stageID string) (domain.Stage, error) {
	stage, found, err := s.repo.StageByID(ctx, stageID)
	if err != nil {
		return domain.Stage{}, err
	}
	if !found {
		return domain.Stage{}, domain.ErrNotFound
	}
	return stage, nil
}

// stagesForRead возвращает этапы номинации для публичных ответов (repeated
// stages, спека 0017, FR-11): реальные строки с проставленным
// ExecutionStatus (спека 0021, FR-1, stageStatuses), либо singleton
// виртуального этапа, если строк ещё нет — не менее одного элемента.
func (s *Service) stagesForRead(ctx context.Context, nominationID string) ([]domain.Stage, error) {
	stages, err := s.stageStatuses(ctx, nominationID)
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
// 0009, решение №9). Не пишет в БД — только для публичных read-путей
// (stagesForRead); мутирующие пути (stageForWrite) виртуальный этап не
// видят — они всегда получают stageID, материализованный ListStages (спека
// 0018, FR-18).
func virtualStage(nominationID string) domain.Stage {
	return domain.Stage{
		NominationID:    nominationID,
		Position:        0,
		Title:           domain.DefaultStageTitle,
		Type:            domain.StageTypeGroups,
		Status:          domain.LayoutDraft,
		ExecutionStatus: domain.StageStatusDraft,
	}
}

// loadLayoutAndSync — loadLayout плюс синхронизация состояния номинации с
// модулем nomination (спека 0012, FR-5/FR-6/FR-10; спека 0021, FR-4/FR-5) —
// синхронное продолжение syncNomination (results.go). Вызывается вместо
// loadLayout из мутирующих методов, реально меняющих членство
// (DeletePool/ResetLayout/AssignFighter/UnassignFighter/AutoDistribute/Undo)
// — после того, как мутация уже применена в repo, чтобы вычислить обе оси по
// результирующему состоянию, а не по имени RPC.
func (s *Service) loadLayoutAndSync(ctx context.Context, stageID string) (domain.Layout, error) {
	layout, err := s.loadLayout(ctx, stageID)
	if err != nil {
		return domain.Layout{}, err
	}
	if err := s.syncNomination(ctx, layout.NominationID); err != nil {
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

// loadLayout собирает Layout одного этапа (админ-экран раскладки,
// мутирующие юзкейсы) по его id — не путать с ListPublicPools/NominationLive
// (номинация целиком, по всем этапам, спека 0017 FR-9). Read-only. Этап,
// адресованный несуществующим id, — ErrNotFound (спека 0018, FR-18:
// админский путь всегда начинается со ListStages, поэтому валидный stageID
// у мутирующих/раскладочных RPC гарантированно указывает на реальную
// строку).
func (s *Service) loadLayout(ctx context.Context, stageID string) (domain.Layout, error) {
	stage, found, err := s.repo.StageByID(ctx, stageID)
	if err != nil {
		return domain.Layout{}, err
	}
	if !found {
		return domain.Layout{}, domain.ErrNotFound
	}
	rawPools, err := s.combinedPoolsByStage(ctx, stage.ID)
	if err != nil {
		return domain.Layout{}, err
	}
	return s.assembleLayout(ctx, stage.NominationID, stage, rawPools)
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
// записи; сетка в ready дополнительно заморожена независимо от orphaned,
// спека 0018 FR-22 — см. repo.PruneMembers). Дополнительно (спека 0011):
// заполняет по каждому пулу ArenaID/ArenaName/Name (спека 0018, FR-19a) и
// вычисляемый Status. nominationID передаётся отдельно (не всегда равен
// stage.NominationID вызывающего контекста при виртуальном этапе).
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

	pools, err = s.applyArenaAndStatus(ctx, pools, stage)
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

// applyArenaAndStatus заполняет Name (FR-19a — «Пул N» у группы,
// ContainerTitle у сетки), ArenaName (батч-резолв через ArenaProvider) и
// Status для пулов ОДНОГО известного этапа (assembleLayout — все пулы
// принадлежат stage). Групповой этап: знаменатель статуса и Standings — как
// раньше (ComputePoolStatus + ComputeStandings из прогресса боёв, спека
// 0013 FR-10/0016). Этап-сетка (спека 0018, FR-17): знаменатель —
// разрешённые пары половины круга (bracketStatusesForStage), не число
// материализованных боёв — «завершён» должен учитывать пары, разрешённые
// баем.
func (s *Service) applyArenaAndStatus(ctx context.Context, pools []domain.Pool, stage domain.Stage) ([]domain.Pool, error) {
	arenaNames, err := s.resolveArenaNames(ctx, pools)
	if err != nil {
		return nil, err
	}
	nomNames, err := s.resolveNominationNames(ctx, pools)
	if err != nil {
		return nil, err
	}

	var bracketStatuses map[int]domain.PoolStatus
	if stage.Type == domain.StageTypeBracket {
		bracketStatuses, err = s.bracketStatusesForStage(ctx, stage)
		if err != nil {
			return nil, err
		}
	}

	for i := range pools {
		if stage.Type == domain.StageTypeBracket {
			pools[i].Status = bracketStatuses[pools[i].Number]
			pools[i].Name = domain.ContainerTitle(stage.Bracket, pools[i].Number)
		} else {
			total, started, finished, err := s.bouts.PoolProgress(ctx, pools[i].ID)
			if err != nil {
				return nil, err
			}
			pools[i].Status = domain.ComputePoolStatus(stage.Status, pools[i].ArenaID, started, finished, total)
			pools[i].Name = groupContainerName(pools[i].Number)
			if finished > 0 {
				poolBouts, err := s.bouts.BoutsByPool(ctx, pools[i].ID)
				if err != nil {
					return nil, err
				}
				pools[i].Standings = domain.ComputeStandings(pools[i].Members, poolBouts)
			}
		}
		if pools[i].ArenaID != "" {
			pools[i].ArenaName = arenaNames[pools[i].ArenaID].Name
		}
		pools[i].NominationName = nomNames[pools[i].NominationID].Title
	}
	return pools, nil
}

// groupContainerName — подпись контейнера группового этапа (спека 0009,
// FR-3; спека 0018, FR-19a — вынесено из api.poolName в сервис, чтобы
// формировать имя контейнера в одном месте вместе с ContainerTitle сетки).
func groupContainerName(number int) string {
	return fmt.Sprintf("Пул %d", number)
}

// enrichPools обогащает произвольный список пулов (возможно, разных
// номинаций/этапов/типов — GetPoolsForArena, спека 0011/0018): членов через
// ActiveFightersProvider (по номинациям, батчем), Name/Status через
// владеющий этап (резолвится по p.StageID — не по номинации: пулы одной
// номинации могут принадлежать разным этапам с разным статусом, спека
// 0018) и ArenaName. Используется, когда пулы уже пришли из repo с «сырыми»
// членствами.
func (s *Service) enrichPools(ctx context.Context, rawPools []domain.Pool) ([]domain.Pool, error) {
	if len(rawPools) == 0 {
		return []domain.Pool{}, nil
	}

	fightersByNom := make(map[string]map[string]domain.FighterRef)
	stageByID := make(map[string]domain.Stage)
	bracketStatusByStage := make(map[string]map[int]domain.PoolStatus)

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

		stage, ok := stageByID[p.StageID]
		if !ok {
			st, found, err := s.repo.StageByID(ctx, p.StageID)
			if err != nil {
				return nil, err
			}
			if found {
				stage = st
			}
			stageByID[p.StageID] = stage
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

		if stage.Type == domain.StageTypeBracket {
			statuses, ok := bracketStatusByStage[stage.ID]
			if !ok {
				var err error
				statuses, err = s.bracketStatusesForStage(ctx, stage)
				if err != nil {
					return nil, err
				}
				bracketStatusByStage[stage.ID] = statuses
			}
			enriched.Status = statuses[p.Number]
			enriched.Name = domain.ContainerTitle(stage.Bracket, p.Number)
		} else {
			total, started, finished, err := s.bouts.PoolProgress(ctx, p.ID)
			if err != nil {
				return nil, err
			}
			enriched.Status = domain.ComputePoolStatus(stage.Status, p.ArenaID, started, finished, total)
			enriched.Name = groupContainerName(p.Number)
		}
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
