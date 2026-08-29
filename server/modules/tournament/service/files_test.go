package service

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"

	"github.com/hema/server/modules/tournament/domain"
	"github.com/hema/server/modules/tournament/testutil"
	"github.com/hema/server/pkg/filestore"
)

// filePolicies — те же значения, что и defaultPolicies модуля (пороги по
// ADR 0019 п.4): регламент — только PDF до 10 МБ, эмблема — растровые
// форматы до 5 МБ.
func filePolicies() map[domain.FileKind]domain.FilePolicy {
	return map[domain.FileKind]domain.FilePolicy{
		domain.FileKindRegulations: {AllowedTypes: []string{"application/pdf"}, MaxBytes: 10 * 1024 * 1024},
		domain.FileKindEmblem:      {AllowedTypes: []string{"image/png", "image/jpeg", "image/webp"}, MaxBytes: 5 * 1024 * 1024},
	}
}

func testServiceWithFilesTournament(t domain.Tournament) (*Service, *testutil.FakeRepo, *testutil.FakeFileStore) {
	repo := testutil.NewFakeRepoWithActive(t)
	files := testutil.NewFakeFileStore()
	return New(repo, files, filePolicies()), repo, files
}

func testServiceWithFiles() (*Service, *testutil.FakeRepo, *testutil.FakeFileStore) {
	return testServiceWithFilesTournament(domain.Tournament{
		ID:        "00000000-0000-0000-0000-000000000001",
		Title:     "Seeded Cup",
		CreatedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	})
}

func pdfContent() []byte {
	return append([]byte("%PDF-1.7\n"), bytes.Repeat([]byte("regulations text "), 10)...)
}

func pngContent() []byte {
	return append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, bytes.Repeat([]byte{0}, 32)...)
}

func jpegContent() []byte {
	return append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{0}, 32)...)
}

func webpContent() []byte {
	out := append([]byte("RIFF"), []byte{0x24, 0x00, 0x00, 0x00}...)
	out = append(out, []byte("WEBPVP8 ")...)
	return append(out, bytes.Repeat([]byte{0}, 16)...)
}

func svgContent() []byte {
	return []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)
}

func garbageContent() []byte {
	return []byte("this is just plain text, not any recognized file format at all")
}

// --- Успешная загрузка ---

func TestUploadFile_Regulations_HappyPath(t *testing.T) {
	svc, _, files := testServiceWithFiles()

	got, err := svc.UploadFile(context.Background(), domain.FileKindRegulations, pdfContent(), "Регламент.pdf")
	if err != nil {
		t.Fatalf("UploadFile: %v", err)
	}
	if got.RegulationsFile.ID == "" {
		t.Fatal("RegulationsFile.ID is empty")
	}
	if got.RegulationsFile.Name != "Регламент.pdf" {
		t.Errorf("Name = %q", got.RegulationsFile.Name)
	}
	if got.RegulationsFile.Size != int64(len(pdfContent())) {
		t.Errorf("Size = %d, want %d", got.RegulationsFile.Size, len(pdfContent()))
	}
	if !files.Has(got.RegulationsFile.ID) {
		t.Error("object not stored in filestore")
	}
}

func TestUploadFile_Emblem_HappyPath(t *testing.T) {
	cases := []struct {
		name    string
		content []byte
	}{
		{"png", pngContent()},
		{"jpeg", jpegContent()},
		{"webp", webpContent()},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, _, files := testServiceWithFiles()

			got, err := svc.UploadFile(context.Background(), domain.FileKindEmblem, tc.content, "logo."+tc.name)
			if err != nil {
				t.Fatalf("UploadFile: %v", err)
			}
			if got.EmblemFile.ID == "" {
				t.Fatal("EmblemFile.ID is empty")
			}
			if !files.Has(got.EmblemFile.ID) {
				t.Error("object not stored in filestore")
			}
		})
	}
}

// --- Отказ по типу ---

func TestUploadFile_Regulations_RejectsNonPDF(t *testing.T) {
	svc, _, _ := testServiceWithFiles()

	_, err := svc.UploadFile(context.Background(), domain.FileKindRegulations, pngContent(), "not-a-pdf.png")
	if !errors.Is(err, domain.ErrUnsupportedFileType) {
		t.Fatalf("err = %v, want ErrUnsupportedFileType", err)
	}
}

func TestUploadFile_Emblem_RejectsSVG(t *testing.T) {
	svc, _, _ := testServiceWithFiles()

	_, err := svc.UploadFile(context.Background(), domain.FileKindEmblem, svgContent(), "logo.svg")
	if !errors.Is(err, domain.ErrUnsupportedFileType) {
		t.Fatalf("err = %v, want ErrUnsupportedFileType", err)
	}
}

func TestUploadFile_Emblem_RejectsGarbage(t *testing.T) {
	svc, _, _ := testServiceWithFiles()

	_, err := svc.UploadFile(context.Background(), domain.FileKindEmblem, garbageContent(), "logo.bin")
	if !errors.Is(err, domain.ErrUnsupportedFileType) {
		t.Fatalf("err = %v, want ErrUnsupportedFileType", err)
	}
}

