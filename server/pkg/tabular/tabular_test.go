package tabular_test

import (
	"bytes"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/xuri/excelize/v2"
	"golang.org/x/text/encoding/charmap"

	"github.com/hema/server/pkg/tabular"
)

// toCP1251 кодирует строку в windows-1251 — типовая выгрузка «Сохранить как
// CSV» из Excel в русской локали (NFR-2).
func toCP1251(t *testing.T, s string) []byte {
	t.Helper()
	out, err := charmap.Windows1251.NewEncoder().Bytes([]byte(s))
	if err != nil {
		t.Fatalf("encode windows-1251: %v", err)
	}
	return out
}

// buildXLSX собирает книгу excelize прямо в тесте: бинарных фикстур в репо
// не держим.
func buildXLSX(t *testing.T, rows [][]string) []byte {
	t.Helper()
	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			t.Fatalf("close xlsx: %v", err)
		}
	}()

	sheet := f.GetSheetName(0)
	for i, row := range rows {
		cell, err := excelize.CoordinatesToCellName(1, i+1)
		if err != nil {
			t.Fatalf("cell name: %v", err)
		}
		values := make([]any, 0, len(row))
		for _, v := range row {
			values = append(values, v)
		}
		if err := f.SetSheetRow(sheet, cell, &values); err != nil {
			t.Fatalf("set row: %v", err)
		}
	}

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("write xlsx: %v", err)
	}
	return buf.Bytes()
}

func TestReadParsesFiles(t *testing.T) {
	const utf8CSV = "имя;клуб;номинации\nИванов Иван;Сталь;Лонгсворд\nПетров Пётр;;Сабля\n"

	cases := []struct {
		name       string
		content    []byte
		fileName   string
		wantHeader []string
		wantRows   []tabular.Row
	}{
		{
			name:       "csv utf-8 с разделителем ;",
			content:    []byte(utf8CSV),
			fileName:   "roster.csv",
			wantHeader: []string{"имя", "клуб", "номинации"},
			wantRows: []tabular.Row{
				{Line: 2, Cells: []string{"Иванов Иван", "Сталь", "Лонгсворд"}},
				{Line: 3, Cells: []string{"Петров Пётр", "", "Сабля"}},
			},
		},
		{
			name:       "csv utf-8 с BOM",
			content:    append([]byte("\xef\xbb\xbf"), []byte(utf8CSV)...),
			fileName:   "roster.csv",
			wantHeader: []string{"имя", "клуб", "номинации"},
			wantRows: []tabular.Row{
				{Line: 2, Cells: []string{"Иванов Иван", "Сталь", "Лонгсворд"}},
				{Line: 3, Cells: []string{"Петров Пётр", "", "Сабля"}},
			},
		},
		{
			name:       "csv windows-1251",
			content:    toCP1251(t, utf8CSV),
			fileName:   "roster.csv",
			wantHeader: []string{"имя", "клуб", "номинации"},
			wantRows: []tabular.Row{
				{Line: 2, Cells: []string{"Иванов Иван", "Сталь", "Лонгсворд"}},
				{Line: 3, Cells: []string{"Петров Пётр", "", "Сабля"}},
			},
		},
		{
			name:       "csv с разделителем ,",
			content:    []byte("name,club,nominations\nJohn Doe,Steel,Longsword\n"),
			fileName:   "roster.csv",
			wantHeader: []string{"name", "club", "nominations"},
			wantRows: []tabular.Row{
				{Line: 2, Cells: []string{"John Doe", "Steel", "Longsword"}},
			},
		},
		{
			name:       "csv с закавыченным полем, содержащим разделитель",
			content:    []byte("имя;клуб;номинации\nИванов Иван;Сталь;\"Лонгсворд; Сабля\"\n"),
			fileName:   "roster.csv",
			wantHeader: []string{"имя", "клуб", "номинации"},
			wantRows: []tabular.Row{
				{Line: 2, Cells: []string{"Иванов Иван", "Сталь", "Лонгсворд; Сабля"}},
			},
		},
		{
			name:       "csv: полностью пустые строки пропускаются, нумерация сохраняется",
			content:    []byte("имя;клуб;номинации\nИванов Иван;Сталь;Лонгсворд\n;;\nПетров Пётр;Сталь;Сабля\n"),
			fileName:   "roster.csv",
			wantHeader: []string{"имя", "клуб", "номинации"},
			wantRows: []tabular.Row{
				{Line: 2, Cells: []string{"Иванов Иван", "Сталь", "Лонгсворд"}},
				{Line: 4, Cells: []string{"Петров Пётр", "Сталь", "Сабля"}},
			},
		},
		{
			name: "xlsx: первый лист книги",
			content: buildXLSX(t, [][]string{
				{"имя", "клуб", "номинации"},
				{"Иванов Иван", "Сталь", "Лонгсворд"},
				{"Петров Пётр", "", "Сабля"},
			}),
			fileName:   "roster.xlsx",
			wantHeader: []string{"имя", "клуб", "номинации"},
			wantRows: []tabular.Row{
				{Line: 2, Cells: []string{"Иванов Иван", "Сталь", "Лонгсворд"}},
				{Line: 3, Cells: []string{"Петров Пётр", "", "Сабля"}},
			},
		},
		{
			name: "расширение файла регистронезависимо",
			content: buildXLSX(t, [][]string{
				{"имя", "клуб"},
				{"Иванов Иван", "Сталь"},
			}),
			fileName:   "Ростер.XLSX",
			wantHeader: []string{"имя", "клуб"},
			wantRows: []tabular.Row{
				{Line: 2, Cells: []string{"Иванов Иван", "Сталь"}},
			},
		},
		{
			name:       "только заголовок — таблица без строк данных",
			content:    []byte("имя;клуб;номинации\n"),
			fileName:   "roster.csv",
			wantHeader: []string{"имя", "клуб", "номинации"},
			wantRows:   nil,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			table, err := tabular.Read(tc.content, tc.fileName, tabular.Options{})
			if err != nil {
				t.Fatalf("Read: unexpected error: %v", err)
			}
			if !equalCells(table.Header, tc.wantHeader) {
				t.Errorf("Header = %q, want %q", table.Header, tc.wantHeader)
			}
			if len(table.Rows) != len(tc.wantRows) {
				t.Fatalf("len(Rows) = %d, want %d (rows: %+v)", len(table.Rows), len(tc.wantRows), table.Rows)
			}
			for i, want := range tc.wantRows {
				got := table.Rows[i]
				if got.Line != want.Line {
					t.Errorf("Rows[%d].Line = %d, want %d", i, got.Line, want.Line)
				}
				if !equalCells(got.Cells, want.Cells) {
					t.Errorf("Rows[%d].Cells = %q, want %q", i, got.Cells, want.Cells)
				}
			}
		})
	}
}

