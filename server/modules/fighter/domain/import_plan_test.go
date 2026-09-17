package domain_test

import (
	"testing"

	"github.com/hema/server/modules/fighter/domain"
)

// PlanImport (T4 спеки 0049): по одному кейсу на критерий приёмки.

const (
	nomLongsword = "nom-longsword"
	nomSabre     = "nom-sabre"
)

// tournamentNominations — индекс номинаций турнира в том виде, в каком его
// строит вызывающий: нормализованное название → id.
func tournamentNominations() map[string]string {
	return map[string]string{
		domain.NormalizeTitle("Лонгсворд"): nomLongsword,
		domain.NormalizeTitle("Сабля"):     nomSabre,
	}
}

func activeFighter(id, name, club string, nominationIDs ...string) domain.Fighter {
	f := domain.Fighter{ID: id, Name: name, Club: club, Status: domain.StatusActive}
	for _, nomID := range nominationIDs {
		f.Participations = append(f.Participations, domain.Participation{
			NominationID: nomID,
			Status:       domain.ParticipationActive,
		})
	}
	return f
}

// wantRow — ожидаемый исход строки в компактной записи.
type wantRow struct {
	line        int
	outcome     domain.RowOutcome
	rowError    domain.RowError
	errorDetail string
	added       []string
	fighterID   string
}

