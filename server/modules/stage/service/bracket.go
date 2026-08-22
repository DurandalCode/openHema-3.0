// Package service — спека 0018: юзкейсы этапа-сетки (плейофф с ручным
// посевом, ADR 0014 §1a/§3/§4). Дерево слотов не хранится — оно вычисляется
// domain.ResolveBracket из посева первого круга и уже материализованных
// боёв на каждом чтении (план, решение 2); syncBracket — единственное
// место, приводящее бои этапа в соответствие резолву.
package service

import (
	"context"
	"strings"

	"github.com/hema/server/modules/stage/domain"
)

// ---------------------------------------------------------------------
// Этапы (FR-2/FR-3/FR-18).
// ---------------------------------------------------------------------

// CreateStage добавляет номинации новый этап — сетку (0018, FR-2) либо
// явный групповой этап (спека 0019, FR-7): валидирует параметры типа (FR-1,
// FR-8), опционально принимает правило отбора (FR-6 — можно задать сразу
// при создании), вычисляет позицию (0019, FR-10 — resolveStagePosition) и
// создаёт строку этапа. Для bracket дополнительно создаёт два контейнера
// первого круга (верхняя/нижняя половина, number 1 и 2, план 0018 решение
// 3) — они же держат посев своей половины слотов; групповой этап своих
// пулов при создании не получает (их создаёт CreatePool либо BuildStage,
// спека 0019). Авто-этап (0017, FR-4) этим методом не создаётся —
// материализуется отдельно (ListStages/EnsureStage).
func (s *Service) CreateStage(ctx context.Context, nominationID string, stageType domain.StageType, title string, bracket domain.BracketConfig, groups domain.GroupsConfig, rule domain.SeedingRule) (domain.Stage, []domain.Stage, error) {
	nominationID = strings.TrimSpace(nominationID)
	title = strings.TrimSpace(title)
	if nominationID == "" || title == "" {
		return domain.Stage{}, nil, domain.ErrInvalidInput
	}
	switch stageType {
	case domain.StageTypeBracket:
		if !domain.ValidBracketSize(bracket.Size) || groups.GroupCount != 0 {
			return domain.Stage{}, nil, domain.ErrInvalidInput
		}
	case domain.StageTypeGroups:
		if groups.GroupCount < 1 || bracket != (domain.BracketConfig{}) {
			return domain.Stage{}, nil, domain.ErrInvalidInput
		}
	default:
		return domain.Stage{}, nil, domain.ErrInvalidInput
	}

	if !rule.IsZero() {
		// Метод раскладки клиент не присылает (FR-4) — выводим сам из типа
		// целевого этапа ДО валидации, иначе Validate отклонит правило по
		// пустому Method независимо от остальных полей.
		rule.Method = domain.ResolveMethod(stageType == domain.StageTypeBracket)
		if err := rule.Validate(stageType == domain.StageTypeBracket); err != nil {
			return domain.Stage{}, nil, err
		}
		if err := s.validateRuleSourceForCreate(ctx, nominationID, rule); err != nil {
			return domain.Stage{}, nil, err
		}
	}

	position, err := s.resolveStagePosition(ctx, nominationID, rule)
	if err != nil {
		return domain.Stage{}, nil, err
	}
	stage, err := s.repo.CreateStage(ctx, nominationID, position, title, stageType, bracket, groups, rule)
	if err != nil {
		return domain.Stage{}, nil, err
	}

	if stageType == domain.StageTypeBracket {
		// Первый круг всегда делится на две половины (FR-6a): при валидном
		// размере (4/8/16/32) в нём минимум две пары.
		if _, err := s.repo.CreatePool(ctx, stage.ID, domain.ContainerNumberOf(bracket, 1, 1)); err != nil {
			return domain.Stage{}, nil, err
		}
		if _, err := s.repo.CreatePool(ctx, stage.ID, domain.ContainerNumberOf(bracket, 1, 2)); err != nil {
			return domain.Stage{}, nil, err
		}
	}

	stages, err := s.repo.StagesByNomination(ctx, nominationID)
	if err != nil {
		return domain.Stage{}, nil, err
	}
	// Новый этап в draft может «расфинишировать» уже завершённую номинацию
	// (спека 0021, FR-4/FR-6, AC-5) — синхронизируем сразу.
	if err := s.syncNomination(ctx, nominationID); err != nil {
		return domain.Stage{}, nil, err
	}
	return stage, stages, nil
}

