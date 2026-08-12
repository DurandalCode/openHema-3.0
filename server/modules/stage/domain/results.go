// Спека 0021: ЖЦ номинации целиком — статус этапа/номинации и итоговый
// протокол. Чистые функции по образцу ComputeStandings (0016), ResolveBracket
// (0018) и ComputeOverallOrder (0019): никакого хранилища, никаких портов —
// только вход/выход.
package domain

// ---------------------------------------------------------------------
// Статус этапа и исполнительная ось номинации (FR-1..FR-4).
// ---------------------------------------------------------------------

// StageStatus — статус этапа целиком (спека 0021, FR-1; ADR 0014 §2):
// draft/ready совпадают по значениям с LayoutStatus (хранимая фиксация,
// 0017); active/finished вычисляются из прогресса боёв контейнеров этапа.
type StageStatus string

const (
	StageStatusDraft    StageStatus = "draft"
	StageStatusReady    StageStatus = "ready"
	StageStatusActive   StageStatus = "active"
	StageStatusFinished StageStatus = "finished"
)

// StageContainer — один контейнер боёв этапа для вычисления его статуса
// (спека 0021, FR-2): обычный пул группы (Total = число боёв) либо половина
// круга сетки (Total = число разрешаемых пар, 0018 FR-17 — computeHalfStatus
// использует тот же знаменатель).
type StageContainer struct {
	Status PoolStatus
	Total  int
}

// ComputeStageStatus вычисляет статус этапа целиком (спека 0021, FR-2/FR-3)
// из хранимой фиксации состава и статусов его контейнеров боёв (та же
// PoolStatus, что ComputePoolStatus считает для отдельного пула/половины
// круга сетки, 0011/0013/0018).
//
// Правила по порядку:
//  1. layout != ready -> StageStatusDraft — независимо от контейнеров;
//  2. контейнеры с Total == 0 отбрасываются (пустой пул/половина без пар не
//     мешает завершению этапа, AC-16);
//  3. если после отбрасывания контейнеров не осталось -> StageStatusReady
//     (доигрывать нечего, но и результата нет — FR-2 «этап без единого боя
//     завершённым не считается»);
//  4. все оставшиеся контейнеры PoolStatusFinished -> StageStatusFinished;
//  5. хотя бы один оставшийся контейнер PoolStatusActive или
//     PoolStatusFinished (но не все finished, иначе сработало бы правило 4)
//     -> StageStatusActive;
//  6. иначе -> StageStatusReady.
func ComputeStageStatus(layout LayoutStatus, containers []StageContainer) StageStatus {
	if layout != LayoutReady {
		return StageStatusDraft
	}

	kept := make([]StageContainer, 0, len(containers))
	for _, c := range containers {
		if c.Total > 0 {
			kept = append(kept, c)
		}
	}
	if len(kept) == 0 {
		return StageStatusReady
	}

	allFinished := true
	anyActiveOrFinished := false
	for _, c := range kept {
		if c.Status != PoolStatusFinished {
			allFinished = false
		}
		if c.Status == PoolStatusActive || c.Status == PoolStatusFinished {
			anyActiveOrFinished = true
		}
	}
	if allFinished {
		return StageStatusFinished
	}
	if anyActiveOrFinished {
		return StageStatusActive
	}
	return StageStatusReady
}

// NominationExecution — исполнительная ось номинации (спека 0021, FR-4):
// none — ни один этап не начат; active — хотя бы один этап идёт/завершён, но
// не все завершены; finished — есть хотя бы один этап и все завершены.
type NominationExecution string

const (
	ExecutionNone     NominationExecution = "none"
	ExecutionActive   NominationExecution = "active"
	ExecutionFinished NominationExecution = "finished"
)

