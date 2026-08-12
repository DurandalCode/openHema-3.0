// Спека 0019: переходы между этапами (ADR 0014 §5-7). Ядро — чистые функции
// отбора и раскладки, по образцу ComputeStandings (0016) и ResolveBracket
// (0018): сводный порядок этапа (FR-5), применение правила отбора (FR-3,
// FR-20, FR-22), детект дележа на границе окна, план раскладки в сетку
// (посев «1×N», FR-4) и в группы (змейка поверх AutoDistribute, FR-4).
package domain

import (
	"fmt"
	"sort"
	"strconv"
)

// ---------------------------------------------------------------------
// Правило отбора (FR-1..FR-4).
// ---------------------------------------------------------------------

// SourceKind — источник правила отбора (FR-2): ростер номинации (для первого
// этапа) либо конкретный другой этап той же номинации.
type SourceKind string

// SelectorKind — кого из источника берём (FR-3).
type SelectorKind string

// LayoutMethod — как отобранные ложатся в целевой этап (FR-4): однозначно
// определяется типом целевого этапа, организатору не предлагается.
type LayoutMethod string

const (
	SourceKindRoster SourceKind = "roster"
	SourceKindStage  SourceKind = "stage"

	SelectorKindAll           SelectorKind = "all"
	SelectorKindGroupPlaces   SelectorKind = "group_places"
	SelectorKindOverallPlaces SelectorKind = "overall_places"

	LayoutMethodSnake  LayoutMethod = "snake"
	LayoutMethodSeeded LayoutMethod = "seeded"
)

// SeedingRule — правило отбора этапа (FR-1): источник — селектор — метод
// раскладки. Нулевое значение — «правила нет» (IsZero), этап набирается
// руками, как и сегодня (0009/0018).
type SeedingRule struct {
	SourceKind    SourceKind
	SourceStageID string
	Selector      SelectorKind
	PlaceFrom     int
	PlaceTo       int // 0 — открытая граница
	Method        LayoutMethod
}

// IsZero — «правила нет» (FR-1): все поля нулевые.
func (r SeedingRule) IsZero() bool {
	return r == SeedingRule{}
}

// ResolveMethod возвращает метод раскладки, выведенный из типа целевого
// этапа (FR-4): seeded для сетки, snake для группового этапа. Клиент это
// поле не присылает (proto-комментарий SeedingRule.method); сервис обязан
// проставить его сам ПЕРЕД Validate/персистентностью — иначе Validate
// отклонит правило как невалидное (пустой Method) независимо от остальных
// полей, что клиент не может починить: у него просто нет этого поля в форме.
func ResolveMethod(targetIsBracket bool) LayoutMethod {
	if targetIsBracket {
		return LayoutMethodSeeded
	}
	return LayoutMethodSnake
}

// Validate проверяет консистентность значений правила (FR-2..FR-4) — не
// знает ни про репозиторий, ни про соседние этапы (ErrSourceNotAllowed,
// ErrRuleLocked и т.п. — гейты сервиса, план `service/seeding.go`).
// targetIsBracket — тип целевого этапа: метод раскладки однозначно
// определяется им (FR-4) — seeded для сетки, snake для группового этапа.
func (r SeedingRule) Validate(targetIsBracket bool) error {
	if r.IsZero() {
		return nil
	}

	switch r.SourceKind {
	case SourceKindRoster, SourceKindStage:
	default:
		return ErrInvalidRule
	}
	switch r.Selector {
	case SelectorKindAll, SelectorKindGroupPlaces, SelectorKindOverallPlaces:
	default:
		return ErrInvalidRule
	}
	switch r.Method {
	case LayoutMethodSnake, LayoutMethodSeeded:
	default:
		return ErrInvalidRule
	}
	if targetIsBracket && r.Method != LayoutMethodSeeded {
		return ErrInvalidRule
	}
	if !targetIsBracket && r.Method != LayoutMethodSnake {
		return ErrInvalidRule
	}

	switch r.SourceKind {
	case SourceKindRoster:
		// У ростера мест нет — единственный допустимый селектор (FR-3).
		if r.Selector != SelectorKindAll {
			return ErrInvalidRule
		}
		if r.SourceStageID != "" {
			return ErrInvalidRule
		}
	case SourceKindStage:
		if r.SourceStageID == "" {
			return ErrInvalidRule
		}
	}

	if r.PlaceFrom < 0 || r.PlaceTo < 0 {
		return ErrInvalidRule
	}
	if r.PlaceTo != 0 && r.PlaceTo < r.PlaceFrom {
		return ErrInvalidRule
	}
	if r.Selector == SelectorKindAll {
		if r.PlaceFrom != 0 || r.PlaceTo != 0 {
			return ErrInvalidRule
		}
	} else if r.PlaceFrom < 1 {
		// Окно мест начинается с 1 — «место 0» не существует (как и у
		// place_to=0, зарезервированного под открытую границу).
		return ErrInvalidRule
	}

	return nil
}