// validateRuleSourceForCreate — вариант validateRuleSource (service/
// seeding.go) для создаваемого этапа (спека 0019, FR-2): целевого id ещё
// нет, поэтому self-reference и «раньше по позиции» не проверяются —
// вычисляемая resolveStagePosition позиция нового этапа (source.Position+1,
// 0 либо MaxStagePosition+1) не может оказаться раньше источника ни в одном
// из трёх случаев, инвариант соблюдается конструктивно.
func (s *Service) validateRuleSourceForCreate(ctx context.Context, nominationID string, rule domain.SeedingRule) error {
	if rule.SourceKind != domain.SourceKindStage {
		return nil
	}
	src, found, err := s.repo.StageByID(ctx, rule.SourceStageID)
	if err != nil {
		return err
	}
	if !found || src.NominationID != nominationID || src.Type != domain.StageTypeGroups {
		return domain.ErrSourceNotAllowed
	}
	return nil
}

// DeleteStage удаляет любой этап номинации — этап-сетку (0018, FR-3),
// явно созданный групповой этап (спека 0019, FR-7a) либо авто-этап (0017,
// FR-4) — по общим основаниям (спека 0020, FR-5: прежний отдельный запрет
// на удаление авто-этапа снят, он больше не особенный): «нет начатых боёв в
// контейнерах этапа» и «этап не служит источником для другого этапа»
// (ErrStageIsSource, AC-19) — иначе удаление молча оборвало бы ссылку
// правила зависимой ветки. Удаление единственного этапа номинации
// возвращает схему к пустой — очередной ListStages снова материализует
// пустой авто-этап (0020, FR-6). Удаляет бои этапа (ClearForPools), затем
// строку этапа — контейнеры и членства уходят каскадом БД (репозиторий).
func (s *Service) DeleteStage(ctx context.Context, stageID string) ([]domain.Stage, error) {
	stageID = strings.TrimSpace(stageID)
	if stageID == "" {
		return nil, domain.ErrInvalidInput
	}
	stage, found, err := s.repo.StageByID(ctx, stageID)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, domain.ErrNotFound
	}

	sources, err := s.repo.StagesBySource(ctx, stageID)
	if err != nil {
		return nil, err
	}
	if len(sources) > 0 {
		return nil, domain.ErrStageIsSource
	}

	pools, err := s.repo.PoolsByStage(ctx, stageID)
	if err != nil {
		return nil, err
	}
	poolIDs := poolIDsOf(pools)
	started, err := s.bouts.AnyStartedInPools(ctx, poolIDs)
	if err != nil {
		return nil, err
	}
	if started {
		return nil, domain.ErrStageNotDeletable
	}

	if err := s.bouts.ClearForPools(ctx, poolIDs); err != nil {
		return nil, err
	}
	if err := s.repo.DeleteStage(ctx, stageID); err != nil {
		return nil, err
	}
	// DeleteStage может убрать сетку, уже видимую публично (ready без
	// начатых боёв — легитимное состояние, FR-3 не требует draft) —
	// сигналим живой снапшот, как остальные мутации, способные его menять.
	// Удаление недоигранного «хвоста» схемы может завершить номинацию (спека
	// 0021, FR-6, AC-5) — синхронизируем.
	s.notifyNominationChanged(stage.NominationID)
	if err := s.syncNomination(ctx, stage.NominationID); err != nil {
		return nil, err
	}
	return s.stagesForRead(ctx, stage.NominationID)
}

// ListStages возвращает этапы номинации (FR-18) вместе с диагностикой схемы
// (спека 0020, FR-8): DiagnoseSchema — чистая функция от того же набора
// этапов, отдельного чтения не требует. Материализует групповой этап, если
// строки ещё нет (0017, FR-4) — единственное место, где EnsureStage
// вызывается на write-пути (план «service/service.go»): админский путь
// всегда начинается со списка этапов, поэтому дальше stage.id гарантированно
// непустой у всех мутирующих RPC. Диагностика ничего не блокирует сама по
// себе (FR-9) — коды, отклоняющие формирование (SelectorOverlap/
// NoGroupCount/…), проверяются тем же путём, что и гейты SetStageRule/
// BuildStage; она лишь объясняет заранее.
func (s *Service) ListStages(ctx context.Context, nominationID string) ([]domain.Stage, []domain.SchemaIssue, error) {
	nominationID = strings.TrimSpace(nominationID)
	if nominationID == "" {
		return nil, nil, domain.ErrInvalidInput
	}
	if _, err := s.repo.EnsureStage(ctx, nominationID); err != nil {
		return nil, nil, err
	}
	stages, err := s.stageStatuses(ctx, nominationID)
	if err != nil {
		return nil, nil, err
	}
	return stages, domain.DiagnoseSchema(stages), nil
}

