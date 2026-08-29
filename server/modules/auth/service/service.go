// Package service содержит бизнес-логику модуля auth (юзкейсы).
package service

import (
	"context"
	"fmt"
	"log/slog"
	"net/mail"
	"strings"
	"time"

	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/pkg/crypto"
	"github.com/hema/server/pkg/jwt"
)

// Service реализует юзкейсы аутентификации. Зависит от портов, не от pg/proto.
type Service struct {
	repo   domain.Repository
	tokens *jwt.Manager
	mailer domain.Mailer
	// publicAppURL — базовый URL публичного веб-приложения, используется для
	// сборки ссылки восстановления пароля (publicAppURL + "/reset-password?token=...").
	publicAppURL string
	// resetTTL — срок жизни токена восстановления пароля (спека 0037, FR-4).
	resetTTL time.Duration
	// emailTokenTTL — срок жизни токена подтверждения/смены адреса (спека
	// 0042, FR-3/FR-6).
	emailTokenTTL time.Duration
	// sessionTTL — срок жизни строки реестра сессий (ADR 0018). Равен TTL
	// refresh-токена: сессия не должна пережить токен, который её несёт,
	// и не должна истечь раньше него.
	sessionTTL time.Duration
	// now — источник текущего времени; параметризован ради детерминизма
	// тестов на TTL/троттлинг сброса пароля.
	now func() time.Time
}

// New создаёт сервис auth.
func New(repo domain.Repository, tokens *jwt.Manager, mailer domain.Mailer, publicAppURL string, resetTTL, emailTokenTTL, sessionTTL time.Duration, now func() time.Time) *Service {
	return &Service{
		repo:          repo,
		tokens:        tokens,
		mailer:        mailer,
		publicAppURL:  publicAppURL,
		resetTTL:      resetTTL,
		emailTokenTTL: emailTokenTTL,
		sessionTTL:    sessionTTL,
		now:           now,
	}
}

// Register создаёт пользователя (роль user), хеширует пароль и выпускает токены.
func (s *Service) Register(ctx context.Context, email, password, displayName string) (domain.User, jwt.Pair, error) {
	email = normalizeEmail(email)
	if email == "" || password == "" {
		return domain.User{}, jwt.Pair{}, domain.ErrInvalidCredentials
	}

	user, err := s.createUser(ctx, email, password, displayName, domain.RoleUser)
	if err != nil {
		return domain.User{}, jwt.Pair{}, err
	}

	// Письмо подтверждения — побочный эффект регистрации (спека 0042,
	// FR-3): его сбой (в т.ч. на уровне создания токена, не только
	// отправки) не должен ронять уже успешно созданную учётку.
	if err := s.SendVerification(ctx, user.ID); err != nil {
		slog.Default().Error("register: send verification failed", "err", err)
	}

	pair, err := s.issueWithNewSession(ctx, user)
	if err != nil {
		return domain.User{}, jwt.Pair{}, err
	}
	return user, pair, nil
}

// Login проверяет учётные данные и выпускает токены с актуальной ролью из БД.
func (s *Service) Login(ctx context.Context, email, password string) (domain.User, jwt.Pair, error) {
	email = normalizeEmail(email)

	user, hash, err := s.repo.GetCredentialsByEmail(ctx, email)
	if err != nil {
		// Не раскрываем, существует ли пользователь.
		return domain.User{}, jwt.Pair{}, domain.ErrInvalidCredentials
	}

	ok, err := crypto.VerifyPassword(password, hash)
	if err != nil || !ok {
		return domain.User{}, jwt.Pair{}, domain.ErrInvalidCredentials
	}

	pair, err := s.issueWithNewSession(ctx, user)
	if err != nil {
		return domain.User{}, jwt.Pair{}, err
	}
	return user, pair, nil
}

// issueWithNewSession создаёт новую строку реестра сессий (ADR 0018,
// каждая выдача сессии — вход, регистрация — создаёт запись, FR-10) и
// выпускает пару токенов с её id в клейме sid refresh-токена.
func (s *Service) issueWithNewSession(ctx context.Context, user domain.User) (jwt.Pair, error) {
	session, err := s.repo.CreateSession(ctx, domain.NewSession{
		UserID:    user.ID,
		ExpiresAt: s.now().Add(s.sessionTTL),
	})
	if err != nil {
		return jwt.Pair{}, fmt.Errorf("create session: %w", err)
	}
	pair, err := s.tokens.Issue(user.ID, string(user.Role), session.ID)
	if err != nil {
		return jwt.Pair{}, fmt.Errorf("issue tokens: %w", err)
	}
	return pair, nil
}