// GroupsConfig — параметр группового этапа (FR-8): число групп, живёт с
// этапом (а не спрашивается при каждом формировании).
type GroupsConfig struct{ GroupCount int }

// ---------------------------------------------------------------------
// Вход отбора и результат.
// ---------------------------------------------------------------------

// SourceGroup — одна группа этапа-источника: метка («Группа 2») и уже
// посчитанная таблица (0016). Собирается сервисом — чистой функции не нужно
// знать ни про репозиторий, ни про порт боёв.
type SourceGroup struct {
	PoolID    string
	Label     string
	Standings []Standing
}

// SelectedFighter — отобранный боец с происхождением (FR-27).
type SelectedFighter struct {
	Fighter      FighterRef
	SourcePoolID string
	OriginLabel  string // «Группа 2, место 1»
	GroupPlace   int
	OverallPlace int
}

// TieAsk — неразрешённый дележ на границе отбора (FR-22): SourcePoolID пуст
// для сводного порядка (OVERALL_PLACES).
type TieAsk struct {
	SourcePoolID string
	GroupLabel   string
	Place        int
	Contenders   []FighterRef
	SlotsLeft    int
}

// TieResolution — ответ организатора на TieAsk (FR-22): FighterIDs по
// приоритету прохода — первые SlotsLeft проходят, остальные — нет.
type TieResolution struct {
	SourcePoolID string
	Place        int
	FighterIDs   []string
}

// SeedPlan — план посадки одного бойца в слот сетки (результат
// PlanBracketSeeds, вход ApplyStageBuild).
type SeedPlan struct {
	Slot      int
	FighterID string
}

// BuildGroup — план одной группы целевого этапа (результат
// PlanGroupAssignments): номер группы и её состав. Пулы на момент
// планирования ещё не созданы, поэтому план адресуется номером, а не
// pool_id — реальные id проставляет ApplyStageBuild после вставки пулов.
type BuildGroup struct {
	Number     int
	FighterIDs []string
}

// StageBuildPreview — план формирования этапа целиком (FR-15), результат
// конвейера «источник → отбор → раскладка» (service.computeStageBuildPlan):
// то, что PreviewStageBuild показывает организатору, и то, что BuildStage
// применяет без пересчёта. Entries — отобранные (уже в целевом порядке,
// FR-27: SelectedFighter.OriginLabel/GroupPlace/OverallPlace несут
// происхождение); Groups/Seeds — раскладка того же отбора в целевой этап
// (заполнено ровно одно из двух, по типу целевого этапа) — вход
// Repository.ApplyStageBuild. Overlaps непуст ⇒ BuildStage отклонит
// формирование (FR-11); Ties непуст ⇒ требуется TieResolution на каждый
// (FR-22); SourceUnfinishedBouts > 0 ⇒ предупреждение о недоигранном
// источнике, формирование при этом разрешено (FR-14).
type StageBuildPreview struct {
	Entries               []SelectedFighter
	Groups                []BuildGroup
	Seeds                 []SeedPlan
	Unselected            []FighterRef
	Capacity              int
	Ties                  []TieAsk
	Overlaps              []FighterRef
	SourceUnfinishedBouts int
}

