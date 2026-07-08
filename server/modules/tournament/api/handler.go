// Package api реализует Connect TournamentService (public) и
// TournamentAdminService (admin): маппинг proto ↔ domain и ошибок.
package api

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/tournament/domain"
	"github.com/hema/server/modules/tournament/service"
)

// Handler реализует публичный TournamentServiceHandler (чтение активного
// турнира). Доступ не ограничен — RPC перечислен в publicProcedures.
type Handler struct {
	svc *service.Service
}

// NewHandler создаёт Connect-обработчик публичных операций турнира.
func NewHandler(svc *service.Service) *Handler {
	return &Handler{svc: svc}
}

var _ hemav1connect.TournamentServiceHandler = (*Handler)(nil)

// GetActiveTournament возвращает активный турнир для главной страницы.
func (h *Handler) GetActiveTournament(
	ctx context.Context,
	_ *connect.Request[hemav1.GetActiveTournamentRequest],
) (*connect.Response[hemav1.GetActiveTournamentResponse], error) {
	t, err := h.svc.GetActive(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.GetActiveTournamentResponse{
		Tournament: toProtoTournament(t),
	}), nil
}

// AdminHandler реализует TournamentAdminServiceHandler (управление профилем
// турнира). Доступ ограничен интерсептором RequireAdmin.
type AdminHandler struct {
	svc *service.Service
}

// NewAdminHandler создаёт Connect-обработчик admin-операций турнира.
func NewAdminHandler(svc *service.Service) *AdminHandler {
	return &AdminHandler{svc: svc}
}

var _ hemav1connect.TournamentAdminServiceHandler = (*AdminHandler)(nil)

// UpdateActiveTournament обновляет поля активного турнира целиком.
func (h *AdminHandler) UpdateActiveTournament(
	ctx context.Context,
	req *connect.Request[hemav1.UpdateActiveTournamentRequest],
) (*connect.Response[hemav1.UpdateActiveTournamentResponse], error) {
	m := req.Msg
	in := domain.UpdateInput{
		Title:       m.Title,
		Description: m.Description,
		EmblemURL:   m.EmblemUrl,
		Contacts:    fromProtoContacts(m.Contacts),
	}
	if m.EventStartAt != nil {
		in.EventStartAt = m.EventStartAt.AsTime()
		in.HasEventStartAt = true
	}
	if m.EventEndAt != nil {
		in.EventEndAt = m.EventEndAt.AsTime()
		in.HasEventEndAt = true
	}
	t, err := h.svc.UpdateActive(ctx, in)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.UpdateActiveTournamentResponse{
		Tournament: toProtoTournament(t),
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

func toProtoTournament(t domain.Tournament) *hemav1.Tournament {
	out := &hemav1.Tournament{
		Id:          t.ID,
		Title:       t.Title,
		Description: t.Description,
		EmblemUrl:   t.EmblemURL,
		IsActive:    t.IsActive,
		Contacts:    toProtoContacts(t.Contacts),
		CreatedAt:   timestamppb.New(t.CreatedAt),
		UpdatedAt:   timestamppb.New(t.UpdatedAt),
	}
	if t.HasEventStartAt {
		out.EventStartAt = timestamppb.New(t.EventStartAt)
	}
	if t.HasEventEndAt {
		out.EventEndAt = timestamppb.New(t.EventEndAt)
	}
	return out
}

func toProtoContacts(contacts []domain.Contact) []*hemav1.Contact {
	out := make([]*hemav1.Contact, 0, len(contacts))
	for _, c := range contacts {
		out = append(out, &hemav1.Contact{
			Id:       c.ID,
			Type:     toProtoContactType(c.Type),
			Value:    c.Value,
			Position: c.Position,
		})
	}
	return out
}

func toProtoContactType(t domain.ContactType) hemav1.ContactType {
	switch t {
	case domain.ContactTypeTelegram:
		return hemav1.ContactType_CONTACT_TYPE_TELEGRAM
	case domain.ContactTypeVK:
		return hemav1.ContactType_CONTACT_TYPE_VK
	case domain.ContactTypeFacebook:
		return hemav1.ContactType_CONTACT_TYPE_FACEBOOK
	case domain.ContactTypeWebsite:
		return hemav1.ContactType_CONTACT_TYPE_WEBSITE
	case domain.ContactTypeEmail:
		return hemav1.ContactType_CONTACT_TYPE_EMAIL
	case domain.ContactTypeOther:
		return hemav1.ContactType_CONTACT_TYPE_OTHER
	default:
		return hemav1.ContactType_CONTACT_TYPE_UNSPECIFIED
	}
}

func fromProtoContacts(in []*hemav1.ContactInput) []domain.ContactInput {
	out := make([]domain.ContactInput, 0, len(in))
	for _, c := range in {
		out = append(out, domain.ContactInput{
			Type:  fromProtoContactType(c.Type),
			Value: c.Value,
		})
	}
	return out
}

func fromProtoContactType(t hemav1.ContactType) domain.ContactType {
	switch t {
	case hemav1.ContactType_CONTACT_TYPE_TELEGRAM:
		return domain.ContactTypeTelegram
	case hemav1.ContactType_CONTACT_TYPE_VK:
		return domain.ContactTypeVK
	case hemav1.ContactType_CONTACT_TYPE_FACEBOOK:
		return domain.ContactTypeFacebook
	case hemav1.ContactType_CONTACT_TYPE_WEBSITE:
		return domain.ContactTypeWebsite
	case hemav1.ContactType_CONTACT_TYPE_EMAIL:
		return domain.ContactTypeEmail
	case hemav1.ContactType_CONTACT_TYPE_OTHER:
		return domain.ContactTypeOther
	default:
		return ""
	}
}