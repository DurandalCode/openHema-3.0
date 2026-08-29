package api

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/tournament/domain"
	"github.com/hema/server/modules/tournament/service"
	"github.com/hema/server/modules/tournament/testutil"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
)

func filesTestPolicies() map[domain.FileKind]domain.FilePolicy {
	return map[domain.FileKind]domain.FilePolicy{
		domain.FileKindRegulations: {AllowedTypes: []string{"application/pdf"}, MaxBytes: 10 * 1024 * 1024},
		domain.FileKindEmblem:      {AllowedTypes: []string{"image/png", "image/jpeg", "image/webp"}, MaxBytes: 5 * 1024 * 1024},
	}
}

// setupWithFiles — как setup, но service сконструирован с настоящим (не
// nil) FakeFileStore и политиками по видам, чтобы гонять
// UploadTournamentFile/DeleteTournamentFile через реальный Connect-путь.
func setupWithFiles(t *testing.T) (hemav1connect.TournamentAdminServiceClient, *testutil.FakeRepo, *testutil.FakeFileStore) {
	t.Helper()

	repo := testutil.NewFakeRepoWithActive(domain.Tournament{
		ID:    "00000000-0000-0000-0000-000000000001",
		Title: "Seeded Cup",
	})
	files := testutil.NewFakeFileStore()
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	svc := service.New(repo, files, filesTestPolicies())
	adminHandler := NewAdminHandler(svc)

	baseOpts := []connect.HandlerOption{connect.WithInterceptors(connectutil.Auth(tokens))}
	adminOpts := []connect.HandlerOption{connect.WithInterceptors(connectutil.RequireAdmin())}

	adminPath, adminH := hemav1connect.NewTournamentAdminServiceHandler(adminHandler, append(baseOpts, adminOpts...)...)

	mux := http.NewServeMux()
	mux.Handle(adminPath, adminH)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := server.Client()
	adminClient := hemav1connect.NewTournamentAdminServiceClient(client, server.URL)
	return adminClient, repo, files
}

func pdfBytes() []byte {
	return append([]byte("%PDF-1.7\n"), bytes.Repeat([]byte("regulations "), 8)...)
}

func pngBytes() []byte {
	return append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, bytes.Repeat([]byte{0}, 16)...)
}

