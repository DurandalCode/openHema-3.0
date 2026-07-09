// Package api реализует Connect NominationService (public) и
// NominationAdminService (admin): маппинг proto ↔ domain и ошибок.
package api

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/nomination/domain"
	"github.com/hema/server/modules/nomination/service"
)

// Handler реализует публичный NominationServiceHandler (чтение номинаций).
// Доступ не ограничен — RPC перечислены в publicProcedures.
type Handler struct {
	svc *service.Service
}

// NewHandler создаёт Connect-обработчик публичных операций номинаций.
func NewHandler(svc *service.Service) *Handler {
	return &Handler{svc: svc}
}

var _ hemav1connect.NominationServiceHandler = (*Handler)(nil)

// ListNominations возвращает номинации турнира по порядку.
func (h *Handler) ListNominations(
	ctx context.Context,
	req *connect.Request[hemav1.ListNominationsRequest],
) (*connect.Response[hemav1.ListNominationsResponse], error) {
	nominations, err := h.svc.List(ctx, req.Msg.TournamentId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ListNominationsResponse{
		Nominations: toProtoNominations(nominations),
	}), nil
}

// GetNomination возвращает одну номинацию по id.
func (h *Handler) GetNomination(
	ctx context.Context,
	req *connect.Request[hemav1.GetNominationRequest],
) (*connect.Response[hemav1.GetNominationResponse], error) {
	n, err := h.svc.Get(ctx, req.Msg.Id)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.GetNominationResponse{
		Nomination: toProtoNomination(n),
	}), nil
}

// AdminHandler реализует NominationAdminServiceHandler (управление
// номинациями турнира). Доступ ограничен интерсептором RequireAdmin.
type AdminHandler struct {
	svc *service.Service
}

// NewAdminHandler создаёт Connect-обработчик admin-операций номинаций.
func NewAdminHandler(svc *service.Service) *AdminHandler {
	return &AdminHandler{svc: svc}
}

var _ hemav1connect.NominationAdminServiceHandler = (*AdminHandler)(nil)

// CreateNomination создаёт номинацию у указанного турнира.
func (h *AdminHandler) CreateNomination(
	ctx context.Context,
	req *connect.Request[hemav1.CreateNominationRequest],
) (*connect.Response[hemav1.CreateNominationResponse], error) {
	m := req.Msg
	in := domain.CreateInput{
		Title:       m.Title,
		Description: m.Description,
		Metadata:    fromProtoMetadata(m.Metadata),
	}
	if m.FighterCapacity != nil {
		in.FighterCapacity = *m.FighterCapacity
		in.HasFighterCapacity = true
	}
	n, err := h.svc.Create(ctx, m.TournamentId, in)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.CreateNominationResponse{
		Nomination: toProtoNomination(n),
	}), nil
}

// UpdateNomination обновляет поля существующей номинации целиком.
func (h *AdminHandler) UpdateNomination(
	ctx context.Context,
	req *connect.Request[hemav1.UpdateNominationRequest],
) (*connect.Response[hemav1.UpdateNominationResponse], error) {
	m := req.Msg
	in := domain.UpdateInput{
		ID:          m.Id,
		Title:       m.Title,
		Description: m.Description,
		Metadata:    fromProtoMetadata(m.Metadata),
	}
	if m.FighterCapacity != nil {
		in.FighterCapacity = *m.FighterCapacity
		in.HasFighterCapacity = true
	}
	n, err := h.svc.Update(ctx, in)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.UpdateNominationResponse{
		Nomination: toProtoNomination(n),
	}), nil
}

// DeleteNomination удаляет номинацию.
func (h *AdminHandler) DeleteNomination(
	ctx context.Context,
	req *connect.Request[hemav1.DeleteNominationRequest],
) (*connect.Response[hemav1.DeleteNominationResponse], error) {
	if err := h.svc.Delete(ctx, req.Msg.Id); err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.DeleteNominationResponse{}), nil
}

// ReorderNominations задаёт порядок номинаций турнира целиком.
func (h *AdminHandler) ReorderNominations(
	ctx context.Context,
	req *connect.Request[hemav1.ReorderNominationsRequest],
) (*connect.Response[hemav1.ReorderNominationsResponse], error) {
	nominations, err := h.svc.Reorder(ctx, req.Msg.TournamentId, req.Msg.OrderedIds)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ReorderNominationsResponse{
		Nominations: toProtoNominations(nominations),
	}), nil
}

// mapError переводит доменные ошибки в connect.Code.
func mapError(err error) error {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, domain.ErrInvalidInput):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, domain.ErrConflict):
		return connect.NewError(connect.CodeAlreadyExists, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}

func toProtoNominations(nominations []domain.Nomination) []*hemav1.Nomination {
	out := make([]*hemav1.Nomination, 0, len(nominations))
	for _, n := range nominations {
		out = append(out, toProtoNomination(n))
	}
	return out
}

func toProtoNomination(n domain.Nomination) *hemav1.Nomination {
	out := &hemav1.Nomination{
		Id:           n.ID,
		TournamentId: n.TournamentID,
		Title:        n.Title,
		Description:  n.Description,
		Metadata:     toProtoMetadata(n.Metadata),
		Position:     n.Position,
		CreatedAt:    timestamppb.New(n.CreatedAt),
		UpdatedAt:    timestamppb.New(n.UpdatedAt),
	}
	if n.HasFighterCapacity {
		out.FighterCapacity = &n.FighterCapacity
	}
	return out
}

func toProtoMetadata(m domain.Metadata) *hemav1.NominationMetadata {
	out := &hemav1.NominationMetadata{}
	if m.RulesURL != "" {
		out.RulesUrl = &m.RulesURL
	}
	return out
}

func fromProtoMetadata(m *hemav1.NominationMetadata) domain.Metadata {
	if m == nil || m.RulesUrl == nil {
		return domain.Metadata{}
	}
	return domain.Metadata{RulesURL: *m.RulesUrl}
}
