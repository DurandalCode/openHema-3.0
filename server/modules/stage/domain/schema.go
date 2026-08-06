// Спека 0020: конструктор схемы номинации + пресеты форматов (ADR 0014
// §8/§9). Ядро — чистые функции над графом этапов номинации, по образцу
// ResolveBracket (0018)/SelectByRule (0019): спецификация формата
// (номинация ⇄ FormatSpec ⇄ пресет, FR-11/FR-15/FR-16), каскадный пересчёт
// позиций от источника (FR-3) и детект цикла источников (FR-4).
package domain

import (
	"sort"
	"strconv"
	"time"
)

// ---------------------------------------------------------------------
// FormatSpec — схема вне привязки к номинации (FR-11).
// ---------------------------------------------------------------------

// FormatStageSpec — один этап схемы вне привязки к номинации (FR-11).
// SourceIndex — индекс этапа-источника в том же FormatSpec.Stages (>= 0),
// если SourceKind = SourceKindStage; -1, если источника-этапа нет (правила
// нет вовсе либо источник — ростер). Именно индекс, а не id, делает
// спецификацию переносимой между номинациями и переживающей турнир (FR-16).
type FormatStageSpec struct {
	Title       string
	Type        StageType
	Bracket     BracketConfig
	Groups      GroupsConfig
	SourceKind  SourceKind
	SourceIndex int
	Selector    SelectorKind
	PlaceFrom   int
	PlaceTo     int
	Method      LayoutMethod
}

// hasRule — «правило есть» для спецификации этапа: SourceKind пуст ровно
// тогда, когда у этапа-донора правила не было (SeedingRule.IsZero, FR-1).
func (s FormatStageSpec) hasRule() bool {
	return s.SourceKind != ""
}

// FormatSpec — схема целиком: упорядоченный список этапов. Порядок — это
// порядок применения (симуляция последовательного создания, FR-8a): позиции
// в целевой номинации считает ResolveStagePositions поверх результата
// применения, а не индекс сам по себе.
type FormatSpec struct {
	Stages []FormatStageSpec
}

// FormatPreset — именованная схема в глобальной библиотеке (FR-11/FR-12):
// живёт вне турнира и вне номинации, переживает оба (FR-16 — копия по
// значению в обе стороны).
type FormatPreset struct {
	ID        string
	Name      string
	Spec      FormatSpec
	CreatedAt time.Time
	UpdatedAt time.Time
}

// SpecFromStages — схема номинации → переносимая спецификация (FR-11,
// FR-15: используется и «сохранить как пресет», и «скопировать схему из
// номинации»). Этапы упорядочиваются по (Position, Title) — тот же порядок,
// в котором схема рисуется на экране (0019, FR-25); UUID источников
// заменяются индексами в этом же порядке. Этап, чей источник не входит в
// переданный набор stages (в валидной схеме невозможно — источник и ветка
// всегда одной номинации, но защищаемся от рассинхрона), теряет правило: у
// него в результате SourceKind == "" (правила нет), как будто оно не было
// задано вовсе.
func SpecFromStages(stages []Stage) FormatSpec {
	ordered := append([]Stage(nil), stages...)
	sort.SliceStable(ordered, func(i, j int) bool {
		if ordered[i].Position != ordered[j].Position {
			return ordered[i].Position < ordered[j].Position
		}
		return ordered[i].Title < ordered[j].Title
	})

	indexByID := make(map[string]int, len(ordered))
	for i, s := range ordered {
		indexByID[s.ID] = i
	}

	out := make([]FormatStageSpec, len(ordered))
	for i, s := range ordered {
		spec := FormatStageSpec{
			Title:       s.Title,
			Type:        s.Type,
			Bracket:     s.Bracket,
			Groups:      s.Groups,
			SourceIndex: -1,
		}
		if !s.Rule.IsZero() {
			switch s.Rule.SourceKind {
			case SourceKindRoster:
				spec.SourceKind = SourceKindRoster
				spec.Selector = s.Rule.Selector
				spec.PlaceFrom = s.Rule.PlaceFrom
				spec.PlaceTo = s.Rule.PlaceTo
				spec.Method = s.Rule.Method
			case SourceKindStage:
				if idx, ok := indexByID[s.Rule.SourceStageID]; ok {
					spec.SourceKind = SourceKindStage
					spec.SourceIndex = idx
					spec.Selector = s.Rule.Selector
					spec.PlaceFrom = s.Rule.PlaceFrom
					spec.PlaceTo = s.Rule.PlaceTo
					spec.Method = s.Rule.Method
				}
				// иначе — осиротевшая ссылка: источник не входит в набор,
				// правило теряется (spec остаётся с нулевым SourceKind).
			}
		}
		out[i] = spec
	}
	return FormatSpec{Stages: out}
}

