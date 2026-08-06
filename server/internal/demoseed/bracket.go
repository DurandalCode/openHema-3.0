// Спека 0018: демо-сид этапа-сетки (плейофф с ручным посевом) поверх уже
// сформированных групп/боёв (SeedPoolsAndBouts). Отдельный файл — тот же
// приём, что и в модуле `stage` (service.go/bracket.go): бои сетки не
// смешиваются со сценарием групп по коду, хотя используют один и тот же
// stageservice.Service.
package demoseed

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"sort"

	fighterdomain "github.com/hema/server/modules/fighter/domain"
	fighterservice "github.com/hema/server/modules/fighter/service"
	stagedomain "github.com/hema/server/modules/stage/domain"
	stageservice "github.com/hema/server/modules/stage/service"
)

// bracketStageTitle — название демо-этапа-сетки в UI.
const bracketStageTitle = "Плейофф"

// bracketStageSize — размер сетки демо-этапа (степень двойки 4/8/16/32,
// спека 0018 FR-1). 8 с боем за 3-е место — достаточно, чтобы показать все
// круги (1/4 финала → полуфинал → финал/бронза), не разрастаясь на экране.
const bracketStageSize = 8

// BracketSeedResult — итог SeedBracketStage: для отчёта в консоль и для
// ручной проверки (T30) — прямая ссылка на страницу сетки в админке.
type BracketSeedResult struct {
	// NominationID/StageID — пусто, если сеять было некого (<2 активных
	// бойцов номинации, как и остальные шаги demo-bouts).
	NominationID string
	StageID      string
	SeededSlots  int
}

// SeedBracketStage добавляет номинации этап-сетку (спека 0018, FR-2) поверх
// уже зафиксированной групповой раскладки той же номинации (SeedPoolsAndBouts
// должен быть вызван раньше — так демо сразу показывает AC-12: у номинации
// одновременно есть групповой этап и сетка, оба с реальными боями). Сеет до
// 7 из 8 слотов активными бойцами номинации — специально не все 8, чтобы
// продемонстрировать бай в недостающей паре (FR-9); фиксирует посев (FR-10),
// материализуя бои заполненных пар первого круга, и доигрывает верхнюю
// половину частично: первая пара — до победителя (FR-14), вторая — начата и
// несёт реальный незавершённый счёт («идёт», как RunningPoolID в
// SeedPoolsAndBouts), остальные пары остаются нетронутыми («ожидает»/бай).
// Так сразу после `make demo-bouts` сетка в браузере показывает разные
// состояния пар (pending/filled/resolved) без ручного прокликивания.
//
// arenaID — площадка для верхней половины первого круга: StartCurrentBout
// требует, чтобы контейнер стоял на арене (ErrPoolNotSeated), как и обычные
// пулы (спека 0011). Отдельная арена от показательных пулов
// SeedPoolsAndBouts — те уже заняты своими showcase-пулами.
func SeedBracketStage(
	ctx context.Context,
	poolSvc *stageservice.Service,
	fighterSvc *fighterservice.Service,
	tournamentID, nominationID, arenaID, actorID string,
	rng *rand.Rand,
) (BracketSeedResult, error) {
	result := BracketSeedResult{NominationID: nominationID}
	if nominationID == "" {
		return result, nil
	}

	activeIDs, err := activeFighterIDsForNomination(ctx, fighterSvc, tournamentID, nominationID)
	if err != nil {
		return result, fmt.Errorf("list active fighters for nomination %s: %w", nominationID, err)
	}
	if len(activeIDs) < 2 {
		return result, nil // некого сеять — фиксация отклонит меньше двух (FR-11)
	}

	stage, _, err := poolSvc.CreateStage(ctx, nominationID, stagedomain.StageTypeBracket, bracketStageTitle, stagedomain.BracketConfig{
		Size:       bracketStageSize,
		ThirdPlace: true,
	}, stagedomain.GroupsConfig{}, stagedomain.SeedingRule{})
	if err != nil {
		return result, fmt.Errorf("create bracket stage: %w", err)
	}
	result.StageID = stage.ID
	result.NominationID = nominationID

	seedCount := len(activeIDs)
	if seedCount > bracketStageSize-1 {
		seedCount = bracketStageSize - 1 // хотя бы один слот пустой — витрина бая (FR-9)
	}
	perm := rng.Perm(len(activeIDs))
	for i := 0; i < seedCount; i++ {
		fighterID := activeIDs[perm[i]]
		if _, err := poolSvc.SeedBracketSlot(ctx, stage.ID, i+1, fighterID); err != nil {
			return result, fmt.Errorf("seed bracket slot %d: %w", i+1, err)
		}
	}
	result.SeededSlots = seedCount

	if _, err := poolSvc.SetStatus(ctx, stage.ID, stagedomain.LayoutReady); err != nil {
		return result, fmt.Errorf("fix bracket seeding: %w", err)
	}

	if arenaID == "" {
		return result, nil // нет свободной арены — сетка остаётся зафиксированной, но без начатых боёв
	}

	bracket, err := poolSvc.GetBracket(ctx, stage.ID)
	if err != nil {
		return result, fmt.Errorf("get bracket: %w", err)
	}
	if len(bracket.Rounds) == 0 || len(bracket.Rounds[0].Halves) == 0 {
		return result, nil
	}
	upperContainerID := bracket.Rounds[0].Halves[0].Container.ID
	if upperContainerID == "" {
		return result, nil
	}

	if _, err := poolSvc.SeatPoolOnArena(ctx, upperContainerID, arenaID); err != nil {
		return result, fmt.Errorf("seat bracket upper half on arena: %w", err)
	}
	if err := conductBracketFirstHalfPartially(ctx, poolSvc, upperContainerID, actorID, rng); err != nil {
		return result, fmt.Errorf("conduct bracket upper half: %w", err)
	}

	return result, nil
}