// ---------------------------------------------------------------------
// ComputeOverallOrder — сводный порядок этапа (FR-5).
// ---------------------------------------------------------------------

// overallCandidate — рабочее представление одной строки таблицы группы для
// сортировки сквозь границы групп: сохраняет критерии 0016 (Wins/
// PointsScored/PointsConceded) отдельно от результирующего SelectedFighter.
type overallCandidate struct {
	fighter        FighterRef
	sourcePoolID   string
	originLabel    string
	groupPlace     int
	wins           int
	pointsScored   int
	pointsConceded int
}

// ComputeOverallOrder строит сводный порядок этапа (FR-5): все участники
// групп, упорядоченные сквозь границы групп по правилу «сначала место в
// своей группе, затем — среди делящих один и тот же уровень места — критерии
// 0016: больше побед, больше набранных, меньше пропущенных». Полное
// равенство всех четырёх (GroupPlace + три критерия 0016) — дележ
// (конкурентное ранжирование 1,2,2,4, как ComputeStandings/ResolveBracket).
//
// Нормировки на размер группы нет (NFR-2): абсолютные показатели сравниваются
// как есть. Пустая группа (без Standings) не ломает функцию — она просто не
// добавляет кандидатов.
func ComputeOverallOrder(groups []SourceGroup) []SelectedFighter {
	var cands []overallCandidate
	for _, g := range groups {
		for _, s := range g.Standings {
			cands = append(cands, overallCandidate{
				fighter:        s.Fighter,
				sourcePoolID:   g.PoolID,
				originLabel:    fmt.Sprintf("%s, место %d", g.Label, s.Place),
				groupPlace:     s.Place,
				wins:           s.Wins,
				pointsScored:   s.PointsScored,
				pointsConceded: s.PointsConceded,
			})
		}
	}

	sort.Slice(cands, func(i, j int) bool {
		a, b := cands[i], cands[j]
		if a.groupPlace != b.groupPlace {
			return a.groupPlace < b.groupPlace
		}
		if a.wins != b.wins {
			return a.wins > b.wins
		}
		if a.pointsScored != b.pointsScored {
			return a.pointsScored > b.pointsScored
		}
		if a.pointsConceded != b.pointsConceded {
			return a.pointsConceded < b.pointsConceded
		}
		// Детерминированный финальный тай-брейк (не влияет на OverallPlace,
		// только на порядок строк внутри полностью равной группы) — по
		// аналогии с ComputeStandings.
		if a.sourcePoolID != b.sourcePoolID {
			return a.sourcePoolID < b.sourcePoolID
		}
		return a.fighter.ID < b.fighter.ID
	})

	out := make([]SelectedFighter, len(cands))
	for i, c := range cands {
		out[i] = SelectedFighter{
			Fighter:      c.fighter,
			SourcePoolID: c.sourcePoolID,
			OriginLabel:  c.originLabel,
			GroupPlace:   c.groupPlace,
		}
		if i == 0 || !overallTied(cands[i-1], c) {
			out[i].OverallPlace = i + 1
		} else {
			out[i].OverallPlace = out[i-1].OverallPlace
		}
	}
	return out
}

// overallTied — равны ли два кандидата по всем четырём критериям сводного
// порядка (GroupPlace + три критерия 0016).
func overallTied(a, b overallCandidate) bool {
	return a.groupPlace == b.groupPlace &&
		a.wins == b.wins &&
		a.pointsScored == b.pointsScored &&
		a.pointsConceded == b.pointsConceded
}

// ---------------------------------------------------------------------
// SelectByRule — применение селектора (FR-3, FR-20, FR-22).
// ---------------------------------------------------------------------

