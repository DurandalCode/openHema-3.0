package domain

import "sort"

// Standing — одна строка итоговой таблицы пула (спека 0016, FR-1..FR-4):
// статистика бойца по завершённым боям пула + итоговое место.
type Standing struct {
	Fighter        FighterRef
	Wins           int
	Draws          int
	Losses         int
	PointsScored   int
	PointsConceded int
	// Place — место с учётом дележа (FR-3): бойцы, полностью равные по
	// Wins/PointsScored/PointsConceded, делят место (конкурентное
	// ранжирование 1,2,2,4 — не 1,2,2,3).
	Place int
}

// ComputeStandings строит итоговую таблицу пула из его состава и боёв (спека
// 0016). Чистая функция — юнит-тестируется без fake-портов, по аналогии с
// ComputePoolStatus.
//
// Учитываются только завершённые бои (FR-1) — не начатые/идущие бои
// пропускаются. Если завершённых боёв нет вовсе — возвращается пустой срез
// (FR-7): вызывающая сторона тогда не заполняет Pool.Standings, и UI не
// показывает блок таблицы.
//
// Ничья (равный счёт) засчитывается обоим бойцам как Draws, не как
// Wins/Losses ни одному (FR-4); очки боя всё равно суммируются в
// PointsScored/PointsConceded каждого.
//
// Ранжирование (FR-2): по убыванию Wins, затем по убыванию PointsScored,
// затем по возрастанию PointsConceded (меньше — выше). Место присваивается
// конкурентным ранжированием (FR-3): полностью равные по этим трём
// критериям бойцы делят одно место, следующая группа получает место со
// сдвигом на размер предыдущей группы.
//
// members — известный состав пула (для нулевой статистики у бойцов без
// завершённых боёв, AC-2); бойцы, встретившиеся в bouts, но отсутствующие в
// members (например, выведенный после проведения боя боец), тоже попадают в
// таблицу — иначе их зафиксированный результат молча терялся бы.
func ComputeStandings(members []FighterRef, bouts []BoutRef) []Standing {
	byID := make(map[string]*Standing, len(members))
	order := make([]string, 0, len(members))
	seed := func(f FighterRef) *Standing {
		s, ok := byID[f.ID]
		if !ok {
			s = &Standing{Fighter: f}
			byID[f.ID] = s
			order = append(order, f.ID)
		}
		return s
	}
	for _, m := range members {
		seed(m)
	}

	finishedCount := 0
	for _, b := range bouts {
		if b.State != BoutStateFinished {
			continue
		}
		finishedCount++
		a := seed(b.FighterA)
		bb := seed(b.FighterB)
		a.PointsScored += b.ScoreA
		a.PointsConceded += b.ScoreB
		bb.PointsScored += b.ScoreB
		bb.PointsConceded += b.ScoreA
		switch {
		case b.ScoreA > b.ScoreB:
			a.Wins++
			bb.Losses++
		case b.ScoreB > b.ScoreA:
			bb.Wins++
			a.Losses++
		default:
			a.Draws++
			bb.Draws++
		}
	}
	if finishedCount == 0 {
		return nil
	}

	out := make([]Standing, len(order))
	for i, id := range order {
		out[i] = *byID[id]
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Wins != out[j].Wins {
			return out[i].Wins > out[j].Wins
		}
		if out[i].PointsScored != out[j].PointsScored {
			return out[i].PointsScored > out[j].PointsScored
		}
		if out[i].PointsConceded != out[j].PointsConceded {
			return out[i].PointsConceded < out[j].PointsConceded
		}
		// Финальный тай-брейк для детерминированного (не влияющего на
		// Place) порядка строк внутри полностью равной группы.
		return out[i].Fighter.ID < out[j].Fighter.ID
	})

	for i := range out {
		if i == 0 || !tiedRank(out[i-1], out[i]) {
			out[i].Place = i + 1
		} else {
			out[i].Place = out[i-1].Place
		}
	}
	return out
}

// tiedRank — равны ли две строки по всем трём критериям ранжирования (FR-3).
func tiedRank(a, b Standing) bool {
	return a.Wins == b.Wins && a.PointsScored == b.PointsScored && a.PointsConceded == b.PointsConceded
}
