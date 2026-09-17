// Package tabular разбирает табличные файлы (CSV, XLSX) в таблицу строк.
//
// Пакет намеренно ничего не знает о предметной области: на входе байты файла
// и его имя, на выходе — строка заголовка и строки данных с их номерами в
// файле. Что означают колонки — решает вызывающий (server/AGENTS.md: pkg/ —
// переиспользуемое без бизнес-логики).
package tabular

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/xuri/excelize/v2"
	"golang.org/x/text/encoding/charmap"
)

// Ошибки пакета. Вызывающий мапит их в свои доменные ошибки.
var (
	// ErrUnsupportedFormat — расширение файла не поддерживается.
	ErrUnsupportedFormat = errors.New("tabular: unsupported file format")
	// ErrEmptyFile — в файле нет ни одной непустой строки (нет даже
	// заголовка).
	ErrEmptyFile = errors.New("tabular: empty file")
	// ErrTooManyRows — число строк данных превышает Options.MaxRows.
	ErrTooManyRows = errors.New("tabular: too many rows")
)

// DefaultMaxRows — предел строк данных по умолчанию (NFR-1 спеки 0049).
const DefaultMaxRows = 1000

// Options — параметры разбора. Лимиты именно параметры, а не константы
// пакета: предел строк — политика вызывающего, не свойство формата.
type Options struct {
	// MaxRows — максимум строк данных (без заголовка). 0 и меньше —
	// DefaultMaxRows.
	MaxRows int
}

func (o Options) maxRows() int {
	if o.MaxRows <= 0 {
		return DefaultMaxRows
	}
	return o.MaxRows
}

// Row — одна строка данных таблицы.
type Row struct {
	// Line — номер строки в файле, как её видит человек в редакторе
	// (1-based, строка заголовка — 1).
	Line int
	// Cells — ячейки строки в порядке колонок.
	Cells []string
}

// Table — разобранный файл: строка заголовка и строки данных.
type Table struct {
	Header []string
	Rows   []Row
}

// Read разбирает содержимое файла по его расширению (.csv, .xlsx).
//
// Первая непустая строка файла считается заголовком (угадывать колонки по
// содержимому пакет не умеет — это источник тихих ошибок). Полностью пустые
// строки пропускаются, но нумерацию не сбивают.
func Read(content []byte, fileName string, opts Options) (Table, error) {
	switch strings.ToLower(filepath.Ext(fileName)) {
	case ".csv":
		return readCSV(content, opts)
	case ".xlsx":
		return readXLSX(content, opts)
	default:
		return Table{}, fmt.Errorf("%w: %q", ErrUnsupportedFormat, filepath.Ext(fileName))
	}
}

// readCSV разбирает CSV с автоопределением кодировки и разделителя.
func readCSV(content []byte, opts Options) (Table, error) {
	text := decodeText(content)
	if strings.TrimSpace(text) == "" {
		return Table{}, ErrEmptyFile
	}

	r := csv.NewReader(strings.NewReader(text))
	r.Comma = detectDelimiter(text)
	r.FieldsPerRecord = -1 // строки файла бывают рваными — это не ошибка формата
	r.LazyQuotes = true
	r.TrimLeadingSpace = true

	var records [][]string
	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return Table{}, fmt.Errorf("tabular: parse csv: %w", err)
		}
		records = append(records, rec)
	}
	return buildTable(records, opts)
}

// readXLSX разбирает первый лист книги Excel.
func readXLSX(content []byte, opts Options) (Table, error) {
	f, err := excelize.OpenReader(bytes.NewReader(content))
	if err != nil {
		return Table{}, fmt.Errorf("tabular: parse xlsx: %w", err)
	}
	defer func() { _ = f.Close() }()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return Table{}, ErrEmptyFile
	}
	records, err := f.GetRows(sheets[0])
	if err != nil {
		return Table{}, fmt.Errorf("tabular: read xlsx sheet: %w", err)
	}
	return buildTable(records, opts)
}

// buildTable превращает сырые записи в Table: первая непустая запись —
// заголовок, остальные непустые — строки данных со своими номерами.
func buildTable(records [][]string, opts Options) (Table, error) {
	var table Table
	maxRows := opts.maxRows()

	for i, rec := range records {
		line := i + 1
		if isBlank(rec) {
			continue
		}
		cells := trimCells(rec)
		if table.Header == nil {
			table.Header = cells
			continue
		}
		if len(table.Rows) == maxRows {
			return Table{}, fmt.Errorf("%w: limit is %d", ErrTooManyRows, maxRows)
		}
		table.Rows = append(table.Rows, Row{Line: line, Cells: cells})
	}

	if table.Header == nil {
		return Table{}, ErrEmptyFile
	}
	return table, nil
}

// decodeText приводит байты файла к UTF-8: срезает BOM, а невалидный UTF-8
// считает windows-1251 (типовая выгрузка Excel в русской локали, NFR-2).
// Файл из одних латинских имён обе кодировки дают одинаково, так что риска
// в эвристике нет.
func decodeText(content []byte) string {
	content = bytes.TrimPrefix(content, []byte("\xef\xbb\xbf"))
	if utf8.Valid(content) {
		return string(content)
	}
	decoded, err := charmap.Windows1251.NewDecoder().Bytes(content)
	if err != nil {
		return string(content)
	}
	return string(decoded)
}

// detectDelimiter выбирает разделитель по первой непустой строке: Excel в
// русской локали пишет `;`, выгрузки и гугл-формы — `,`.
func detectDelimiter(text string) rune {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.Count(line, ";") >= strings.Count(line, ",") && strings.Contains(line, ";") {
			return ';'
		}
		if strings.Contains(line, ",") {
			return ','
		}
		return ';'
	}
	return ';'
}

func isBlank(cells []string) bool {
	for _, c := range cells {
		if strings.TrimSpace(c) != "" {
			return false
		}
	}
	return true
}

func trimCells(cells []string) []string {
	out := make([]string, len(cells))
	for i, c := range cells {
		out[i] = strings.TrimSpace(c)
	}
	return out
}