// Refresh обменивает валидный refresh-токен на новую пару токенов.
// Роль берётся из БД (а не из refresh-клейма), чтобы учесть её изменение.
// Токен, выданный до последней смены/сброса пароля, отклоняется (FR-12,
// спека 0037): продлить старую сессию нельзя, требуется вход заново.
func (s *Service) Refresh(ctx context.Context, refreshToken string) (jwt.Pair, error) {
	claims, err := s.tokens.ParseRefresh(refreshToken)
	if err != nil {
		return jwt.Pair{}, domain.ErrInvalidCredentials
	}
	// Токен без sid — выпущен до внедрения реестра сессий (ADR 0018, п.4:
	// "Судьба уже выданных токенов без sid") — трактуется как невалидный,
	// пользователь входит заново, ровно как если бы refresh истёк.
	if claims.SessionID == "" {
		return jwt.Pair{}, domain.ErrInvalidCredentials
	}
	session, err := s.repo.GetSession(ctx, claims.SessionID)
	if err != nil {
		return jwt.Pair{}, domain.ErrInvalidCredentials
	}
	now := s.now()
	// Отозванная (поштучно, "выйти со всех устройств", смена/сброс пароля)
	// или просроченная сессия не продлевается (ADR 0018, п.2).
	if session.RevokedAt != nil || now.After(session.ExpiresAt) {
		return jwt.Pair{}, domain.ErrInvalidCredentials
	}
	user, err := s.repo.GetUserByID(ctx, claims.UserID)
	if err != nil {
		return jwt.Pair{}, domain.ErrInvalidCredentials
	}
	// iat в JWT хранится в целых секундах — усекаем PasswordChangedAt до
	// секунды тоже, иначе токен, выданный Login сразу после сброса в ту же
	// секунду, отклонялся бы сам собой. Равенство считается валидным,
	// отклоняется только строго более раннее issued_at.
	if claims.IssuedAt != nil && claims.IssuedAt.Time.Before(user.PasswordChangedAt.Truncate(time.Second)) {
		return jwt.Pair{}, domain.ErrInvalidCredentials
	}
	if err := s.repo.TouchSession(ctx, session.ID, now); err != nil {
		return jwt.Pair{}, fmt.Errorf("touch session: %w", err)
	}
	// sid сохраняется — Refresh продлевает существующую сессию, не создаёт
	// новую строку реестра (ADR 0018).
	pair, err := s.tokens.Issue(user.ID, string(user.Role), session.ID)
	if err != nil {
		return jwt.Pair{}, fmt.Errorf("issue tokens: %w", err)
	}
	return pair, nil
}

// Me возвращает пользователя по валидному access-токену.
func (s *Service) Me(ctx context.Context, accessToken string) (domain.User, error) {
	claims, err := s.tokens.ParseAccess(accessToken)
	if err != nil {
		return domain.User{}, domain.ErrInvalidCredentials
	}
	return s.repo.GetUserByID(ctx, claims.UserID)
}

// DisplayNames возвращает батч отображаемых имён пользователей по набору id.
// Межмодульная точка входа для UserProvider других модулей (напр.
// application, ADR 0002): неизвестные/недоступные id просто отсутствуют в
// результате — не ошибка.
func (s *Service) DisplayNames(ctx context.Context, ids []string) (map[string]string, error) {
	if len(ids) == 0 {
		return map[string]string{}, nil
	}
	users, err := s.repo.GetUsersByIDs(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("get users by ids: %w", err)
	}
	out := make(map[string]string, len(users))
	for _, u := range users {
		out[u.ID] = u.DisplayName
	}
	return out, nil
}

// createUser проверяет формат email и политику пароля (FR-11), хеширует
// пароль и делегирует вставку репозиторию. Общая точка для Register,
// CreateAdmin и bootstrap — единая валидация действует одинаково во всех
// сценариях создания пользователя. Валидация email здесь (а не только на
// входе Register) закрывает SMTP header injection у корня: письмо
// восстановления позже уходит на user.Email, прочитанный из БД, а не на
// сырой ввод запроса (см. RequestPasswordReset) — значит единственный
// надёжный момент отбраковать вредоносный адрес — здесь, перед вставкой.
func (s *Service) createUser(ctx context.Context, email, password, displayName string, role domain.Role) (domain.User, error) {
	if err := validateEmail(email); err != nil {
		return domain.User{}, err
	}
	if err := validatePassword(password); err != nil {
		return domain.User{}, err
	}
	if err := validateProfileField(displayName); err != nil {
		return domain.User{}, err
	}
	hash, err := crypto.HashPassword(password)
	if err != nil {
		return domain.User{}, fmt.Errorf("hash password: %w", err)
	}
	user, err := s.repo.CreateUser(ctx, domain.NewUser{
		Email:        email,
		PasswordHash: hash,
		DisplayName:  displayName,
		Role:         role,
	})
	if err != nil {
		return domain.User{}, err
	}
	return user, nil
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// validateEmail отклоняет CR/LF (SMTP header injection, см. createUser) и
// адреса, не проходящие базовый RFC 5322-разбор (net/mail.ParseAddress).
func validateEmail(email string) error {
	if strings.ContainsAny(email, "\r\n") {
		return domain.ErrInvalidEmail
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return domain.ErrInvalidEmail
	}
	return nil
}
