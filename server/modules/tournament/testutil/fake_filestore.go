package testutil

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"

	"github.com/hema/server/pkg/filestore"
)

// FakeFileStore — in-memory реализация filestore.Store для тестов сервиса
// и api-хендлеров модуля tournament. Потокобезопасна. Помимо данных хранит
// журнал вызовов Delete (Deleted) — тесты используют его, чтобы убедиться,
// что service действительно освобождает прежний объект при замене/удалении
// файла (ADR 0019 п.5).
type FakeFileStore struct {
	mu      sync.Mutex
	objects map[string][]byte
	metas   map[string]filestore.Meta
	Deleted []string
}

// NewFakeFileStore создаёт пустое in-memory хранилище.
func NewFakeFileStore() *FakeFileStore {
	return &FakeFileStore{
		objects: make(map[string][]byte),
		metas:   make(map[string]filestore.Meta),
	}
}

var _ filestore.Store = (*FakeFileStore)(nil)

// Put сохраняет содержимое r под новым случайным id.
func (f *FakeFileStore) Put(_ context.Context, r io.Reader, meta filestore.Meta) (string, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return "", fmt.Errorf("testutil: read content: %w", err)
	}
	id, err := randomID()
	if err != nil {
		return "", err
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	f.objects[id] = data
	f.metas[id] = meta
	return id, nil
}

// Open возвращает содержимое объекта id.
func (f *FakeFileStore) Open(_ context.Context, id string) (io.ReadCloser, filestore.Meta, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	data, ok := f.objects[id]
	if !ok {
		return nil, filestore.Meta{}, fmt.Errorf("testutil: open %s: %w", id, os.ErrNotExist)
	}
	return io.NopCloser(bytes.NewReader(data)), f.metas[id], nil
}

// Delete удаляет объект id и записывает его в Deleted.
func (f *FakeFileStore) Delete(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	if _, ok := f.objects[id]; !ok {
		return fmt.Errorf("testutil: delete %s: %w", id, os.ErrNotExist)
	}
	delete(f.objects, id)
	delete(f.metas, id)
	f.Deleted = append(f.Deleted, id)
	return nil
}

// Seed вставляет объект под заданным id напрямую, без прохода через Put
// (который сам генерирует случайный id). Нужен тестам, что заранее заводят
// domain.Tournament со StoredFile{ID: "some-fixed-id"} и должны, чтобы этот
// же id действительно существовал в фейковом хранилище к моменту Delete.
func (f *FakeFileStore) Seed(id string, data []byte, meta filestore.Meta) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.objects[id] = append([]byte(nil), data...)
	f.metas[id] = meta
}

// Has сообщает, есть ли в хранилище объект id (удобно в тестах вместо
// прямого чтения Deleted/objects).
func (f *FakeFileStore) Has(id string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	_, ok := f.objects[id]
	return ok
}

// WasDeleted сообщает, был ли объект id когда-либо удалён через Delete.
func (f *FakeFileStore) WasDeleted(id string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, d := range f.Deleted {
		if d == id {
			return true
		}
	}
	return false
}

func randomID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", errors.New("testutil: rand.Read failed: " + err.Error())
	}
	return hex.EncodeToString(b), nil
}