// bracketStage резолвит этап-сетку по id: не найден → ErrNotFound; найден,
// но не bracket → ErrStageTypeMismatch (посев/сетка отклоняются на групповом
// этапе так же, как AutoDistribute/CreatePool отклоняются на сетке).
func (s *Service) bracketStage(ctx context.Context, stageID string) (domain.Stage, error) {
	stage, found, err := s.repo.StageByID(ctx, stageID)
	if err != nil {
		return domain.Stage{}, err
	}
	if !found {
		return domain.Stage{}, domain.ErrNotFound
	}
	if stage.Type != domain.StageTypeBracket {
		return domain.Stage{}, domain.ErrStageTypeMismatch
	}
	return stage, nil
}

// ---------------------------------------------------------------------
// Посев (FR-7/FR-8/FR-9).
// ---------------------------------------------------------------------

// SeedBracketSlot сажает бойца в слот первого круга сетки (FR-7/FR-8):
// только в draft; диапазон слота 1..size; контейнер-владелец членства —
// HalfOfSlot(cfg, slot). Занятый слот: если сажаемый боец уже сидит в
// другом слоте этого этапа — обмен местами (в т.ч. между половинами —
// тогда меняются и контейнеры членств, всё это делает repo.SeedSlot одной
// операцией); занят другим, ещё не посеянным в этом этапе бойцом —
// ErrSlotOccupied (слот сначала освобождают, FR-8). Дальше — как
// AssignFighter: синхронизация приёма заявок (FR-21) и очистка undo
// (repo.SeedSlot делает это сама).
func (s *Service) SeedBracketSlot(ctx context.Context, stageID string, slot int, fighterID string) (domain.Bracket, error) {
	stageID = strings.TrimSpace(stageID)
	fighterID = strings.TrimSpace(fighterID)
	if stageID == "" || fighterID == "" {
		return domain.Bracket{}, domain.ErrInvalidInput
	}
	stage, err := s.bracketStage(ctx, stageID)
	if err != nil {
		return domain.Bracket{}, err
	}
	if stage.Status != domain.LayoutDraft {
		return domain.Bracket{}, domain.ErrNotDraft
	}
	if slot < 1 || slot > stage.Bracket.Size {
		return domain.Bracket{}, domain.ErrInvalidInput
	}

	seeds, err := s.repo.SeedsByStage(ctx, stageID)
	if err != nil {
		return domain.Bracket{}, err
	}
	occupant := ""
	fighterAlreadySeeded := false
	for _, sd := range seeds {
		if sd.Slot == slot {
			occupant = sd.Fighter.ID
		}
		if sd.Fighter.ID == fighterID {
			fighterAlreadySeeded = true
		}
	}
	if occupant != "" && occupant != fighterID && !fighterAlreadySeeded {
		return domain.Bracket{}, domain.ErrSlotOccupied
	}

	containerID, err := s.containerOfHalf(ctx, stageID, domain.HalfOfSlot(stage.Bracket, slot))
	if err != nil {
		return domain.Bracket{}, err
	}
	if err := s.repo.SeedSlot(ctx, stageID, containerID, fighterID, slot); err != nil {
		return domain.Bracket{}, err
	}
	if err := s.syncBracketRegistration(ctx, stage.NominationID); err != nil {
		return domain.Bracket{}, err
	}
	return s.buildBracket(ctx, stage, true)
}

