package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/hema/server/modules/fighter/domain"
	"github.com/hema/server/pkg/tabular"
)

// Импорт ростера из файла (спека 0049). Файл — транспорт, а не документ
// турнира: он разбирается и забывается (NFR-3), состояния «сессии импорта»
// на сервере нет — предпросмотр и подтверждение это один и тот же вызов с
// разным dry_run.

const (
	// maxImportRows — предел строк данных в файле (NFR-1).
	maxImportRows = 1000
	// rosterPageSize — размер страницы при вычитывании ростера турнира.
	// Пустой RosterFilter означает LIMIT 0 (спека 0041), поэтому снимок
	// ростера собирается страницами, а не одним «фильтром по умолчанию».
	rosterPageSize = 500
)

// Заголовки колонок, которые импорт понимает. Порядок колонок в файле
// произволен, лишние колонки игнорируются, настраиваемого маппинга нет
// (вне скоупа спеки).
var (
	nameHeaders       = []string{"имя", "name"}
	surnameHeaders    = []string{"фамилия", "surname", "last_name"}
	clubHeaders       = []string{"клуб", "club"}
	nominationHeaders = []string{"номинации", "nominations"}
)

// nominationSeparators — разделители нескольких номинаций внутри одной
// ячейки: «Лонгсворд, Сабля».
const nominationSeparators = ",;\n"

// ImportCommand — запрос импорта ростера из файла.
type ImportCommand struct {
	// TournamentID — пустой резолвится в активный турнир (как ListRoster).
	TournamentID string
	Content      []byte
	// FileName — по расширению (.csv/.xlsx) выбирается разборщик.
	FileName string
	// DefaultNominationIDs — умолчания из UI: применяются к строкам, где
	// колонка номинаций пуста (FR-5a).
	DefaultNominationIDs []string
	// DryRun — предпросмотр без записи (FR-2).
	DryRun bool
}

// ImportResult — отчёт импорта: и предпросмотра, и фактической записи.
type ImportResult struct {
	TournamentID string
	Summary      domain.ImportSummary
	Rows         []domain.RowResult
	DryRun       bool
}

// ImportFighters разбирает файл со списком участников и заводит бойцов
// (спека 0049). При DryRun возвращает тот же отчёт, ничего не записав.
//
// Ошибки уровня файла (формат, пустой файл, лимит строк, нет колонки имени)
// возвращаются ошибкой вызова; ошибки уровня строки — не ошибка вызова, а
// исход строки в отчёте: одна опечатка не отменяет две сотни корректных
// строк (FR-9).
func (s *Service) ImportFighters(ctx context.Context, cmd ImportCommand) (ImportResult, error) {
	tournamentID := strings.TrimSpace(cmd.TournamentID)
	if tournamentID == "" {
		activeID, err := s.tournaments.ActiveTournamentID(ctx)
		if err != nil {
			return ImportResult{}, domain.ErrNotFound
		}
		tournamentID = activeID
	}

	table, err := tabular.Read(cmd.Content, cmd.FileName, tabular.Options{MaxRows: maxImportRows})
	if err != nil {
		return ImportResult{}, mapTabularError(err)
	}

	rows, err := parseRows(table)
	if err != nil {
		return ImportResult{}, err
	}

	nominations, err := s.nominationIndex(ctx, tournamentID)
	if err != nil {
		return ImportResult{}, err
	}
	defaults, err := validDefaults(cmd.DefaultNominationIDs, nominations)
	if err != nil {
		return ImportResult{}, err
	}

	existing, err := s.loadRoster(ctx, tournamentID)
	if err != nil {
		return ImportResult{}, err
	}

	results, summary := domain.PlanImport(rows, existing, nominations, defaults)
	result := ImportResult{
		TournamentID: tournamentID,
		Summary:      summary,
		Rows:         results,
		DryRun:       cmd.DryRun,
	}
	if cmd.DryRun {
		return result, nil
	}

	if err := s.applyPlan(ctx, tournamentID, existing, result.Rows); err != nil {
		return ImportResult{}, err
	}
	return result, nil
}

// applyPlan записывает план построчно: created — новый боец, updated —
// дописанные участия существующему. Одной транзакции на файл нет намеренно:
// спека выбрала «валидные пишем, отклонённые возвращаем» (FR-9), частичный
// результат здесь решение, а не дефект.
func (s *Service) applyPlan(
	ctx context.Context,
	tournamentID string,
	existing []domain.Fighter,
	results []domain.RowResult,
) error {
	byID := make(map[string]domain.Fighter, len(existing))
	for _, f := range existing {
		byID[f.ID] = f
	}
	// createdByKey — бойцы, заведённые этим же файлом: вторая строка про
	// того же человека не создаёт второго бойца (FR-7), но её строка отчёта
	// должна указывать на созданного.
	createdByKey := make(map[string]string, len(results))

	for i := range results {
		r := &results[i]
		key := domain.NormalizeKey(r.Row.Name, r.Row.Club)

		switch r.Outcome {
		case domain.OutcomeCreated:
			f, err := domain.NewManual(tournamentID, r.Row.Name, r.Row.Club, r.AddedNominationIDs)
			if err != nil {
				return err
			}
			created, err := s.repo.Create(ctx, f)
			if err != nil {
				return err
			}
			r.FighterID = created.ID
			createdByKey[key] = created.ID
		case domain.OutcomeUpdated:
			if r.FighterID == "" {
				// Дополнение бойца, запланированного этим же файлом: участия
				// уже вошли в Create строки-родителя.
				r.FighterID = createdByKey[key]
				continue
			}
			f, ok := byID[r.FighterID]
			if !ok {
				return fmt.Errorf("import: fighter %s missing in roster snapshot: %w", r.FighterID, domain.ErrNotFound)
			}
			for _, nomID := range r.AddedNominationIDs {
				if err := f.AddParticipation(nomID); err != nil {
					return err
				}
			}
			updated, err := s.repo.Update(ctx, f)
			if err != nil {
				return err
			}
			byID[updated.ID] = updated
		case domain.OutcomeSkipped:
			if r.FighterID == "" {
				r.FighterID = createdByKey[key]
			}
		case domain.OutcomeRejected:
			// Ничего не записываем — причина уже в отчёте.
		}
	}
	return nil
}

