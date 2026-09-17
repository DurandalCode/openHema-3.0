package service_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/hema/server/modules/fighter/domain"
	"github.com/hema/server/modules/fighter/service"
	"github.com/hema/server/modules/fighter/testutil"
)

const (
	testTournament = "t1"
	nomLongsword   = "nom-longsword"
	nomSabre       = "nom-sabre"
)

// newImportService собирает сервис с номинациями турнира t1: «Лонгсворд» и
// «Сабля» (как в критериях приёмки спеки 0049).
func newImportService() (*service.Service, testDeps) {
	svc, d := newServiceWithDeps()
	d.noms.SetTitled(nomLongsword, testTournament, "Лонгсворд")
	d.noms.SetTitled(nomSabre, testTournament, "Сабля")
	return svc, d
}

// roster читает весь ростер турнира из fake-репозитория.
func roster(t *testing.T, repo *testutil.FakeRepo) []domain.Fighter {
	t.Helper()
	fighters, err := repo.ListByTournament(context.Background(), testTournament, domain.RosterFilter{Limit: 1000})
	if err != nil {
		t.Fatalf("ListByTournament: %v", err)
	}
	return fighters
}

func activeNominations(f domain.Fighter) []string {
	var out []string
	for _, p := range f.Participations {
		if p.Status == domain.ParticipationActive {
			out = append(out, p.NominationID)
		}
	}
	return out
}

func findFighter(fighters []domain.Fighter, name string) (domain.Fighter, bool) {
	for _, f := range fighters {
		if f.Name == name {
			return f, true
		}
	}
	return domain.Fighter{}, false
}

func csvFile(lines ...string) []byte {
	return []byte(strings.Join(lines, "\n") + "\n")
}

func TestImportFightersDryRunWritesNothing(t *testing.T) {
	ctx := context.Background()
	svc, d := newImportService()

	res, err := svc.ImportFighters(ctx, service.ImportCommand{
		TournamentID: testTournament,
		FileName:     "roster.csv",
		Content: csvFile(
			"имя;клуб;номинации",
			"Иванов Иван;Сталь;Лонгсворд",
			"Петров Пётр;Сталь;Лонгсворд, Сабля",
		),
		DryRun: true,
	})
	if err != nil {
		t.Fatalf("ImportFighters: %v", err)
	}

	if !res.DryRun {
		t.Error("res.DryRun = false, want true — UI не должен путать предпросмотр с отчётом")
	}
	if res.Summary != (domain.ImportSummary{RowsRead: 2, Created: 2}) {
		t.Errorf("summary = %+v, want RowsRead=2 Created=2", res.Summary)
	}
	if got := len(roster(t, d.repo)); got != 0 {
		t.Fatalf("AC-2: предпросмотр записал %d бойцов, ростер должен остаться пустым", got)
	}
	for i, r := range res.Rows {
		if r.FighterID != "" {
			t.Errorf("rows[%d].FighterID = %q, при dry_run бойца ещё нет", i, r.FighterID)
		}
	}
}

func TestImportFightersWritesValidRows(t *testing.T) {
	ctx := context.Background()
	svc, d := newImportService()

	res, err := svc.ImportFighters(ctx, service.ImportCommand{
		TournamentID: testTournament,
		FileName:     "roster.csv",
		Content: csvFile(
			"имя;клуб;номинации",
			"Иванов Иван;Сталь;Лонгсворд",
			"Петров Пётр;Сталь;Лонгсворд",
			"Сидоров Сидор;Меч;Лонгсворд, Сабля",
		),
	})
	if err != nil {
		t.Fatalf("ImportFighters: %v", err)
	}

	if res.DryRun {
		t.Error("res.DryRun = true, want false")
	}
	fighters := roster(t, d.repo)
	if len(fighters) != 3 {
		t.Fatalf("AC-1: в ростере %d бойцов, want 3", len(fighters))
	}
	sidorov, ok := findFighter(fighters, "Сидоров Сидор")
	if !ok {
		t.Fatal("AC-1: Сидоров Сидор не заведён")
	}
	if got := activeNominations(sidorov); len(got) != 2 {
		t.Errorf("AC-1: у Сидорова участий %v, want Лонгсворд и Сабля", got)
	}
	for i, r := range res.Rows {
		if r.Outcome != domain.OutcomeCreated {
			t.Errorf("rows[%d].Outcome = %q, want created", i, r.Outcome)
		}
		if r.FighterID == "" {
			t.Errorf("rows[%d].FighterID пуст — отчёт после записи обязан нести id", i)
		}
	}
}

