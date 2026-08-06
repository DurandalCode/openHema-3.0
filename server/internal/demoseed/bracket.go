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
