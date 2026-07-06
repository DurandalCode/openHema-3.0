package service

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/auth/domain"
)

func TestCreateAdmin_HappyPath(t *testing.T) {
	svc, repo := testService()

	user, err := svc.CreateAdmin(context.Background(), "admin@hema.test", "pass", "Admin")
	if err != nil {
		t.Fatalf("CreateAdmin: %v", err)
	}
	if user.Role != domain.RoleAdmin {
		t.Errorf("Role = %q, want %q", user.Role, domain.RoleAdmin)
	}

	// Проверяем, что роль действительно сохранена в репо.
	stored, _, err := repo.GetCredentialsByEmail(context.Background(), "admin@hema.test")
	if err != nil {
		t.Fatalf("GetCredentialsByEmail: %v", err)
	}
	if stored.Role != domain.RoleAdmin {
		t.Errorf("stored Role = %q, want %q", stored.Role, domain.RoleAdmin)
	}
}

func TestCreateAdmin_DuplicateEmail(t *testing.T) {
	svc, _ := testService()

	if _, err := svc.CreateAdmin(context.Background(), "dup@hema.test", "pass", "First"); err != nil {
		t.Fatalf("first CreateAdmin: %v", err)
	}

	_, err := svc.CreateAdmin(context.Background(), "dup@hema.test", "pass", "Second")
	if !errors.Is(err, domain.ErrUserExists) {
		t.Errorf("expected ErrUserExists, got %v", err)
	}
}

func TestCreateAdmin_EmptyFields(t *testing.T) {
	svc, _ := testService()

	cases := []struct {
		name     string
		email    string
		password string
	}{
		{"empty email", "", "pass"},
		{"empty password", "a@b.test", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := svc.CreateAdmin(context.Background(), tc.email, tc.password, "Name")
			if !errors.Is(err, domain.ErrInvalidCredentials) {
				t.Errorf("expected ErrInvalidCredentials, got %v", err)
			}
		})
	}
}

func TestListAdmins(t *testing.T) {
	svc, _ := testService()

	if _, err := svc.CreateAdmin(context.Background(), "a1@hema.test", "pass", "A1"); err != nil {
		t.Fatalf("CreateAdmin a1: %v", err)
	}
	if _, err := svc.CreateAdmin(context.Background(), "a2@hema.test", "pass", "A2"); err != nil {
		t.Fatalf("CreateAdmin a2: %v", err)
	}

	admins, err := svc.ListAdmins(context.Background())
	if err != nil {
		t.Fatalf("ListAdmins: %v", err)
	}
	if len(admins) != 2 {
		t.Errorf("admins count = %d, want 2", len(admins))
	}
	for _, a := range admins {
		if a.Role != domain.RoleAdmin {
			t.Errorf("admin Role = %q, want %q", a.Role, domain.RoleAdmin)
		}
	}
}

func TestListUsers(t *testing.T) {
	svc, _ := testService()

	if _, _, err := svc.Register(context.Background(), "u1@hema.test", "pass", "U1"); err != nil {
		t.Fatalf("Register u1: %v", err)
	}
	if _, err := svc.CreateAdmin(context.Background(), "a1@hema.test", "pass", "A1"); err != nil {
		t.Fatalf("CreateAdmin a1: %v", err)
	}

	users, err := svc.ListUsers(context.Background(), 100, 0)
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(users) != 2 {
		t.Errorf("users count = %d, want 2", len(users))
	}
}

func TestPromoteUser(t *testing.T) {
	svc, repo := testService()

	user, _, err := svc.Register(context.Background(), "promote@hema.test", "pass", "User")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	promoted, err := svc.PromoteUser(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("PromoteUser: %v", err)
	}
	if promoted.Role != domain.RoleAdmin {
		t.Errorf("Role = %q, want %q", promoted.Role, domain.RoleAdmin)
	}

	stored, err := repo.GetUserByID(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if stored.Role != domain.RoleAdmin {
		t.Errorf("stored Role = %q, want %q", stored.Role, domain.RoleAdmin)
	}
}

func TestPromoteUser_NonexistentUser(t *testing.T) {
	svc, _ := testService()

	_, err := svc.PromoteUser(context.Background(), "nonexistent-id")
	if !errors.Is(err, domain.ErrUserNotFound) {
		t.Errorf("expected ErrUserNotFound, got %v", err)
	}
}

func TestDemoteUser_HappyPath(t *testing.T) {
	svc, _ := testService()

	caller, err := svc.CreateAdmin(context.Background(), "caller@hema.test", "pass", "Caller")
	if err != nil {
		t.Fatalf("CreateAdmin caller: %v", err)
	}
	target, err := svc.CreateAdmin(context.Background(), "target@hema.test", "pass", "Target")
	if err != nil {
		t.Fatalf("CreateAdmin target: %v", err)
	}

	demoted, err := svc.DemoteUser(context.Background(), target.ID, caller.ID)
	if err != nil {
		t.Fatalf("DemoteUser: %v", err)
	}
	if demoted.Role != domain.RoleUser {
		t.Errorf("Role = %q, want %q", demoted.Role, domain.RoleUser)
	}
}

func TestDemoteUser_SelfReturnsForbidden(t *testing.T) {
	svc, _ := testService()

	caller, err := svc.CreateAdmin(context.Background(), "self@hema.test", "pass", "Self")
	if err != nil {
		t.Fatalf("CreateAdmin: %v", err)
	}
	// Второй админ, чтобы guard последнего админа не сработал раньше self-guard.
	target, err := svc.CreateAdmin(context.Background(), "other@hema.test", "pass", "Other")
	if err != nil {
		t.Fatalf("CreateAdmin other: %v", err)
	}
	_ = target

	_, err = svc.DemoteUser(context.Background(), caller.ID, caller.ID)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Errorf("expected ErrForbidden, got %v", err)
	}
}

