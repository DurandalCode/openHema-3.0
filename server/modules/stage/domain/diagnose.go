// Спека 0020: диагностика схемы (FR-8, FR-9; ADR 0014 §5). Чистая функция по
// образцу ComputeStandings (0016)/ResolveBracket (0018)/SelectByRule (0019):
// показывает организатору то, что и так проверят гейты 0019 при
// SetStageRule/BuildStage — до формирования, а не в момент, когда зал ждёт.
// Считает ТОЛЬКО по схеме (Stage.Position/Type/Groups/Bracket/Rule), без
// обращения к боям и ростеру (NFR-2) — там, где оценка требует фактического
// числа бойцов (открытая граница окна, селектор ALL, источник-ростер),
// честно возвращает «оценка невозможна» вместо выдуманного числа.
package domain

import (
	"fmt"
	"sort"
	"strings"
)

// SchemaIssueSeverity — класс проблемы диагностики (FR-8): ERROR —
// формирование заведомо не пройдёт (то же, что отклонят гейты 0019);
// WARNING — формирование пройдёт, но результат может удивить; INFO — так и
// задумано, но организатор должен это видеть до формирования (ADR 0014, §5).
type SchemaIssueSeverity string

const (
	SchemaIssueSeverityError   SchemaIssueSeverity = "error"
	SchemaIssueSeverityWarning SchemaIssueSeverity = "warning"
	SchemaIssueSeverityInfo    SchemaIssueSeverity = "info"
)

// severityRank — порядок для сортировки выдачи (детерминизм, план
// «Тестирование»): сначала ошибки, потом предупреждения, потом информация.
func (s SchemaIssueSeverity) rank() int {
	switch s {
	case SchemaIssueSeverityError:
		return 0
	case SchemaIssueSeverityWarning:
		return 1
	case SchemaIssueSeverityInfo:
		return 2
	default:
		return 3
	}
}

// SchemaIssueCode — код проблемы (FR-8/FR-9). Кода «групповой этап с одной
// группой» намеренно нет (FR-8a) — «финал трёх» законный формат, не
// вырожденная раскладка.
type SchemaIssueCode string

const (
	// Ошибки — заведомый отказ гейтов 0019.

	// SchemaIssueCodeNoGroupCount — групповой этап с правилом отбора, но без
	// заданного числа групп: формировать было бы некуда (FR-7/FR-9a).
	SchemaIssueCodeNoGroupCount SchemaIssueCode = "no_group_count"
	// SchemaIssueCodeBadSource — источник правила не групповой этап либо
	// стоит не раньше целевого по позиции (0019, FR-2).
	SchemaIssueCodeBadSource SchemaIssueCode = "bad_source"
	// SchemaIssueCodeSourceCycle — этап прямо или косвенно питается от
	// самого себя (FR-4).
	SchemaIssueCodeSourceCycle SchemaIssueCode = "source_cycle"
	// SchemaIssueCodeSelectorOverlap — окна двух и более веток от одного
	// источника заведомо пересекаются (0019, FR-11).
	SchemaIssueCodeSelectorOverlap SchemaIssueCode = "selector_overlap"
	// SchemaIssueCodeCapacityExceeded — оценка отбора больше вместимости
	// целевой сетки (0019, FR-19).
	SchemaIssueCodeCapacityExceeded SchemaIssueCode = "capacity_exceeded"

	// Предупреждения — формирование пройдёт, но результат может удивить.

	// SchemaIssueCodeCapacityUnderfill — оценка отбора меньше размера сетки
	// (останутся байи, 0018 FR-9).
	SchemaIssueCodeCapacityUnderfill SchemaIssueCode = "capacity_underfill"
	// SchemaIssueCodeCoverageGap — между окнами соседних веток одного
	// источника есть разрыв мест, не доставшийся никому.
	SchemaIssueCodeCoverageGap SchemaIssueCode = "coverage_gap"
	// SchemaIssueCodeOverlapUnknown — окна веток одного источника разных
	// видов (места в группе против мест сводного порядка) — статически
	// пересечение не выводится, проверится при формировании.
	SchemaIssueCodeOverlapUnknown SchemaIssueCode = "overlap_unknown"

	// Информация — так и задумано, но видеть это надо (ADR 0014, §5).

	// SchemaIssueCodeTailUncovered — хвост состава источника не покрыт ни
	// одной веткой: нормальный исход отбора (0019, FR-11), не дефект.
	SchemaIssueCodeTailUncovered SchemaIssueCode = "tail_uncovered"
)

