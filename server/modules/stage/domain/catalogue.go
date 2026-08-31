// Спека 0047: встроенный каталог пресетов формата (ADR 0014 §9). Каталог —
// Go-константа, а не данные в БД: десять записей четырёх схем ADR 0014 §5,
// первые три — в трёх вариантах масштаба турнира. Заведение записей в
// библиотеку (журнал, однократность) — забота service/catalogue.go; здесь —
// только сами спецификации и их форма.
package domain

// BuiltinPreset — одна запись встроенного каталога: стабильный Key (журнал
// заведения, FR-7 — переименование записи в библиотеке ключ не меняет,
// исправленная схема существующего ключа не бывает, только новый ключ,
// FR-8), Name — имя в библиотеке (самодостаточное, содержит схему и вариант
// масштаба, FR-4), Spec — та же FormatSpec, что и у пользовательского
// пресета (0020, FR-11) — каталог не расширяет модель.
type BuiltinPreset struct {
	Key  string
	Name string
	Spec FormatSpec
}

// BuiltinPresets — каталог целиком (FR-2/FR-3): десять записей. Порядок
// возврата фиксирован (для детерминизма тестов и логов заведения), но не
// является витриной — библиотека сортирует по имени (0029, FR-20).
func BuiltinPresets() []BuiltinPreset {
	return []BuiltinPreset{
		groupsDoublePlayoff("groups-double-playoff-8", "Группы + двойной плейофф (до 8)", 2, 4),
		groupsDoublePlayoff("groups-double-playoff-16", "Группы + двойной плейофф (до 16)", 4, 8),
		groupsDoublePlayoff("groups-double-playoff-32", "Группы + двойной плейофф (до 32)", 8, 16),
		groupsPlayoff("groups-playoff-8", "Группы + плейофф (до 8)", 2, 4),
		groupsPlayoff("groups-playoff-16", "Группы + плейофф (до 16)", 4, 8),
		groupsPlayoff("groups-playoff-32", "Группы + плейофф (до 32)", 8, 16),
		singleBracket("bracket-8", "Олимпийка (до 8)", 4),
		singleBracket("bracket-16", "Олимпийка (до 16)", 8),
		singleBracket("bracket-32", "Олимпийка (до 32)", 16),
		roundRobin(),
	}
}

// rosterGroupsStage — групповой этап от ростера номинации, отбирающий всех
// (ALL) и раскладывающий змейкой (SNAKE) — общее начало у всех схем с
// групповой стадией. Явная роль-рулка (не «правила нет») даёт организатору
// то же действие «Сформировать этап», что и у любого другого этапа со
// схемой (ADR 0014 §6), а не только ручной DnD.
func rosterGroupsStage(title string, groupCount int) FormatStageSpec {
	return FormatStageSpec{
		Title:       title,
		Type:        StageTypeGroups,
		Groups:      GroupsConfig{GroupCount: groupCount},
		SourceKind:  SourceKindRoster,
		SourceIndex: -1,
		Selector:    SelectorKindAll,
		Method:      LayoutMethodSnake,
	}
}

// bracketFromGroupPlaces — сетка, посеянная (SEEDED) от окна мест каждой
// группы группового этапа с индексом sourceIndex. placeTo=0 — открытая
// верхняя граница «места placeFrom и ниже» (0019, FR-3).
func bracketFromGroupPlaces(title string, size, sourceIndex, placeFrom, placeTo int) FormatStageSpec {
	return FormatStageSpec{
		Title:       title,
		Type:        StageTypeBracket,
		Bracket:     BracketConfig{Size: size, ThirdPlace: true},
		SourceKind:  SourceKindStage,
		SourceIndex: sourceIndex,
		Selector:    SelectorKindGroupPlaces,
		PlaceFrom:   placeFrom,
		PlaceTo:     placeTo,
		Method:      LayoutMethodSeeded,
	}
}

// groupsDoublePlayoff — целевая схема ADR 0014: групповой этап → основная
// сетка (места 1–2 каждой группы, за 1-е место) + утешительная сетка (места
// 3 и ниже каждой группы), параллельные ветки общего источника (0019,
// FR-10/FR-11). Отбор 2×groupCount заполняет сетку размера size ровно
// (NFR-1) — окна 1–2 и 3+ не пересекаются по построению.
func groupsDoublePlayoff(key, name string, groupCount, size int) BuiltinPreset {
	return BuiltinPreset{
		Key:  key,
		Name: name,
		Spec: FormatSpec{Stages: []FormatStageSpec{
			rosterGroupsStage("Групповой этап", groupCount),
			bracketFromGroupPlaces("Основная сетка", size, 0, 1, 2),
			bracketFromGroupPlaces("Утешительная сетка", size, 0, 3, 0),
		}},
	}
}

// groupsPlayoff — групповой этап → одна сетка по местам 1–2 групп; места 3
// и ниже никуда не проходят (нормальный исход отбора, 0020 FR-8 «класс
// информация»).
func groupsPlayoff(key, name string, groupCount, size int) BuiltinPreset {
	return BuiltinPreset{
		Key:  key,
		Name: name,
		Spec: FormatSpec{Stages: []FormatStageSpec{
			rosterGroupsStage("Групповой этап", groupCount),
			bracketFromGroupPlaces("Плейофф", size, 0, 1, 2),
		}},
	}
}

// singleBracket — олимпийка: одна сетка прямо от ростера номинации, посев
// 1×N (SEEDED), без групповой стадии.
func singleBracket(key, name string, size int) BuiltinPreset {
	return BuiltinPreset{
		Key:  key,
		Name: name,
		Spec: FormatSpec{Stages: []FormatStageSpec{{
			Title:       "Сетка",
			Type:        StageTypeBracket,
			Bracket:     BracketConfig{Size: size, ThirdPlace: true},
			SourceKind:  SourceKindRoster,
			SourceIndex: -1,
			Selector:    SelectorKindAll,
			Method:      LayoutMethodSeeded,
		}}},
	}
}

// roundRobin — единственный групповой этап на одну группу: каждый с каждым,
// итог по таблице (0016). Та же форма, что и завершающий «финал трёх»
// (0020, FR-8a) — сеткой невыразима, минимальный размер сетки 4. Варианта по
// масштабу не имеет (FR-3): число групп всегда 1.
func roundRobin() BuiltinPreset {
	return BuiltinPreset{
		Key:  "round-robin",
		Name: "Круговая система (одна группа)",
		Spec: FormatSpec{Stages: []FormatStageSpec{
			rosterGroupsStage("Круговая система", 1),
		}},
	}
}