// ComputeNominationExecution вычисляет исполнительную ось номинации из
// статусов её этапов (спека 0021, FR-4). Пустой список -> none (этапов нет
// вовсе). Непустой список, где все этапы finished -> finished. Иначе, если
// хотя бы один этап active или finished (например, смесь ready+finished —
// один этап доигран, другой ещё даже не зафиксирован: это ещё не «всё
// завершено», но уже «что-то идёт») -> active. Иначе (все draft/ready, ни
// одного начатого боя) -> none.
func ComputeNominationExecution(statuses []StageStatus) NominationExecution {
	if len(statuses) == 0 {
		return ExecutionNone
	}

	allFinished := true
	anyActiveOrFinished := false
	for _, s := range statuses {
		if s != StageStatusFinished {
			allFinished = false
		}
		if s == StageStatusActive || s == StageStatusFinished {
			anyActiveOrFinished = true
		}
	}
	if allFinished {
		return ExecutionFinished
	}
	if anyActiveOrFinished {
		return ExecutionActive
	}
	return ExecutionNone
}

// ---------------------------------------------------------------------
// Терминальные этапы (FR-9).
// ---------------------------------------------------------------------

// TerminalStages возвращает этапы, которые не служат источником ни для
// какого другого этапа схемы (спека 0021, FR-9) — то же отношение, что
// охраняет ErrStageIsSource (0019, FR-7a). Порядок результата — как во
// входном stages (обычно по Position).
func TerminalStages(stages []Stage) []Stage {
	sources := make(map[string]bool, len(stages))
	for _, s := range stages {
		if s.Rule.SourceStageID != "" {
			sources[s.Rule.SourceStageID] = true
		}
	}

	out := make([]Stage, 0, len(stages))
	for _, s := range stages {
		if !sources[s.ID] {
			out = append(out, s)
		}
	}
	return out
}

// ---------------------------------------------------------------------
// Итоговый протокол (FR-11..FR-14).
// ---------------------------------------------------------------------

// ResultEntry — строка итогового протокола (спека 0021, FR-13). Место —
// диапазон «от–до» (FR-11): 1, 2, 3-4, 5-8. Одиночное место — PlaceFrom ==
// PlaceTo.
type ResultEntry struct {
	PlaceFrom, PlaceTo int
	Fighter            FighterRef
	OriginLabel        string
}

// diffByID возвращает элементы a, чей Fighter.ID не встречается в b —
// «выбывшие в круге r» (участники круга r минус участники круга r+1).
func diffByID(a, b []FighterRef) []FighterRef {
	inB := make(map[string]bool, len(b))
	for _, f := range b {
		inB[f.ID] = true
	}
	out := make([]FighterRef, 0, len(a))
	for _, f := range a {
		if !inB[f.ID] {
			out = append(out, f)
		}
	}
	return out
}

