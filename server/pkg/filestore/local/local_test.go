package local

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/hema/server/pkg/filestore"
)

func TestLocalStore_PutOpenDelete_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	s := New(dir)
	ctx := context.Background()

	content := []byte("%PDF-1.7 fake regulations content")
	id, err := s.Put(ctx, bytes.NewReader(content), filestore.Meta{ContentType: "application/pdf", Size: int64(len(content))})
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	if id == "" {
		t.Fatal("Put returned empty id")
	}

	rc, meta, err := s.Open(ctx, id)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer rc.Close()

	got, err := io.ReadAll(rc)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !bytes.Equal(got, content) {
		t.Errorf("content mismatch: got %q, want %q", got, content)
	}
	if meta.ContentType != "application/pdf" {
		t.Errorf("ContentType = %q, want application/pdf", meta.ContentType)
	}
	if meta.Size != int64(len(content)) {
		t.Errorf("Size = %d, want %d", meta.Size, len(content))
	}

	if err := s.Delete(ctx, id); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if _, _, err := s.Open(ctx, id); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("Open after Delete: err = %v, want os.ErrNotExist", err)
	}
}

func TestLocalStore_Open_UnknownID(t *testing.T) {
	s := New(t.TempDir())
	_, _, err := s.Open(context.Background(), "does-not-exist")
	if !errors.Is(err, os.ErrNotExist) {
		t.Errorf("err = %v, want os.ErrNotExist", err)
	}
}

func TestLocalStore_Delete_UnknownID(t *testing.T) {
	s := New(t.TempDir())
	err := s.Delete(context.Background(), "does-not-exist")
	if !errors.Is(err, os.ErrNotExist) {
		t.Errorf("err = %v, want os.ErrNotExist", err)
	}
}

func TestLocalStore_Put_CreatesDirLazily(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "not-yet-created", "nested")
	s := New(dir)

	content := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0, 0, 0}
	id, err := s.Put(context.Background(), bytes.NewReader(content), filestore.Meta{ContentType: "image/png", Size: int64(len(content))})
	if err != nil {
		t.Fatalf("Put: %v", err)
	}

	rc, _, err := s.Open(context.Background(), id)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	_ = rc.Close()
}

func TestLocalStore_PutOpenDelete_UnknownContentType(t *testing.T) {
	// Sniff never returns an unregistered mime, but LocalStore itself must
	// not choke on one — round trip still works, just with a generic
	// extension/content type.
	s := New(t.TempDir())
	content := []byte("arbitrary bytes")
	id, err := s.Put(context.Background(), bytes.NewReader(content), filestore.Meta{ContentType: "application/octet-stream", Size: int64(len(content))})
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	rc, _, err := s.Open(context.Background(), id)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	_ = rc.Close()
	if err := s.Delete(context.Background(), id); err != nil {
		t.Fatalf("Delete: %v", err)
	}
}
