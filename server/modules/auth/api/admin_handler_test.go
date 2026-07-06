package api

import (
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/modules/auth/testutil"
	"github.com/hema/server/pkg/jwt"
)

// seedAdmin вставляет админа в fake-репо и возвращает его access-токен.
func seedAdmin(t *testing.T, repo *testutil.FakeRepo, tokens *jwt.Manager, email string) (string, string) {
	t.Helper()
	user, err := repo.CreateUser(context.Background(), domain.NewUser{
		Email:        email,
		PasswordHash: "x",
		DisplayName:  "Admin",
		Role:         domain.RoleAdmin,
	})
	if err != nil {
		t.Fatalf("seed admin: %v", err)
	}
	pair, err := tokens.Issue(user.ID, string(user.Role))
	if err != nil {
		t.Fatalf("issue admin token: %v", err)
	}
	return user.ID, pair.Access
}

// seedUser вставляет обычного пользователя и возвращает его access-токен.
func seedUser(t *testing.T, repo *testutil.FakeRepo, tokens *jwt.Manager, email string) (string, string) {
	t.Helper()
	user, err := repo.CreateUser(context.Background(), domain.NewUser{
		Email:        email,
		PasswordHash: "x",
		DisplayName:  "User",
		Role:         domain.RoleUser,
	})
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	pair, err := tokens.Issue(user.ID, string(user.Role))
	if err != nil {
		t.Fatalf("issue user token: %v", err)
	}
	return user.ID, pair.Access
}

func withToken(req *connect.Request[hemav1.CreateAdminRequest], token string) *connect.Request[hemav1.CreateAdminRequest] {
	req.Header().Set("Authorization", "Bearer "+token)
	return req
}