// --- Отказ по размеру: прежний файл не изменяется ---

func TestUploadFile_Regulations_TooLarge_PreservesPreviousFile(t *testing.T) {
	seeded := domain.Tournament{
		ID:              "00000000-0000-0000-0000-000000000001",
		Title:           "Seeded Cup",
		RegulationsFile: domain.StoredFile{ID: "prev-regs", Name: "old.pdf", Size: 10},
		CreatedAt:       time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:       time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	}
	svc, repo, _ := testServiceWithFilesTournament(seeded)
	_ = repo

	oversized := append([]byte("%PDF-1.7\n"), make([]byte, 11*1024*1024)...)
	_, err := svc.UploadFile(context.Background(), domain.FileKindRegulations, oversized, "big.pdf")
	if !errors.Is(err, domain.ErrFileTooLarge) {
		t.Fatalf("err = %v, want ErrFileTooLarge", err)
	}

	got, err := svc.GetActive(context.Background())
	if err != nil {
		t.Fatalf("GetActive: %v", err)
	}
	if got.RegulationsFile.ID != "prev-regs" {
		t.Errorf("RegulationsFile changed after failed upload: %+v", got.RegulationsFile)
	}
}

func TestUploadFile_Emblem_TooLarge_PreservesPreviousFile(t *testing.T) {
	seeded := domain.Tournament{
		ID:         "00000000-0000-0000-0000-000000000001",
		Title:      "Seeded Cup",
		EmblemFile: domain.StoredFile{ID: "prev-emblem", Name: "old.png", Size: 10},
		CreatedAt:  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	}
	svc, _, _ := testServiceWithFilesTournament(seeded)

	oversized := append(pngContent(), make([]byte, 6*1024*1024)...)
	_, err := svc.UploadFile(context.Background(), domain.FileKindEmblem, oversized, "big.png")
	if !errors.Is(err, domain.ErrFileTooLarge) {
		t.Fatalf("err = %v, want ErrFileTooLarge", err)
	}

	got, err := svc.GetActive(context.Background())
	if err != nil {
		t.Fatalf("GetActive: %v", err)
	}
	if got.EmblemFile.ID != "prev-emblem" {
		t.Errorf("EmblemFile changed after failed upload: %+v", got.EmblemFile)
	}
}

// --- Загрузка вытесняет ранее заданную ссылку ---

func TestUploadFile_Regulations_EvictsPreviousLink(t *testing.T) {
	seeded := domain.Tournament{
		ID:             "00000000-0000-0000-0000-000000000001",
		Title:          "Seeded Cup",
		RegulationsURL: "https://example.com/regs.pdf",
		CreatedAt:      time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:      time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	}
	svc, _, _ := testServiceWithFilesTournament(seeded)

	got, err := svc.UploadFile(context.Background(), domain.FileKindRegulations, pdfContent(), "Регламент.pdf")
	if err != nil {
		t.Fatalf("UploadFile: %v", err)
	}
	if got.RegulationsURL != "" {
		t.Errorf("RegulationsURL = %q, want empty", got.RegulationsURL)
	}
	if got.RegulationsFile.ID == "" {
		t.Error("RegulationsFile.ID is empty")
	}
}

func TestUploadFile_Emblem_EvictsPreviousLink(t *testing.T) {
	seeded := domain.Tournament{
		ID:        "00000000-0000-0000-0000-000000000001",
		Title:     "Seeded Cup",
		EmblemURL: "https://example.com/logo.png",
		CreatedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	}
	svc, _, _ := testServiceWithFilesTournament(seeded)

	got, err := svc.UploadFile(context.Background(), domain.FileKindEmblem, pngContent(), "logo.png")
	if err != nil {
		t.Fatalf("UploadFile: %v", err)
	}
	if got.EmblemURL != "" {
		t.Errorf("EmblemURL = %q, want empty", got.EmblemURL)
	}
}

// --- UpdateActive с непустой ссылкой вытесняет ранее загруженный файл ---

func TestUpdateActive_RegulationsURL_EvictsPreviousFile(t *testing.T) {
	seeded := domain.Tournament{
		ID:              "00000000-0000-0000-0000-000000000001",
		Title:           "Seeded Cup",
		RegulationsFile: domain.StoredFile{ID: "prev-regs", Name: "old.pdf", Size: 10},
		CreatedAt:       time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:       time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	}
	repo := testutil.NewFakeRepoWithActive(seeded)
	files := testutil.NewFakeFileStore()
	files.Seed("prev-regs", []byte("x"), filestore.Meta{ContentType: "application/pdf"})
	svc := New(repo, files, filePolicies())

	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:          "Seeded Cup",
		RegulationsURL: "https://example.com/new-regs.pdf",
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if got.RegulationsFile.ID != "" {
		t.Errorf("RegulationsFile.ID = %q, want empty", got.RegulationsFile.ID)
	}
	if !files.WasDeleted("prev-regs") {
		t.Error("previous regulations object was not deleted")
	}
}

