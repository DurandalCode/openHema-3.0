//go:build integration

package integration

import (
	"context"
	"fmt"
	"testing"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
)

// importCSV — файл, который «прислал клуб»: заголовок + три строки, у одной
// две номинации. Формируется в тесте, бинарных фикстур в репо нет.
func importCSV(longsword, sabre string) []byte {
	return []byte(fmt.Sprintf(
		"имя;клуб;номинации\n"+
			"Иванов Иван;Сталь;%s\n"+
			"Петров Пётр;Сталь;%s, %s\n"+
			"Сидоров Сидор;Меч;%s\n",
		longsword, longsword, sabre, longsword,
	))
}

func importFighters(
	t *testing.T,
	ctx context.Context,
	client hemav1connect.FighterAdminServiceClient,
	content []byte,
	dryRun bool,
) *hemav1.ImportFightersResponse {
	t.Helper()
	req := connect.NewRequest(&hemav1.ImportFightersRequest{
		Content:  content,
		FileName: "roster.csv",
		DryRun:   dryRun,
	})
	req.Header().Set("Authorization", adminBearer(t))
	resp, err := client.ImportFighters(ctx, req)
	if err != nil {
		t.Fatalf("ImportFighters(dryRun=%v): %v", dryRun, err)
	}
	return resp.Msg
}

// rosterSize — число бойцов турнира. Limit задаётся явно: пустой
// ListRosterRequest означает LIMIT 0 и вернул бы ноль строк независимо от
// содержимого ростера (спека 0041) — та же ловушка, из-за которой сервис
// собирает снимок страницами.
func rosterSize(t *testing.T, ctx context.Context, client hemav1connect.FighterAdminServiceClient) int {
	t.Helper()
	req := connect.NewRequest(&hemav1.ListRosterRequest{Limit: 100})
	req.Header().Set("Authorization", adminBearer(t))
	resp, err := client.ListRoster(ctx, req)
	if err != nil {
		t.Fatalf("ListRoster: %v", err)
	}
	return len(resp.Msg.Fighters)
}

// TestIntegration_ImportFighters_DryRunThenTwice — спека 0049, AC-2 и AC-8 на
// реальной БД: предпросмотр ничего не пишет, импорт заводит ростер, а
// повторный импорт того же файла его не задваивает. Дедуп здесь проверяется
// не планом в памяти, а состоянием Postgres после двух реальных проходов.
func TestIntegration_ImportFighters_DryRunThenTwice(t *testing.T) {
	_, nomAdmin, fighterAdmin, fighterPublic := setup(t)
	ctx := context.Background()

	longsword := "Import Longsword"
	sabre := "Import Sabre"
	longswordID := createNomination(t, ctx, nomAdmin, longsword)
	createNomination(t, ctx, nomAdmin, sabre)
	content := importCSV(longsword, sabre)

	// AC-2: предпросмотр не пишет.
	preview := importFighters(t, ctx, fighterAdmin, content, true)
	if !preview.DryRun {
		t.Fatalf("preview: dry_run echo lost")
	}
	if preview.Summary.Created != 3 || preview.Summary.RowsRead != 3 {
		t.Fatalf("preview summary: %+v", preview.Summary)
	}
	if got := rosterSize(t, ctx, fighterAdmin); got != 0 {
		t.Fatalf("preview wrote to roster: %d fighters", got)
	}

	// Первый настоящий импорт: три новых бойца.
	first := importFighters(t, ctx, fighterAdmin, content, false)
	if first.DryRun {
		t.Fatalf("import: dry_run must be false in response")
	}
	if first.Summary.Created != 3 || first.Summary.Rejected != 0 {
		t.Fatalf("first import summary: %+v", first.Summary)
	}
	for _, row := range first.Rows {
		if row.FighterId == "" {
			t.Fatalf("created row without fighter_id: %+v", row)
		}
	}
	if got := rosterSize(t, ctx, fighterAdmin); got != 3 {
		t.Fatalf("after first import: %d fighters, want 3", got)
	}

	// Состав номинации: три бойца в лонгсворде (AC-1).
	rosterResp, err := fighterPublic.ListNominationRoster(ctx, connect.NewRequest(&hemav1.ListNominationRosterRequest{
		NominationId: longswordID,
	}))
	if err != nil {
		t.Fatalf("ListNominationRoster: %v", err)
	}
	if len(rosterResp.Msg.Entries) != 3 {
		t.Fatalf("longsword roster: %d entries, want 3", len(rosterResp.Msg.Entries))
	}

	// AC-8: повторный импорт того же файла ростер не меняет.
	second := importFighters(t, ctx, fighterAdmin, content, false)
	if second.Summary.Created != 0 || second.Summary.Updated != 0 || second.Summary.Skipped != 3 {
		t.Fatalf("second import summary: %+v, want all skipped", second.Summary)
	}
	if got := rosterSize(t, ctx, fighterAdmin); got != 3 {
		t.Fatalf("after second import: %d fighters, want 3", got)
	}
}
