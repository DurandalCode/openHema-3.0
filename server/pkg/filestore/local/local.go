// Package local реализует filestore.Store поверх локальной файловой
// системы (ADR 0019 п.2): один каталог (обычно смонтированный docker-том),
// объект — файл `<id><ext>`, где id — случайный UUID, а ext выведен из
// meta.ContentType (не из имени файла на входе — тип уже определён
// Sniff'ом на уровне вызывающего кода).
package local

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"

	"github.com/hema/server/pkg/filestore"
)

// extByContentType — соответствие MIME → расширение файла на диске.
// Только для белого списка типов, которые проходят filestore.Sniff;
// неизвестный ContentType получает расширение ".bin" (Put не отбраковывает
// вход — отбраковка типа файла целиком лежит на вызывающем коде/сервисе,
// здесь это просто deterministic-имя объекта).
var extByContentType = map[string]string{
	"application/pdf": ".pdf",
	"image/png":       ".png",
	"image/jpeg":      ".jpg",
	"image/webp":      ".webp",
}

// contentTypeByExt — обратное соответствие, используется Open для
// восстановления ContentType по расширению файла на диске.
var contentTypeByExt = map[string]string{
	".pdf":  "application/pdf",
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".webp": "image/webp",
	".bin":  "application/octet-stream",
}

// LocalStore — адаптер filestore.Store поверх каталога на диске.
type LocalStore struct {
	dir string
}

// New создаёт LocalStore над каталогом dir. Каталог не обязан существовать
// на момент вызова New: Put создаёт его лениво (os.MkdirAll) при первой
// записи — так конструктор остаётся дешёвым и не требует контекста/ошибки
// на старте composition root (dir из конфигурации может указывать на
// docker-том, монтируемый после старта процесса в редких средах).
func New(dir string) *LocalStore {
	return &LocalStore{dir: dir}
}

var _ filestore.Store = (*LocalStore)(nil)

// Put сохраняет содержимое r в новый файл `<uuid><ext>` в каталоге хранилища.
func (s *LocalStore) Put(_ context.Context, r io.Reader, meta filestore.Meta) (string, error) {
	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return "", fmt.Errorf("filestore/local: create dir %s: %w", s.dir, err)
	}

	id := uuid.NewString()
	ext := extByContentType[meta.ContentType]
	if ext == "" {
		ext = ".bin"
	}
	path := filepath.Join(s.dir, id+ext)

	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return "", fmt.Errorf("filestore/local: create file %s: %w", path, err)
	}
	if _, err := io.Copy(f, r); err != nil {
		_ = f.Close()
		_ = os.Remove(path)
		return "", fmt.Errorf("filestore/local: write file %s: %w", path, err)
	}
	if err := f.Close(); err != nil {
		return "", fmt.Errorf("filestore/local: close file %s: %w", path, err)
	}
	return id, nil
}

// Open открывает объект по id. Расширение (и, следовательно, ContentType)
// неизвестно заранее — объект ищется через filepath.Glob(dir/id + ".*").
func (s *LocalStore) Open(_ context.Context, id string) (io.ReadCloser, filestore.Meta, error) {
	path, err := s.find(id)
	if err != nil {
		return nil, filestore.Meta{}, err
	}
	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, filestore.Meta{}, fmt.Errorf("filestore/local: open %s: %w", id, os.ErrNotExist)
		}
		return nil, filestore.Meta{}, fmt.Errorf("filestore/local: open %s: %w", id, err)
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, filestore.Meta{}, fmt.Errorf("filestore/local: stat %s: %w", id, err)
	}
	meta := filestore.Meta{
		ContentType: contentTypeByExt[filepath.Ext(path)],
		Size:        info.Size(),
	}
	return f, meta, nil
}

// Delete удаляет объект по id.
func (s *LocalStore) Delete(_ context.Context, id string) error {
	path, err := s.find(id)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("filestore/local: delete %s: %w", id, os.ErrNotExist)
		}
		return fmt.Errorf("filestore/local: delete %s: %w", id, err)
	}
	return nil
}

// find ищет файл объекта по id независимо от расширения. Пустой результат
// Glob (нет файла и нет ошибки самого паттерна) переводится в
// os.ErrNotExist, чтобы errors.Is(err, os.ErrNotExist) работал у вызывающего
// кода единообразно для Open и Delete.
func (s *LocalStore) find(id string) (string, error) {
	matches, err := filepath.Glob(filepath.Join(s.dir, id+".*"))
	if err != nil {
		return "", fmt.Errorf("filestore/local: glob %s: %w", id, err)
	}
	if len(matches) == 0 {
		return "", fmt.Errorf("filestore/local: %s: %w", id, os.ErrNotExist)
	}
	return matches[0], nil
}
