package api

import (
	"context"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/auth/service"
	"github.com/hema/server/pkg/connectutil"
)

// AdminHandler реализует Connect AdminServiceHandler. Доступ ограничен
// интерсептором RequireAdmin (монтируется в module.Register).
type AdminHandler struct {
	svc *service.Service
}

// NewAdminHandler создаёт Connect-обработчик admin-операций.
func NewAdminHandler(svc *service.Service) *AdminHandler {
	return &AdminHandler{svc: svc}
}

var _ hemav1connect.AdminServiceHandler = (*AdminHandler)(nil)

// CreateAdmin создаёт нового администратора.
func (h *AdminHandler) CreateAdmin(
	ctx context.Context,
	req *connect.Request[hemav1.CreateAdminRequest],
) (*connect.Response[hemav1.CreateAdminResponse], error) {
	m := req.Msg
	user, err := h.svc.CreateAdmin(ctx, m.Email, m.Password, m.DisplayName)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.CreateAdminResponse{
		User: toProtoUser(user),
	}), nil
}

// ListAdmins возвращает всех администраторов.
func (h *AdminHandler) ListAdmins(
	ctx context.Context,
	req *connect.Request[hemav1.ListAdminsRequest],
) (*connect.Response[hemav1.ListAdminsResponse], error) {
	admins, err := h.svc.ListAdmins(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*hemav1.User, 0, len(admins))
	for _, a := range admins {
		out = append(out, toProtoUser(a))
	}
	return connect.NewResponse(&hemav1.ListAdminsResponse{Admins: out}), nil
}

// ListUsers возвращает всех пользователей с постраничной навигацией.
func (h *AdminHandler) ListUsers(
	ctx context.Context,
	req *connect.Request[hemav1.ListUsersRequest],
) (*connect.Response[hemav1.ListUsersResponse], error) {
	users, err := h.svc.ListUsers(ctx, req.Msg.Limit, req.Msg.Offset)
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*hemav1.User, 0, len(users))
	for _, u := range users {
		out = append(out, toProtoUser(u))
	}
	return connect.NewResponse(&hemav1.ListUsersResponse{Users: out}), nil
}

// PromoteUser повышает пользователя до роли admin.
func (h *AdminHandler) PromoteUser(
	ctx context.Context,
	req *connect.Request[hemav1.PromoteUserRequest],
) (*connect.Response[hemav1.PromoteUserResponse], error) {
	user, err := h.svc.PromoteUser(ctx, req.Msg.UserId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.PromoteUserResponse{
		User: toProtoUser(user),
	}), nil
}

// DemoteUser понижает админа до роли user. callerID берётся из контекста
// (положен интерсептором Auth из JWT-клейма).
func (h *AdminHandler) DemoteUser(
	ctx context.Context,
	req *connect.Request[hemav1.DemoteUserRequest],
) (*connect.Response[hemav1.DemoteUserResponse], error) {
	callerID := connectutil.CallerID(ctx)
	user, err := h.svc.DemoteUser(ctx, req.Msg.UserId, callerID)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.DemoteUserResponse{
		User: toProtoUser(user),
	}), nil
}