// ClearBracketSlot освобождает слот (FR-8). Идемпотентно — слот без
// посеянного бойца не даёт ошибку. Только в draft.
func (s *Service) ClearBracketSlot(ctx context.Context, stageID string, slot int) (domain.Bracket, error) {
	stageID = strings.TrimSpace(stageID)
	if stageID == "" {
		return domain.Bracket{}, domain.ErrInvalidInput
	}
	stage, err := s.bracketStage(ctx, stageID)
	if err != nil {
		return domain.Bracket{}, err
	}
	if stage.Status != domain.LayoutDraft {
		return domain.Bracket{}, domain.ErrNotDraft
	}
	if slot < 1 || slot > stage.Bracket.Size {
		return domain.Bracket{}, domain.ErrInvalidInput
	}

	seeds, err := s.repo.SeedsByStage(ctx, stageID)
	if err != nil {
		return domain.Bracket{}, err
	}
	for _, sd := range seeds {
		if sd.Slot == slot {
			if err := s.repo.UnassignFighter(ctx, stageID, sd.Fighter.ID); err != nil {
				return domain.Bracket{}, err
			}
			break
		}
	}
	if err := s.syncBracketRegistration(ctx, stage.NominationID); err != nil {
		return domain.Bracket{}, err
	}
	return s.buildBracket(ctx, stage, true)
}

// GetBracket возвращает админский вид сетки (FR-7/FR-19): резолв посева и
// материализованных боёв + unassigned (активный ростер минус уже
// посеянные). Ничего не материализует — чтение.
func (s *Service) GetBracket(ctx context.Context, stageID string) (domain.Bracket, error) {
	stageID = strings.TrimSpace(stageID)
	if stageID == "" {
		return domain.Bracket{}, domain.ErrInvalidInput
	}
	stage, err := s.bracketStage(ctx, stageID)
	if err != nil {
		return domain.Bracket{}, err
	}
	return s.buildBracket(ctx, stage, true)
}

// containerOfHalf возвращает id контейнера-владельца half первого круга
// этапа (number 1 или 2 — см. CreateStage).
func (s *Service) containerOfHalf(ctx context.Context, stageID string, half int) (string, error) {
	pools, err := s.repo.PoolsByStage(ctx, stageID)
	if err != nil {
		return "", err
	}
	for _, p := range pools {
		if p.Number == half {
			return p.ID, nil
		}
	}
	return "", domain.ErrNotFound
}

// syncBracketRegistration синхронизирует состояние номинации после
// посева/освобождения слота (спека 0012, FR-5/FR-6; спека 0017, FR-9; спека
// 0021, FR-4/FR-5) — тонкая обёртка над syncNomination (той же механикой,
// что и loadLayoutAndSync).
func (s *Service) syncBracketRegistration(ctx context.Context, nominationID string) error {
	return s.syncNomination(ctx, nominationID)
}

// ---------------------------------------------------------------------
// Резолв и обогащение (FR-19, GetBracket/SeedBracketSlot/ClearBracketSlot).
// ---------------------------------------------------------------------

// bracketPairKey индексирует материализованный бой по координатам пары
// (круг, глобальный номер пары в круге) — общий индекс для syncBracket,
// buildBracket и bracketHalfStatuses.
type bracketPairKey struct{ round, pair int }

// bracketBoutRows читает бои всех контейнеров этапа-сетки и восстанавливает
// координаты каждой пары (круг + глобальный номер) из координат контейнера
// (ContainerCoords) и порядкового номера боя внутри контейнера
// (PairOfBout) — вход domain.ResolveBracket и индекс для сверки
// наличия/состава пары при синхронизации (FR-14/FR-16).
func (s *Service) bracketBoutRows(ctx context.Context, cfg domain.BracketConfig, pools []domain.Pool) ([]domain.BracketBout, map[bracketPairKey]domain.BoutRef, error) {
	rows := make([]domain.BracketBout, 0)
	byPair := make(map[bracketPairKey]domain.BoutRef)
	for _, p := range pools {
		round, half, ok := domain.ContainerCoords(cfg, p.Number)
		if !ok {
			continue
		}
		bouts, err := s.bouts.BoutsByPool(ctx, p.ID)
		if err != nil {
			return nil, nil, err
		}
		sorted := sortedBySequence(bouts)
		for i, b := range sorted {
			pair := domain.PairOfBout(cfg, round, half, i+1)
			rows = append(rows, domain.BracketBout{
				Round: round, Pair: pair, ID: b.ID,
				A: b.FighterA, B: b.FighterB, State: b.State,
				ScoreA: b.ScoreA, ScoreB: b.ScoreB,
			})
			byPair[bracketPairKey{round, pair}] = b
		}
	}
	return rows, byPair, nil
}