// SchemaIssue — одна проблема схемы (FR-8). StageIDs — этапы, к которым
// проблема привязана (один — например, нет числа групп; два и больше —
// например, пересечение/разрыв/непокрытый хвост нескольких веток). Message
// формирует сервер — клиент строку из кода не собирает (то же правило, что у
// BracketSlot.SourceLabel и StageBuildEntry.OriginLabel).
type SchemaIssue struct {
	Severity SchemaIssueSeverity
	Code     SchemaIssueCode
	StageIDs []string
	Message  string
}

// openBound — «нет верхней границы» в оценке размера окна (place_to = 0 в
// SeedingRule, FR-3). Достаточно большое значение, чтобы гарантированно не
// уместиться ни в одно реальное окно/размер сетки.
const openBound = 1 << 30

// DiagnoseSchema — диагностика схемы целиком (FR-8, FR-9): три класса
// проблем у этапов номинации. Порядок выдачи детерминирован (severity, затем
// позиция этапа, затем код) — вызывающий (ListStages) отдаёт срез как есть.
func DiagnoseSchema(stages []Stage) []SchemaIssue {
	byID := stagesByID(stages)
	var issues []SchemaIssue

	issues = append(issues, noGroupCountIssues(stages)...)
	issues = append(issues, badSourceIssues(stages, byID)...)
	issues = append(issues, sourceCycleIssues(stages, byID)...)
	issues = append(issues, capacityIssues(stages, byID)...)
	issues = append(issues, branchWindowIssues(stages, byID)...)

	sortIssues(issues, byID)
	return issues
}

// noGroupCountIssues — SchemaIssueCodeNoGroupCount: групповой этап с
// правилом отбора, но group_count <= 0 (FR-7/FR-9a). Групповой этап на ОДНУ
// группу («финал трёх», FR-8a) group_count > 0, поэтому проблемой не
// считается.
func noGroupCountIssues(stages []Stage) []SchemaIssue {
	var out []SchemaIssue
	for _, s := range stages {
		if s.Type == StageTypeGroups && !s.Rule.IsZero() && s.Groups.GroupCount <= 0 {
			out = append(out, SchemaIssue{
				Severity: SchemaIssueSeverityError,
				Code:     SchemaIssueCodeNoGroupCount,
				StageIDs: []string{s.ID},
				Message:  fmt.Sprintf("«%s»: задано правило отбора, но не указано число групп", s.Title),
			})
		}
	}
	return out
}

// badSourceIssues — SchemaIssueCodeBadSource: источник правила не найден
// среди этапов номинации, не групповой этап, либо не стоит строго раньше
// целевого по позиции (0019, FR-2).
func badSourceIssues(stages []Stage, byID map[string]Stage) []SchemaIssue {
	var out []SchemaIssue
	for _, s := range stages {
		if s.Rule.IsZero() || s.Rule.SourceKind != SourceKindStage {
			continue
		}
		src, ok := byID[s.Rule.SourceStageID]
		if !ok || src.Type != StageTypeGroups || src.Position >= s.Position {
			out = append(out, SchemaIssue{
				Severity: SchemaIssueSeverityError,
				Code:     SchemaIssueCodeBadSource,
				StageIDs: []string{s.ID},
				Message:  fmt.Sprintf("«%s»: источник правила недопустим — не групповой этап либо стоит не раньше по схеме", s.Title),
			})
		}
	}
	return out
}