func TestCreateAdmin_E2E_NoTokenReturnsUnauthenticated(t *testing.T) {
	_, adminClient, _ := setup(t)

	_, err := adminClient.CreateAdmin(context.Background(), connect.NewRequest(&hemav1.CreateAdminRequest{
		Email:    "new@hema.test",
		Password: "pass",
	}))
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestCreateAdmin_E2E_UserReturnsPermissionDenied(t *testing.T) {
	_, adminClient, repo := setup(t)
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	_, userToken := seedUser(t, repo, tokens, "user@hema.test")

	_, err := adminClient.CreateAdmin(context.Background(), withToken(connect.NewRequest(&hemav1.CreateAdminRequest{
		Email:    "new@hema.test",
		Password: "pass",
	}), userToken))
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestCreateAdmin_E2E_AdminCreatesAdmin(t *testing.T) {
	_, adminClient, repo := setup(t)
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	_, token := seedAdmin(t, repo, tokens, "root@hema.test")

	res, err := adminClient.CreateAdmin(context.Background(), withToken(connect.NewRequest(&hemav1.CreateAdminRequest{
		Email:       "new-admin@hema.test",
		Password:    "pass",
		DisplayName: "New Admin",
	}), token))
	if err != nil {
		t.Fatalf("CreateAdmin: %v", err)
	}
	if res.Msg.User == nil {
		t.Fatal("user should not be nil")
	}
	if res.Msg.User.Role != hemav1.Role_ROLE_ADMIN {
		t.Errorf("Role = %v, want ROLE_ADMIN", res.Msg.User.Role)
	}
	if res.Msg.User.Email != "new-admin@hema.test" {
		t.Errorf("Email = %q", res.Msg.User.Email)
	}
}

func TestListAdmins_E2E(t *testing.T) {
	_, adminClient, repo := setup(t)
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	seedAdmin(t, repo, tokens, "a1@hema.test")
	seedAdmin(t, repo, tokens, "a2@hema.test")
	_, token := seedAdmin(t, repo, tokens, "caller@hema.test")

	res, err := adminClient.ListAdmins(context.Background(), withTokenList(connect.NewRequest(&hemav1.ListAdminsRequest{}), token))
	if err != nil {
		t.Fatalf("ListAdmins: %v", err)
	}
	if len(res.Msg.Admins) != 3 {
		t.Errorf("admins count = %d, want 3", len(res.Msg.Admins))
	}
}

func TestListUsers_E2E(t *testing.T) {
	_, adminClient, repo := setup(t)
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	seedUser(t, repo, tokens, "u1@hema.test")
	_, token := seedAdmin(t, repo, tokens, "caller@hema.test")

	res, err := adminClient.ListUsers(context.Background(), withTokenListUsers(connect.NewRequest(&hemav1.ListUsersRequest{
		Limit: 100, Offset: 0,
	}), token))
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(res.Msg.Users) < 2 {
		t.Errorf("users count = %d, want >= 2", len(res.Msg.Users))
	}
}

func TestPromoteUser_E2E(t *testing.T) {
	_, adminClient, repo := setup(t)
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	userID, _ := seedUser(t, repo, tokens, "promote@hema.test")
	_, token := seedAdmin(t, repo, tokens, "caller@hema.test")

	res, err := adminClient.PromoteUser(context.Background(), withTokenPromote(connect.NewRequest(&hemav1.PromoteUserRequest{
		UserId: userID,
	}), token))
	if err != nil {
		t.Fatalf("PromoteUser: %v", err)
	}
	if res.Msg.User.Role != hemav1.Role_ROLE_ADMIN {
		t.Errorf("Role = %v, want ROLE_ADMIN", res.Msg.User.Role)
	}
}

func TestDemoteUser_E2E_SelfReturnsPermissionDenied(t *testing.T) {
	_, adminClient, repo := setup(t)
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	callerID, token := seedAdmin(t, repo, tokens, "self@hema.test")

	_, err := adminClient.DemoteUser(context.Background(), withTokenDemote(connect.NewRequest(&hemav1.DemoteUserRequest{
		UserId: callerID,
	}), token))
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestDemoteUser_E2E_LastAdminReturnsPermissionDenied(t *testing.T) {
	_, adminClient, repo := setup(t)
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	// Единственный админ — caller. Любая попытка понизить другого пользователя
	// оставила бы систему с 1 админом → guard (count<=1) отклоняет.
	_, token := seedAdmin(t, repo, tokens, "caller@hema.test")
	userID, _ := seedUser(t, repo, tokens, "target@hema.test")

	_, err := adminClient.DemoteUser(context.Background(), withTokenDemote(connect.NewRequest(&hemav1.DemoteUserRequest{
		UserId: userID,
	}), token))
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("expected CodePermissionDenied (last admin guard), got %v", connect.CodeOf(err))
	}
}

func TestDemoteUser_E2E_DemotesWhenMultipleAdmins(t *testing.T) {
	_, adminClient, repo := setup(t)
	tokens := jwt.NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
	targetID, _ := seedAdmin(t, repo, tokens, "target@hema.test")
	seedAdmin(t, repo, tokens, "other@hema.test")
	_, token := seedAdmin(t, repo, tokens, "caller@hema.test")

	res, err := adminClient.DemoteUser(context.Background(), withTokenDemote(connect.NewRequest(&hemav1.DemoteUserRequest{
		UserId: targetID,
	}), token))
	if err != nil {
		t.Fatalf("DemoteUser: %v", err)
	}
	if res.Msg.User.Role != hemav1.Role_ROLE_USER {
		t.Errorf("Role = %v, want ROLE_USER", res.Msg.User.Role)
	}
}

func withTokenList(req *connect.Request[hemav1.ListAdminsRequest], token string) *connect.Request[hemav1.ListAdminsRequest] {
	req.Header().Set("Authorization", "Bearer "+token)
	return req
}

func withTokenListUsers(req *connect.Request[hemav1.ListUsersRequest], token string) *connect.Request[hemav1.ListUsersRequest] {
	req.Header().Set("Authorization", "Bearer "+token)
	return req
}

func withTokenPromote(req *connect.Request[hemav1.PromoteUserRequest], token string) *connect.Request[hemav1.PromoteUserRequest] {
	req.Header().Set("Authorization", "Bearer "+token)
	return req
}

func withTokenDemote(req *connect.Request[hemav1.DemoteUserRequest], token string) *connect.Request[hemav1.DemoteUserRequest] {
	req.Header().Set("Authorization", "Bearer "+token)
	return req
}