// parseRows находит колонки по заголовку и раскладывает строки таблицы в
// доменные ImportRow. Заголовок обязателен: угадывать колонки по содержимому
// — источник тихих ошибок.
func parseRows(table tabular.Table) ([]domain.ImportRow, error) {
	nameCol := findColumn(table.Header, nameHeaders)
	if nameCol < 0 {
		return nil, domain.ErrMissingNameColumn
	}
	surnameCol := findColumn(table.Header, surnameHeaders)
	clubCol := findColumn(table.Header, clubHeaders)
	nomCol := findColumn(table.Header, nominationHeaders)

	rows := make([]domain.ImportRow, 0, len(table.Rows))
	for _, row := range table.Rows {
		name := cell(row.Cells, nameCol)
		if surname := cell(row.Cells, surnameCol); surname != "" && name != "" {
			name = strings.TrimSpace(surname + " " + name)
		}
		rows = append(rows, domain.ImportRow{
			Line:             row.Line,
			Name:             name,
			Club:             cell(row.Cells, clubCol),
			NominationTitles: splitTitles(cell(row.Cells, nomCol)),
		})
	}
	return rows, nil
}

// findColumn ищет колонку по списку допустимых заголовков (регистр и
// пробелы не важны). -1 — колонки нет.
func findColumn(header []string, aliases []string) int {
	for i, h := range header {
		normalized := domain.NormalizeTitle(h)
		for _, alias := range aliases {
			if normalized == alias {
				return i
			}
		}
	}
	return -1
}

func cell(cells []string, idx int) string {
	if idx < 0 || idx >= len(cells) {
		return ""
	}
	return strings.TrimSpace(cells[idx])
}

// splitTitles режет ячейку номинаций на названия.
func splitTitles(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	parts := strings.FieldsFunc(value, func(r rune) bool {
		return strings.ContainsRune(nominationSeparators, r)
	})
	titles := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			titles = append(titles, p)
		}
	}
	return titles
}

// nominationIndex строит индекс «нормализованное название → id» по
// номинациям турнира (FR-5).
func (s *Service) nominationIndex(ctx context.Context, tournamentID string) (map[string]string, error) {
	refs, err := s.nominations.NominationsByTournament(ctx, tournamentID)
	if err != nil {
		return nil, err
	}
	index := make(map[string]string, len(refs))
	for _, ref := range refs {
		title := domain.NormalizeTitle(ref.Title)
		if title == "" {
			continue
		}
		index[title] = ref.ID
	}
	return index, nil
}

// validDefaults проверяет, что умолчания из UI принадлежат этому турниру.
// Чужой id — ошибка запроса, а не строки: он приходит из UI, не из файла.
func validDefaults(ids []string, nominations map[string]string) ([]string, error) {
	known := make(map[string]bool, len(nominations))
	for _, id := range nominations {
		known[id] = true
	}

	out := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if !known[id] {
			return nil, domain.ErrNominationNotFound
		}
		out = append(out, id)
	}
	return out, nil
}

// loadRoster собирает снимок ростера турнира страницами: пустой
// RosterFilter означает LIMIT 0 (спека 0041), а импорту нужен весь ростер —
// и активные, и выведенные (FR-8a), и слитые (их отсеет PlanImport, FR-8b).
func (s *Service) loadRoster(ctx context.Context, tournamentID string) ([]domain.Fighter, error) {
	var all []domain.Fighter
	for offset := int32(0); ; offset += rosterPageSize {
		page, err := s.repo.ListByTournament(ctx, tournamentID, domain.RosterFilter{
			Limit:  rosterPageSize,
			Offset: offset,
		})
		if err != nil {
			return nil, err
		}
		all = append(all, page...)
		if len(page) < rosterPageSize {
			return all, nil
		}
	}
}

// mapTabularError переводит ошибки разборщика файла в доменные.
func mapTabularError(err error) error {
	switch {
	case errors.Is(err, tabular.ErrUnsupportedFormat):
		return fmt.Errorf("%w: %s", domain.ErrUnsupportedFile, err)
	case errors.Is(err, tabular.ErrEmptyFile):
		return domain.ErrEmptyFile
	case errors.Is(err, tabular.ErrTooManyRows):
		return fmt.Errorf("%w: limit is %d", domain.ErrTooManyRows, maxImportRows)
	default:
		return fmt.Errorf("%w: %s", domain.ErrMalformedFile, err)
	}
}
