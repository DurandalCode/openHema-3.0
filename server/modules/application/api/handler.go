// Package api реализует Connect ApplicationService (заявитель),
// ApplicationAdminService (секретарь/admin) и ApplicationPublicService
// (публичный стартовый лист): маппинг proto ↔ domain/service и ошибок.
package api

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/application/domain"
	"github.com/hema/server/modules/application/service"
	"github.com/hema/server/pkg/connectutil"
)

// Handler реализует ApplicationServiceHandler (операции заявителя). Требует
// auth (не в publicProcedures); заявитель берётся из контекста (CallerID).
type Handler struct {
	svc *service.Service
}

// NewHandler создаёт Connect-обработчик операций заявителя.
func NewHandler(svc *service.Service) *Handler {
	return &Handler{svc: svc}
}

var _ hemav1connect.ApplicationServiceHandler = (*Handler)(nil)

// SubmitApplication подаёт заявку текущего пользователя в номинацию.
func (h *Handler) SubmitApplication(
	ctx context.Context,
	req *connect.Request[hemav1.SubmitApplicationRequest],
) (*connect.Response[hemav1.SubmitApplicationResponse], error) {
	app, err := h.svc.Submit(ctx, connectutil.CallerID(ctx), req.Msg.NominationId, req.Msg.Club, req.Msg.NeedsEquipment)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.SubmitApplicationResponse{
		Application: toProtoApplication(app),
	}), nil
}

// DeclarePayment отмечает оплату собственной заявки.
func (h *Handler) DeclarePayment(
	ctx context.Context,
	req *connect.Request[hemav1.DeclarePaymentRequest],
) (*connect.Response[hemav1.DeclarePaymentResponse], error) {
	app, err := h.svc.DeclarePayment(ctx, connectutil.CallerID(ctx), req.Msg.ApplicationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.DeclarePaymentResponse{
		Application: toProtoApplication(app),
	}), nil
}

// WithdrawApplication отзывает собственную заявку.
func (h *Handler) WithdrawApplication(
	ctx context.Context,
	req *connect.Request[hemav1.WithdrawApplicationRequest],
) (*connect.Response[hemav1.WithdrawApplicationResponse], error) {
	app, err := h.svc.Withdraw(ctx, connectutil.CallerID(ctx), req.Msg.ApplicationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.WithdrawApplicationResponse{
		Application: toProtoApplication(app),
	}), nil
}

// ListMyApplications возвращает заявки текущего пользователя.
func (h *Handler) ListMyApplications(
	ctx context.Context,
	_ *connect.Request[hemav1.ListMyApplicationsRequest],
) (*connect.Response[hemav1.ListMyApplicationsResponse], error) {
	apps, err := h.svc.ListMy(ctx, connectutil.CallerID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ListMyApplicationsResponse{
		Applications: toProtoApplications(apps),
	}), nil
}

// GetApplication возвращает заявку с историей. Доступна владельцу или admin.
func (h *Handler) GetApplication(
	ctx context.Context,
	req *connect.Request[hemav1.GetApplicationRequest],
) (*connect.Response[hemav1.GetApplicationResponse], error) {
	callerID := connectutil.CallerID(ctx)
	isAdmin := connectutil.CallerRole(ctx) == "admin"
	app, history, err := h.svc.Get(ctx, callerID, isAdmin, req.Msg.ApplicationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.GetApplicationResponse{
		Application: toProtoApplication(app),
		History:     toProtoHistory(history),
	}), nil
}

// AdminHandler реализует ApplicationAdminServiceHandler (секретарь/admin).
// Доступ ограничен интерсептором RequireAdmin.
type AdminHandler struct {
	svc *service.Service
}

// NewAdminHandler создаёт Connect-обработчик admin-операций заявок.
func NewAdminHandler(svc *service.Service) *AdminHandler {
	return &AdminHandler{svc: svc}
}

var _ hemav1connect.ApplicationAdminServiceHandler = (*AdminHandler)(nil)

// ConfirmPayment подтверждает заявленную оплату.
func (h *AdminHandler) ConfirmPayment(
	ctx context.Context,
	req *connect.Request[hemav1.ConfirmPaymentRequest],
) (*connect.Response[hemav1.ConfirmPaymentResponse], error) {
	app, err := h.svc.ConfirmPayment(ctx, connectutil.CallerID(ctx), req.Msg.ApplicationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ConfirmPaymentResponse{
		Application: toProtoApplication(app),
	}), nil
}