// sourceCycleIssues — SchemaIssueCodeSourceCycle: этап прямо или косвенно
// питается от самого себя (FR-4), обнаруживается тем же обходом, что
// DetectSourceCycle.
func sourceCycleIssues(stages []Stage, byID map[string]Stage) []SchemaIssue {
	var out []SchemaIssue
	for _, s := range stages {
		if !stageInCycle(s.ID, byID) {
			continue
		}
		out = append(out, SchemaIssue{
			Severity: SchemaIssueSeverityError,
			Code:     SchemaIssueCodeSourceCycle,
			StageIDs: []string{s.ID},
			Message:  fmt.Sprintf("«%s»: цикл источников — этап косвенно питается от самого себя", s.Title),
		})
	}
	return out
}

// stageInCycle — входит ли startID в цикл источников текущей (уже
// сохранённой) схемы: проход по цепочке Rule.SourceStageID до возврата в
// startID (цикл) либо до конца цепочки (не цикл).
func stageInCycle(startID string, byID map[string]Stage) bool {
	seen := map[string]bool{}
	cur := startID
	for {
		st, ok := byID[cur]
		if !ok || st.Rule.IsZero() || st.Rule.SourceKind != SourceKindStage {
			return false
		}
		next := st.Rule.SourceStageID
		if next == startID {
			return true
		}
		if seen[next] {
			// Цикл есть, но не включает startID.
			return false
		}
		seen[next] = true
		cur = next
	}
}

// estimateSelectionSize — оценка размера отбора правила от источника (NFR-2):
// -1, если оценка невозможна (открытая верхняя граница, селектор ALL,
// источник-ростер, либо у источника не задано число групп для
// group_places). group_places с закрытой границей [from..to] от источника с
// group_count = G даёт G*(to-from+1); overall_places с закрытой границей
// даёт to-from+1 — от размера источника не зависит, сводный порядок уже
// абсолютно пронумерован.
func estimateSelectionSize(rule SeedingRule, source Stage) int {
	if rule.SourceKind != SourceKindStage {
		return -1
	}
	switch rule.Selector {
	case SelectorKindGroupPlaces:
		if rule.PlaceTo == 0 || source.Groups.GroupCount <= 0 {
			return -1
		}
		return source.Groups.GroupCount * (rule.PlaceTo - rule.PlaceFrom + 1)
	case SelectorKindOverallPlaces:
		if rule.PlaceTo == 0 {
			return -1
		}
		return rule.PlaceTo - rule.PlaceFrom + 1
	default:
		// SelectorKindAll — весь состав источника, число известно только на
		// формировании (NFR-2).
		return -1
	}
}

// capacityIssues — SchemaIssueCodeCapacityExceeded (error)/
// SchemaIssueCodeCapacityUnderfill (warning): оценка отбора против
// вместимости целевой СЕТКИ (0019, FR-19/0018 FR-9). У группового целевого
// этапа фиксированной вместимости нет (AutoDistribute принимает любое
// число) — капасити не оценивается вовсе, в т.ч. для «финала трёх» на одну
// группу (FR-8a).
func capacityIssues(stages []Stage, byID map[string]Stage) []SchemaIssue {
	var out []SchemaIssue
	for _, s := range stages {
		if s.Type != StageTypeBracket || s.Rule.IsZero() || s.Rule.SourceKind != SourceKindStage {
			continue
		}
		src, ok := byID[s.Rule.SourceStageID]
		if !ok {
			continue // источник недопустим — уже отражено badSourceIssues.
		}
		estimate := estimateSelectionSize(s.Rule, src)
		if estimate < 0 {
			continue
		}
		switch {
		case estimate > s.Bracket.Size:
			out = append(out, SchemaIssue{
				Severity: SchemaIssueSeverityError,
				Code:     SchemaIssueCodeCapacityExceeded,
				StageIDs: []string{s.ID},
				Message:  fmt.Sprintf("«%s»: отобранных заведомо больше (%d), чем слотов сетки (%d)", s.Title, estimate, s.Bracket.Size),
			})
		case estimate < s.Bracket.Size:
			out = append(out, SchemaIssue{
				Severity: SchemaIssueSeverityWarning,
				Code:     SchemaIssueCodeCapacityUnderfill,
				StageIDs: []string{s.ID},
				Message:  fmt.Sprintf("«%s»: отобранных заведомо меньше (%d), чем слотов сетки (%d) — останутся байи", s.Title, estimate, s.Bracket.Size),
			})
		}
	}
	return out
}