func TestImportFightersRejectedRowsDoNotBlockOthers(t *testing.T) {
	ctx := context.Background()
	svc, d := newImportService()

	res, err := svc.ImportFighters(ctx, service.ImportCommand{
		TournamentID: testTournament,
		FileName:     "roster.csv",
		Content: csvFile(
			"имя;клуб;номинации",
			";Сталь;Лонгсворд",
			"Петров Пётр;Сталь;Копьё",
			"Сидоров Сидор;Меч;Лонгсворд",
		),
	})
	if err != nil {
		t.Fatalf("FR-9: отклонённые строки не должны валить весь вызов: %v", err)
	}

	if res.Summary != (domain.ImportSummary{RowsRead: 3, Created: 1, Rejected: 2}) {
		t.Errorf("summary = %+v, want RowsRead=3 Created=1 Rejected=2", res.Summary)
	}
	if got := len(roster(t, d.repo)); got != 1 {
		t.Fatalf("в ростере %d бойцов, want 1 (корректная строка записана)", got)
	}

	// AC-13: номер строки в отчёте — как в редакторе, с учётом заголовка.
	if res.Rows[0].Row.Line != 2 || res.Rows[0].Error != domain.RowErrorEmptyName {
		t.Errorf("rows[0] = line %d / %q, want line 2 / empty_name", res.Rows[0].Row.Line, res.Rows[0].Error)
	}
	if res.Rows[1].Error != domain.RowErrorUnknownNomination || res.Rows[1].ErrorDetail != "Копьё" {
		t.Errorf("rows[1] = %q / %q, want unknown_nomination / Копьё", res.Rows[1].Error, res.Rows[1].ErrorDetail)
	}
}

func TestImportFightersUpdatesExistingFighter(t *testing.T) {
	ctx := context.Background()
	svc, d := newImportService()

	created, err := d.repo.Create(ctx, domain.Fighter{
		TournamentID: testTournament, Name: "Иванов Иван", Club: "Сталь", Status: domain.StatusActive,
		Participations: []domain.Participation{{NominationID: nomLongsword, Status: domain.ParticipationActive}},
	})
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	res, err := svc.ImportFighters(ctx, service.ImportCommand{
		TournamentID: testTournament,
		FileName:     "roster.csv",
		Content: csvFile(
			"имя;клуб;номинации",
			"иванов  иван;сталь;Лонгсворд, Сабля",
		),
	})
	if err != nil {
		t.Fatalf("ImportFighters: %v", err)
	}

	fighters := roster(t, d.repo)
	if len(fighters) != 1 {
		t.Fatalf("AC-5: в ростере %d бойцов, дубль создавать нельзя", len(fighters))
	}
	if got := activeNominations(fighters[0]); len(got) != 2 {
		t.Errorf("AC-5: участия = %v, want Лонгсворд и Сабля", got)
	}
	if res.Rows[0].Outcome != domain.OutcomeUpdated || res.Rows[0].FighterID != created.ID {
		t.Errorf("rows[0] = %q / %q, want updated / %q", res.Rows[0].Outcome, res.Rows[0].FighterID, created.ID)
	}
}

func TestImportFightersCollapsesInFileDuplicate(t *testing.T) {
	ctx := context.Background()
	svc, d := newImportService()

	res, err := svc.ImportFighters(ctx, service.ImportCommand{
		TournamentID: testTournament,
		FileName:     "roster.csv",
		Content: csvFile(
			"имя;клуб;номинации",
			"Петров Пётр;Сталь;Лонгсворд",
			"Петров Пётр;Сталь;Сабля",
		),
	})
	if err != nil {
		t.Fatalf("ImportFighters: %v", err)
	}

	fighters := roster(t, d.repo)
	if len(fighters) != 1 {
		t.Fatalf("AC-7: создано %d бойцов, want 1", len(fighters))
	}
	if got := activeNominations(fighters[0]); len(got) != 2 {
		t.Errorf("AC-7: участия = %v, want два", got)
	}
	// Обе строки отчёта должны указывать на одного и того же бойца.
	if res.Rows[0].FighterID == "" || res.Rows[0].FighterID != res.Rows[1].FighterID {
		t.Errorf("FighterID строк = %q и %q, want один и тот же непустой id",
			res.Rows[0].FighterID, res.Rows[1].FighterID)
	}
}

