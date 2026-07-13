// Package api реализует Connect FighterAdminService и FighterPublicService:
// маппинг proto ↔ domain и ошибок.
package api

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/fighter/domain"
	"github.com/hema/server/modules/fighter/service"
)

// Handler реализует FighterAdminServiceHandler (управление ростером
// бойцов турнира). Доступ ограничен интерсептором RequireAdmin.
type Handler struct {
	svc *service.Service
}

// NewHandler создаёт Connect-обработчик admin-операций бойцов.
func NewHandler(svc *service.Service) *Handler {
	return &Handler{svc: svc}
}

var _ hemav1connect.FighterAdminServiceHandler = (*Handler)(nil)

// CreateFighter заводит бойца вручную и назначает его в номинации.
func (h *Handler) CreateFighter(
	ctx context.Context,
	req *connect.Request[hemav1.CreateFighterRequest],
) (*connect.Response[hemav1.CreateFighterResponse], error) {
	m := req.Msg
	f, err := h.svc.CreateManual(ctx, m.TournamentId, m.Name, m.Club, m.NominationIds)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.CreateFighterResponse{Fighter: toProtoFighter(f)}), nil
}

// EditFighter правит имя и клуб бойца.
func (h *Handler) EditFighter(
	ctx context.Context,
	req *connect.Request[hemav1.EditFighterRequest],
) (*connect.Response[hemav1.EditFighterResponse], error) {
	m := req.Msg
	f, err := h.svc.EditFighter(ctx, m.FighterId, m.Name, m.Club)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.EditFighterResponse{Fighter: toProtoFighter(f)}), nil
}

// WithdrawFighter выводит бойца со всего турнира с причиной.
func (h *Handler) WithdrawFighter(
	ctx context.Context,
	req *connect.Request[hemav1.WithdrawFighterRequest],
) (*connect.Response[hemav1.WithdrawFighterResponse], error) {
	m := req.Msg
	f, err := h.svc.WithdrawFighter(ctx, m.FighterId, fromProtoReason(m.Reason))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.WithdrawFighterResponse{Fighter: toProtoFighter(f)}), nil
}

// ReturnFighter возвращает ранее выведенного бойца.
func (h *Handler) ReturnFighter(
	ctx context.Context,
	req *connect.Request[hemav1.ReturnFighterRequest],
) (*connect.Response[hemav1.ReturnFighterResponse], error) {
	f, err := h.svc.ReturnFighter(ctx, req.Msg.FighterId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ReturnFighterResponse{Fighter: toProtoFighter(f)}), nil
}

// AddToNomination добавляет бойцу участие в номинации.
func (h *Handler) AddToNomination(
	ctx context.Context,
	req *connect.Request[hemav1.AddToNominationRequest],
) (*connect.Response[hemav1.AddToNominationResponse], error) {
	m := req.Msg
	f, err := h.svc.AddToNomination(ctx, m.FighterId, m.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.AddToNominationResponse{Fighter: toProtoFighter(f)}), nil
}

// RemoveFromNomination снимает бойца с одной номинации.
func (h *Handler) RemoveFromNomination(
	ctx context.Context,
	req *connect.Request[hemav1.RemoveFromNominationRequest],
) (*connect.Response[hemav1.RemoveFromNominationResponse], error) {
	m := req.Msg
	f, err := h.svc.RemoveFromNomination(ctx, m.FighterId, m.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.RemoveFromNominationResponse{Fighter: toProtoFighter(f)}), nil
}

// MoveFighter переводит бойца из одной номинации в другую.
func (h *Handler) MoveFighter(
	ctx context.Context,
	req *connect.Request[hemav1.MoveFighterRequest],
) (*connect.Response[hemav1.MoveFighterResponse], error) {
	m := req.Msg
	f, err := h.svc.MoveFighter(ctx, m.FighterId, m.FromNominationId, m.ToNominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.MoveFighterResponse{Fighter: toProtoFighter(f)}), nil
}

// GetFighter возвращает одного бойца со всеми участиями.
func (h *Handler) GetFighter(
	ctx context.Context,
	req *connect.Request[hemav1.GetFighterRequest],
) (*connect.Response[hemav1.GetFighterResponse], error) {
	f, err := h.svc.GetFighter(ctx, req.Msg.FighterId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.GetFighterResponse{Fighter: toProtoFighter(f)}), nil
}

// ListRoster возвращает ростер турнира.
func (h *Handler) ListRoster(
	ctx context.Context,
	req *connect.Request[hemav1.ListRosterRequest],
) (*connect.Response[hemav1.ListRosterResponse], error) {
	var tournamentID string
	if req.Msg.TournamentId != nil {
		tournamentID = *req.Msg.TournamentId
	}
	fighters, err := h.svc.ListRoster(ctx, tournamentID)
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*hemav1.Fighter, 0, len(fighters))
	for _, f := range fighters {
		out = append(out, toProtoFighter(f))
	}
	return connect.NewResponse(&hemav1.ListRosterResponse{Fighters: out}), nil
}