// RegisterFighter регистрирует оплаченную заявку (терминальный шаг).
func (h *AdminHandler) RegisterFighter(
	ctx context.Context,
	req *connect.Request[hemav1.RegisterFighterRequest],
) (*connect.Response[hemav1.RegisterFighterResponse], error) {
	app, exceeded, err := h.svc.Register(ctx, connectutil.CallerID(ctx), req.Msg.ApplicationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.RegisterFighterResponse{
		Application:      toProtoApplication(app),
		CapacityExceeded: exceeded,
	}), nil
}

// ListNominationApplications возвращает заявки одной номинации.
func (h *AdminHandler) ListNominationApplications(
	ctx context.Context,
	req *connect.Request[hemav1.ListNominationApplicationsRequest],
) (*connect.Response[hemav1.ListNominationApplicationsResponse], error) {
	apps, err := h.svc.ListByNomination(ctx, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ListNominationApplicationsResponse{
		Applications: toProtoApplications(apps),
	}), nil
}

// ListApplications — сводный экран заявок турнира с опциональными фильтрами.
func (h *AdminHandler) ListApplications(
	ctx context.Context,
	req *connect.Request[hemav1.ListApplicationsRequest],
) (*connect.Response[hemav1.ListApplicationsResponse], error) {
	var status *domain.State
	if req.Msg.Status != nil {
		s := fromProtoState(*req.Msg.Status)
		status = &s
	}
	apps, err := h.svc.ListApplications(ctx, req.Msg.TournamentId, status, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ListApplicationsResponse{
		Applications: toProtoApplications(apps),
	}), nil
}

// EditApplication редактирует заявку: клуб, признак экипировки,
// переопределение имени, перенос в номинацию и/или ручную смену статуса
// (спека 0006, FR-3..FR-9). Допустимо над заявкой в любом состоянии.
func (h *AdminHandler) EditApplication(
	ctx context.Context,
	req *connect.Request[hemav1.EditApplicationRequest],
) (*connect.Response[hemav1.EditApplicationResponse], error) {
	in := service.EditInput{
		Club:                  req.Msg.Club,
		NeedsEquipment:        req.Msg.NeedsEquipment,
		ApplicantNameOverride: req.Msg.ApplicantNameOverride,
		NominationID:          req.Msg.NominationId,
	}
	if req.Msg.State != nil {
		st := fromProtoState(*req.Msg.State)
		in.State = &st
	}
	app, err := h.svc.EditApplication(ctx, connectutil.CallerID(ctx), req.Msg.ApplicationId, in)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.EditApplicationResponse{
		Application: toProtoApplication(app),
	}), nil
}

// PublicHandler реализует ApplicationPublicServiceHandler (стартовый лист
// номинации). Доступ не ограничен — RPC перечислены в publicProcedures.
type PublicHandler struct {
	svc *service.Service
}

// NewPublicHandler создаёт Connect-обработчик публичного чтения.
func NewPublicHandler(svc *service.Service) *PublicHandler {
	return &PublicHandler{svc: svc}
}

var _ hemav1connect.ApplicationPublicServiceHandler = (*PublicHandler)(nil)

// ListNominationParticipants возвращает имена заявленных/подтверждённых
// бойцов и счётчики номинации.
func (h *PublicHandler) ListNominationParticipants(
	ctx context.Context,
	req *connect.Request[hemav1.ListNominationParticipantsRequest],
) (*connect.Response[hemav1.ListNominationParticipantsResponse], error) {
	participants, applied, confirmed, capacity, err := h.svc.NominationParticipants(ctx, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ListNominationParticipantsResponse{
		Participants:    toProtoParticipants(participants),
		AppliedCount:    int32(applied),
		ConfirmedCount:  int32(confirmed),
		FighterCapacity: capacity,
	}), nil
}

// mapError переводит доменные ошибки в connect.Code.
func mapError(err error) error {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, domain.ErrForbidden):
		return connect.NewError(connect.CodePermissionDenied, err)
	case errors.Is(err, domain.ErrInvalidTransition):
		return connect.NewError(connect.CodeFailedPrecondition, err)
	case errors.Is(err, domain.ErrDuplicateActive):
		return connect.NewError(connect.CodeAlreadyExists, err)
	case errors.Is(err, domain.ErrNominationNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, domain.ErrConcurrency):
		return connect.NewError(connect.CodeAborted, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}

