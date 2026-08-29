// Package api реализует Connect AuthService: маппинг proto ↔ domain и ошибок.
package api

import (
	"context"
	"errors"
	"net/http"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/modules/auth/service"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
)

// currentSessionHeader — заголовок, которым BFF передаёт refresh-токен
// текущего запроса для эндпоинтов, которым нужно знать "текущую" сессию
// вызывающего (см. currentSessionID ниже и service.SessionIDFromRefreshToken).
const currentSessionHeader = "X-Refresh-Token"

// Handler адаптирует service.Service к Connect-интерфейсу AuthService.
type Handler struct {
	svc *service.Service
}

// NewHandler создаёт Connect-обработчик модуля auth.
func NewHandler(svc *service.Service) *Handler {
	return &Handler{svc: svc}
}

var _ hemav1connect.AuthServiceHandler = (*Handler)(nil)

// currentSessionID резолвит id сессии вызывающего запроса из заголовка
// currentSessionHeader (пустая строка — заголовок отсутствует или токен в
// нём невалиден: сервис в этом случае деградирует, а не отказывает).
func (h *Handler) currentSessionID(header http.Header) string {
	return h.svc.SessionIDFromRefreshToken(header.Get(currentSessionHeader))
}

// Register обрабатывает регистрацию.
func (h *Handler) Register(
	ctx context.Context,
	req *connect.Request[hemav1.RegisterRequest],
) (*connect.Response[hemav1.RegisterResponse], error) {
	m := req.Msg
	user, tokens, err := h.svc.Register(ctx, m.Email, m.Password, m.DisplayName)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.RegisterResponse{
		User:   toProtoUser(user),
		Tokens: toProtoTokens(tokens),
	}), nil
}

// Login обрабатывает вход.
func (h *Handler) Login(
	ctx context.Context,
	req *connect.Request[hemav1.LoginRequest],
) (*connect.Response[hemav1.LoginResponse], error) {
	m := req.Msg
	user, tokens, err := h.svc.Login(ctx, m.Email, m.Password)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.LoginResponse{
		User:   toProtoUser(user),
		Tokens: toProtoTokens(tokens),
	}), nil
}

// Refresh обменивает refresh-токен на новую пару.
func (h *Handler) Refresh(
	ctx context.Context,
	req *connect.Request[hemav1.RefreshRequest],
) (*connect.Response[hemav1.RefreshResponse], error) {
	tokens, err := h.svc.Refresh(ctx, req.Msg.RefreshToken)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.RefreshResponse{
		Tokens: toProtoTokens(tokens),
	}), nil
}

// Me возвращает текущего пользователя. Access-токен — в заголовке Authorization.
func (h *Handler) Me(
	ctx context.Context,
	req *connect.Request[hemav1.MeRequest],
) (*connect.Response[hemav1.MeResponse], error) {
	token := connectutil.BearerToken(req.Header())
	if token == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, domain.ErrInvalidCredentials)
	}
	user, err := h.svc.Me(ctx, token)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.MeResponse{User: toProtoUser(user)}), nil
}

// RequestPasswordReset выдаёт ссылку восстановления и отправляет её на
// почту. Публичный RPC — ответ не зависит от существования аккаунта (FR-2).
func (h *Handler) RequestPasswordReset(
	ctx context.Context,
	req *connect.Request[hemav1.RequestPasswordResetRequest],
) (*connect.Response[hemav1.RequestPasswordResetResponse], error) {
	if err := h.svc.RequestPasswordReset(ctx, req.Msg.Email); err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.RequestPasswordResetResponse{}), nil
}

// ResetPassword задаёт новый пароль по одноразовому токену из письма.
// Публичный RPC. Сессию не выдаёт (спека 0037, решение 5).
func (h *Handler) ResetPassword(
	ctx context.Context,
	req *connect.Request[hemav1.ResetPasswordRequest],
) (*connect.Response[hemav1.ResetPasswordResponse], error) {
	m := req.Msg
	if err := h.svc.ResetPassword(ctx, m.Token, m.NewPassword); err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ResetPasswordResponse{}), nil
}

// ChangePassword меняет пароль залогиненного пользователя. Access-токен —
// в заголовке Authorization, тем же приёмом, что и в Me.
func (h *Handler) ChangePassword(
	ctx context.Context,
	req *connect.Request[hemav1.ChangePasswordRequest],
) (*connect.Response[hemav1.ChangePasswordResponse], error) {
	token := connectutil.BearerToken(req.Header())
	if token == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, domain.ErrInvalidCredentials)
	}
	m := req.Msg
	currentSessionID := h.currentSessionID(req.Header())
	pair, err := h.svc.ChangePassword(ctx, token, m.CurrentPassword, m.NewPassword, currentSessionID)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ChangePasswordResponse{
		Tokens: toProtoTokens(pair),
	}), nil
}