func TestPlanImport(t *testing.T) {
	cases := []struct {
		name        string
		rows        []domain.ImportRow
		existing    []domain.Fighter
		defaults    []string
		want        []wantRow
		wantSummary domain.ImportSummary
	}{
		{
			name: "AC-1: пустой ростер — все строки создают бойцов",
			rows: []domain.ImportRow{
				{Line: 2, Name: "Иванов Иван", Club: "Сталь", NominationTitles: []string{"Лонгсворд"}},
				{Line: 3, Name: "Петров Пётр", Club: "Сталь", NominationTitles: []string{"Лонгсворд"}},
				{Line: 4, Name: "Сидоров Сидор", Club: "Меч", NominationTitles: []string{"Лонгсворд", "Сабля"}},
			},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeCreated, added: []string{nomLongsword}},
				{line: 3, outcome: domain.OutcomeCreated, added: []string{nomLongsword}},
				{line: 4, outcome: domain.OutcomeCreated, added: []string{nomLongsword, nomSabre}},
			},
			wantSummary: domain.ImportSummary{RowsRead: 3, Created: 3},
		},
		{
			name: "AC-3: неизвестная номинация отклоняет строку, остальные проходят",
			rows: []domain.ImportRow{
				{Line: 2, Name: "Иванов Иван", Club: "Сталь", NominationTitles: []string{"Копьё"}},
				{Line: 3, Name: "Петров Пётр", Club: "Сталь", NominationTitles: []string{"Лонгсворд"}},
			},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeRejected, rowError: domain.RowErrorUnknownNomination, errorDetail: "Копьё"},
				{line: 3, outcome: domain.OutcomeCreated, added: []string{nomLongsword}},
			},
			wantSummary: domain.ImportSummary{RowsRead: 2, Created: 1, Rejected: 1},
		},
		{
			name: "AC-4: пустое имя отклоняется, остальные записываются",
			rows: []domain.ImportRow{
				{Line: 2, Name: "   ", Club: "Сталь", NominationTitles: []string{"Лонгсворд"}},
				{Line: 3, Name: "Петров Пётр", Club: "Сталь", NominationTitles: []string{"Лонгсворд"}},
			},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeRejected, rowError: domain.RowErrorEmptyName},
				{line: 3, outcome: domain.OutcomeCreated, added: []string{nomLongsword}},
			},
			wantSummary: domain.ImportSummary{RowsRead: 2, Created: 1, Rejected: 1},
		},
		{
			name: "AC-5: совпадение с существующим дописывает недостающее участие",
			rows: []domain.ImportRow{
				{Line: 2, Name: "иванов иван", Club: "сталь", NominationTitles: []string{"Лонгсворд", "Сабля"}},
			},
			existing: []domain.Fighter{activeFighter("f-1", "Иванов Иван", "Сталь", nomLongsword)},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeUpdated, added: []string{nomSabre}, fighterID: "f-1"},
			},
			wantSummary: domain.ImportSummary{RowsRead: 1, Updated: 1},
		},
		{
			name: "AC-6: полный дубль ничего не меняет",
			rows: []domain.ImportRow{
				{Line: 2, Name: "Иванов Иван", Club: "Сталь", NominationTitles: []string{"Лонгсворд"}},
			},
			existing: []domain.Fighter{activeFighter("f-1", "Иванов Иван", "Сталь", nomLongsword, nomSabre)},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeSkipped, fighterID: "f-1"},
			},
			wantSummary: domain.ImportSummary{RowsRead: 1, Skipped: 1},
		},
		{
			name: "AC-7: дубль внутри файла схлопывается в одного бойца",
			rows: []domain.ImportRow{
				{Line: 2, Name: "Петров Пётр", Club: "Сталь", NominationTitles: []string{"Лонгсворд"}},
				{Line: 3, Name: "петров  пётр", Club: " Сталь ", NominationTitles: []string{"Сабля"}},
			},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeCreated, added: []string{nomLongsword, nomSabre}},
				{line: 3, outcome: domain.OutcomeUpdated, added: []string{nomSabre}},
			},
			wantSummary: domain.ImportSummary{RowsRead: 2, Created: 1, Updated: 1},
		},
		{
			name: "AC-7b: вторая строка без новых номинаций — пропуск",
			rows: []domain.ImportRow{
				{Line: 2, Name: "Петров Пётр", Club: "Сталь", NominationTitles: []string{"Лонгсворд"}},
				{Line: 3, Name: "Петров Пётр", Club: "Сталь", NominationTitles: []string{"Лонгсворд"}},
			},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeCreated, added: []string{nomLongsword}},
				{line: 3, outcome: domain.OutcomeSkipped},
			},
			wantSummary: domain.ImportSummary{RowsRead: 2, Created: 1, Skipped: 1},
		},
		{
			name: "AC-8: повторный импорт того же файла — всё пропуск",
			rows: []domain.ImportRow{
				{Line: 2, Name: "Иванов Иван", Club: "Сталь", NominationTitles: []string{"Лонгсворд"}},
				{Line: 3, Name: "Сидоров Сидор", Club: "Меч", NominationTitles: []string{"Лонгсворд", "Сабля"}},
			},
			existing: []domain.Fighter{
				activeFighter("f-1", "Иванов Иван", "Сталь", nomLongsword),
				activeFighter("f-2", "Сидоров Сидор", "Меч", nomLongsword, nomSabre),
			},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeSkipped, fighterID: "f-1"},
				{line: 3, outcome: domain.OutcomeSkipped, fighterID: "f-2"},
			},
			wantSummary: domain.ImportSummary{RowsRead: 2, Skipped: 2},
		},
		{
			name: "AC-11: умолчание из UI применяется только к пустой колонке",
			rows: []domain.ImportRow{
				{Line: 2, Name: "Иванов Иван", Club: "Сталь"},
				{Line: 3, Name: "Петров Пётр", Club: "Сталь", NominationTitles: []string{"Сабля"}},
			},
			defaults: []string{nomLongsword},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeCreated, added: []string{nomLongsword}},
				{line: 3, outcome: domain.OutcomeCreated, added: []string{nomSabre}},
			},
			wantSummary: domain.ImportSummary{RowsRead: 2, Created: 2},
		},
		{
			name: "AC-12: совпадение с выведенным бойцом отклоняется",
			rows: []domain.ImportRow{
				{Line: 2, Name: "Иванов Иван", Club: "Сталь", NominationTitles: []string{"Лонгсворд"}},
				{Line: 3, Name: "Петров Пётр", Club: "Сталь", NominationTitles: []string{"Лонгсворд"}},
			},
			existing: []domain.Fighter{
				{
					ID: "f-1", Name: "Иванов Иван", Club: "Сталь",
					Status: domain.StatusWithdrawn, WithdrawalReason: domain.ReasonInjury,
					Participations: []domain.Participation{{NominationID: nomLongsword, Status: domain.ParticipationActive}},
				},
			},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeRejected, rowError: domain.RowErrorFighterWithdrawn, fighterID: "f-1"},
				{line: 3, outcome: domain.OutcomeCreated, added: []string{nomLongsword}},
			},
			wantSummary: domain.ImportSummary{RowsRead: 2, Created: 1, Rejected: 1},
		},
		{
			name: "AC-14: боец без номинаций законен",
			rows: []domain.ImportRow{
				{Line: 2, Name: "Сидоров Сидор", Club: "Меч"},
			},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeCreated},
			},
			wantSummary: domain.ImportSummary{RowsRead: 1, Created: 1},
		},
		{
			name: "FR-8b: слитая запись в сопоставлении не участвует",
			rows: []domain.ImportRow{
				{Line: 2, Name: "Иванов Иван", Club: "Сталь", NominationTitles: []string{"Лонгсворд"}},
			},
			existing: []domain.Fighter{
				{
					ID: "f-old", Name: "Иванов Иван", Club: "Сталь",
					Status: domain.StatusMerged, MergedIntoID: "f-new",
					Participations: []domain.Participation{{NominationID: nomLongsword, Status: domain.ParticipationActive}},
				},
			},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeCreated, added: []string{nomLongsword}},
			},
			wantSummary: domain.ImportSummary{RowsRead: 1, Created: 1},
		},
		{
			name: "снятое участие существующего бойца восстанавливается как дополнение",
			rows: []domain.ImportRow{
				{Line: 2, Name: "Иванов Иван", Club: "Сталь", NominationTitles: []string{"Сабля"}},
			},
			existing: []domain.Fighter{
				{
					ID: "f-1", Name: "Иванов Иван", Club: "Сталь", Status: domain.StatusActive,
					Participations: []domain.Participation{
						{NominationID: nomLongsword, Status: domain.ParticipationActive},
						{NominationID: nomSabre, Status: domain.ParticipationRemoved},
					},
				},
			},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeUpdated, added: []string{nomSabre}, fighterID: "f-1"},
			},
			wantSummary: domain.ImportSummary{RowsRead: 1, Updated: 1},
		},
		{
			name: "боец без клуба с одноимённым клубным не путается",
			rows: []domain.ImportRow{
				{Line: 2, Name: "Иванов Иван", Club: "", NominationTitles: []string{"Лонгсворд"}},
			},
			existing: []domain.Fighter{activeFighter("f-1", "Иванов Иван", "Сталь", nomLongsword)},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeCreated, added: []string{nomLongsword}},
			},
			wantSummary: domain.ImportSummary{RowsRead: 1, Created: 1},
		},
		{
			name: "повторение одной номинации в строке не дублирует участие",
			rows: []domain.ImportRow{
				{Line: 2, Name: "Иванов Иван", Club: "Сталь", NominationTitles: []string{"Лонгсворд", " лонгсворд "}},
			},
			want: []wantRow{
				{line: 2, outcome: domain.OutcomeCreated, added: []string{nomLongsword}},
			},
			wantSummary: domain.ImportSummary{RowsRead: 1, Created: 1},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, summary := domain.PlanImport(tc.rows, tc.existing, tournamentNominations(), tc.defaults)

			if len(got) != len(tc.want) {
				t.Fatalf("len(results) = %d, want %d (%+v)", len(got), len(tc.want), got)
			}
			for i, want := range tc.want {
				r := got[i]
				if r.Row.Line != want.line {
					t.Errorf("results[%d].Row.Line = %d, want %d", i, r.Row.Line, want.line)
				}
				if r.Outcome != want.outcome {
					t.Errorf("results[%d].Outcome = %q, want %q", i, r.Outcome, want.outcome)
				}
				if r.Error != want.rowError {
					t.Errorf("results[%d].Error = %q, want %q", i, r.Error, want.rowError)
				}
				if r.ErrorDetail != want.errorDetail {
					t.Errorf("results[%d].ErrorDetail = %q, want %q", i, r.ErrorDetail, want.errorDetail)
				}
				if r.FighterID != want.fighterID {
					t.Errorf("results[%d].FighterID = %q, want %q", i, r.FighterID, want.fighterID)
				}
				if !equalStrings(r.AddedNominationIDs, want.added) {
					t.Errorf("results[%d].AddedNominationIDs = %v, want %v", i, r.AddedNominationIDs, want.added)
				}
			}
			if summary != tc.wantSummary {
				t.Errorf("summary = %+v, want %+v", summary, tc.wantSummary)
			}
		})
	}
}

func TestPlanImportDoesNotMutateExisting(t *testing.T) {
	existing := []domain.Fighter{activeFighter("f-1", "Иванов Иван", "Сталь", nomLongsword)}
	rows := []domain.ImportRow{
		{Line: 2, Name: "Иванов Иван", Club: "Сталь", NominationTitles: []string{"Сабля"}},
	}

	domain.PlanImport(rows, existing, tournamentNominations(), nil)

	if len(existing[0].Participations) != 1 {
		t.Fatalf("PlanImport изменил снимок ростера: участий %d, было 1", len(existing[0].Participations))
	}
}

func equalStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
