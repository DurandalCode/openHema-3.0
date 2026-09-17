package api

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/modules/fighter/domain"
)

// errBrokenNominations — «модуль nomination недоступен»: не доменная ошибка
// импорта, а внутренний сбой.
var errBrokenNominations = errors.New("nomination module is down")

func importPtr(s string) *string { return &s }

// setupImport — стенд импорта: те же две номинации турнира, но с
// названиями (импорт резолвит номинации по названию из файла).
func setupImport(t *testing.T) clients {
	t.Helper()
	c := setup(t)
	c.noms.SetTitled(nominationID, tournamentID, "Лонгсворд")
	c.noms.SetTitled(nomination2, tournamentID, "Сабля")
	return c
}

func importRoster(t *testing.T, c clients) []domain.Fighter {
	t.Helper()
	fighters, _, _, err := c.svc.ListRoster(context.Background(), tournamentID, domain.RosterFilter{Limit: 100})
	if err != nil {
		t.Fatalf("ListRoster: %v", err)
	}
	return fighters
}

func importCSV(lines ...string) []byte {
	return []byte(strings.Join(lines, "\n") + "\n")
}

func TestImportFighters_HappyPath(t *testing.T) {
	c := setupImport(t)
	ctx := context.Background()

	resp, err := c.admin.ImportFighters(ctx, authedReq(t, &hemav1.ImportFightersRequest{
		TournamentId: importPtr(tournamentID),
		FileName:     "roster.csv",
		Content: importCSV(
			"имя;клуб;номинации",
			"Иванов Иван;Сталь;Лонгсворд",
			"Петров Пётр;Сталь;Лонгсворд, Сабля",
			";Сталь;Лонгсворд",
		),
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("ImportFighters: %v", err)
	}

	msg := resp.Msg
	if msg.DryRun {
		t.Error("dry_run = true, want false")
	}
	if msg.Summary.RowsRead != 3 || msg.Summary.Created != 2 || msg.Summary.Rejected != 1 {
		t.Errorf("summary = %+v, want rows_read=3 created=2 rejected=1", msg.Summary)
	}
	if len(msg.Rows) != 3 {
		t.Fatalf("len(rows) = %d, want 3", len(msg.Rows))
	}

	first := msg.Rows[0]
	if first.Line != 2 || first.Name != "Иванов Иван" || first.Club != "Сталь" {
		t.Errorf("rows[0] = %+v, want строка 2 «Иванов Иван»/«Сталь»", first)
	}
	if first.Outcome != hemav1.ImportRowOutcome_IMPORT_ROW_OUTCOME_CREATED {
		t.Errorf("rows[0].outcome = %s, want CREATED", first.Outcome)
	}
	if len(first.NominationTitles) != 1 || first.NominationTitles[0] != "Лонгсворд" {
		t.Errorf("rows[0].nomination_titles = %v, want [Лонгсворд]", first.NominationTitles)
	}
	if len(first.AddedNominationIds) != 1 || first.AddedNominationIds[0] != nominationID {
		t.Errorf("rows[0].added_nomination_ids = %v, want [%s]", first.AddedNominationIds, nominationID)
	}
	if first.FighterId == "" {
		t.Error("rows[0].fighter_id пуст — после записи id обязан быть в отчёте")
	}

	// AC-13: номер строки в отчёте — как в редакторе, с учётом заголовка.
	rejected := msg.Rows[2]
	if rejected.Line != 4 {
		t.Errorf("rows[2].line = %d, want 4", rejected.Line)
	}
	if rejected.Outcome != hemav1.ImportRowOutcome_IMPORT_ROW_OUTCOME_REJECTED ||
		rejected.Error != hemav1.ImportRowError_IMPORT_ROW_ERROR_EMPTY_NAME {
		t.Errorf("rows[2] = %s / %s, want REJECTED / EMPTY_NAME", rejected.Outcome, rejected.Error)
	}

	if got := len(importRoster(t, c)); got != 2 {
		t.Fatalf("в ростере %d бойцов, want 2", got)
	}
}

func TestImportFighters_UnknownNominationRowError(t *testing.T) {
	c := setupImport(t)
	ctx := context.Background()

	resp, err := c.admin.ImportFighters(ctx, authedReq(t, &hemav1.ImportFightersRequest{
		FileName: "roster.csv",
		Content:  importCSV("имя;клуб;номинации", "Иванов Иван;Сталь;Копьё"),
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("AC-3: нераспознанная номинация — исход строки, а не ошибка RPC: %v", err)
	}
	row := resp.Msg.Rows[0]
	if row.Error != hemav1.ImportRowError_IMPORT_ROW_ERROR_UNKNOWN_NOMINATION || row.ErrorDetail != "Копьё" {
		t.Fatalf("rows[0] = %s / %q, want UNKNOWN_NOMINATION / Копьё", row.Error, row.ErrorDetail)
	}
}

func TestImportFighters_DryRunWritesNothing(t *testing.T) {
	c := setupImport(t)
	ctx := context.Background()

	resp, err := c.admin.ImportFighters(ctx, authedReq(t, &hemav1.ImportFightersRequest{
		FileName: "roster.csv",
		Content:  importCSV("имя;клуб;номинации", "Иванов Иван;Сталь;Лонгсворд"),
		DryRun:   true,
	}, adminUserID, "admin"))
	if err != nil {
		t.Fatalf("ImportFighters: %v", err)
	}

	if !resp.Msg.DryRun {
		t.Error("dry_run не отражён в ответе — UI спутает предпросмотр с отчётом")
	}
	if resp.Msg.Summary.Created != 1 {
		t.Errorf("summary = %+v, want created=1", resp.Msg.Summary)
	}
	if got := len(importRoster(t, c)); got != 0 {
		t.Fatalf("AC-2: предпросмотр записал %d бойцов", got)
	}
}

func TestImportFighters_TooLargeFile(t *testing.T) {
	c := setupImport(t)
	ctx := context.Background()

	oversized := bytes.Repeat([]byte("a"), maxImportBytes+1)
	_, err := c.admin.ImportFighters(ctx, authedReq(t, &hemav1.ImportFightersRequest{
		FileName: "roster.csv",
		Content:  oversized,
	}, adminUserID, "admin"))
	if err == nil {
		t.Fatal("AC-10: файл сверх лимита должен отклоняться")
	}
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Fatalf("code = %v, want InvalidArgument", connect.CodeOf(err))
	}
	if got := len(importRoster(t, c)); got != 0 {
		t.Fatalf("после отказа записано %d бойцов", got)
	}
}

func TestImportFighters_FileErrorsAreInvalidArgument(t *testing.T) {
	ctx := context.Background()

	cases := []struct {
		name     string
		fileName string
		content  []byte
		defaults []string
	}{
		{
			name:     "неподдерживаемый формат",
			fileName: "roster.pdf",
			content:  importCSV("имя;клуб", "Иванов Иван;Сталь"),
		},
		{
			name:     "пустой файл",
			fileName: "roster.csv",
			content:  nil,
		},
		{
			name:     "нет колонки имени",
			fileName: "roster.csv",
			content:  importCSV("клуб;номинации", "Сталь;Лонгсворд"),
		},
		{
			name:     "битая книга",
			fileName: "roster.xlsx",
			content:  []byte("вовсе не книга Excel"),
		},
		{
			name:     "чужая номинация в умолчаниях",
			fileName: "roster.csv",
			content:  importCSV("имя;клуб;номинации", "Иванов Иван;Сталь;Лонгсворд"),
			defaults: []string{"00000000-0000-0000-0000-00000000b0ff"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := setupImport(t)
			_, err := c.admin.ImportFighters(ctx, authedReq(t, &hemav1.ImportFightersRequest{
				FileName:             tc.fileName,
				Content:              tc.content,
				DefaultNominationIds: tc.defaults,
			}, adminUserID, "admin"))
			if err == nil {
				t.Fatal("expected error")
			}
			if connect.CodeOf(err) != connect.CodeInvalidArgument {
				t.Fatalf("code = %v, want InvalidArgument", connect.CodeOf(err))
			}
		})
	}
}

func TestImportFighters_InternalErrorIsNotInvalidArgument(t *testing.T) {
	c := setupImport(t)
	ctx := context.Background()
	c.noms.SetListError(errBrokenNominations)

	_, err := c.admin.ImportFighters(ctx, authedReq(t, &hemav1.ImportFightersRequest{
		FileName: "roster.csv",
		Content:  importCSV("имя;клуб;номинации", "Иванов Иван;Сталь;Лонгсворд"),
	}, adminUserID, "admin"))
	if err == nil {
		t.Fatal("expected error")
	}
	if connect.CodeOf(err) != connect.CodeInternal {
		t.Fatalf("code = %v, want Internal", connect.CodeOf(err))
	}
}

func TestImportFighters_RegularUserForbidden(t *testing.T) {
	c := setupImport(t)
	ctx := context.Background()

	_, err := c.admin.ImportFighters(ctx, authedReq(t, &hemav1.ImportFightersRequest{
		FileName: "roster.csv",
		Content:  importCSV("имя;клуб;номинации", "Иванов Иван;Сталь;Лонгсворд"),
	}, regularUser, "user"))
	if err == nil {
		t.Fatal("AC-9: импорт доступен только admin")
	}
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Fatalf("code = %v, want PermissionDenied", connect.CodeOf(err))
	}
	if got := len(importRoster(t, c)); got != 0 {
		t.Fatalf("ростер изменился: %d бойцов", got)
	}
}
