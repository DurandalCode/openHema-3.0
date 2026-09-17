package domain

import "strings"

// Импорт ростера из файла (спека 0049). Файл уже разобран в строки
// (pkg/tabular), доменный слой решает только, что с этими строками станет:
// кто новый, кому дописать участия, кого пропустить, кого отклонить.

// ImportRow — разобранная строка файла: боец и его номинации «как записано».
type ImportRow struct {
	// Line — номер строки в файле, как её видит admin в редакторе, с учётом
	// строки заголовка (FR-11a).
	Line int
	Name string
	Club string
	// NominationTitles — названия номинаций из колонки файла. Пусто —
	// сработает умолчание из UI (FR-5a), а если и оно пусто, боец заводится
	// без участий (FR-5b).
	NominationTitles []string
}

// RowOutcome — исход строки файла.
type RowOutcome string

const (
	// OutcomeCreated — будет заведён новый боец.
	OutcomeCreated RowOutcome = "created"
	// OutcomeUpdated — боец уже есть, добавляются недостающие участия (FR-8).
	OutcomeUpdated RowOutcome = "updated"
	// OutcomeSkipped — полный дубль: ничего не меняется (AC-6).
	OutcomeSkipped RowOutcome = "skipped"
	// OutcomeRejected — строка не применена, причина в RowResult.Error.
	OutcomeRejected RowOutcome = "rejected"
)

// RowError — причина отклонения строки.
type RowError string

const (
	// RowErrorNone — строка не отклонена.
	RowErrorNone RowError = ""
	// RowErrorEmptyName — в строке нет имени бойца (FR-6).
	RowErrorEmptyName RowError = "empty_name"
	// RowErrorUnknownNomination — название номинации не найдено в турнире
	// (FR-5); само название — в RowResult.ErrorDetail.
	RowErrorUnknownNomination RowError = "unknown_nomination"
	// RowErrorFighterWithdrawn — строка совпала с выведенным с турнира
	// бойцом; импорт не возвращает бойцов в турнир (FR-8a).
	RowErrorFighterWithdrawn RowError = "fighter_withdrawn"
)

// RowResult — исход одной строки файла: и для предпросмотра, и для отчёта.
type RowResult struct {
	Row     ImportRow
	Outcome RowOutcome
	Error   RowError
	// ErrorDetail — уточнение причины (нераспознанное название номинации).
	ErrorDetail string
	// FighterID — существующий боец для updated/skipped и для отклонения по
	// RowErrorFighterWithdrawn; для created при планировании пуст (бойца ещё
	// нет) и проставляется после записи.
	FighterID string
	// AddedNominationIDs — участия, которые появятся у бойца (created/updated).
	AddedNominationIDs []string
}

// ImportSummary — сводка по файлу (FR-4).
type ImportSummary struct {
	RowsRead int
	Created  int
	Updated  int
	Skipped  int
	Rejected int
}

// NormalizeKey строит ключ сопоставления строки файла с бойцом турнира
// (FR-8): нижний регистр, срезанные окружающие и схлопнутые внутренние
// пробелы. Одной функцией строятся и индекс существующих бойцов, и ключ
// строки файла, и ключ дедупа внутри файла (FR-7) — иначе они разъедутся.
//
// Имя и клуб разделены символом, который в них не встречается, чтобы
// «Иванов» + «Иван Сталь» не схлопнулось с «Иванов Иван» + «Сталь».
func NormalizeKey(name, club string) string {
	return normalizeSpaces(name) + "\x00" + normalizeSpaces(club)
}

// NormalizeTitle нормализует название номинации для сопоставления с
// колонкой файла (FR-5: без учёта регистра и окружающих пробелов). Той же
// функцией вызывающий строит индекс названий номинаций турнира, который
// передаёт в PlanImport.
func NormalizeTitle(title string) string {
	return normalizeSpaces(title)
}

// normalizeSpaces приводит строку к сравнимому виду: нижний регистр, без
// окружающих пробелов, внутренние пробельные последовательности — в один
// пробел.
func normalizeSpaces(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(s), " "))
}

// PlanImport раскладывает строки файла по исходам, ничего не записывая.
//
// Чистая функция: ни БД, ни файлов, ни времени — на входе разобранные
// строки, снимок ростера и индекс названий номинаций турнира
// (NormalizeTitle(title) → nomination_id), на выходе исход каждой строки и
// сводка. Один и тот же вызов обслуживает и предпросмотр (dry_run), и
// подтверждение — разница только в том, применяет ли вызывающий план.
//
// defaults — id номинаций «по умолчанию» из UI: применяются только к
// строкам с пустой колонкой номинаций (FR-5a).
func PlanImport(
	rows []ImportRow,
	existing []Fighter,
	nominations map[string]string,
	defaults []string,
) ([]RowResult, ImportSummary) {
	index := indexRoster(existing)
	// planned — ключ → позиция в results уже запланированной к созданию
	// строки: вторая строка про того же человека дополняет её, а не заводит
	// второго бойца (FR-7).
	planned := make(map[string]int, len(rows))
	// state — набор номинаций, который будет у бойца с этим ключом после
	// применения плана (по существующему бойцу либо по запланированному).
	state := make(map[string]map[string]bool, len(rows))

	results := make([]RowResult, 0, len(rows))
	summary := ImportSummary{RowsRead: len(rows)}

	for _, row := range rows {
		res := planRow(row, index, planned, state, results, nominations, defaults)
		results = append(results, res)
	}

	for _, r := range results {
		switch r.Outcome {
		case OutcomeCreated:
			summary.Created++
		case OutcomeUpdated:
			summary.Updated++
		case OutcomeSkipped:
			summary.Skipped++
		case OutcomeRejected:
			summary.Rejected++
		}
	}
	return results, summary
}