// SelectByRule применяет правило отбора к источнику. groups — таблицы групп
// источника-этапа (пуст для источника-ростера). active играет две роли:
// источник кандидатов для роster (весь список — и есть отбор), и фильтр
// активности для stage (ранжирование считается по таблицам как есть —
// ComputeOverallOrder видит всех, включая выведенных с турнира, — и только
// затем неактивные исключаются из окна отбора; окно добирается следующими по
// порядку, FR-20). res — ответы на уже заданные вопросы о дележе (FR-22):
// если для возникающего TieAsk найден подходящий TieResolution (совпадают
// SourcePoolID+Place), он применяется и вопрос не возвращается.
func SelectByRule(rule SeedingRule, groups []SourceGroup, active []FighterRef, res []TieResolution) ([]SelectedFighter, []TieAsk, error) {
	switch rule.SourceKind {
	case SourceKindRoster:
		if rule.Selector != SelectorKindAll {
			return nil, nil, ErrInvalidRule
		}
		return selectAllFromRoster(active), nil, nil

	case SourceKindStage:
		activeSet := toFighterIDSet(active)
		overall := ComputeOverallOrder(groups)

		switch rule.Selector {
		case SelectorKindAll:
			return filterActiveKeepOrder(overall, activeSet), nil, nil

		case SelectorKindGroupPlaces:
			return selectByGroupPlaces(overall, groups, activeSet, rule, res)

		case SelectorKindOverallPlaces:
			selected, ask := selectWindow(overall, activeSet, rule.PlaceFrom, rule.PlaceTo, "", "", res, overallPlaceOf)
			var ties []TieAsk
			if ask != nil {
				ties = append(ties, *ask)
			}
			return selected, ties, nil

		default:
			return nil, nil, ErrInvalidRule
		}

	default:
		return nil, nil, ErrInvalidRule
	}
}

func selectAllFromRoster(active []FighterRef) []SelectedFighter {
	out := make([]SelectedFighter, len(active))
	for i, f := range active {
		out[i] = SelectedFighter{Fighter: f, OverallPlace: i + 1}
	}
	return out
}

func filterActiveKeepOrder(overall []SelectedFighter, active map[string]bool) []SelectedFighter {
	out := make([]SelectedFighter, 0, len(overall))
	for _, sf := range overall {
		if active[sf.Fighter.ID] {
			out = append(out, sf)
		}
	}
	return out
}

func toFighterIDSet(fighters []FighterRef) map[string]bool {
	set := make(map[string]bool, len(fighters))
	for _, f := range fighters {
		set[f.ID] = true
	}
	return set
}

func groupPlaceOf(sf SelectedFighter) int   { return sf.GroupPlace }
func overallPlaceOf(sf SelectedFighter) int { return sf.OverallPlace }

// selectByGroupPlaces применяет окно PlaceFrom..PlaceTo внутри каждой группы
// источника отдельно (используя GroupPlace, не OverallPlace) — FR-3.
// Результат отсортирован по OverallPlace (посев/раскладка идут по сводному
// порядку независимо от вида селектора, FR-4).
func selectByGroupPlaces(overall []SelectedFighter, groups []SourceGroup, active map[string]bool, rule SeedingRule, res []TieResolution) ([]SelectedFighter, []TieAsk, error) {
	order := make([]string, 0, len(groups))
	labelByPool := make(map[string]string, len(groups))
	for _, g := range groups {
		order = append(order, g.PoolID)
		labelByPool[g.PoolID] = g.Label
	}

	byPool := make(map[string][]SelectedFighter, len(groups))
	for _, sf := range overall {
		byPool[sf.SourcePoolID] = append(byPool[sf.SourcePoolID], sf)
	}

	var selected []SelectedFighter
	var ties []TieAsk
	for _, poolID := range order {
		list := byPool[poolID]
		sort.SliceStable(list, func(i, j int) bool { return list[i].GroupPlace < list[j].GroupPlace })

		sel, ask := selectWindow(list, active, rule.PlaceFrom, rule.PlaceTo, poolID, labelByPool[poolID], res, groupPlaceOf)
		selected = append(selected, sel...)
		if ask != nil {
			ties = append(ties, *ask)
		}
	}

	sort.SliceStable(selected, func(i, j int) bool { return selected[i].OverallPlace < selected[j].OverallPlace })
	return selected, ties, nil
}