// strongBracketTitle/weakBracketTitle — названия веток демо-двойного
// плейоффа (спека 0019, FR-10, AC-2): сетка за 1-е место и утешительная,
// обе от одного источника — уже доигранного группового этапа той же
// номинации, что и SeedBracketStage выше. Отдельная номинация не нужна:
// правило отбора не пересекается с ручным посевом SeedBracketStage (другая
// номинация в demo-bouts/main.go, T21 — «два разных сценария, две разные
// номинации» не требуется, если селекторы не пересекаются).
const (
	strongBracketTitle = "Плейофф — сильные"
	weakBracketTitle   = "Плейофф — утешительный"
)

// DoubleBracketSeedResult — итог SeedDoubleBracketStages, для отчёта в
// консоль и ручной проверки (T21).
type DoubleBracketSeedResult struct {
	NominationID   string
	StrongStageID  string
	WeakStageID    string
	StrongSelected int
	WeakSelected   int
}

// SeedDoubleBracketStages демонстрирует переходы между этапами (спека 0019,
// AC-2): два этапа-сетки, оба с правилом отбора от одного и того же уже
// доигранного группового этапа номинации (тот же источник, что и у
// SeedBracketStage) — «сильные» (места 1-2 каждой группы) и «утешительные»
// (места 3 и ниже), непересекающиеся селекторы (FR-11). Обе формируются
// (BuildStage) сразу — в отличие от SeedBracketStage, здесь демонстрируется
// именно автоматический переход, а не ручной посев.
//
// Размер каждой сетки вычисляется из фактического состава групп (places
// 1-2 на пул для сильных, остаток для утешительных) — не захардкожен: число
// пулов и их размер в demo-данных зависят от случайной выборки заявок
// (rand seed фиксирован, но общее число активных бойцов номинации может
// отличаться при правках демо-данных), а BuildStage откажет с
// ErrCapacityExceeded, если реально отобранных больше, чем слотов.
//
// Дележи мест на границе окна (FR-22) в демо-данных возможны (случайный
// счёт боёв, маленькие пулы) — resolveTiesForDemo отвечает на них
// детерминированно (по возрастанию id бойца), чтобы `make demo-bouts`
// оставался идемпотентным и не падал на конкретной случайной выборке.
func SeedDoubleBracketStages(
	ctx context.Context,
	poolSvc *stageservice.Service,
	nominationID, arenaID, actorID string,
	rng *rand.Rand,
) (DoubleBracketSeedResult, error) {
	result := DoubleBracketSeedResult{NominationID: nominationID}
	if nominationID == "" {
		return result, nil
	}

	sourceStageID, err := groupsStageID(ctx, poolSvc, nominationID)
	if err != nil {
		return result, fmt.Errorf("resolve groups stage: %w", err)
	}
	sourceLayout, err := poolSvc.GetLayout(ctx, sourceStageID)
	if err != nil {
		return result, fmt.Errorf("get source layout: %w", err)
	}
	if len(sourceLayout.Pools) == 0 {
		return result, nil // группы ещё не сформированы (SeedPoolsAndBouts для этой номинации не отработал)
	}

	strongCount, weakCount := 0, 0
	for _, p := range sourceLayout.Pools {
		n := len(p.Members)
		if n >= 2 {
			strongCount += 2
		} else {
			strongCount += n
		}
		if n > 2 {
			weakCount += n - 2
		}
	}
	if strongCount < 2 {
		return result, nil // формирование отклонит меньше двух отобранных (FR-11, 0018 FR-11)
	}

	strong, _, err := poolSvc.CreateStage(ctx, nominationID, stagedomain.StageTypeBracket, strongBracketTitle,
		stagedomain.BracketConfig{Size: bracketSizeFor(strongCount)}, stagedomain.GroupsConfig{},
		stagedomain.SeedingRule{
			SourceKind: stagedomain.SourceKindStage, SourceStageID: sourceStageID,
			Selector: stagedomain.SelectorKindGroupPlaces, PlaceFrom: 1, PlaceTo: 2,
			Method: stagedomain.LayoutMethodSeeded,
		})
	if err != nil {
		return result, fmt.Errorf("create strong bracket stage: %w", err)
	}
	result.StrongStageID = strong.ID

	if err := buildStageForDemo(ctx, poolSvc, strong.ID); err != nil {
		return result, fmt.Errorf("build strong bracket: %w", err)
	}
	result.StrongSelected = strongCount

	if weakCount >= 2 {
		weak, _, err := poolSvc.CreateStage(ctx, nominationID, stagedomain.StageTypeBracket, weakBracketTitle,
			stagedomain.BracketConfig{Size: bracketSizeFor(weakCount)}, stagedomain.GroupsConfig{},
			stagedomain.SeedingRule{
				SourceKind: stagedomain.SourceKindStage, SourceStageID: sourceStageID,
				Selector: stagedomain.SelectorKindGroupPlaces, PlaceFrom: 3, PlaceTo: 0,
				Method: stagedomain.LayoutMethodSeeded,
			})
		if err != nil {
			return result, fmt.Errorf("create weak bracket stage: %w", err)
		}
		result.WeakStageID = weak.ID

		if err := buildStageForDemo(ctx, poolSvc, weak.ID); err != nil {
			return result, fmt.Errorf("build weak bracket: %w", err)
		}
		result.WeakSelected = weakCount
	}

	if arenaID == "" {
		return result, nil
	}

	bracket, err := poolSvc.GetBracket(ctx, strong.ID)
	if err != nil {
		return result, fmt.Errorf("get strong bracket: %w", err)
	}
	if len(bracket.Rounds) == 0 || len(bracket.Rounds[0].Halves) == 0 {
		return result, nil
	}
	containerID := bracket.Rounds[0].Halves[0].Container.ID
	if containerID == "" {
		return result, nil
	}
	if _, err := poolSvc.SeatPoolOnArena(ctx, containerID, arenaID); err != nil {
		return result, fmt.Errorf("seat strong bracket half on arena: %w", err)
	}
	if err := conductBracketFirstHalfPartially(ctx, poolSvc, containerID, actorID, rng); err != nil {
		return result, fmt.Errorf("conduct strong bracket half: %w", err)
	}

	return result, nil
}