// planRow вычисляет исход одной строки и дописывает состояние плана.
func planRow(
	row ImportRow,
	index map[string]Fighter,
	planned map[string]int,
	state map[string]map[string]bool,
	results []RowResult,
	nominations map[string]string,
	defaults []string,
) RowResult {
	res := RowResult{Row: row}

	if strings.TrimSpace(row.Name) == "" {
		res.Outcome = OutcomeRejected
		res.Error = RowErrorEmptyName
		return res
	}

	wanted, unknownTitle, ok := resolveNominations(row.NominationTitles, nominations, defaults)
	if !ok {
		res.Outcome = OutcomeRejected
		res.Error = RowErrorUnknownNomination
		res.ErrorDetail = unknownTitle
		return res
	}

	key := NormalizeKey(row.Name, row.Club)

	if f, found := index[key]; found {
		if f.Status == StatusWithdrawn {
			res.Outcome = OutcomeRejected
			res.Error = RowErrorFighterWithdrawn
			res.FighterID = f.ID
			return res
		}
		res.FighterID = f.ID
	}

	have, tracked := state[key]
	if !tracked {
		have = make(map[string]bool)
		if f, found := index[key]; found {
			for _, p := range f.Participations {
				if p.Status == ParticipationActive {
					have[p.NominationID] = true
				}
			}
		}
		state[key] = have
	}

	added := make([]string, 0, len(wanted))
	for _, nomID := range wanted {
		if !have[nomID] {
			have[nomID] = true
			added = append(added, nomID)
		}
	}

	if pos, isPlanned := planned[key]; isPlanned {
		// Дубль внутри файла: дописываем участия уже запланированному бойцу.
		results[pos].AddedNominationIDs = append(results[pos].AddedNominationIDs, added...)
		res.Outcome = OutcomeUpdated
		if len(added) == 0 {
			res.Outcome = OutcomeSkipped
		}
		res.AddedNominationIDs = nonEmpty(added)
		return res
	}

	if res.FighterID != "" {
		res.Outcome = OutcomeUpdated
		if len(added) == 0 {
			res.Outcome = OutcomeSkipped
		}
		res.AddedNominationIDs = nonEmpty(added)
		return res
	}

	res.Outcome = OutcomeCreated
	res.AddedNominationIDs = nonEmpty(added)
	planned[key] = len(results)
	return res
}

// resolveNominations превращает названия из строки файла в id номинаций.
// Пустая колонка — умолчания из UI (FR-5a); пустой результат законен
// (FR-5b). ok=false и название — при нераспознанном названии (FR-5).
func resolveNominations(
	titles []string,
	nominations map[string]string,
	defaults []string,
) (ids []string, unknownTitle string, ok bool) {
	written := make([]string, 0, len(titles))
	for _, t := range titles {
		if strings.TrimSpace(t) != "" {
			written = append(written, t)
		}
	}

	if len(written) == 0 {
		return dedupe(defaults), "", true
	}

	resolved := make([]string, 0, len(written))
	for _, title := range written {
		nomID, found := nominations[NormalizeTitle(title)]
		if !found {
			return nil, strings.TrimSpace(title), false
		}
		resolved = append(resolved, nomID)
	}
	return dedupe(resolved), "", true
}

// indexRoster строит индекс существующих бойцов по ключу «имя + клуб».
// Записи со StatusMerged в индекс не попадают: строка файла должна
// сопоставляться с итоговой записью слияния, а не с поглощённой (FR-8b).
func indexRoster(existing []Fighter) map[string]Fighter {
	index := make(map[string]Fighter, len(existing))
	for _, f := range existing {
		if f.Status == StatusMerged {
			continue
		}
		index[NormalizeKey(f.Name, f.Club)] = f
	}
	return index
}

func dedupe(ids []string) []string {
	seen := make(map[string]bool, len(ids))
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

// nonEmpty возвращает nil вместо пустого среза: в отчёте «участий не
// добавлено» и «добавлен пустой список» — одно и то же.
func nonEmpty(ids []string) []string {
	if len(ids) == 0 {
		return nil
	}
	return ids
}