// selectWindow — общий алгоритм окна отбора (для одной группы либо для
// сводного порядка целиком). list уже отсортирован по placeOf по
// возрастанию. slotCount — номинальная вместимость окна (PlaceTo-PlaceFrom+1,
// -1 — открытая граница, без ограничения). Кандидаты обрабатываются
// последовательными группами одинакового place (place-group):
//   - place < from — вся place-group вне окна снизу, вопросов нет, бюджет не
//     расходуется;
//   - бюджет окна исчерпан (для закрытого окна) — обход прерывается: дальше
//     смотреть нечего;
//   - иначе place-group — кандидат в окно: неактивные внутри неё не
//     учитываются вовсе и не расходуют бюджет (FR-20) — если поэтому в
//     первоначальной верхней границе (place > to) остался незанятый бюджет,
//     окно добирается следующими place-группами дальше границы («окно
//     добирается следующими по порядку», FR-20, AC-13);
//   - если активных участников place-group помещается в оставшийся бюджет
//     окна целиком — они проходят без вопроса («дележ целиком внутри окна»);
//   - если не помещается — дележ строго на границе (FR-22): при наличии
//     подходящего TieResolution — применяется молча; иначе — возвращается
//     TieAsk с SlotsLeft = оставшийся бюджет, и обход прерывается (судьба
//     окна не может быть решена без ответа на вопрос).
func selectWindow(list []SelectedFighter, active map[string]bool, from, to int, poolID, groupLabel string, res []TieResolution, placeOf func(SelectedFighter) int) ([]SelectedFighter, *TieAsk) {
	slotCount := -1
	if to != 0 {
		slotCount = to - from + 1
	}

	var selected []SelectedFighter
	i, n := 0, len(list)
	for i < n {
		place := placeOf(list[i])
		j := i
		for j < n && placeOf(list[j]) == place {
			j++
		}
		group := list[i:j]
		i = j

		if place < from {
			continue
		}
		if slotCount >= 0 && slotCount-len(selected) <= 0 {
			break
		}

		activeGroup := make([]SelectedFighter, 0, len(group))
		for _, sf := range group {
			if active[sf.Fighter.ID] {
				activeGroup = append(activeGroup, sf)
			}
		}
		if len(activeGroup) == 0 {
			continue
		}

		if slotCount < 0 {
			selected = append(selected, activeGroup...)
			continue
		}

		remaining := slotCount - len(selected)
		if len(activeGroup) <= remaining {
			selected = append(selected, activeGroup...)
			continue
		}

		// Дележ строго на границе окна: активных претендентов больше, чем
		// осталось слотов.
		if tr, ok := findResolution(res, poolID, place); ok {
			selected = append(selected, applyResolution(activeGroup, tr, remaining)...)
			continue
		}

		contenders := make([]FighterRef, len(activeGroup))
		for k, sf := range activeGroup {
			contenders[k] = sf.Fighter
		}
		return selected, &TieAsk{
			SourcePoolID: poolID,
			GroupLabel:   groupLabel,
			Place:        place,
			Contenders:   contenders,
			SlotsLeft:    remaining,
		}
	}
	return selected, nil
}

func findResolution(res []TieResolution, poolID string, place int) (TieResolution, bool) {
	for _, r := range res {
		if r.SourcePoolID == poolID && r.Place == place {
			return r, true
		}
	}
	return TieResolution{}, false
}

// applyResolution выбирает из delящей group бойцов по порядку из
// res.FighterIDs — первые remaining валидных (найденных среди group,
// без повторов) проходят. Неизвестные id молча игнорируются; если валидных
// id меньше remaining — проходит меньше (организатор ответил не полностью,
// это не ошибка домена).
func applyResolution(group []SelectedFighter, res TieResolution, remaining int) []SelectedFighter {
	byID := make(map[string]SelectedFighter, len(group))
	for _, sf := range group {
		byID[sf.Fighter.ID] = sf
	}
	chosen := make([]SelectedFighter, 0, remaining)
	seen := make(map[string]bool, remaining)
	for _, id := range res.FighterIDs {
		if len(chosen) >= remaining {
			break
		}
		sf, ok := byID[id]
		if !ok || seen[id] {
			continue
		}
		seen[id] = true
		chosen = append(chosen, sf)
	}
	return chosen
}

