package service

import (
	"context"
	"fmt"

	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/pkg/crypto"
)

// CreateAdmin создаёт пользователя с ролью admin. Вызывается только админом
// (доступ ограничен интерсептором RequireAdmin). Токены не выдаёт — новый
// админ логинится самостоятельно через AuthService.Login.
func (s *Service) CreateAdmin(ctx context.Context, email, password, displayName string) (domain.User, error) {
	email = normalizeEmail(email)
	if email == "" || password == "" {
		return domain.User{}, domain.ErrInvalidCredentials
	}
	hash, err := crypto.HashPassword(password)
	if err != nil {
		return domain.User{}, fmt.Errorf("hash password: %w", err)
	}
	user, err := s.repo.CreateUser(ctx, domain.NewUser{
		Email:        email,
		PasswordHash: hash,
		DisplayName:  displayName,
		Role:         domain.RoleAdmin,
	})
	if err != nil {
		return domain.User{}, err
	}
	return user, nil
}

// ListAdmins возвращает всех администраторов.
func (s *Service) ListAdmins(ctx context.Context) ([]domain.User, error) {
	return s.repo.ListAdmins(ctx)
}

// ListUsers возвращает всех пользователей с постраничной навигацией.
// limit<=0 означает «без ограничения» (репозиторий возвращает все записи).
func (s *Service) ListUsers(ctx context.Context, limit, offset int32) ([]domain.User, error) {
	return s.repo.ListUsers(ctx, domain.ListParams{Limit: limit, Offset: offset})
}

// PromoteUser повышает пользователя до роли admin.
func (s *Service) PromoteUser(ctx context.Context, userID string) (domain.User, error) {
	return s.repo.SetUserRole(ctx, userID, domain.RoleAdmin)
}

// DemoteUser понижает админа до роли user. callerID — идентификатор
// вызывающего админа (берётся из JWT-клейма интерсептором).
// Запрещено понижать самого себя и понижать последнего оставшегося админа.
func (s *Service) DemoteUser(ctx context.Context, userID, callerID string) (domain.User, error) {
	if userID == callerID {
		return domain.User{}, domain.ErrForbidden
	}
	count, err := s.repo.CountAdmins(ctx)
	if err != nil {
		return domain.User{}, fmt.Errorf("count admins: %w", err)
	}
	if count <= 1 {
		return domain.User{}, domain.ErrForbidden
	}
	return s.repo.SetUserRole(ctx, userID, domain.RoleUser)
}

// BootstrapAdmin создаёт первого админа из env-кредов при старте сервера,
// если в системе ещё нет ни одного админа. Идемпотентен: при наличии админов
// или при конфликте email (админ с таким email уже существует) ничего не делает.
// Возвращает created=true, если пользователь был создан в этом вызове.
func (s *Service) BootstrapAdmin(ctx context.Context, email, password, displayName string) (bool, error) {
	email = normalizeEmail(email)
	if email == "" || password == "" {
		return false, nil
	}

	count, err := s.repo.CountAdmins(ctx)
	if err != nil {
		return false, fmt.Errorf("count admins: %w", err)
	}
	if count > 0 {
		return false, nil
	}

	hash, err := crypto.HashPassword(password)
	if err != nil {
		return false, fmt.Errorf("hash password: %w", err)
	}
	_, err = s.repo.CreateUser(ctx, domain.NewUser{
		Email:        email,
		PasswordHash: hash,
		DisplayName:  displayName,
		Role:         domain.RoleAdmin,
	})
	if err != nil {
		// Админ с таким email уже существует — считаем бутстрап выполненным.
		if err == domain.ErrUserExists {
			return false, nil
		}
		return false, err
	}
	return true, nil
}