// buildStageForDemo прогоняет PreviewStageBuild → BuildStage → SetStatus
// (ready), разрешая возможные дележи мест детерминированно
// (resolveTiesForDemo) — случайный счёт демо-боёв (randomFinalScore) при
// маленьких пулах иногда даёт полное равенство показателей ровно на границе
// отбора (FR-22). Формирование само по себе не фиксирует состав и не
// создаёт боёв первого круга (FR-16) — это отдельное существующее действие
// (0009/0018 FR-9/FR-10), без него containerID остаётся в статусе draft и
// SeatPoolOnArena отклонит его (ErrNotReady).
func buildStageForDemo(ctx context.Context, poolSvc *stageservice.Service, stageID string) error {
	preview, err := poolSvc.PreviewStageBuild(ctx, stageID, nil)
	if err != nil {
		return fmt.Errorf("preview: %w", err)
	}
	ties := resolveTiesForDemo(preview.Ties)
	if _, _, err := poolSvc.BuildStage(ctx, stageID, ties); err != nil {
		return fmt.Errorf("build: %w", err)
	}
	if _, err := poolSvc.SetStatus(ctx, stageID, stagedomain.LayoutReady); err != nil {
		return fmt.Errorf("fix seeding: %w", err)
	}
	return nil
}

// resolveTiesForDemo отвечает на дележи мест (FR-22) детерминированно: из
// претендентов на границу отбора проходят первые SlotsLeft по возрастанию
// id бойца — не доменное решение (реальный тай-брейк организатор выбирает
// вручную, ADR 0014 §7), а исключительно для того, чтобы `make demo-bouts`
// не падал на случайной выборке демо-данных.
func resolveTiesForDemo(ties []stagedomain.TieAsk) []stagedomain.TieResolution {
	if len(ties) == 0 {
		return nil
	}
	out := make([]stagedomain.TieResolution, 0, len(ties))
	for _, t := range ties {
		ids := make([]string, len(t.Contenders))
		for i, c := range t.Contenders {
			ids[i] = c.ID
		}
		sort.Strings(ids)
		out = append(out, stagedomain.TieResolution{SourcePoolID: t.SourcePoolID, Place: t.Place, FighterIDs: ids})
	}
	return out
}