// Overlap — пересечение по Fighter.ID двух выборок (проверка параллельных
// веток, FR-11): бойцы, отобранные и в a, и в b.
func Overlap(a, b []SelectedFighter) []FighterRef {
	inA := make(map[string]FighterRef, len(a))
	for _, sf := range a {
		inA[sf.Fighter.ID] = sf.Fighter
	}
	var out []FighterRef
	seen := make(map[string]bool)
	for _, sf := range b {
		if f, ok := inA[sf.Fighter.ID]; ok && !seen[sf.Fighter.ID] {
			out = append(out, f)
			seen[sf.Fighter.ID] = true
		}
	}
	return out
}

// ---------------------------------------------------------------------
// Раскладка отобранных в целевой этап (FR-4).
// ---------------------------------------------------------------------

// BracketSeedOrder — классический порядок посева «1×N» (FR-4): посевной 1
// встречает посевного 2 не раньше финала, посевной i — слот order[i-1]
// (1-based позиция посевного). Рекурсивно: order(2) = [1,2]; order(2n) —
// чередование order(n) и его зеркала (2n+1-x для каждого x из order(n)).
// Валидные size — степень двойки (как BracketConfig.Size, 4..32).
func BracketSeedOrder(size int) []int {
	if size <= 2 {
		return []int{1, 2}
	}
	prev := BracketSeedOrder(size / 2)
	out := make([]int, 0, size)
	for _, x := range prev {
		out = append(out, x, size+1-x)
	}
	return out
}

// PlanBracketSeeds раскладывает отобранных (уже упорядоченных по
// OverallPlace) в слоты сетки по классическому посеву (FR-4): посевной i
// (1-based позиция в selected) получает слот BracketSeedOrder(cfg.Size)[i-1].
// len(selected) > cfg.Size — вместимости не хватает (FR-19) →
// ErrCapacityExceeded. Недобор — законен: часть слотов просто отсутствует в
// результате (0018, FR-9 — баи).
func PlanBracketSeeds(selected []SelectedFighter, cfg BracketConfig) ([]SeedPlan, error) {
	if len(selected) > cfg.Size {
		return nil, ErrCapacityExceeded
	}
	order := BracketSeedOrder(cfg.Size)
	plans := make([]SeedPlan, len(selected))
	for i, sf := range selected {
		plans[i] = SeedPlan{Slot: order[i], FighterID: sf.Fighter.ID}
	}
	return plans, nil
}

// PlanGroupAssignments раскладывает отобранных (уже упорядоченных по
// OverallPlace — сводная сила) в groupCount групп целевого этапа (FR-4):
// переиспользует AutoDistribute (0009) поверх groupCount синтетических
// пустых пулов, адресованных номером группы ("1".."N") — реальные пулы на
// момент планирования ещё не созданы (ApplyStageBuild создаёт их и
// проставляет id в той же транзакции). Минимум одноклубников обеспечивает
// сама AutoDistribute.
func PlanGroupAssignments(selected []SelectedFighter, groupCount int) []BuildGroup {
	if groupCount <= 0 {
		return nil
	}

	synthPools := make([]Pool, groupCount)
	for i := 0; i < groupCount; i++ {
		num := i + 1
		synthPools[i] = Pool{ID: strconv.Itoa(num), Number: num}
	}

	unassigned := make([]FighterRef, len(selected))
	for i, sf := range selected {
		unassigned[i] = sf.Fighter
	}

	assignments := AutoDistribute(synthPools, unassigned)
	fightersByPool := make(map[string][]string, groupCount)
	for _, a := range assignments {
		fightersByPool[a.PoolID] = append(fightersByPool[a.PoolID], a.FighterID)
	}

	out := make([]BuildGroup, groupCount)
	for i := 0; i < groupCount; i++ {
		number := i + 1
		out[i] = BuildGroup{Number: number, FighterIDs: fightersByPool[strconv.Itoa(number)]}
	}
	return out
}