// PublicHandler реализует FighterPublicServiceHandler (публичное чтение
// состава номинации). Доступ не ограничен — RPC перечислены в
// publicProcedures.
type PublicHandler struct {
	svc *service.Service
}

// NewPublicHandler создаёт Connect-обработчик публичного чтения бойцов.
func NewPublicHandler(svc *service.Service) *PublicHandler {
	return &PublicHandler{svc: svc}
}

var _ hemav1connect.FighterPublicServiceHandler = (*PublicHandler)(nil)

// ListNominationRoster возвращает состав номинации: имя, клуб и статус
// участия каждого бойца. Выведенные/снятые не скрываются.
func (h *PublicHandler) ListNominationRoster(
	ctx context.Context,
	req *connect.Request[hemav1.ListNominationRosterRequest],
) (*connect.Response[hemav1.ListNominationRosterResponse], error) {
	entries, err := h.svc.ListNominationRoster(ctx, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*hemav1.RosterEntry, 0, len(entries))
	for _, e := range entries {
		out = append(out, &hemav1.RosterEntry{
			Name:     e.Name,
			Club:     e.Club,
			InRoster: e.InRoster,
		})
	}
	return connect.NewResponse(&hemav1.ListNominationRosterResponse{Entries: out}), nil
}

// mapError переводит доменные ошибки в connect.Code.
func mapError(err error) error {
	switch {
	case errors.Is(err, domain.ErrNotFound), errors.Is(err, domain.ErrNominationNotFound),
		errors.Is(err, domain.ErrParticipationNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, domain.ErrInvalidInput), errors.Is(err, domain.ErrEmptyName),
		errors.Is(err, domain.ErrInvalidReason):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, domain.ErrAlreadyWithdrawn), errors.Is(err, domain.ErrNotWithdrawn):
		return connect.NewError(connect.CodeFailedPrecondition, err)
	case errors.Is(err, domain.ErrOriginConflict):
		return connect.NewError(connect.CodeAlreadyExists, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}

func toProtoFighter(f domain.Fighter) *hemav1.Fighter {
	parts := make([]*hemav1.Participation, 0, len(f.Participations))
	for _, p := range f.Participations {
		parts = append(parts, &hemav1.Participation{
			NominationId: p.NominationID,
			Status:       toProtoParticipationStatus(p.Status),
		})
	}
	return &hemav1.Fighter{
		Id:               f.ID,
		TournamentId:     f.TournamentID,
		Name:             f.Name,
		Club:             f.Club,
		Status:           toProtoStatus(f.Status),
		WithdrawalReason: toProtoReason(f.WithdrawalReason),
		Participations:   parts,
		CreatedAt:        timestamppb.New(f.CreatedAt),
		UpdatedAt:        timestamppb.New(f.UpdatedAt),
	}
}

func toProtoStatus(s domain.Status) hemav1.FighterStatus {
	switch s {
	case domain.StatusActive:
		return hemav1.FighterStatus_FIGHTER_STATUS_ACTIVE
	case domain.StatusWithdrawn:
		return hemav1.FighterStatus_FIGHTER_STATUS_WITHDRAWN
	default:
		return hemav1.FighterStatus_FIGHTER_STATUS_UNSPECIFIED
	}
}

func toProtoReason(r domain.Reason) hemav1.WithdrawalReason {
	switch r {
	case domain.ReasonInjury:
		return hemav1.WithdrawalReason_WITHDRAWAL_REASON_INJURY
	case domain.ReasonBan:
		return hemav1.WithdrawalReason_WITHDRAWAL_REASON_BAN
	case domain.ReasonOther:
		return hemav1.WithdrawalReason_WITHDRAWAL_REASON_OTHER
	default:
		return hemav1.WithdrawalReason_WITHDRAWAL_REASON_UNSPECIFIED
	}
}

func fromProtoReason(r hemav1.WithdrawalReason) domain.Reason {
	switch r {
	case hemav1.WithdrawalReason_WITHDRAWAL_REASON_INJURY:
		return domain.ReasonInjury
	case hemav1.WithdrawalReason_WITHDRAWAL_REASON_BAN:
		return domain.ReasonBan
	case hemav1.WithdrawalReason_WITHDRAWAL_REASON_OTHER:
		return domain.ReasonOther
	default:
		return domain.ReasonNone
	}
}

func toProtoParticipationStatus(s domain.ParticipationStatus) hemav1.ParticipationStatus {
	switch s {
	case domain.ParticipationActive:
		return hemav1.ParticipationStatus_PARTICIPATION_STATUS_ACTIVE
	case domain.ParticipationRemoved:
		return hemav1.ParticipationStatus_PARTICIPATION_STATUS_REMOVED
	default:
		return hemav1.ParticipationStatus_PARTICIPATION_STATUS_UNSPECIFIED
	}
}