// enrichedSeeds читает посев этапа и обогащает имена/клубы через активный
// ростер номинации (как assembleLayout — обогащение членства). orphaned —
// хотя бы один посеянный боец больше не активен (реконсиляция, FR-22): в
// draft такой посев не возвращается (слот трактуется как свободный на
// чтении, PruneMembers почистит хранилище); в ready — посев заморожен,
// возвращается как есть (сформированные бои сохраняют снапшот участников).
func (s *Service) enrichedSeeds(ctx context.Context, stage domain.Stage, activeByID map[string]domain.FighterRef) (seeds []domain.Seed, orphaned bool, err error) {
	raw, err := s.repo.SeedsByStage(ctx, stage.ID)
	if err != nil {
		return nil, false, err
	}
	seeds = make([]domain.Seed, 0, len(raw))
	for _, sd := range raw {
		ref := sd.Fighter
		if enriched, ok := activeByID[sd.Fighter.ID]; ok {
			ref = enriched
		} else if stage.Status == domain.LayoutDraft {
			orphaned = true
			continue
		}
		seeds = append(seeds, domain.Seed{Slot: sd.Slot, Fighter: ref})
	}
	return seeds, orphaned, nil
}

// buildBracket резолвит и обогащает сетку этапа (FR-19): посев + бои
// контейнеров этапа → domain.ResolveBracket → обогащение контейнеров
// (статус/арена, как loadLayout) и unassigned (активный ростер минус уже
// посеянные в этом этапе, только если includeUnassigned — публичный путь,
// NominationLive, его не заполняет). Ничего не материализует — чтение
// (план «service/bracket.go», GetBracket).
func (s *Service) buildBracket(ctx context.Context, stage domain.Stage, includeUnassigned bool) (domain.Bracket, error) {
	cfg := stage.Bracket

	active, err := s.fighters.ActiveFightersByNomination(ctx, stage.NominationID)
	if err != nil {
		return domain.Bracket{}, err
	}
	activeByID := make(map[string]domain.FighterRef, len(active))
	for _, f := range active {
		activeByID[f.ID] = f
	}

	seeds, orphaned, err := s.enrichedSeeds(ctx, stage, activeByID)
	if err != nil {
		return domain.Bracket{}, err
	}
	if orphaned {
		activeIDs := make([]string, 0, len(active))
		for _, f := range active {
			activeIDs = append(activeIDs, f.ID)
		}
		if err := s.repo.PruneMembers(ctx, stage.NominationID, activeIDs); err != nil {
			return domain.Bracket{}, err
		}
	}

	pools, err := s.repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		return domain.Bracket{}, err
	}
	bracketBouts, boutByPair, err := s.bracketBoutRows(ctx, cfg, pools)
	if err != nil {
		return domain.Bracket{}, err
	}

	view := domain.ResolveBracket(cfg, seeds, bracketBouts)

	poolByNumber := make(map[int]domain.Pool, len(pools))
	for _, p := range pools {
		poolByNumber[p.Number] = p
	}
	statusByContainer, err := s.bracketContainerStatuses(ctx, stage, view, poolByNumber)
	if err != nil {
		return domain.Bracket{}, err
	}
	arenaNames, err := s.resolveArenaNames(ctx, pools)
	if err != nil {
		return domain.Bracket{}, err
	}

	rounds := make([]domain.BracketRoundView, 0, len(view.Rounds))
	for _, r := range view.Rounds {
		halves := make([]domain.BracketHalfView, 0, len(r.Halves))
		for _, h := range r.Halves {
			rawContainer := poolByNumber[h.ContainerNumber]
			container := domain.Pool{
				ID: rawContainer.ID, StageID: rawContainer.StageID, NominationID: rawContainer.NominationID,
				Number: rawContainer.Number, Name: domain.ContainerTitle(cfg, h.ContainerNumber),
				ArenaID: rawContainer.ArenaID, Status: statusByContainer[h.ContainerNumber],
			}
			if rawContainer.ArenaID != "" {
				container.ArenaName = arenaNames[rawContainer.ArenaID].Name
			}

			pairs := make([]domain.BracketPairView, 0, len(h.Pairs))
			for _, pr := range h.Pairs {
				pv := domain.BracketPairView{Index: pr.Index, A: pr.A, B: pr.B, Resolved: pr.Resolved}
				if pr.Bout != nil {
					if b, ok := boutByPair[bracketPairKey{r.Number, pr.Index}]; ok {
						pv.Bout = &b
					}
				}
				pairs = append(pairs, pv)
			}

			// Контейнер круга >= 2 может ещё не существовать (создаётся только
			// lockBracket'ом при фиксации, план «service/bracket.go») — резолв
			// (view) уже знает про этот круг чисто вычислительно, но читать
			// его бои нечего: rawContainer — нулевое значение, CurrentBoutID
			// остаётся пустым.
			var currentBoutID string
			if rawContainer.ID != "" {
				sortedContainerBouts, err := s.bouts.BoutsByPool(ctx, rawContainer.ID)
				if err != nil {
					return domain.Bracket{}, err
				}
				currentBoutID = effectiveCurrentBoutID(rawContainer, sortedContainerBouts)
			}
			halves = append(halves, domain.BracketHalfView{
				Number: h.Number, Title: h.Title, Container: container, Pairs: pairs,
				CurrentBoutID: currentBoutID,
			})
		}
		rounds = append(rounds, domain.BracketRoundView{
			Number: r.Number, Title: r.Title, ThirdPlace: r.ThirdPlace, Halves: halves,
		})
	}

	bracket := domain.Bracket{
		Stage: stage, Rounds: rounds,
		CanUndo:          stage.Undo.Kind != domain.UndoNone,
		Champion:         view.Champion,
		ThirdPlaceWinner: view.ThirdPlaceWinner,
	}
	if includeUnassigned {
		seededIDs := make(map[string]bool, len(seeds))
		for _, sd := range seeds {
			seededIDs[sd.Fighter.ID] = true
		}
		unassigned := make([]domain.FighterRef, 0, len(active))
		for _, f := range active {
			if !seededIDs[f.ID] {
				unassigned = append(unassigned, f)
			}
		}
		bracket.Unassigned = unassigned
	}
	return bracket, nil
}