func TestImportFightersRepeatedImportIsIdempotent(t *testing.T) {
	ctx := context.Background()
	svc, d := newImportService()

	cmd := service.ImportCommand{
		TournamentID: testTournament,
		FileName:     "roster.csv",
		Content: csvFile(
			"имя;клуб;номинации",
			"Иванов Иван;Сталь;Лонгсворд",
			"Сидоров Сидор;Меч;Лонгсворд, Сабля",
		),
	}
	if _, err := svc.ImportFighters(ctx, cmd); err != nil {
		t.Fatalf("первый импорт: %v", err)
	}

	res, err := svc.ImportFighters(ctx, cmd)
	if err != nil {
		t.Fatalf("повторный импорт: %v", err)
	}

	if got := len(roster(t, d.repo)); got != 2 {
		t.Fatalf("AC-8: после повторного импорта в ростере %d бойцов, want 2", got)
	}
	if res.Summary != (domain.ImportSummary{RowsRead: 2, Skipped: 2}) {
		t.Errorf("AC-8: summary = %+v, want RowsRead=2 Skipped=2", res.Summary)
	}
}

func TestImportFightersWithdrawnFighterIsRejected(t *testing.T) {
	ctx := context.Background()
	svc, d := newImportService()

	if _, err := d.repo.Create(ctx, domain.Fighter{
		TournamentID: testTournament, Name: "Иванов Иван", Club: "Сталь",
		Status: domain.StatusWithdrawn, WithdrawalReason: domain.ReasonInjury,
		Participations: []domain.Participation{{NominationID: nomLongsword, Status: domain.ParticipationActive}},
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	res, err := svc.ImportFighters(ctx, service.ImportCommand{
		TournamentID: testTournament,
		FileName:     "roster.csv",
		Content: csvFile(
			"имя;клуб;номинации",
			"Иванов Иван;Сталь;Сабля",
		),
	})
	if err != nil {
		t.Fatalf("ImportFighters: %v", err)
	}

	if res.Rows[0].Error != domain.RowErrorFighterWithdrawn {
		t.Fatalf("AC-12: rows[0].Error = %q, want fighter_withdrawn", res.Rows[0].Error)
	}
	fighters := roster(t, d.repo)
	if fighters[0].Status != domain.StatusWithdrawn || len(activeNominations(fighters[0])) != 1 {
		t.Errorf("AC-12: боец изменился: %+v", fighters[0])
	}
}

func TestImportFightersDefaultNominations(t *testing.T) {
	ctx := context.Background()
	svc, d := newImportService()

	_, err := svc.ImportFighters(ctx, service.ImportCommand{
		TournamentID: testTournament,
		FileName:     "roster.csv",
		Content: csvFile(
			"имя;клуб;номинации",
			"Иванов Иван;Сталь;",
			"Петров Пётр;Сталь;Сабля",
		),
		DefaultNominationIDs: []string{nomLongsword},
	})
	if err != nil {
		t.Fatalf("ImportFighters: %v", err)
	}

	fighters := roster(t, d.repo)
	ivanov, _ := findFighter(fighters, "Иванов Иван")
	petrov, _ := findFighter(fighters, "Петров Пётр")
	if got := activeNominations(ivanov); len(got) != 1 || got[0] != nomLongsword {
		t.Errorf("AC-11: у Иванова %v, want только умолчание Лонгсворд", got)
	}
	if got := activeNominations(petrov); len(got) != 1 || got[0] != nomSabre {
		t.Errorf("AC-11: у Петрова %v, want только Сабля (умолчание не добавляется)", got)
	}
}

func TestImportFightersForeignDefaultNomination(t *testing.T) {
	ctx := context.Background()
	svc, d := newImportService()
	d.noms.SetTitled("nom-other", "t2", "Копьё")

	_, err := svc.ImportFighters(ctx, service.ImportCommand{
		TournamentID:         testTournament,
		FileName:             "roster.csv",
		Content:              csvFile("имя;клуб;номинации", "Иванов Иван;Сталь;Лонгсворд"),
		DefaultNominationIDs: []string{"nom-other"},
	})
	if !errors.Is(err, domain.ErrNominationNotFound) {
		t.Fatalf("err = %v, want ErrNominationNotFound: чужой id приходит из UI, это ошибка запроса", err)
	}
	if got := len(roster(t, d.repo)); got != 0 {
		t.Fatalf("после отказа записано %d бойцов, want 0", got)
	}
}

func TestImportFightersResolvesActiveTournament(t *testing.T) {
	ctx := context.Background()
	svc, d := newImportService()

	res, err := svc.ImportFighters(ctx, service.ImportCommand{
		FileName: "roster.csv",
		Content:  csvFile("имя;клуб;номинации", "Иванов Иван;Сталь;Лонгсворд"),
	})
	if err != nil {
		t.Fatalf("ImportFighters без tournament_id: %v", err)
	}
	if res.Summary.Created != 1 {
		t.Fatalf("summary = %+v, want Created=1", res.Summary)
	}
	fighters := roster(t, d.repo)
	if len(fighters) != 1 || fighters[0].TournamentID != testTournament {
		t.Fatalf("боец заведён не в активном турнире: %+v", fighters)
	}
}

func TestImportFightersColumnDetection(t *testing.T) {
	ctx := context.Background()

	cases := []struct {
		name     string
		content  []byte
		wantName string
		wantClub string
		wantNoms int
	}{
		{
			name:     "порядок колонок произволен, лишние игнорируются",
			content:  csvFile("№;Номинации;Клуб;ИМЯ;комментарий", "1;Лонгсворд;Сталь;Иванов Иван;без разницы"),
			wantName: "Иванов Иван", wantClub: "Сталь", wantNoms: 1,
		},
		{
			name:     "английские заголовки",
			content:  csvFile("Name,Club,Nominations", "Ivan Ivanov,Steel,Лонгсворд"),
			wantName: "Ivan Ivanov", wantClub: "Steel", wantNoms: 1,
		},
		{
			name:     "заголовки с лишними пробелами",
			content:  csvFile("  имя ;  клуб ;  номинации ", "Иванов Иван;Сталь;Лонгсворд"),
			wantName: "Иванов Иван", wantClub: "Сталь", wantNoms: 1,
		},
		{
			name:     "колонка клуба необязательна",
			content:  csvFile("имя;номинации", "Иванов Иван;Лонгсворд"),
			wantName: "Иванов Иван", wantClub: "", wantNoms: 1,
		},
		{
			name:     "колонка номинаций необязательна",
			content:  csvFile("имя;клуб", "Иванов Иван;Сталь"),
			wantName: "Иванов Иван", wantClub: "Сталь", wantNoms: 0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, d := newImportService()
			if _, err := svc.ImportFighters(ctx, service.ImportCommand{
				TournamentID: testTournament,
				FileName:     "roster.csv",
				Content:      tc.content,
			}); err != nil {
				t.Fatalf("ImportFighters: %v", err)
			}

			fighters := roster(t, d.repo)
			if len(fighters) != 1 {
				t.Fatalf("в ростере %d бойцов, want 1", len(fighters))
			}
			f := fighters[0]
			if f.Name != tc.wantName {
				t.Errorf("Name = %q, want %q", f.Name, tc.wantName)
			}
			if f.Club != tc.wantClub {
				t.Errorf("Club = %q, want %q", f.Club, tc.wantClub)
			}
			if got := len(activeNominations(f)); got != tc.wantNoms {
				t.Errorf("участий %d, want %d", got, tc.wantNoms)
			}
		})
	}
}

func TestImportFightersFileLevelErrors(t *testing.T) {
	ctx := context.Background()

	cases := []struct {
		name     string
		fileName string
		content  []byte
		wantErr  error
	}{
		{
			name:     "неподдерживаемый формат",
			fileName: "roster.pdf",
			content:  csvFile("имя;клуб", "Иванов Иван;Сталь"),
			wantErr:  domain.ErrUnsupportedFile,
		},
		{
			name:     "пустой файл",
			fileName: "roster.csv",
			content:  nil,
			wantErr:  domain.ErrEmptyFile,
		},
		{
			name:     "нет колонки имени",
			fileName: "roster.csv",
			content:  csvFile("клуб;номинации", "Сталь;Лонгсворд"),
			wantErr:  domain.ErrMissingNameColumn,
		},
		{
			name:     "битая книга xlsx",
			fileName: "roster.xlsx",
			content:  []byte("это вовсе не книга Excel"),
			wantErr:  domain.ErrMalformedFile,
		},
		{
			name:     "превышение лимита строк",
			fileName: "roster.csv",
			content:  bigCSV(1001),
			wantErr:  domain.ErrTooManyRows,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, d := newImportService()
			_, err := svc.ImportFighters(ctx, service.ImportCommand{
				TournamentID: testTournament,
				FileName:     tc.fileName,
				Content:      tc.content,
			})
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
			if got := len(roster(t, d.repo)); got != 0 {
				t.Fatalf("AC-10: при ошибке уровня файла записано %d бойцов, want 0", got)
			}
		})
	}
}

func TestImportFightersRowsLimitBoundary(t *testing.T) {
	ctx := context.Background()
	svc, _ := newImportService()

	if _, err := svc.ImportFighters(ctx, service.ImportCommand{
		TournamentID: testTournament,
		FileName:     "roster.csv",
		Content:      bigCSV(1000),
		DryRun:       true,
	}); err != nil {
		t.Fatalf("1000 строк — рабочий объём (NFR-1), got %v", err)
	}
}

func bigCSV(rows int) []byte {
	lines := []string{"имя;клуб;номинации"}
	for i := 0; i < rows; i++ {
		lines = append(lines, fmt.Sprintf("Боец %d;Сталь;Лонгсворд", i))
	}
	return csvFile(lines...)
}