func TestUpdateActive_EmblemURL_EvictsPreviousFile(t *testing.T) {
	seeded := domain.Tournament{
		ID:         "00000000-0000-0000-0000-000000000001",
		Title:      "Seeded Cup",
		EmblemFile: domain.StoredFile{ID: "prev-emblem", Name: "old.png", Size: 10},
		CreatedAt:  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	}
	repo := testutil.NewFakeRepoWithActive(seeded)
	files := testutil.NewFakeFileStore()
	svc := New(repo, files, filePolicies())

	got, err := svc.UpdateActive(context.Background(), domain.UpdateInput{
		Title:     "Seeded Cup",
		EmblemURL: "https://example.com/new-logo.png",
	})
	if err != nil {
		t.Fatalf("UpdateActive: %v", err)
	}
	if got.EmblemFile.ID != "" {
		t.Errorf("EmblemFile.ID = %q, want empty", got.EmblemFile.ID)
	}
}

// --- Delete прежнего объекта у Store ---

func TestUploadFile_ReplacingFile_DeletesPreviousObject(t *testing.T) {
	svc, _, files := testServiceWithFiles()

	first, err := svc.UploadFile(context.Background(), domain.FileKindRegulations, pdfContent(), "v1.pdf")
	if err != nil {
		t.Fatalf("first UploadFile: %v", err)
	}
	prevID := first.RegulationsFile.ID

	second, err := svc.UploadFile(context.Background(), domain.FileKindRegulations, pdfContent(), "v2.pdf")
	if err != nil {
		t.Fatalf("second UploadFile: %v", err)
	}
	if second.RegulationsFile.ID == prevID {
		t.Fatal("expected a new object id on replace")
	}
	if !files.WasDeleted(prevID) {
		t.Error("previous object was not deleted")
	}
	if !files.Has(second.RegulationsFile.ID) {
		t.Error("new object missing from store")
	}
}

func TestDeleteFile_DeletesObject(t *testing.T) {
	svc, _, files := testServiceWithFiles()

	uploaded, err := svc.UploadFile(context.Background(), domain.FileKindEmblem, pngContent(), "logo.png")
	if err != nil {
		t.Fatalf("UploadFile: %v", err)
	}
	id := uploaded.EmblemFile.ID

	got, err := svc.DeleteFile(context.Background(), domain.FileKindEmblem)
	if err != nil {
		t.Fatalf("DeleteFile: %v", err)
	}
	if got.EmblemFile.ID != "" {
		t.Errorf("EmblemFile.ID = %q, want empty", got.EmblemFile.ID)
	}
	if !files.WasDeleted(id) {
		t.Error("object was not deleted")
	}
}

// --- Изоляция между видами ---

func TestUploadFile_Regulations_DoesNotTouchEmblem(t *testing.T) {
	seeded := domain.Tournament{
		ID:         "00000000-0000-0000-0000-000000000001",
		Title:      "Seeded Cup",
		EmblemFile: domain.StoredFile{ID: "keep-emblem", Name: "logo.png", Size: 5},
		CreatedAt:  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	}
	svc, _, _ := testServiceWithFilesTournament(seeded)

	got, err := svc.UploadFile(context.Background(), domain.FileKindRegulations, pdfContent(), "regs.pdf")
	if err != nil {
		t.Fatalf("UploadFile: %v", err)
	}
	if got.EmblemFile.ID != "keep-emblem" {
		t.Errorf("EmblemFile changed: %+v", got.EmblemFile)
	}
}

func TestUploadFile_Emblem_DoesNotTouchRegulations(t *testing.T) {
	seeded := domain.Tournament{
		ID:              "00000000-0000-0000-0000-000000000001",
		Title:           "Seeded Cup",
		RegulationsFile: domain.StoredFile{ID: "keep-regs", Name: "regs.pdf", Size: 5},
		CreatedAt:       time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:       time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	}
	svc, _, _ := testServiceWithFilesTournament(seeded)

	got, err := svc.UploadFile(context.Background(), domain.FileKindEmblem, pngContent(), "logo.png")
	if err != nil {
		t.Fatalf("UploadFile: %v", err)
	}
	if got.RegulationsFile.ID != "keep-regs" {
		t.Errorf("RegulationsFile changed: %+v", got.RegulationsFile)
	}
}

// --- Хранилище не настроено ---

func TestUploadFile_NilStore_ReturnsStorageUnavailable(t *testing.T) {
	repo := testutil.NewFakeRepoWithActive(domain.Tournament{
		ID:    "00000000-0000-0000-0000-000000000001",
		Title: "Seeded Cup",
	})
	svc := New(repo, nil, filePolicies())

	_, err := svc.UploadFile(context.Background(), domain.FileKindRegulations, pdfContent(), "regs.pdf")
	if !errors.Is(err, domain.ErrStorageUnavailable) {
		t.Fatalf("err = %v, want ErrStorageUnavailable", err)
	}
}