// branchWindow — окно одной ветки от общего источника: рабочее
// представление для парного сравнения (пересечение/разрыв/хвост).
type branchWindow struct {
	stage Stage
	kind  SelectorKind // Selector веток от источника: ALL/GROUP_PLACES/OVERALL_PLACES
	from  int
	to    int // openBound — открытая верхняя граница
}

// branchWindowIssues — SchemaIssueCodeSelectorOverlap (error)/
// SchemaIssueCodeOverlapUnknown/SchemaIssueCodeCoverageGap (warning)/
// SchemaIssueCodeTailUncovered (info): обход окон ВСЕХ веток одного
// источника разом (двух, трёх и больше — FR-8a), сгруппированных по
// Rule.SourceStageID.
func branchWindowIssues(stages []Stage, byID map[string]Stage) []SchemaIssue {
	bySource := make(map[string][]branchWindow)
	for _, s := range stages {
		if s.Rule.IsZero() || s.Rule.SourceKind != SourceKindStage {
			continue
		}
		if _, ok := byID[s.Rule.SourceStageID]; !ok {
			continue // недопустимый источник — уже badSourceIssues.
		}
		to := s.Rule.PlaceTo
		if to == 0 {
			to = openBound
		}
		bySource[s.Rule.SourceStageID] = append(bySource[s.Rule.SourceStageID], branchWindow{
			stage: s,
			kind:  s.Rule.Selector,
			from:  s.Rule.PlaceFrom,
			to:    to,
		})
	}

	var out []SchemaIssue
	for _, branches := range bySource {
		sort.SliceStable(branches, func(i, j int) bool {
			if branches[i].from != branches[j].from {
				return branches[i].from < branches[j].from
			}
			return branches[i].stage.ID < branches[j].stage.ID
		})

		out = append(out, pairwiseOverlapIssues(branches)...)
		out = append(out, gapAndTailIssues(branches)...)
	}
	return out
}

// windowsOverlap — окна двух веток одного вида пересекаются (интервалы
// [from..to] пересекаются, openBound трактуется как +бесконечность).
func windowsOverlap(a, b branchWindow) bool {
	lo := a.from
	if b.from > lo {
		lo = b.from
	}
	hi := a.to
	if b.to < hi {
		hi = b.to
	}
	return lo <= hi
}

// pairwiseOverlapIssues — SelectorOverlap (окна одного вида физически
// пересекаются, либо хотя бы одно — ALL, забирающий весь состав целиком) /
// OverlapUnknown (окна разных видов — «места в группе» против «мест
// сводного порядка» — статически не сравнимы).
func pairwiseOverlapIssues(branches []branchWindow) []SchemaIssue {
	var out []SchemaIssue
	for i := 0; i < len(branches); i++ {
		for j := i + 1; j < len(branches); j++ {
			a, b := branches[i], branches[j]
			switch {
			case a.kind == SelectorKindAll || b.kind == SelectorKindAll:
				out = append(out, selectorOverlapIssue(a.stage, b.stage))
			case a.kind != b.kind:
				out = append(out, SchemaIssue{
					Severity: SchemaIssueSeverityWarning,
					Code:     SchemaIssueCodeOverlapUnknown,
					StageIDs: []string{a.stage.ID, b.stage.ID},
					Message:  fmt.Sprintf("«%s» и «%s»: окна разных видов (места в группе / сводный порядок) — пересечение проверится только при формировании", a.stage.Title, b.stage.Title),
				})
			case windowsOverlap(a, b):
				out = append(out, selectorOverlapIssue(a.stage, b.stage))
			}
		}
	}
	return out
}

func selectorOverlapIssue(a, b Stage) SchemaIssue {
	return SchemaIssue{
		Severity: SchemaIssueSeverityError,
		Code:     SchemaIssueCodeSelectorOverlap,
		StageIDs: []string{a.ID, b.ID},
		Message:  fmt.Sprintf("«%s» и «%s»: окна веток пересекаются — кто-то попал бы в обе", a.Title, b.Title),
	}
}