// ComputeBracketPlaces строит протокол терминальной сетки (спека 0021,
// FR-11a): диапазон места определяется КРУГОМ выбывания, а не числом
// фактически выбывших бойцов — байи и неполный посев (0018, FR-9) диапазон
// не сдвигают. Проигравший в круге r, после которого формально остаётся k
// участников (= число заполненных слотов круга r+1, для финала — чемпион),
// получает диапазон [k+1 .. 2k]. Круг R+1 (бой за 3-е место, если есть)
// расщепляет 3-4 на 3 и 4 по факту боя.
//
// Незавершённая сетка не паникует: раунды без заполненных слотов и финал без
// определённого чемпиона просто не дают строк — вызывающая сторона
// гарантирует, что функция зовётся только на завершённом этапе (FR-15), это
// лишь защита от неполных данных.
func ComputeBracketPlaces(view BracketView) []ResultEntry {
	mainByNumber := make(map[int]Round)
	var thirdRound *Round
	maxRound := 0
	for i := range view.Rounds {
		rd := view.Rounds[i]
		if rd.ThirdPlace {
			cp := rd
			thirdRound = &cp
			continue
		}
		mainByNumber[rd.Number] = rd
		if rd.Number > maxRound {
			maxRound = rd.Number
		}
	}
	if maxRound == 0 {
		return nil
	}
	finalRound := maxRound

	participantsOf := func(r int) []FighterRef {
		rd, ok := mainByNumber[r]
		if !ok {
			return nil
		}
		var out []FighterRef
		for _, h := range rd.Halves {
			for _, p := range h.Pairs {
				if p.A.State == SlotFilled {
					out = append(out, p.A.Fighter)
				}
				if p.B.State == SlotFilled {
					out = append(out, p.B.Fighter)
				}
			}
		}
		return out
	}

	var entries []ResultEntry

	if view.Champion.ID != "" {
		entries = append(entries, ResultEntry{
			PlaceFrom: 1, PlaceTo: 1, Fighter: view.Champion, OriginLabel: "Чемпион",
		})
	}

	for r := finalRound; r >= 1; r-- {
		curr := participantsOf(r)
		if len(curr) == 0 {
			continue
		}

		if r == finalRound {
			if view.Champion.ID == "" {
				// Финал не решён — определить проигравшего нельзя, не
				// паникуем, просто ничего не добавляем.
				continue
			}
			for _, f := range curr {
				if f.ID == view.Champion.ID {
					continue
				}
				entries = append(entries, ResultEntry{
					PlaceFrom: 2, PlaceTo: 2, Fighter: f, OriginLabel: "Финал",
				})
			}
			continue
		}

		next := participantsOf(r + 1)
		eliminated := diffByID(curr, next)
		if len(eliminated) == 0 {
			continue
		}
		k := len(next)

		if r == finalRound-1 {
			// Полуфинал: проигравшие делят 3-4, либо расщепляются боем за
			// 3-е место, если он есть и разрешён.
			splitByThird := view.Config.ThirdPlace && thirdRound != nil && view.ThirdPlaceWinner.ID != ""
			for _, f := range eliminated {
				switch {
				case splitByThird && f.ID == view.ThirdPlaceWinner.ID:
					entries = append(entries, ResultEntry{
						PlaceFrom: 3, PlaceTo: 3, Fighter: f, OriginLabel: "Бой за 3-е место",
					})
				case splitByThird:
					entries = append(entries, ResultEntry{
						PlaceFrom: 4, PlaceTo: 4, Fighter: f, OriginLabel: "Бой за 3-е место",
					})
				default:
					entries = append(entries, ResultEntry{
						PlaceFrom: 3, PlaceTo: 4, Fighter: f, OriginLabel: mainByNumber[r].Title,
					})
				}
			}
			continue
		}

		placeFrom, placeTo := k+1, 2*k
		for _, f := range eliminated {
			entries = append(entries, ResultEntry{
				PlaceFrom: placeFrom, PlaceTo: placeTo, Fighter: f, OriginLabel: "выбыл: " + mainByNumber[r].Title,
			})
		}
	}

	return entries
}

// ComputeGroupPlaces строит протокол терминального группового этапа (спека
// 0021, FR-12) из сводного порядка ComputeOverallOrder (0019, FR-5): та же
// сортировка и конкурентное ранжирование (OverallPlace), развёрнутое в
// диапазон — группа бойцов, равных на OverallPlace p размера n, получает
// диапазон [p .. p+n-1]. Для одной группы вырождается ровно в
// ComputeStandings.
// ResultsSection — пьедестал одного терминального этапа (спека 0021,
// FR-9/FR-10). Finished=false у ещё не доигранного терминального этапа —
// Entries пуст, но секция всё равно возвращается (нужна админке, FR-19,
// чтобы показать «этап не доигран»).
type ResultsSection struct {
	StageID                string
	StageTitle             string
	StageType              StageType
	Finished               bool
	Entries                []ResultEntry
	PlacesFromOverallOrder bool
}

// NominationResults — итоговый протокол номинации (спека 0021): секция на
// каждый терминальный этап (FR-9/FR-10) — у каждого свой пьедестал, сквозной
// нумерации мест по номинации нет.
type NominationResults struct {
	NominationID       string
	NominationFinished bool
	Sections           []ResultsSection
}

func ComputeGroupPlaces(groups []SourceGroup) []ResultEntry {
	overall := ComputeOverallOrder(groups)

	entries := make([]ResultEntry, 0, len(overall))
	i := 0
	for i < len(overall) {
		place := overall[i].OverallPlace
		j := i
		for j < len(overall) && overall[j].OverallPlace == place {
			j++
		}
		size := j - i
		for _, sf := range overall[i:j] {
			entries = append(entries, ResultEntry{
				PlaceFrom:   place,
				PlaceTo:     place + size - 1,
				Fighter:     sf.Fighter,
				OriginLabel: sf.OriginLabel,
			})
		}
		i = j
	}
	return entries
}