// bracketContainerStatuses вычисляет статус каждого контейнера сетки
// (FR-17) из уже резолвленного дерева: знаменатель — число разрешённых пар
// половины, а не число материализованных боёв (см. computeHalfStatus).
func (s *Service) bracketContainerStatuses(ctx context.Context, stage domain.Stage, view domain.BracketView, poolByNumber map[int]domain.Pool) (map[int]domain.PoolStatus, error) {
	out := make(map[int]domain.PoolStatus, len(poolByNumber))
	for _, r := range view.Rounds {
		for _, h := range r.Halves {
			p := poolByNumber[h.ContainerNumber]
			total := len(h.Pairs)
			resolved := 0
			started := 0
			for _, pr := range h.Pairs {
				if pr.Resolved {
					resolved++
				}
				if pr.Bout != nil && pr.Bout.State != domain.BoutStateNotStarted {
					started++
				}
			}
			out[h.ContainerNumber] = computeHalfStatus(stage.Status, p.ArenaID, started, resolved, total)
		}
	}
	return out, nil
}

// bracketStatusesForStage вычисляет статус каждого контейнера этапа-сетки
// (FR-17) с нуля — используется service.enrichPools/applyArenaAndStatus
// (списки, собранные из разных номинаций/этапов, напр. GetPoolsForArena,
// FR-9/FR-19a), где ещё нет готового резолва.
func (s *Service) bracketStatusesForStage(ctx context.Context, stage domain.Stage) (map[int]domain.PoolStatus, error) {
	pools, err := s.repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		return nil, err
	}
	active, err := s.fighters.ActiveFightersByNomination(ctx, stage.NominationID)
	if err != nil {
		return nil, err
	}
	activeByID := make(map[string]domain.FighterRef, len(active))
	for _, f := range active {
		activeByID[f.ID] = f
	}
	seeds, _, err := s.enrichedSeeds(ctx, stage, activeByID)
	if err != nil {
		return nil, err
	}
	bracketBouts, _, err := s.bracketBoutRows(ctx, stage.Bracket, pools)
	if err != nil {
		return nil, err
	}
	view := domain.ResolveBracket(stage.Bracket, seeds, bracketBouts)

	poolByNumber := make(map[int]domain.Pool, len(pools))
	for _, p := range pools {
		poolByNumber[p.Number] = p
	}
	return s.bracketContainerStatuses(ctx, stage, view, poolByNumber)
}