// UpdateProfile правит отображаемое имя и клуб текущего пользователя.
// Access-токен — в заголовке Authorization, тем же приёмом, что и в Me.
func (h *Handler) UpdateProfile(
	ctx context.Context,
	req *connect.Request[hemav1.UpdateProfileRequest],
) (*connect.Response[hemav1.UpdateProfileResponse], error) {
	token := connectutil.BearerToken(req.Header())
	if token == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, domain.ErrInvalidCredentials)
	}
	m := req.Msg
	user, err := h.svc.UpdateProfile(ctx, token, m.DisplayName, m.Club)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.UpdateProfileResponse{
		User: toProtoUser(user),
	}), nil
}

// VerifyEmail подтверждает адрес по одноразовому токену из письма (FR-3).
// Публичный RPC — переход по ссылке может случиться без активной сессии в
// этом браузере.
func (h *Handler) VerifyEmail(
	ctx context.Context,
	req *connect.Request[hemav1.VerifyEmailRequest],
) (*connect.Response[hemav1.VerifyEmailResponse], error) {
	if err := h.svc.VerifyEmail(ctx, req.Msg.Token); err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.VerifyEmailResponse{}), nil
}

// ResendEmailVerification отправляет письмо подтверждения повторно (FR-4).
func (h *Handler) ResendEmailVerification(
	ctx context.Context,
	req *connect.Request[hemav1.ResendEmailVerificationRequest],
) (*connect.Response[hemav1.ResendEmailVerificationResponse], error) {
	if err := h.svc.ResendEmailVerification(ctx, connectutil.CallerID(ctx)); err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ResendEmailVerificationResponse{}), nil
}

// RequestEmailChange запрашивает смену адреса учётки (FR-6). Требует
// текущий пароль.
func (h *Handler) RequestEmailChange(
	ctx context.Context,
	req *connect.Request[hemav1.RequestEmailChangeRequest],
) (*connect.Response[hemav1.RequestEmailChangeResponse], error) {
	m := req.Msg
	user, err := h.svc.RequestEmailChange(ctx, connectutil.CallerID(ctx), m.NewEmail, m.CurrentPassword)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.RequestEmailChangeResponse{User: toProtoUser(user)}), nil
}

// ConfirmEmailChange подтверждает смену адреса по токену из письма,
// отправленного на новый адрес (FR-6). Публичный RPC — как VerifyEmail.
func (h *Handler) ConfirmEmailChange(
	ctx context.Context,
	req *connect.Request[hemav1.ConfirmEmailChangeRequest],
) (*connect.Response[hemav1.ConfirmEmailChangeResponse], error) {
	user, err := h.svc.ConfirmEmailChange(ctx, req.Msg.Token)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ConfirmEmailChangeResponse{User: toProtoUser(user)}), nil
}

// CancelEmailChange отменяет незавершённый запрос смены адреса.
func (h *Handler) CancelEmailChange(
	ctx context.Context,
	req *connect.Request[hemav1.CancelEmailChangeRequest],
) (*connect.Response[hemav1.CancelEmailChangeResponse], error) {
	user, err := h.svc.CancelEmailChange(ctx, connectutil.CallerID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.CancelEmailChangeResponse{User: toProtoUser(user)}), nil
}

// UpdateNotificationSettings правит личные переключатели уведомлений
// текущего пользователя (FR-20). Включение вида при неподтверждённом
// адресе отклоняется (FR-21).
func (h *Handler) UpdateNotificationSettings(
	ctx context.Context,
	req *connect.Request[hemav1.UpdateNotificationSettingsRequest],
) (*connect.Response[hemav1.UpdateNotificationSettingsResponse], error) {
	var settings domain.NotificationSettings
	if s := req.Msg.Settings; s != nil {
		settings = domain.NotificationSettings{
			ApplicationState: s.ApplicationState,
			PoolSeated:       s.PoolSeated,
		}
	}
	user, err := h.svc.UpdateNotificationSettings(ctx, connectutil.CallerID(ctx), settings)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.UpdateNotificationSettingsResponse{User: toProtoUser(user)}), nil
}

// ListSessions возвращает активные сессии текущего пользователя (FR-11).
func (h *Handler) ListSessions(
	ctx context.Context,
	req *connect.Request[hemav1.ListSessionsRequest],
) (*connect.Response[hemav1.ListSessionsResponse], error) {
	sessions, err := h.svc.ListSessions(ctx, connectutil.CallerID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	current := h.currentSessionID(req.Header())
	out := make([]*hemav1.Session, 0, len(sessions))
	for _, s := range sessions {
		out = append(out, toProtoSession(s, current))
	}
	return connect.NewResponse(&hemav1.ListSessionsResponse{Sessions: out}), nil
}

// RevokeSession завершает одну сессию пользователя по id (FR-12). Чужая
// сессия — PermissionDenied.
func (h *Handler) RevokeSession(
	ctx context.Context,
	req *connect.Request[hemav1.RevokeSessionRequest],
) (*connect.Response[hemav1.RevokeSessionResponse], error) {
	if err := h.svc.RevokeSession(ctx, connectutil.CallerID(ctx), req.Msg.SessionId); err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.RevokeSessionResponse{}), nil
}