// bracketSizeFor возвращает наименьший допустимый размер сетки (степень
// двойки 4/8/16/32, FR-1), вмещающий n отобранных — недобор законен (бай,
// 0018 FR-9), поэтому размер не обязан совпадать с n точно.
func bracketSizeFor(n int) int {
	for _, size := range []int{4, 8, 16, 32} {
		if n <= size {
			return size
		}
	}
	return 32
}

// activeFighterIDsForNomination — id активных бойцов (спека 0007) с активным
// участием в конкретной номинации. Тот же критерий, что и
// activeFighterCountsByNomination, но список id, а не счётчик — нужен, чтобы
// реально посеять кого-то в слоты сетки.
func activeFighterIDsForNomination(ctx context.Context, svc *fighterservice.Service, tournamentID, nominationID string) ([]string, error) {
	roster, err := svc.ListRoster(ctx, tournamentID)
	if err != nil {
		return nil, err
	}
	var ids []string
	for _, f := range roster {
		if f.Status != fighterdomain.StatusActive {
			continue
		}
		for _, p := range f.Participations {
			if p.NominationID == nominationID && p.Status == fighterdomain.ParticipationActive {
				ids = append(ids, f.ID)
				break
			}
		}
	}
	return ids, nil
}

// conductBracketFirstHalfPartially доигрывает верхнюю половину первого круга
// сетки частично (спека 0018, T28): первый бой пары — до конца (счёт +
// завершение, победитель продвинут автоматически, FR-14); второй — начат и
// оставлен «идёт» с реальным незавершённым счётом. Если пар меньше двух
// (совсем маленький посев) — доигрывает, что есть; ErrNoCurrentBout (боёв в
// контейнере нет вовсе) — не ошибка, no-op.
func conductBracketFirstHalfPartially(ctx context.Context, svc *stageservice.Service, containerID, actorID string, rng *rand.Rand) error {
	if _, err := svc.StartCurrentBout(ctx, containerID, actorID); err != nil {
		if errors.Is(err, stagedomain.ErrNoCurrentBout) {
			return nil
		}
		return err
	}
	finishedA, finishedB := randomFinalScore(rng)
	if _, err := svc.ScoreCurrentBout(ctx, containerID, actorID, finishedA, finishedB); err != nil {
		return err
	}
	if _, err := svc.FinishCurrentBout(ctx, containerID, actorID); err != nil {
		return err
	}

	if _, err := svc.StartCurrentBout(ctx, containerID, actorID); err != nil {
		if errors.Is(err, stagedomain.ErrNoCurrentBout) {
			return nil
		}
		return err
	}
	liveA, liveB := randomLiveScore(rng)
	if _, err := svc.ScoreCurrentBout(ctx, containerID, actorID, liveA, liveB); err != nil {
		return err
	}
	return nil
}