func toProtoApplications(apps []service.Application) []*hemav1.Application {
	out := make([]*hemav1.Application, 0, len(apps))
	for _, a := range apps {
		out = append(out, toProtoApplication(a))
	}
	return out
}

func toProtoApplication(a service.Application) *hemav1.Application {
	return &hemav1.Application{
		Id:                   a.ID,
		NominationId:         a.NominationID,
		TournamentId:         a.TournamentID,
		ApplicantUserId:      a.ApplicantUserID,
		ApplicantDisplayName: a.ApplicantDisplayName,
		State:                toProtoState(a.State),
		Club:                 a.Club,
		NeedsEquipment:       a.NeedsEquipment,
		CreatedAt:            timestamppb.New(a.CreatedAt),
		UpdatedAt:            timestamppb.New(a.UpdatedAt),
	}
}

func toProtoHistory(history []service.HistoryEvent) []*hemav1.ApplicationEvent {
	out := make([]*hemav1.ApplicationEvent, 0, len(history))
	for _, ev := range history {
		out = append(out, &hemav1.ApplicationEvent{
			Type:       toProtoEventType(ev.Type),
			ActorId:    ev.ActorID,
			OccurredAt: timestamppb.New(ev.OccurredAt),
			Sequence:   int32(ev.Sequence),
		})
	}
	return out
}

func toProtoParticipants(participants []service.Participant) []*hemav1.NominationParticipant {
	out := make([]*hemav1.NominationParticipant, 0, len(participants))
	for _, p := range participants {
		out = append(out, &hemav1.NominationParticipant{
			DisplayName: p.DisplayName,
			State:       toProtoState(p.State),
			Club:        p.Club,
		})
	}
	return out
}

func toProtoState(s domain.State) hemav1.ApplicationState {
	switch s {
	case domain.StateSubmitted:
		return hemav1.ApplicationState_APPLICATION_STATE_SUBMITTED
	case domain.StateAwaitingPaymentConfirmation:
		return hemav1.ApplicationState_APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION
	case domain.StatePaid:
		return hemav1.ApplicationState_APPLICATION_STATE_PAID
	case domain.StateRegistered:
		return hemav1.ApplicationState_APPLICATION_STATE_REGISTERED
	case domain.StateWithdrawn:
		return hemav1.ApplicationState_APPLICATION_STATE_WITHDRAWN
	default:
		return hemav1.ApplicationState_APPLICATION_STATE_UNSPECIFIED
	}
}

func fromProtoState(s hemav1.ApplicationState) domain.State {
	switch s {
	case hemav1.ApplicationState_APPLICATION_STATE_SUBMITTED:
		return domain.StateSubmitted
	case hemav1.ApplicationState_APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION:
		return domain.StateAwaitingPaymentConfirmation
	case hemav1.ApplicationState_APPLICATION_STATE_PAID:
		return domain.StatePaid
	case hemav1.ApplicationState_APPLICATION_STATE_REGISTERED:
		return domain.StateRegistered
	case hemav1.ApplicationState_APPLICATION_STATE_WITHDRAWN:
		return domain.StateWithdrawn
	default:
		return ""
	}
}

func toProtoEventType(t domain.EventType) hemav1.ApplicationEventType {
	switch t {
	case domain.EventSubmitted:
		return hemav1.ApplicationEventType_APPLICATION_EVENT_TYPE_SUBMITTED
	case domain.EventPaymentDeclared:
		return hemav1.ApplicationEventType_APPLICATION_EVENT_TYPE_PAYMENT_DECLARED
	case domain.EventPaymentConfirmed:
		return hemav1.ApplicationEventType_APPLICATION_EVENT_TYPE_PAYMENT_CONFIRMED
	case domain.EventFighterRegistered:
		return hemav1.ApplicationEventType_APPLICATION_EVENT_TYPE_FIGHTER_REGISTERED
	case domain.EventWithdrawn:
		return hemav1.ApplicationEventType_APPLICATION_EVENT_TYPE_WITHDRAWN
	case domain.EventAmended:
		return hemav1.ApplicationEventType_APPLICATION_EVENT_TYPE_AMENDED
	default:
		return hemav1.ApplicationEventType_APPLICATION_EVENT_TYPE_UNSPECIFIED
	}
}
