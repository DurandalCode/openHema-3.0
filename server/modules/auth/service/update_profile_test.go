package service

import (
	"context"
	"errors"
	"testing"

	"github.com/hema/server/modules/auth/domain"
)

// TestUpdateProfile_HappyPath — AC-12: изменённое имя и клуб возвращаются
// и сохраняются.
func TestUpdateProfile_HappyPath(t *testing.T) {
	svc, repo := testService()
	ctx := context.Background()

	_, tokens, err := svc.Register(ctx, "ivan@example.com", "password1", "Иван")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	updated, err := svc.UpdateProfile(ctx, tokens.Access, "Иван Кравцов", "Северный клинок")
	if err != nil {
		t.Fatalf("UpdateProfile: %v", err)
	}
	if updated.DisplayName != "Иван Кравцов" {
		t.Errorf("DisplayName = %q", updated.DisplayName)
	}
	if updated.Club != "Северный клинок" {
		t.Errorf("Club = %q", updated.Club)
	}

	stored, err := repo.GetUserByID(ctx, updated.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if stored.DisplayName != "Иван Кравцов" || stored.Club != "Северный клинок" {
		t.Errorf("stored profile not updated: %+v", stored)
	}
}

// TestUpdateProfile_EmptyNameRejected — AC-13: пустое имя отклоняется,
// прежнее значение сохраняется.
func TestUpdateProfile_EmptyNameRejected(t *testing.T) {
	svc, repo := testService()
	ctx := context.Background()

	user, tokens, err := svc.Register(ctx, "ivan@example.com", "password1", "Иван")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	_, err = svc.UpdateProfile(ctx, tokens.Access, "   ", "Клуб")
	if !errors.Is(err, domain.ErrInvalidProfile) {
		t.Errorf("expected ErrInvalidProfile, got %v", err)
	}

	stored, err := repo.GetUserByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if stored.DisplayName != "Иван" {
		t.Errorf("DisplayName should be unchanged, got %q", stored.DisplayName)
	}
	if stored.Club != "" {
		t.Errorf("Club should be unchanged (empty), got %q", stored.Club)
	}
}

// TestUpdateProfile_ClubCanBeCleared — FR-15/UpdateProfileRequest.club:
// пустая строка убирает клуб.
func TestUpdateProfile_ClubCanBeCleared(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	_, tokens, err := svc.Register(ctx, "ivan@example.com", "password1", "Иван")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if _, err := svc.UpdateProfile(ctx, tokens.Access, "Иван", "Клуб"); err != nil {
		t.Fatalf("first UpdateProfile: %v", err)
	}

	updated, err := svc.UpdateProfile(ctx, tokens.Access, "Иван", "")
	if err != nil {
		t.Fatalf("second UpdateProfile: %v", err)
	}
	if updated.Club != "" {
		t.Errorf("Club should be cleared, got %q", updated.Club)
	}
}

// TestUpdateProfile_InvalidAccessToken — без валидного access-токена отказ.
func TestUpdateProfile_InvalidAccessToken(t *testing.T) {
	svc, _ := testService()

	_, err := svc.UpdateProfile(context.Background(), "garbage", "Name", "Club")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}
}

// TestUpdateProfile_EmailAndRoleUnchanged — FR-17: правка профиля не меняет
// email и роль.
func TestUpdateProfile_EmailAndRoleUnchanged(t *testing.T) {
	svc, _ := testService()
	ctx := context.Background()

	user, tokens, err := svc.Register(ctx, "ivan@example.com", "password1", "Иван")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	updated, err := svc.UpdateProfile(ctx, tokens.Access, "Иван Новый", "Клуб")
	if err != nil {
		t.Fatalf("UpdateProfile: %v", err)
	}
	if updated.Email != user.Email {
		t.Errorf("Email changed: %q -> %q", user.Email, updated.Email)
	}
	if updated.Role != user.Role {
		t.Errorf("Role changed: %q -> %q", user.Role, updated.Role)
	}
}
