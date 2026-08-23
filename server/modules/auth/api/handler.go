// Package api реализует Connect AuthService: маппинг proto ↔ domain и ошибок.
package api

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/auth/domain"
	"github.com/hema/server/modules/auth/service"
	"github.com/hema/server/pkg/connectutil"
	"github.com/hema/server/pkg/jwt"
)

// Handler адаптирует service.Service к Connect-интерфейсу AuthService.
type Handler struct {
	svc *service.Service
}

// NewHandler создаёт Connect-обработчик модуля auth.
func NewHandler(svc *service.Service) *Handler {
	return &Handler{svc: svc}
}

var _ hemav1connect.AuthServiceHandler = (*Handler)(nil)

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
	pair, err := h.svc.ChangePassword(ctx, token, m.CurrentPassword, m.NewPassword)
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

func toProtoUser(u domain.User) *hemav1.User {
	return &hemav1.User{
		Id:          u.ID,
		Email:       u.Email,
		DisplayName: u.DisplayName,
		CreatedAt:   timestamppb.New(u.CreatedAt),
		Role:        toProtoRole(u.Role),
		Club:        u.Club,
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
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}
