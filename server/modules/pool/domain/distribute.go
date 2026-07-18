// Package domain описывает сущности, порты, ошибки и чистую логику модуля
// pool (спека 0009).
package domain

import (
	"sort"
	"strings"
)

// FighterRef — проекция бойца для раскладки: id + клуб (для алгоритма) и имя
// (для отображения). Совпадает по смыслу с fighter.domain.FighterRef, но
// принадлежит pool — модули не делят типы напрямую (ADR 0002).
type FighterRef struct {
	ID   string
	Name string
	Club string
}

// Pool — пул номинации с его текущими бойцами (для алгоритма и представления
// раскладки). Members заполняется службой (service) после обогащения сырых
// членств (fighter_id) данными из ActiveFightersProvider — до обогащения
// Name/Club у элементов Members пусты.
//
// ArenaID/ArenaName/Status — спека 0011: ArenaID хранится репозиторием
// (пусто, если пул не на арене); ArenaName резолвится службой через
// ArenaProvider при сборке (не хранится в БД, план «Обзор решения» —
// «резолв имени арены — live, не снапшот»); Status вычисляется службой
// через ComputePoolStatus(layoutStatus, ArenaID).
//
// NominationName — резолвленное на момент чтения название номинации пула
// (по аналогии с ArenaName): заполняется службой через NominationProvider
// при сборке. Не хранится в схеме pool — берётся live из модуля nomination.
// Полезно на экранах, где пулы собраны из разных номинаций (GetPoolsForArena,
// спека 0011, FR-9).
type Pool struct {
	ID             string
	NominationID   string
	NominationName string
	Number          int
	Members        []FighterRef
	ArenaID        string
	ArenaName      string
	Status         PoolStatus
}

// Assignment — результат автораспределения: бойца — в пул.
type Assignment struct {
	FighterID string
	PoolID    string
}

// NormalizeClub нормализует значение клуба для сравнения «одноклубников»
// (FR-7): регистр и краевые пробелы игнорируются. Пустой клуб (после
// нормализации) не считается общим.
func NormalizeClub(club string) string {
	return strings.ToLower(strings.TrimSpace(club))
}

// NextPoolNumber возвращает наименьший свободный положительный номер среди
// existingNumbers (FR-3): номера удалённых пулов снова доступны.
func NextPoolNumber(existingNumbers []int) int {
	used := make(map[int]bool, len(existingNumbers))
	for _, n := range existingNumbers {
		used[n] = true
	}
	for n := 1; ; n++ {
		if !used[n] {
			return n
		}
	}
}

// poolState — рабочее состояние пула во время раскладки: размер и счётчики
// клубов среди уже стоящих (существующих + расставленных в этом запуске)
// бойцов.
type poolState struct {
	id      string
	number  int
	size    int
	clubCnt map[string]int
}

// AutoDistribute раскладывает unassigned по existing пулам детерминированным
// жадным round-robin (FR-6/FR-7): минимизирует пик числа одноклубников в
// одном пуле, при равенстве — суммарные «лишние» пары, при равенстве —
// наименьший размер пула, финальный тай-брейк — наименьший номер пула.
// Уже расставленные бойцы (existing[*].Members) не трогаются: функция
// возвращает назначения только для unassigned. Если existing пуст —
// возвращает пустой список (проверка ErrNoPools — на уровне service).
func AutoDistribute(existing []Pool, unassigned []FighterRef) []Assignment {
	if len(existing) == 0 || len(unassigned) == 0 {
		return nil
	}

	pools := make([]*poolState, len(existing))
	for i, p := range existing {
		cc := make(map[string]int)
		for _, m := range p.Members {
			if c := NormalizeClub(m.Club); c != "" {
				cc[c]++
			}
		}
		pools[i] = &poolState{id: p.ID, number: p.Number, size: len(p.Members), clubCnt: cc}
	}
	sort.Slice(pools, func(i, j int) bool { return pools[i].number < pools[j].number })

	sorted := make([]FighterRef, len(unassigned))
	copy(sorted, unassigned)
	sort.Slice(sorted, func(i, j int) bool {
		ci, cj := NormalizeClub(sorted[i].Club), NormalizeClub(sorted[j].Club)
		if ci == "" && cj != "" {
			return false
		}
		if cj == "" && ci != "" {
			return true
		}
		if ci != cj {
			return ci < cj
		}
		return sorted[i].ID < sorted[j].ID
	})

	peak := make(map[string]int)
	for _, p := range pools {
		for c, cnt := range p.clubCnt {
			if cnt > peak[c] {
				peak[c] = cnt
			}
		}
	}

	assignments := make([]Assignment, 0, len(sorted))
	for _, f := range sorted {
		club := NormalizeClub(f.Club)
		target := pickPool(pools, club, peak)
		assignments = append(assignments, Assignment{FighterID: f.ID, PoolID: target.id})
		target.size++
		if club != "" {
			target.clubCnt[club]++
			if target.clubCnt[club] > peak[club] {
				peak[club] = target.clubCnt[club]
			}
		}
	}
	return assignments
}

// pickPool выбирает пул для очередного бойца по полному каскаду тай-брейков
// (FR-7): наименьший размер → не увеличивает пик клуба → минимум «лишних»
// пар → наименьший номер пула. pools отсортированы по number (asc) —
// порядок сохраняется через фильтрацию, это даёт финальный тай-брейк
// «бесплатно» (первый элемент после фильтров).
func pickPool(pools []*poolState, club string, peak map[string]int) *poolState {
	candidates := filterMinSize(pools)
	if len(candidates) == 1 || club == "" {
		return candidates[0]
	}

	candidates = filterMinPeakImpact(candidates, club, peak)
	if len(candidates) == 1 {
		return candidates[0]
	}

	candidates = filterMinPairs(candidates, club)
	return candidates[0]
}

func filterMinSize(pools []*poolState) []*poolState {
	min := pools[0].size
	for _, p := range pools[1:] {
		if p.size < min {
			min = p.size
		}
	}
	out := make([]*poolState, 0, len(pools))
	for _, p := range pools {
		if p.size == min {
			out = append(out, p)
		}
	}
	return out
}

func filterMinPeakImpact(pools []*poolState, club string, peak map[string]int) []*poolState {
	score := func(p *poolState) int {
		if p.clubCnt[club]+1 > peak[club] {
			return 1
		}
		return 0
	}
	min := score(pools[0])
	for _, p := range pools[1:] {
		if s := score(p); s < min {
			min = s
		}
	}
	out := make([]*poolState, 0, len(pools))
	for _, p := range pools {
		if score(p) == min {
			out = append(out, p)
		}
	}
	return out
}

func filterMinPairs(pools []*poolState, club string) []*poolState {
	min := pools[0].clubCnt[club]
	for _, p := range pools[1:] {
		if p.clubCnt[club] < min {
			min = p.clubCnt[club]
		}
	}
	out := make([]*poolState, 0, len(pools))
	for _, p := range pools {
		if p.clubCnt[club] == min {
			out = append(out, p)
		}
	}
	return out
}