func TestReadErrors(t *testing.T) {
	cases := []struct {
		name     string
		content  []byte
		fileName string
		opts     tabular.Options
		wantErr  error
	}{
		{
			name:     "пустой файл",
			content:  nil,
			fileName: "roster.csv",
			wantErr:  tabular.ErrEmptyFile,
		},
		{
			name:     "файл из одних пробелов и переводов строк",
			content:  []byte("\n\n   \n"),
			fileName: "roster.csv",
			wantErr:  tabular.ErrEmptyFile,
		},
		{
			name:     "пустая книга xlsx",
			content:  buildXLSX(t, nil),
			fileName: "roster.xlsx",
			wantErr:  tabular.ErrEmptyFile,
		},
		{
			name:     "неизвестное расширение",
			content:  []byte("имя;клуб\nИванов;Сталь\n"),
			fileName: "roster.pdf",
			wantErr:  tabular.ErrUnsupportedFormat,
		},
		{
			name:     "имя без расширения",
			content:  []byte("имя;клуб\nИванов;Сталь\n"),
			fileName: "roster",
			wantErr:  tabular.ErrUnsupportedFormat,
		},
		{
			name:     "превышение MaxRows",
			content:  []byte(csvWithDataRows(4)),
			fileName: "roster.csv",
			opts:     tabular.Options{MaxRows: 3},
			wantErr:  tabular.ErrTooManyRows,
		},
		{
			name:     "превышение MaxRows в xlsx",
			content:  buildXLSX(t, xlsxRows(4)),
			fileName: "roster.xlsx",
			opts:     tabular.Options{MaxRows: 3},
			wantErr:  tabular.ErrTooManyRows,
		},
		{
			name:     "нечитаемый xlsx",
			content:  []byte("это вовсе не книга Excel"),
			fileName: "roster.xlsx",
			wantErr:  nil, // любая ошибка, но не одна из типизированных
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := tabular.Read(tc.content, tc.fileName, tc.opts)
			if err == nil {
				t.Fatalf("Read: want error, got nil")
			}
			if tc.wantErr != nil && !errors.Is(err, tc.wantErr) {
				t.Fatalf("Read: err = %v, want %v", err, tc.wantErr)
			}
		})
	}
}

func TestReadMaxRowsBoundary(t *testing.T) {
	table, err := tabular.Read([]byte(csvWithDataRows(3)), "roster.csv", tabular.Options{MaxRows: 3})
	if err != nil {
		t.Fatalf("Read: ровно MaxRows строк не должно быть ошибкой, got %v", err)
	}
	if len(table.Rows) != 3 {
		t.Fatalf("len(Rows) = %d, want 3", len(table.Rows))
	}
}

func csvWithDataRows(n int) string {
	var b strings.Builder
	b.WriteString("имя;клуб;номинации\n")
	for i := 0; i < n; i++ {
		fmt.Fprintf(&b, "Боец %d;Сталь;Лонгсворд\n", i)
	}
	return b.String()
}

func xlsxRows(n int) [][]string {
	rows := [][]string{{"имя", "клуб", "номинации"}}
	for i := 0; i < n; i++ {
		rows = append(rows, []string{fmt.Sprintf("Боец %d", i), "Сталь", "Лонгсворд"})
	}
	return rows
}

func equalCells(got, want []string) bool {
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