func TestDemoteUser_LastAdminReturnsForbidden(t *testing.T) {
	svc, _ := testService()

	caller, err := svc.CreateAdmin(context.Background(), "only@hema.test", "pass", "Only")
	if err != nil {
		t.Fatalf("CreateAdmin: %v", err)
	}
	// Единственный админ — caller. Пытаемся понизить другого (несуществующего)
	// пользователя: guard count<=1 сработает раньше ErrUserNotFound.
	_, err = svc.DemoteUser(context.Background(), "ghost-id", caller.ID)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Errorf("expected ErrForbidden (last admin guard), got %v", err)
	}
}

func TestBootstrapAdmin_CreatesFirstAdmin(t *testing.T) {
	svc, repo := testService()

	created, err := svc.BootstrapAdmin(context.Background(), "boot@hema.test", "pass", "Boot")
	if err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}
	if !created {
		t.Fatal("expected created=true")
	}

	count, err := repo.CountAdmins(context.Background())
	if err != nil {
		t.Fatalf("CountAdmins: %v", err)
	}
	if count != 1 {
		t.Errorf("admins count = %d, want 1", count)
	}
}

func TestBootstrapAdmin_SkipsWhenAdminsExist(t *testing.T) {
	svc, _ := testService()

	if _, err := svc.CreateAdmin(context.Background(), "existing@hema.test", "pass", "Existing"); err != nil {
		t.Fatalf("CreateAdmin: %v", err)
	}

	created, err := svc.BootstrapAdmin(context.Background(), "boot@hema.test", "pass", "Boot")
	if err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}
	if created {
		t.Error("expected created=false when admins already exist")
	}
}

func TestBootstrapAdmin_SkipsWhenNoCredentials(t *testing.T) {
	svc, _ := testService()

	created, err := svc.BootstrapAdmin(context.Background(), "", "", "")
	if err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}
	if created {
		t.Error("expected created=false when no credentials provided")
	}
}

func TestBootstrapAdmin_IdempotentOnSameEmail(t *testing.T) {
	svc, _ := testService()

	if _, err := svc.BootstrapAdmin(context.Background(), "boot@hema.test", "pass", "Boot"); err != nil {
		t.Fatalf("first BootstrapAdmin: %v", err)
	}
	// Второй вызов с тем же email — админ уже есть, skip.
	created, err := svc.BootstrapAdmin(context.Background(), "boot@hema.test", "pass", "Boot")
	if err != nil {
		t.Fatalf("second BootstrapAdmin: %v", err)
	}
	if created {
		t.Error("expected created=false on second call")
	}
}

func TestLogin_ReturnsRole(t *testing.T) {
	svc, _ := testService()

	if _, err := svc.CreateAdmin(context.Background(), "login@hema.test", "pass", "Admin"); err != nil {
		t.Fatalf("CreateAdmin: %v", err)
	}

	user, _, err := svc.Login(context.Background(), "login@hema.test", "pass")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if user.Role != domain.RoleAdmin {
		t.Errorf("Role = %q, want %q", user.Role, domain.RoleAdmin)
	}
}

func TestMe_ReturnsRole(t *testing.T) {
	svc, _ := testService()

	if _, err := svc.CreateAdmin(context.Background(), "me@hema.test", "pass", "Admin"); err != nil {
		t.Fatalf("CreateAdmin: %v", err)
	}
	// Создаём токен вручную (CreateAdmin не выдаёт токены).
	pair, err := svc.tokens.Issue(getUserIDByEmail(t, svc, "me@hema.test"), string(domain.RoleAdmin))
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	user, err := svc.Me(context.Background(), pair.Access)
	if err != nil {
		t.Fatalf("Me: %v", err)
	}
	if user.Role != domain.RoleAdmin {
		t.Errorf("Role = %q, want %q", user.Role, domain.RoleAdmin)
	}
}

func getUserIDByEmail(t *testing.T, svc *Service, email string) string {
	t.Helper()
	u, _, err := svc.repo.GetCredentialsByEmail(context.Background(), email)
	if err != nil {
		t.Fatalf("GetCredentialsByEmail: %v", err)
	}
	return u.ID
}
