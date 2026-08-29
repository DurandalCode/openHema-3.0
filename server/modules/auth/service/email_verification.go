package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/hema/server/modules/auth/domain"
)

// emailThrottleWindow — минимальный интервал между письмами подтверждения/
// смены адреса одному пользователю (FR-4/FR-6, тот же троттлинг, что и у
// сброса пароля, спека 0037).
const emailThrottleWindow = time.Minute

// SendVerification создаёт токен подтверждения текущего адреса и
// отправляет письмо. Вызывается изнутри Register сразу после создания
// пользователя. Ошибка отправки не пробрасывается наружу (почта — побочный
// эффект, тем же приёмом, что и RequestPasswordReset, NFR-2) — логируется.
func (s *Service) SendVerification(ctx context.Context, userID string) error {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return fmt.Errorf("get user by id: %w", err)
	}

	rawToken, err := generateEmailToken()
	if err != nil {
		return fmt.Errorf("generate email token: %w", err)
	}

	_, err = s.repo.CreateEmailToken(ctx, domain.NewEmailToken{
		UserID:    user.ID,
		Purpose:   domain.EmailTokenVerify,
		TokenHash: hashEmailToken(rawToken),
		ExpiresAt: s.now().Add(s.emailTokenTTL),
	})
	if err != nil {
		return fmt.Errorf("create email token: %w", err)
	}

	link := s.publicAppURL + "/verify-email?token=" + rawToken
	if err := s.mailer.SendEmailVerification(ctx, user.Email, link); err != nil {
		// Сбой отправки не должен ронять вызывающий юзкейс (регистрацию) —
		// идёт в журнал, как и в RequestPasswordReset (NFR-2).
		slog.Default().Error("send verification: send mail failed", "err", err)
	}
	return nil
}

// VerifyEmail подтверждает адрес по одноразовому токену из письма (FR-3).
// Недействительный токен (не найден/просрочен/погашен) даёт один и тот же
// ErrInvalidEmailToken, не раскрывающий причину — тем же приёмом, что и
// ResetPassword (спека 0037, FR-8).
func (s *Service) VerifyEmail(ctx context.Context, rawToken string) error {
	token, err := s.repo.GetActiveEmailToken(ctx, hashEmailToken(rawToken), domain.EmailTokenVerify)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidEmailToken) {
			return domain.ErrInvalidEmailToken
		}
		return fmt.Errorf("get active email token: %w", err)
	}

	if err := s.repo.MarkEmailVerified(ctx, token.UserID, s.now()); err != nil {
		return fmt.Errorf("mark email verified: %w", err)
	}
	if err := s.repo.MarkEmailTokenUsed(ctx, token.ID); err != nil {
		return fmt.Errorf("mark email token used: %w", err)
	}
	return nil
}

// ResendEmailVerification отправляет письмо подтверждения повторно (FR-4).
// Троттлинг — не чаще раза в минуту с момента последней выдачи (в т.ч.
// погашенной). Новый запрос гасит прежний неиспользованный токен (FR-5,
// тем же приёмом, что и RequestPasswordReset).
func (s *Service) ResendEmailVerification(ctx context.Context, userID string) error {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return fmt.Errorf("get user by id: %w", err)
	}

	last, err := s.repo.LastEmailTokenAt(ctx, user.ID, domain.EmailTokenVerify)
	if err != nil {
		return fmt.Errorf("last email token at: %w", err)
	}
	now := s.now()
	if !last.IsZero() && now.Sub(last) < emailThrottleWindow {
		return domain.ErrThrottled
	}

	if err := s.repo.InvalidateActiveEmailTokens(ctx, user.ID, domain.EmailTokenVerify); err != nil {
		return fmt.Errorf("invalidate active email tokens: %w", err)
	}

	rawToken, err := generateEmailToken()
	if err != nil {
		return fmt.Errorf("generate email token: %w", err)
	}

	_, err = s.repo.CreateEmailToken(ctx, domain.NewEmailToken{
		UserID:    user.ID,
		Purpose:   domain.EmailTokenVerify,
		TokenHash: hashEmailToken(rawToken),
		ExpiresAt: now.Add(s.emailTokenTTL),
	})
	if err != nil {
		return fmt.Errorf("create email token: %w", err)
	}

	link := s.publicAppURL + "/verify-email?token=" + rawToken
	if err := s.mailer.SendEmailVerification(ctx, user.Email, link); err != nil {
		slog.Default().Error("resend email verification: send mail failed", "err", err)
	}
	return nil
}

// generateEmailToken генерирует 32 случайных байта (crypto/rand) и кодирует
// их base64url без паддинга — компактный, URL-безопасный сырой токен.
// Отдельная функция от generateResetToken (password_reset.go): та же
// реализация, но своё семейство токенов (email_tokens, не
// password_reset_tokens) — см. domain.EmailToken.
func generateEmailToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// hashEmailToken возвращает sha256-хеш сырого токена в hex. В репозитории
// хранится только этот хеш (NFR-1) — сырой токен живёт лишь в письме.
func hashEmailToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
