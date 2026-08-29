package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/hema/server/modules/auth/domain"
)

// ListSessions возвращает активные сессии пользователя (FR-11). Отметка
// «текущая» — не доменное поле (domain.Session её не несёт): она чисто
// презентационная и вычисляется в api-слое сравнением id с сессией
// вызывающего запроса (см. api/handler.go, toProtoSession) — так же, как
// сравнение делает Connect-хендлер для любого другого запрос-специфичного
// признака.
func (s *Service) ListSessions(ctx context.Context, userID string) ([]domain.Session, error) {
	sessions, err := s.repo.ListActiveSessions(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list active sessions: %w", err)
	}
	return sessions, nil
}

// RevokeSession завершает одну сессию пользователя по id (FR-12). Чужая
// сессия — ErrForbidden (FR-17: реестр сессий не даёт увидеть/погасить
// сессию другого пользователя). Уже отозванная/просроченная сессия
// погашается идемпотентно (не ошибка).
func (s *Service) RevokeSession(ctx context.Context, userID, sessionID string) error {
	session, err := s.repo.GetSession(ctx, sessionID)
	if err != nil {
		return err
	}
	if session.UserID != userID {
		return domain.ErrForbidden
	}
	if err := s.repo.RevokeSession(ctx, sessionID, s.now()); err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	return nil
}

// RevokeOtherSessions завершает все сессии пользователя, кроме текущей
// («выйти со всех устройств», FR-12). currentSessionID приходит от
// вызывающего (api-слой резолвит его из refresh-токена текущего запроса —
// access-токен клейма sid не несёт, ADR 0018); пустая строка — сервер не
// смог определить текущую сессию и гасит все.
func (s *Service) RevokeOtherSessions(ctx context.Context, userID, currentSessionID string) (int, error) {
	n, err := s.repo.RevokeUserSessions(ctx, userID, currentSessionID, s.now())
	if err != nil {
		return 0, fmt.Errorf("revoke user sessions: %w", err)
	}
	return n, nil
}

// Logout завершает текущую сессию на сервере (FR-13), а не только стирает
// cookie в браузере. Идемпотентен: невалидный/безсессионный refresh-токен,
// уже отозванная или несуществующая сессия — не ошибка, тем же приёмом,
// что и ResetPassword/ResendEmailVerification трактуют «уже неактивно» как
// успех, а не как отказ.
func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	claims, err := s.tokens.ParseRefresh(refreshToken)
	if err != nil || claims.SessionID == "" {
		return nil
	}
	if _, err := s.repo.GetSession(ctx, claims.SessionID); err != nil {
		if errors.Is(err, domain.ErrSessionNotFound) {
			return nil
		}
		return fmt.Errorf("get session: %w", err)
	}
	if err := s.repo.RevokeSession(ctx, claims.SessionID, s.now()); err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	return nil
}

// SessionIDFromRefreshToken декодирует sid из refresh-токена, не проверяя
// активность самой сессии в реестре. Точка входа для api-слоя: сигнатуры
// ChangePasswordRequest/ListSessionsRequest/RevokeOtherSessionsRequest не
// несут id сессии (протокол заморожен волной 0, см. proto/hema/v1/auth.proto),
// а access-токен клейма sid не несёт (ADR 0018) — значит "текущую" сессию
// вызывающего запроса можно узнать только из его refresh-токена. BFF
// прокидывает его отдельным заголовком (тем же приёмом, что и
// LogoutRequest.refresh_token, только транспортом, не телом сообщения).
// Пустая строка при пустом/невалидном/безсессионном токене — вызывающие
// юзкейсы одинаково трактуют "не смогли определить" как отсутствие
// текущей сессии, плавно деградируя, а не отказывая.
func (s *Service) SessionIDFromRefreshToken(refreshToken string) string {
	if refreshToken == "" {
		return ""
	}
	claims, err := s.tokens.ParseRefresh(refreshToken)
	if err != nil {
		return ""
	}
	return claims.SessionID
}