// computeHalfStatus — обёртка ComputePoolStatus для контейнера сетки
// (FR-17): знаменатель — число разрешённых пар этой половины (домен
// ResolveBracket, включая пары, разрешённые баем), а не число
// материализованных боёв, как у обычного пула группы. Логика перехода та
// же (draft→not_ready, все пары разрешены→finished, есть начатая→active,
// на арене→preparing, иначе ready) — ComputePoolStatus достаточно общая,
// чтобы принять «разрешённые пары» на месте «завершённые бои».
func computeHalfStatus(layoutStatus domain.LayoutStatus, arenaID string, started, resolvedPairs, totalPairs int) domain.PoolStatus {
	return domain.ComputePoolStatus(layoutStatus, arenaID, started, resolvedPairs, totalPairs)
}

// ---------------------------------------------------------------------
// Фиксация и материализация (FR-9/FR-10/FR-11/FR-14/FR-16).
// ---------------------------------------------------------------------

// lockBracket фиксирует посев сетки (draft → ready, вызывается из
// SetStatus): гейт «посеяно >= 2» (FR-11), создаёт контейнеры всех половин
// кругов 2..R (+ R+1 при бронзе), затем syncBracket материализует бои
// только полных пар — баи продвигаются без боя (FR-9/FR-14).
func (s *Service) lockBracket(ctx context.Context, stage domain.Stage) error {
	seeds, err := s.repo.SeedsByStage(ctx, stage.ID)
	if err != nil {
		return err
	}
	if len(seeds) < 2 {
		return domain.ErrNotEnoughSeeds
	}

	cfg := stage.Bracket
	maxRound := domain.RoundCount(cfg.Size)
	if cfg.ThirdPlace {
		maxRound++
	}
	for round := 2; round <= maxRound; round++ {
		for half := 1; half <= domain.HalvesInRound(cfg, round); half++ {
			number := domain.ContainerNumberOf(cfg, round, half)
			if _, err := s.repo.CreatePool(ctx, stage.ID, number); err != nil {
				return err
			}
		}
	}
	return s.syncBracket(ctx, stage)
}

// unlockBracket расфиксирует посев сетки (ready → draft, вызывается из
// SetStatus после существующих гейтов — арена/результаты, FR-10): удаляет
// бои этапа (ClearForPools) и контейнеры кругов >= 2 (DeleteContainers) —
// первый круг (number 1/2) и посев в нём остаются.
func (s *Service) unlockBracket(ctx context.Context, stage domain.Stage, pools []domain.Pool) error {
	poolIDs := poolIDsOf(pools)
	if err := s.bouts.ClearForPools(ctx, poolIDs); err != nil {
		return err
	}
	toDelete := make([]string, 0, len(pools))
	for _, p := range pools {
		if p.Number > 2 {
			toDelete = append(toDelete, p.ID)
		}
	}
	return s.repo.DeleteContainers(ctx, toDelete)
}

// syncBracket приводит бои этапа-сетки к резолву (FR-14/FR-16): единственное
// место, создающее и удаляющее бои сетки.
//  1. контейнеры этапа + их бои → resolve (координаты пары восстанавливаются
//     через ContainerCoords + PairOfBout);
//  2. Expected-пара без боя → ScheduleBout(контейнер своей половины,
//     round=r, sequence=позиция пары внутри половины, A, B);
//  3. бой есть, но пара больше не Expected, либо состав пары изменился
//     (последствие пересмотра предыдущего круга, FR-16) → DeleteBouts, если
//     бой ещё не начат (начатый/завершённый бой syncBracket никогда не
//     трогает — гейт ErrDownstreamStarted в вызывающем стоит раньше).
//
// Вызывается из lockBracket (SetStatus draft→ready), FinishCurrentBout,
// ReopenCurrentBout, ResetCurrentBout — отовсюду, где меняется множество
// завершённых боёв сетки.
func (s *Service) syncBracket(ctx context.Context, stage domain.Stage) error {
	cfg := stage.Bracket

	active, err := s.fighters.ActiveFightersByNomination(ctx, stage.NominationID)
	if err != nil {
		return err
	}
	activeByID := make(map[string]domain.FighterRef, len(active))
	for _, f := range active {
		activeByID[f.ID] = f
	}
	seeds, _, err := s.enrichedSeeds(ctx, stage, activeByID)
	if err != nil {
		return err
	}

	pools, err := s.repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		return err
	}
	containerIDByNumber := make(map[int]string, len(pools))
	for _, p := range pools {
		containerIDByNumber[p.Number] = p.ID
	}
	bracketBouts, existing, err := s.bracketBoutRows(ctx, cfg, pools)
	if err != nil {
		return err
	}

	view := domain.ResolveBracket(cfg, seeds, bracketBouts)

	for _, r := range view.Rounds {
		for _, h := range r.Halves {
			poolID, ok := containerIDByNumber[h.ContainerNumber]
			if !ok {
				continue // контейнер круга ещё не создан — не должно происходить после lockBracket
			}
			for pi, pair := range h.Pairs {
				sequence := pi + 1
				old, hadOld := existing[bracketPairKey{r.Number, pair.Index}]

				compositionChanged := hadOld && (old.FighterA.ID != pair.A.Fighter.ID || old.FighterB.ID != pair.B.Fighter.ID)
				if hadOld && old.State == domain.BoutStateNotStarted && (!pair.Expected || compositionChanged) {
					if err := s.bouts.DeleteBouts(ctx, []string{old.ID}); err != nil {
						return err
					}
					hadOld = false
				}
				if pair.Expected && !hadOld {
					if _, err := s.bouts.ScheduleBout(ctx, stage.NominationID, poolID, r.Number, sequence, pair.A.Fighter, pair.B.Fighter); err != nil {
						return err
					}
				}
			}
		}
	}
	return nil
}