func TestUploadTournamentFile_E2E_Regulations_HappyPath(t *testing.T) {
	admin, _, _ := setupWithFiles(t)

	req := connect.NewRequest(&hemav1.UploadTournamentFileRequest{
		Kind:     hemav1.TournamentFileKind_TOURNAMENT_FILE_KIND_REGULATIONS,
		Content:  pdfBytes(),
		FileName: "Регламент.pdf",
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.UploadTournamentFile(context.Background(), req)
	if err != nil {
		t.Fatalf("UploadTournamentFile: %v", err)
	}
	if res.Msg.Tournament.RegulationsFile == nil {
		t.Fatal("RegulationsFile is nil")
	}
	if res.Msg.Tournament.RegulationsFile.Name != "Регламент.pdf" {
		t.Errorf("Name = %q", res.Msg.Tournament.RegulationsFile.Name)
	}
	if res.Msg.Tournament.RegulationsFile.Url == "" {
		t.Error("Url is empty")
	}
}

func TestUploadTournamentFile_E2E_Emblem_HappyPath(t *testing.T) {
	admin, _, _ := setupWithFiles(t)

	req := connect.NewRequest(&hemav1.UploadTournamentFileRequest{
		Kind:     hemav1.TournamentFileKind_TOURNAMENT_FILE_KIND_EMBLEM,
		Content:  pngBytes(),
		FileName: "logo.png",
	})
	req.Header().Set("Authorization", adminBearer(t))

	res, err := admin.UploadTournamentFile(context.Background(), req)
	if err != nil {
		t.Fatalf("UploadTournamentFile: %v", err)
	}
	if res.Msg.Tournament.EmblemFile == nil {
		t.Fatal("EmblemFile is nil")
	}
}

func TestUploadTournamentFile_E2E_UnsupportedType_InvalidArgument(t *testing.T) {
	admin, _, _ := setupWithFiles(t)

	req := connect.NewRequest(&hemav1.UploadTournamentFileRequest{
		Kind:     hemav1.TournamentFileKind_TOURNAMENT_FILE_KIND_REGULATIONS,
		Content:  pngBytes(),
		FileName: "not-a-pdf.png",
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.UploadTournamentFile(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("code = %v, want InvalidArgument", connect.CodeOf(err))
	}
}

func TestUploadTournamentFile_E2E_TooLarge_InvalidArgument(t *testing.T) {
	admin, _, _ := setupWithFiles(t)

	oversized := append([]byte("%PDF-1.7\n"), make([]byte, 11*1024*1024)...)
	req := connect.NewRequest(&hemav1.UploadTournamentFileRequest{
		Kind:     hemav1.TournamentFileKind_TOURNAMENT_FILE_KIND_REGULATIONS,
		Content:  oversized,
		FileName: "big.pdf",
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.UploadTournamentFile(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("code = %v, want InvalidArgument", connect.CodeOf(err))
	}
}

func TestUploadTournamentFile_E2E_UnknownKind_InvalidArgument(t *testing.T) {
	admin, _, _ := setupWithFiles(t)

	req := connect.NewRequest(&hemav1.UploadTournamentFileRequest{
		Kind:     hemav1.TournamentFileKind_TOURNAMENT_FILE_KIND_UNSPECIFIED,
		Content:  pdfBytes(),
		FileName: "x.pdf",
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.UploadTournamentFile(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("code = %v, want InvalidArgument", connect.CodeOf(err))
	}
}

func TestUploadTournamentFile_E2E_StorageUnavailable_FailedPrecondition(t *testing.T) {
	repo := testutil.NewFakeRepoWithActive(domain.Tournament{
		ID:    "00000000-0000-0000-0000-000000000001",
		Title: "Seeded Cup",
	})
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	svc := service.New(repo, nil, filesTestPolicies())
	adminHandler := NewAdminHandler(svc)

	baseOpts := []connect.HandlerOption{connect.WithInterceptors(connectutil.Auth(tokens))}
	adminOpts := []connect.HandlerOption{connect.WithInterceptors(connectutil.RequireAdmin())}
	adminPath, adminH := hemav1connect.NewTournamentAdminServiceHandler(adminHandler, append(baseOpts, adminOpts...)...)

	mux := http.NewServeMux()
	mux.Handle(adminPath, adminH)
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	admin := hemav1connect.NewTournamentAdminServiceClient(server.Client(), server.URL)

	req := connect.NewRequest(&hemav1.UploadTournamentFileRequest{
		Kind:     hemav1.TournamentFileKind_TOURNAMENT_FILE_KIND_REGULATIONS,
		Content:  pdfBytes(),
		FileName: "x.pdf",
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.UploadTournamentFile(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("code = %v, want FailedPrecondition", connect.CodeOf(err))
	}
}

func TestDeleteTournamentFile_E2E_HappyPath(t *testing.T) {
	admin, _, files := setupWithFiles(t)

	uploadReq := connect.NewRequest(&hemav1.UploadTournamentFileRequest{
		Kind:     hemav1.TournamentFileKind_TOURNAMENT_FILE_KIND_EMBLEM,
		Content:  pngBytes(),
		FileName: "logo.png",
	})
	uploadReq.Header().Set("Authorization", adminBearer(t))
	uploaded, err := admin.UploadTournamentFile(context.Background(), uploadReq)
	if err != nil {
		t.Fatalf("UploadTournamentFile: %v", err)
	}
	id := uploaded.Msg.Tournament.EmblemFile.Url

	delReq := connect.NewRequest(&hemav1.DeleteTournamentFileRequest{
		Kind: hemav1.TournamentFileKind_TOURNAMENT_FILE_KIND_EMBLEM,
	})
	delReq.Header().Set("Authorization", adminBearer(t))
	res, err := admin.DeleteTournamentFile(context.Background(), delReq)
	if err != nil {
		t.Fatalf("DeleteTournamentFile: %v", err)
	}
	if res.Msg.Tournament.EmblemFile != nil {
		t.Errorf("EmblemFile = %+v, want nil", res.Msg.Tournament.EmblemFile)
	}
	if id == "" {
		t.Fatal("uploaded file url is empty")
	}
	objectID := id[len(filesBaseURL):]
	if files.Has(objectID) {
		t.Error("object still present in filestore after delete")
	}
}

func TestDeleteTournamentFile_E2E_UnknownKind_InvalidArgument(t *testing.T) {
	admin, _, _ := setupWithFiles(t)

	req := connect.NewRequest(&hemav1.DeleteTournamentFileRequest{
		Kind: hemav1.TournamentFileKind_TOURNAMENT_FILE_KIND_UNSPECIFIED,
	})
	req.Header().Set("Authorization", adminBearer(t))

	_, err := admin.DeleteTournamentFile(context.Background(), req)
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("code = %v, want InvalidArgument", connect.CodeOf(err))
	}
}
