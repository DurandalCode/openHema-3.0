// Package filestore определяет порт файлового хранилища (ADR 0019): модуль
// tournament (и любой будущий потребитель) не знает, где физически лежит
// файл — только Store и его Meta. Пакет не тянет внешних зависимостей сверх
// стандартной библиотеки; конкретные адаптеры живут в подпакетах (local/).
package filestore

import (
	"context"
	"io"
)

// Store — порт доступа к файловому хранилищу.
//
// nil-Store — легальное состояние: «хранилище не настроено»
// (FILE_STORAGE_DIR пуст, ADR 0019 п.2). Интерфейс сам по себе не делает
// вызовы на nil безопасными — это ответственность вызывающего кода
// (см. tournament/service: nil Store → domain.ErrStorageUnavailable до
// вызова любого метода).
type Store interface {
	// Put сохраняет содержимое r и возвращает id нового объекта.
	Put(ctx context.Context, r io.Reader, meta Meta) (id string, err error)
	// Open открывает объект по id для чтения. Вызывающий обязан закрыть
	// возвращённый ReadCloser.
	Open(ctx context.Context, id string) (io.ReadCloser, Meta, error)
	// Delete удаляет объект по id. Отсутствие объекта — ошибка, совместимая
	// с errors.Is(err, os.ErrNotExist).
	Delete(ctx context.Context, id string) error
}

// Meta — метаданные хранимого объекта.
type Meta struct {
	ContentType string
	Size        int64
}

// pdfSignature / pngSignature / jpegSignature — бинарные сигнатуры форматов,
// принятых белым списком (ADR 0019 п.3, спека 0042 FR-32).
var (
	pdfSignature  = []byte("%PDF-")
	pngSignature  = []byte("\x89PNG\r\n\x1a\n")
	jpegSignature = []byte("\xFF\xD8\xFF")
)

// Sniff определяет MIME-тип по бинарной сигнатуре начала файла (не по
// заявленному Content-Type, NFR-9). head может быть короче полного файла —
// функция сама не паникует на пустом/коротком срезе, просто не находит
// сигнатуру. Всё, что не входит в белый список (PDF/PNG/JPEG/WebP) — в
// т.ч. текстовые форматы без бинарной сигнатуры вроде SVG — отвергается
// (ok=false), а не угадывается.
func Sniff(head []byte) (mime string, ok bool) {
	switch {
	case hasPrefix(head, pdfSignature):
		return "application/pdf", true
	case hasPrefix(head, pngSignature):
		return "image/png", true
	case hasPrefix(head, jpegSignature):
		return "image/jpeg", true
	case isWebP(head):
		return "image/webp", true
	default:
		return "", false
	}
}

// isWebP проверяет RIFF....WEBP: байты 0-3 "RIFF", байты 8-11 "WEBP"
// (байты 4-7 — little-endian длина chunk'а, для определения типа не нужны).
func isWebP(head []byte) bool {
	if len(head) < 12 {
		return false
	}
	return string(head[0:4]) == "RIFF" && string(head[8:12]) == "WEBP"
}

func hasPrefix(head, sig []byte) bool {
	if len(head) < len(sig) {
		return false
	}
	for i := range sig {
		if head[i] != sig[i] {
			return false
		}
	}
	return true
}
