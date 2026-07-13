// Package api реализует Connect ArenaAdminService: маппинг proto ↔ domain и
// ошибок. Домен админский — публичного сервиса нет (публичное чтение появится
// вместе с боями/расписанием, см. spec 0008 «Вне скоупа»).
package api

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/arena/domain"
	"github.com/hema/server/modules/arena/service"
)

// AdminHandler реализует ArenaAdminServiceHandler (управление площадками
// турнира). Доступ ограничен интерсептором RequireAdmin.
type AdminHandler struct {
	svc *service.Service
}

// NewAdminHandler создаёт Connect-обработчик admin-операций площадок.
func NewAdminHandler(svc *service.Service) *AdminHandler {
	return &AdminHandler{svc: svc}
}

var _ hemav1connect.ArenaAdminServiceHandler = (*AdminHandler)(nil)

// ListArenas возвращает площадки турнира по порядку (активные и архивные
// различимы по status).
func (h *AdminHandler) ListArenas(
	ctx context.Context,
	req *connect.Request[hemav1.ListArenasRequest],
) (*connect.Response[hemav1.ListArenasResponse], error) {
	arenas, err := h.svc.List(ctx, req.Msg.TournamentId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ListArenasResponse{
		Arenas: toProtoArenas(arenas),
	}), nil
}

// GetArena возвращает одну площадку по id (для страницы управления).
func (h *AdminHandler) GetArena(
	ctx context.Context,
	req *connect.Request[hemav1.GetArenaRequest],
) (*connect.Response[hemav1.GetArenaResponse], error) {
	a, err := h.svc.Get(ctx, req.Msg.Id)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.GetArenaResponse{
		Arena: toProtoArena(a),
	}), nil
}

// CreateArena создаёт площадку у указанного турнира.
func (h *AdminHandler) CreateArena(
	ctx context.Context,
	req *connect.Request[hemav1.CreateArenaRequest],
) (*connect.Response[hemav1.CreateArenaResponse], error) {
	m := req.Msg
	a, err := h.svc.Create(ctx, m.TournamentId, domain.CreateInput{
		Name:        m.Name,
		Description: m.Description,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.CreateArenaResponse{
		Arena: toProtoArena(a),
	}), nil
}

// UpdateArena обновляет редактируемые поля существующей площадки целиком
// (name, description). id и tournament_id неизменяемы.
func (h *AdminHandler) UpdateArena(
	ctx context.Context,
	req *connect.Request[hemav1.UpdateArenaRequest],
) (*connect.Response[hemav1.UpdateArenaResponse], error) {
	m := req.Msg
	a, err := h.svc.Update(ctx, domain.UpdateInput{
		ID:          m.Id,
		Name:        m.Name,
		Description: m.Description,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.UpdateArenaResponse{
		Arena: toProtoArena(a),
	}), nil
}

// ArchiveArena убирает площадку в архив (обратимо). Идемпотентна.
func (h *AdminHandler) ArchiveArena(
	ctx context.Context,
	req *connect.Request[hemav1.ArchiveArenaRequest],
) (*connect.Response[hemav1.ArchiveArenaResponse], error) {
	a, err := h.svc.Archive(ctx, req.Msg.Id)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ArchiveArenaResponse{
		Arena: toProtoArena(a),
	}), nil
}

// RestoreArena возвращает площадку из архива. Идемпотентна.
func (h *AdminHandler) RestoreArena(
	ctx context.Context,
	req *connect.Request[hemav1.RestoreArenaRequest],
) (*connect.Response[hemav1.RestoreArenaResponse], error) {
	a, err := h.svc.Restore(ctx, req.Msg.Id)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.RestoreArenaResponse{
		Arena: toProtoArena(a),
	}), nil
}

// ReorderArenas задаёт порядок площадок турнира целиком.
func (h *AdminHandler) ReorderArenas(
	ctx context.Context,
	req *connect.Request[hemav1.ReorderArenasRequest],
) (*connect.Response[hemav1.ReorderArenasResponse], error) {
	arenas, err := h.svc.Reorder(ctx, req.Msg.TournamentId, req.Msg.OrderedIds)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ReorderArenasResponse{
		Arenas: toProtoArenas(arenas),
	}), nil
}

// mapError переводит доменные ошибки в connect.Code.
func mapError(err error) error {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, domain.ErrInvalidInput):
		return connect.NewError(connect.CodeInvalidArgument, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}

func toProtoArenas(arenas []domain.Arena) []*hemav1.Arena {
	out := make([]*hemav1.Arena, 0, len(arenas))
	for _, a := range arenas {
		out = append(out, toProtoArena(a))
	}
	return out
}

func toProtoArena(a domain.Arena) *hemav1.Arena {
	return &hemav1.Arena{
		Id:           a.ID,
		TournamentId: a.TournamentID,
		Name:         a.Name,
		Description:  a.Description,
		Position:     a.Position,
		Status:       toProtoStatus(a.Status),
		CreatedAt:    timestamppb.New(a.CreatedAt),
		UpdatedAt:    timestamppb.New(a.UpdatedAt),
	}
}

func toProtoStatus(s domain.Status) hemav1.ArenaStatus {
	switch s {
	case domain.StatusActive:
		return hemav1.ArenaStatus_ARENA_STATUS_ACTIVE
	case domain.StatusArchived:
		return hemav1.ArenaStatus_ARENA_STATUS_ARCHIVED
	default:
		return hemav1.ArenaStatus_ARENA_STATUS_UNSPECIFIED
	}
}