package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/pkg/crypto"
)

// RequestEmailChange запрашивает смену адреса учётки (FR-6). Требует
// текущий пароль — тем же приёмом, что и ChangePassword. Новый адрес
// должен быть свободен (FR-8, проверяется здесь и повторно в
// ConfirmEmailChange — за время ожидания его мог занять кто-то ещё).
// Письмо со ссылкой подтверждения уходит на новый адрес; письмо-
// предупреждение без ссылки — на прежний (FR-7), всегда, независимо от
// исхода первого письма.
func (s *Service) RequestEmailChange(ctx context.Context, userID, newEmail, currentPassword string) (domain.User, error) {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return domain.User{}, domain.ErrInvalidCredentials
	}
	_, hash, err := s.repo.GetCredentialsByEmail(ctx, user.Email)
	if err != nil {
		return domain.User{}, domain.ErrInvalidCredentials
	}
	ok, err := crypto.VerifyPassword(currentPassword, hash)
	if err != nil || !ok {
		return domain.User{}, domain.ErrInvalidCredentials
	}

	newEmail = normalizeEmail(newEmail)
	if err := validateEmail(newEmail); err != nil {
		return domain.User{}, err
	}

	taken, err := s.repo.IsEmailTaken(ctx, newEmail)
	if err != nil {
		return domain.User{}, fmt.Errorf("is email taken: %w", err)
	}
	if taken {
		return domain.User{}, domain.ErrEmailTaken
	}

	// Новый запрос гасит прежний неиспользованный (тем же приёмом, что и
	// в email-подтверждении) — на аккаунт действует не более одного
	// незавершённого запроса смены одновременно.
	if err := s.repo.InvalidateActiveEmailTokens(ctx, user.ID, domain.EmailTokenChange); err != nil {
		return domain.User{}, fmt.Errorf("invalidate active email tokens: %w", err)
	}

	rawToken, err := generateEmailToken()
	if err != nil {
		return domain.User{}, fmt.Errorf("generate email token: %w", err)
	}
	_, err = s.repo.CreateEmailToken(ctx, domain.NewEmailToken{
		UserID:    user.ID,
		Purpose:   domain.EmailTokenChange,
		TokenHash: hashEmailToken(rawToken),
		NewEmail:  newEmail,
		ExpiresAt: s.now().Add(s.emailTokenTTL),
	})
	if err != nil {
		return domain.User{}, fmt.Errorf("create email token: %w", err)
	}

	if err := s.repo.SetPendingEmail(ctx, user.ID, newEmail); err != nil {
		return domain.User{}, fmt.Errorf("set pending email: %w", err)
	}

	link := s.publicAppURL + "/email-change/confirm?token=" + rawToken
	if err := s.mailer.SendEmailChangeConfirmation(ctx, newEmail, link); err != nil {
		slog.Default().Error("request email change: send confirmation mail failed", "err", err)
	}
	// Предупреждение прежнему адресу не подчиняется настройкам уведомлений
	// (FR-7/FR-18) и уходит независимо от исхода письма выше.
	if err := s.mailer.SendEmailChangeNotice(ctx, user.Email, newEmail); err != nil {
		slog.Default().Error("request email change: send notice mail failed", "err", err)
	}

	return s.repo.GetUserByID(ctx, user.ID)
}

// ConfirmEmailChange подтверждает смену адреса по токену из письма,
// отправленного на новый адрес (FR-6). Занятость нового адреса проверяется
// повторно (FR-8): если за время ожидания его заняли — ErrEmailTaken,
// токен остаётся активным (не погашен), адрес учётки не меняется.
func (s *Service) ConfirmEmailChange(ctx context.Context, rawToken string) (domain.User, error) {
	token, err := s.repo.GetActiveEmailToken(ctx, hashEmailToken(rawToken), domain.EmailTokenChange)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidEmailToken) {
			return domain.User{}, domain.ErrInvalidEmailToken
		}
		return domain.User{}, fmt.Errorf("get active email token: %w", err)
	}

	taken, err := s.repo.IsEmailTaken(ctx, token.NewEmail)
	if err != nil {
		return domain.User{}, fmt.Errorf("is email taken: %w", err)
	}
	if taken {
		return domain.User{}, domain.ErrEmailTaken
	}

	if err := s.repo.MarkEmailTokenUsed(ctx, token.ID); err != nil {
		return domain.User{}, fmt.Errorf("mark email token used: %w", err)
	}

	user, err := s.repo.ApplyEmailChange(ctx, token.UserID, token.NewEmail, s.now())
	if err != nil {
		return domain.User{}, fmt.Errorf("apply email change: %w", err)
	}
	return user, nil
}

// CancelEmailChange отменяет незавершённый запрос смены адреса: гасит
// активный токен purpose=change и очищает PendingEmail.
func (s *Service) CancelEmailChange(ctx context.Context, userID string) (domain.User, error) {
	if err := s.repo.InvalidateActiveEmailTokens(ctx, userID, domain.EmailTokenChange); err != nil {
		return domain.User{}, fmt.Errorf("invalidate active email tokens: %w", err)
	}
	if err := s.repo.SetPendingEmail(ctx, userID, ""); err != nil {
		return domain.User{}, fmt.Errorf("set pending email: %w", err)
	}
	return s.repo.GetUserByID(ctx, userID)
}