// gapAndTailIssues — CoverageGap/TailUncovered считаются только внутри
// однородного по виду селектора кластера веток (ALL исключён — с ним
// координаты «мест» не определены): окна разных видов статически
// несравнимы (OverlapUnknown уже это отразил), гэп/хвост для такой смеси не
// выводится (недостоверная информация хуже отсутствующей, NFR-2).
func gapAndTailIssues(branches []branchWindow) []SchemaIssue {
	kind, homogeneous := clusterKind(branches)
	if !homogeneous {
		return nil
	}

	var out []SchemaIssue
	// merged — слитые непересекающиеся диапазоны покрытия источника этим
	// кластером веток; lastStage — та ветка, чья верхняя граница сейчас
	// формирует правый край текущего диапазона (для сообщения о разрыве).
	type covered struct {
		to        int
		lastStage Stage
		stageIDs  []string
	}
	var merged []covered

	for _, w := range branches {
		if len(merged) == 0 {
			merged = append(merged, covered{to: w.to, lastStage: w.stage, stageIDs: []string{w.stage.ID}})
			continue
		}
		last := &merged[len(merged)-1]
		if last.to < openBound && w.from > last.to+1 {
			out = append(out, SchemaIssue{
				Severity: SchemaIssueSeverityWarning,
				Code:     SchemaIssueCodeCoverageGap,
				StageIDs: []string{last.lastStage.ID, w.stage.ID},
				Message:  fmt.Sprintf("«%s» и «%s»: между окнами веток есть разрыв — эти места никому не достаются", last.lastStage.Title, w.stage.Title),
			})
			merged = append(merged, covered{to: w.to, lastStage: w.stage, stageIDs: []string{w.stage.ID}})
			continue
		}
		last.stageIDs = append(last.stageIDs, w.stage.ID)
		if w.to > last.to {
			last.to = w.to
			last.lastStage = w.stage
		}
	}

	tail := merged[len(merged)-1]
	if tail.to < openBound {
		out = append(out, SchemaIssue{
			Severity: SchemaIssueSeverityInfo,
			Code:     SchemaIssueCodeTailUncovered,
			StageIDs: tail.stageIDs,
			Message:  fmt.Sprintf("хвост состава источника (места с %d) не покрыт ни одной веткой (кластер %q)", tail.to+1, kind),
		})
	}
	return out
}

// clusterKind — все ветки кластера одного вида (не ALL) → (вид, true);
// иначе ("", false) — гэп/хвост для смешанного кластера не считается.
func clusterKind(branches []branchWindow) (SelectorKind, bool) {
	if len(branches) == 0 {
		return "", false
	}
	kind := branches[0].kind
	if kind == SelectorKindAll {
		return "", false
	}
	for _, w := range branches[1:] {
		if w.kind != kind {
			return "", false
		}
	}
	return kind, true
}

// sortIssues — детерминированный порядок выдачи (план «Тестирование»):
// severity, затем позиция этапа (минимальная среди StageIDs — так пары
// сортируются по более раннему участнику), затем код, затем сами id — на
// случай полного совпадения первых трёх ключей у нескольких проблем.
func sortIssues(issues []SchemaIssue, byID map[string]Stage) {
	sort.SliceStable(issues, func(i, j int) bool {
		a, b := issues[i], issues[j]
		if ra, rb := a.Severity.rank(), b.Severity.rank(); ra != rb {
			return ra < rb
		}
		if pa, pb := minPosition(a.StageIDs, byID), minPosition(b.StageIDs, byID); pa != pb {
			return pa < pb
		}
		if a.Code != b.Code {
			return a.Code < b.Code
		}
		return strings.Join(a.StageIDs, ",") < strings.Join(b.StageIDs, ",")
	})
}

func minPosition(stageIDs []string, byID map[string]Stage) int {
	min := openBound
	for _, id := range stageIDs {
		if st, ok := byID[id]; ok && st.Position < min {
			min = st.Position
		}
	}
	return min
}