// ValidateFormatSpec — спецификация исполнима структурно (вызывается и при
// сохранении пресета, и при применении, план «domain/schema.go»):
//   - непустая (пустой пресет сохранять нечего);
//   - индексы источников в границах и строго меньше собственного индекса —
//     это одновременно гарантирует ацикличность по построению (сослаться
//     вперёд или на себя невозможно);
//   - правило (если есть) валидно структурно — переиспользует
//     SeedingRule.Validate (FR-2..FR-4), targetIsBracket выводится из
//     собственного Type этапа;
//   - групповой этап с правилом отбора, но без заданного числа групп —
//     формировать было бы некуда (FR-7/FR-9a).
func ValidateFormatSpec(spec FormatSpec) error {
	if len(spec.Stages) == 0 {
		return ErrInvalidSpec
	}

	for i, s := range spec.Stages {
		if !s.hasRule() {
			continue
		}

		if s.SourceKind == SourceKindStage {
			if s.SourceIndex < 0 || s.SourceIndex >= len(spec.Stages) || s.SourceIndex >= i {
				return ErrInvalidSpec
			}
		}

		rule := SeedingRule{
			SourceKind: s.SourceKind,
			Selector:   s.Selector,
			PlaceFrom:  s.PlaceFrom,
			PlaceTo:    s.PlaceTo,
			Method:     s.Method,
		}
		if s.SourceKind == SourceKindStage {
			// SeedingRule.Validate требует непустой SourceStageID у
			// источника-этапа — индекс уже проверен выше, здесь нужен лишь
			// факт присутствия (значение id вне спецификации не резолвится).
			rule.SourceStageID = strconv.Itoa(s.SourceIndex)
		}
		if err := rule.Validate(s.Type == StageTypeBracket); err != nil {
			return ErrInvalidSpec
		}

		if s.Type == StageTypeGroups && s.Groups.GroupCount <= 0 {
			return ErrInvalidSpec
		}
	}

	return nil
}

// ---------------------------------------------------------------------
// Позиции и циклы источников (FR-3, FR-4).
// ---------------------------------------------------------------------

// stagesByID индексирует этапы по id — общий хелпер для резолва источников
// (ResolveStagePositions/DetectSourceCycle/DiagnoseSchema).
func stagesByID(stages []Stage) map[string]Stage {
	byID := make(map[string]Stage, len(stages))
	for _, s := range stages {
		byID[s.ID] = s
	}
	return byID
}

// ResolveStagePositions — каскадный пересчёт позиций всей схемы от
// источников (FR-3): смена источника одной ветки перестраивает уровни всех
// этапов, что от неё зависят, — ручной порядок нигде не запрашивается.
// Правила пересчёта для каждого этапа:
//   - без правила отбора (SeedingRule.IsZero) — позиция НЕ пересчитывается,
//     сохраняется как есть (0018, FR-2). Это регресс-тест на AC-18 спеки
//     0019: этап без правила («финал трёх» из победителей сеток, FR-8a)
//     обязан вставать следующим уровнем за уже размещёнными, а не
//     пересчитываться, — иначе он вернулся бы в начало схемы;
//   - источник-ростер — позиция 0 (первый уровень);
//   - источник-этап — позиция source+1, резолвится рекурсивно/
//     топологически (несколько веток от одного источника получают
//     одинаковую позицию — они параллельны, FR-8a).
//
// Резолв топологический с защитой от цикла: цикл источников (FR-4) даёт
// ErrSourceCycle вместо зависания.
func ResolveStagePositions(stages []Stage) (map[string]int, error) {
	byID := stagesByID(stages)
	resolved := make(map[string]int, len(stages))
	visiting := make(map[string]bool, len(stages))

	var resolve func(id string) (int, error)
	resolve = func(id string) (int, error) {
		if pos, ok := resolved[id]; ok {
			return pos, nil
		}
		st, ok := byID[id]
		if !ok {
			// Источник вне переданного набора — не наша забота здесь
			// (гейтится на уровне сервиса, ErrSourceNotAllowed); чтобы не
			// падать, резолвим в 0.
			return 0, nil
		}
		if visiting[id] {
			return 0, ErrSourceCycle
		}
		visiting[id] = true
		defer delete(visiting, id)

		var pos int
		var err error
		switch {
		case st.Rule.IsZero():
			pos = st.Position
		case st.Rule.SourceKind == SourceKindRoster:
			pos = 0
		case st.Rule.SourceKind == SourceKindStage:
			var srcPos int
			srcPos, err = resolve(st.Rule.SourceStageID)
			if err != nil {
				return 0, err
			}
			pos = srcPos + 1
		default:
			pos = st.Position
		}
		resolved[id] = pos
		return pos, nil
	}

	for _, s := range stages {
		pos, err := resolve(s.ID)
		if err != nil {
			return nil, err
		}
		resolved[s.ID] = pos
	}
	return resolved, nil
}

// DetectSourceCycle — гейт FR-4: если этапу stageID назначить источником
// newSourceID, замкнётся ли цепочка источников сама на себя? Проходит по
// ТЕКУЩИМ (уже сохранённым) правилам от newSourceID вверх по цепочке; если
// упирается в stageID — цикл. newSourceID == stageID — прямой
// self-reference, цикл длиной 1, всегда true без обхода.
func DetectSourceCycle(stages []Stage, stageID, newSourceID string) bool {
	if newSourceID == stageID {
		return true
	}

	byID := stagesByID(stages)
	seen := make(map[string]bool, len(stages))
	cur := newSourceID
	for {
		if cur == stageID {
			return true
		}
		if seen[cur] {
			// Цикл существует, но не замыкается на stageID — не наш
			// случай (в валидной схеме недостижимо: FR-4 не пускает такие
			// циклы возникнуть в первую очередь).
			return false
		}
		seen[cur] = true

		st, ok := byID[cur]
		if !ok || st.Rule.IsZero() || st.Rule.SourceKind != SourceKindStage {
			return false
		}
		cur = st.Rule.SourceStageID
	}
}
