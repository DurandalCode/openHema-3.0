package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"log/slog"
	"time"

	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/pkg/crypto"
)

// resetThrottleWindow — минимальный интервал между письмами восстановления
// одному пользователю (FR-6).
const resetThrottleWindow = time.Minute

// RequestPasswordReset выдаёт ссылку восстановления и отправляет её на
// почту. Ответ не зависит от существования аккаунта (FR-2): несуществующий
// email, троттлинг (FR-6) и сбой отправки (NFR-2) — во всех случаях nil.
func (s *Service) RequestPasswordReset(ctx context.Context, email string) error {
	email = normalizeEmail(email)
	if email == "" {
		return nil
	}

	user, _, err := s.repo.GetCredentialsByEmail(ctx, email)
	if err != nil {
		// Аккаунта нет — тихий успех, ничего не раскрываем (FR-2).
		return nil
	}

	last, err := s.repo.LastResetTokenAt(ctx, user.ID)
	if err != nil {
		return fmt.Errorf("last reset token at: %w", err)
	}
	now := s.now()
	if !last.IsZero() && now.Sub(last) < resetThrottleWindow {
		// Повтор в пределах минуты — ответ прежний, письма нет (FR-6).
		return nil
	}

	if err := s.repo.InvalidateActiveResetTokens(ctx, user.ID); err != nil {
		return fmt.Errorf("invalidate active reset tokens: %w", err)
	}

	rawToken, err := generateResetToken()
	if err != nil {
		return fmt.Errorf("generate reset token: %w", err)
	}

	_, err = s.repo.CreateResetToken(ctx, domain.NewResetToken{
		UserID:    user.ID,
		TokenHash: hashResetToken(rawToken),
		ExpiresAt: now.Add(s.resetTTL),
	})
	if err != nil {
		return fmt.Errorf("create reset token: %w", err)
	}

	link := s.publicAppURL + "/reset-password?token=" + rawToken
	if err := s.mailer.SendPasswordReset(ctx, user.Email, link); err != nil {
		// Сбой отправки не меняет ответ гостю (FR-2), но идёт в журнал —
		// иначе по поведению системы читалось бы существование адреса (NFR-2).
		slog.Default().Error("password reset: send mail failed", "err", err)
	}
	return nil
}

// ResetPassword задаёт новый пароль по одноразовому токену из письма.
// Сессию не выдаёт (FR-7) — дальше обычный вход. Недействительный токен
// (не найден/просрочен/погашен) даёт один и тот же ErrInvalidResetToken,
// не раскрывающий причину (FR-8).
func (s *Service) ResetPassword(ctx context.Context, rawToken, newPassword string) error {
	if err := validatePassword(newPassword); err != nil {
		return err
	}

	token, err := s.repo.GetActiveResetToken(ctx, hashResetToken(rawToken))
	if err != nil {
		return domain.ErrInvalidResetToken
	}

	hash, err := crypto.HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	if err := s.repo.UpdatePassword(ctx, token.UserID, hash); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	if err := s.repo.MarkResetTokenUsed(ctx, token.ID); err != nil {
		return fmt.Errorf("mark reset token used: %w", err)
	}
	return nil
}

// generateResetToken генерирует 32 случайных байта (crypto/rand) и кодирует
// их base64url без паддинга — компактный, URL-безопасный сырой токен.
func generateResetToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// hashResetToken возвращает sha256-хеш сырого токена в hex. В репозитории
// хранится только этот хеш (NFR-1) — сырой токен живёт лишь в письме.
func hashResetToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
