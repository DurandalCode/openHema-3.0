package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/hema/server/modules/auth/domain"
)

// TestValidatePassword_MinLengthBoundary проверяет единую политику длины
// пароля (FR-11, AC-10): граница 7/8 символов.
func TestValidatePassword_MinLengthBoundary(t *testing.T) {
	cases := []struct {
		name    string
		pass    string
		wantErr bool
	}{
		{"7 chars rejected", strings.Repeat("a", 7), true},
		{"8 chars accepted", strings.Repeat("a", 8), false},
		{"empty rejected", "", true},
		{"9 chars accepted", strings.Repeat("a", 9), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validatePassword(tc.pass)
			if tc.wantErr && !errors.Is(err, domain.ErrWeakPassword) {
				t.Errorf("validatePassword(%q) = %v, want ErrWeakPassword", tc.pass, err)
			}
			if !tc.wantErr && err != nil {
				t.Errorf("validatePassword(%q) = %v, want nil", tc.pass, err)
			}
		})
	}
}

// TestRegister_WeakPasswordRejected — единая политика подключена в Register
// (AC-10): регистрация с коротким паролем отклоняется, пользователь не создаётся.
func TestRegister_WeakPasswordRejected(t *testing.T) {
	svc, repo := testService()

	_, _, err := svc.Register(context.Background(), "weak@hema.test", "short", "Name")
	if !errors.Is(err, domain.ErrWeakPassword) {
		t.Errorf("expected ErrWeakPassword, got %v", err)
	}
	if _, _, err := repo.GetCredentialsByEmail(context.Background(), "weak@hema.test"); !errors.Is(err, domain.ErrUserNotFound) {
		t.Error("user should not have been created")
	}
}

// TestCreateAdmin_WeakPasswordRejected — политика подключена и в CreateAdmin (FR-11).
func TestCreateAdmin_WeakPasswordRejected(t *testing.T) {
	svc, _ := testService()

	_, err := svc.CreateAdmin(context.Background(), "weakadmin@hema.test", "short", "Name")
	if !errors.Is(err, domain.ErrWeakPassword) {
		t.Errorf("expected ErrWeakPassword, got %v", err)
	}
}