// gateDownstream — гейт FR-16 для reopen/reset текущего боя контейнера
// сетки: находит координаты (round, pair) currentID среди боёв контейнера
// пула и отклоняет действие, если продолжение уже начато. Вызывается ДО
// самого действия (план «Риски»: гейт обязан стоять раньше, иначе можно
// потерять начатый бой). No-op (nil), если pool не является контейнером
// сетки (координаты не резолвятся) или currentID не найден среди боёв
// контейнера.
func (s *Service) gateDownstream(ctx context.Context, stage domain.Stage, pool domain.Pool, currentID string) error {
	round, half, ok := domain.ContainerCoords(stage.Bracket, pool.Number)
	if !ok {
		return nil
	}
	bouts, err := s.bouts.BoutsByPool(ctx, pool.ID)
	if err != nil {
		return err
	}
	sorted := sortedBySequence(bouts)
	sequence := 0
	for i, b := range sorted {
		if b.ID == currentID {
			sequence = i + 1
			break
		}
	}
	if sequence == 0 {
		return nil
	}
	pair := domain.PairOfBout(stage.Bracket, round, half, sequence)
	started, err := s.downstreamStarted(ctx, stage, round, pair)
	if err != nil {
		return err
	}
	if started {
		return domain.ErrDownstreamStarted
	}
	return nil
}

// downstreamStarted проверяет гейт FR-16 для пересмотра боя пары (round,
// pair) круга сетки: если пара (round+1, ceil(pair/2)) уже имеет начатый
// или завершённый бой — результат уже «уехал» дальше, пересмотр отклоняется
// ДО действия (план «Риски»: гейт обязан стоять раньше самого действия,
// иначе можно потерять начатый бой). При включённой бронзе то же самое для
// пары полуфинала против круга бронзы (R+1): полуфинал участвует в двух
// продолжениях — победитель в круге R+1(финал следующего уровня для этой
// пары) и, если это полуфинал, проигравший — в бронзе.
func (s *Service) downstreamStarted(ctx context.Context, stage domain.Stage, round, pair int) (bool, error) {
	cfg := stage.Bracket
	lastRound := domain.RoundCount(cfg.Size)

	pools, err := s.repo.PoolsByStage(ctx, stage.ID)
	if err != nil {
		return false, err
	}
	_, existing, err := s.bracketBoutRows(ctx, cfg, pools)
	if err != nil {
		return false, err
	}
	started := func(r, p int) bool {
		b, ok := existing[bracketPairKey{r, p}]
		return ok && b.State != domain.BoutStateNotStarted
	}

	// Круг < финала: победитель продвигается в пару (round+1, ceil(pair/2)).
	if round < lastRound && started(round+1, (pair+1)/2) {
		return true, nil
	}
	// Полуфинал при включённой бронзе: проигравший продвигается в круг
	// бронзы (lastRound+1, единственная пара).
	if cfg.ThirdPlace && round == lastRound-1 && started(lastRound+1, 1) {
		return true, nil
	}
	return false, nil
}