// RevokeOtherSessions завершает все сессии пользователя, кроме текущей
// («выйти со всех устройств», FR-12).
func (h *Handler) RevokeOtherSessions(
	ctx context.Context,
	req *connect.Request[hemav1.RevokeOtherSessionsRequest],
) (*connect.Response[hemav1.RevokeOtherSessionsResponse], error) {
	current := h.currentSessionID(req.Header())
	n, err := h.svc.RevokeOtherSessions(ctx, connectutil.CallerID(ctx), current)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.RevokeOtherSessionsResponse{RevokedCount: int32(n)}), nil
}

// Logout завершает текущую сессию на сервере (FR-13), а не только стирает
// cookie в браузере. Идемпотентен.
func (h *Handler) Logout(
	ctx context.Context,
	req *connect.Request[hemav1.LogoutRequest],
) (*connect.Response[hemav1.LogoutResponse], error) {
	if err := h.svc.Logout(ctx, req.Msg.RefreshToken); err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.LogoutResponse{}), nil
}

func toProtoUser(u domain.User) *hemav1.User {
	return &hemav1.User{
		Id:            u.ID,
		Email:         u.Email,
		DisplayName:   u.DisplayName,
		CreatedAt:     timestamppb.New(u.CreatedAt),
		Role:          toProtoRole(u.Role),
		Club:          u.Club,
		EmailVerified: u.EmailVerifiedAt != nil,
		PendingEmail:  u.PendingEmail,
		Notifications: &hemav1.NotificationSettings{
			ApplicationState: u.Notifications.ApplicationState,
			PoolSeated:       u.Notifications.PoolSeated,
		},
	}
}

// toProtoSession адаптирует domain.Session к proto: "текущая" — не
// доменное поле, а сравнение с currentID, резолвленным api-слоем из
// заголовка запроса (см. Handler.currentSessionID).
func toProtoSession(s domain.Session, currentID string) *hemav1.Session {
	return &hemav1.Session{
		Id:         s.ID,
		CreatedAt:  timestamppb.New(s.CreatedAt),
		LastSeenAt: timestamppb.New(s.LastSeenAt),
		Current:    currentID != "" && s.ID == currentID,
	}
}

func toProtoRole(r domain.Role) hemav1.Role {
	switch r {
	case domain.RoleAdmin:
		return hemav1.Role_ROLE_ADMIN
	case domain.RoleUser:
		return hemav1.Role_ROLE_USER
	default:
		return hemav1.Role_ROLE_UNSPECIFIED
	}
}

func toProtoTokens(p jwt.Pair) *hemav1.TokenPair {
	return &hemav1.TokenPair{
		AccessToken:  p.Access,
		RefreshToken: p.Refresh,
	}
}

// mapError переводит доменные ошибки в connect.Code.
func mapError(err error) error {
	switch {
	case errors.Is(err, domain.ErrUserExists):
		return connect.NewError(connect.CodeAlreadyExists, err)
	case errors.Is(err, domain.ErrInvalidCredentials):
		return connect.NewError(connect.CodeUnauthenticated, err)
	case errors.Is(err, domain.ErrUserNotFound):
		return connect.NewError(connect.CodeUnauthenticated, domain.ErrInvalidCredentials)
	case errors.Is(err, domain.ErrForbidden):
		return connect.NewError(connect.CodePermissionDenied, err)
	case errors.Is(err, domain.ErrInvalidResetToken):
		// Не CodeNotFound: код не должен различать «нет токена» и
		// «просрочен» — оба раскрывали бы больше, чем FR-8 разрешает.
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, domain.ErrWeakPassword):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, domain.ErrInvalidProfile):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, domain.ErrInvalidEmail):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, domain.ErrInvalidEmailToken):
		// Тем же приёмом, что и ErrInvalidResetToken выше — один код на
		// «не найден/просрочен/погашен» (FR-8).
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, domain.ErrEmailTaken):
		return connect.NewError(connect.CodeAlreadyExists, err)
	case errors.Is(err, domain.ErrEmailNotVerified):
		return connect.NewError(connect.CodeFailedPrecondition, err)
	case errors.Is(err, domain.ErrSessionNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, domain.ErrThrottled):
		return connect.NewError(connect.CodeResourceExhausted, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}
