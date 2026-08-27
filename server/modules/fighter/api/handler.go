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
	return connect.NewResponse(&hemav1.CreateFighterResponse{Fighter: toProtoFighterAdmin(f)}), nil
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
	return connect.NewResponse(&hemav1.EditFighterResponse{Fighter: toProtoFighterAdmin(f)}), nil
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
	return connect.NewResponse(&hemav1.WithdrawFighterResponse{Fighter: toProtoFighterAdmin(f)}), nil
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
	return connect.NewResponse(&hemav1.ReturnFighterResponse{Fighter: toProtoFighterAdmin(f)}), nil
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
	return connect.NewResponse(&hemav1.AddToNominationResponse{Fighter: toProtoFighterAdmin(f)}), nil
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
	return connect.NewResponse(&hemav1.RemoveFromNominationResponse{Fighter: toProtoFighterAdmin(f)}), nil
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
	return connect.NewResponse(&hemav1.MoveFighterResponse{Fighter: toProtoFighterAdmin(f)}), nil
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
	return connect.NewResponse(&hemav1.GetFighterResponse{Fighter: toProtoFighterAdmin(f)}), nil
}

// ListRoster возвращает страницу ростера турнира: отфильтрованную по
// статусу/номинации (активное участие)/клубу и найденную по подстроке
// имени/клуба (спека 0041, FR-1..FR-3), с total_count для постраничной
// навигации (FR-5) и status_counts независимыми от фильтра/поиска (FR-4).
// Видимость ростера не меняется этим RPC (в т.ч. Status=StatusMerged
// по-прежнему возвращается, если Statuses не сужает выборку) — добавляется
// только явная фильтрация/поиск/постраничность поверх неё.
func (h *Handler) ListRoster(
	ctx context.Context,
	req *connect.Request[hemav1.ListRosterRequest],
) (*connect.Response[hemav1.ListRosterResponse], error) {
	m := req.Msg
	var tournamentID string
	if m.TournamentId != nil {
		tournamentID = *m.TournamentId
	}

	fighters, total, statusCounts, err := h.svc.ListRoster(ctx, tournamentID, domain.RosterFilter{
		Statuses:      fromProtoStatuses(m.Statuses),
		NominationIDs: m.NominationIds,
		Clubs:         m.Clubs,
		IncludeNoClub: m.IncludeNoClub,
		Search:        m.Search,
		Limit:         m.Limit,
		Offset:        m.Offset,
	})
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*hemav1.Fighter, 0, len(fighters))
	for _, f := range fighters {
		out = append(out, toProtoFighterAdmin(f))
	}
	return connect.NewResponse(&hemav1.ListRosterResponse{
		Fighters:     out,
		TotalCount:   int32(total),
		StatusCounts: toProtoStatusCounts(statusCounts),
	}), nil
}

// FindFighterByAccount ищет бойца турнира по учётке пользователя (спека
// 0040, FR-9). Пустой fighter в ответе — «у этой учётки нет бойца в этом
// турнире», не ошибка (тот же приём, что GetMyFighter/ADR 0016).
func (h *Handler) FindFighterByAccount(
	ctx context.Context,
	req *connect.Request[hemav1.FindFighterByAccountRequest],
) (*connect.Response[hemav1.FindFighterByAccountResponse], error) {
	m := req.Msg
	f, found, err := h.svc.FindByAccount(ctx, m.GetUserId(), m.GetTournamentId())
	if err != nil {
		return nil, mapError(err)
	}
	if !found {
		return connect.NewResponse(&hemav1.FindFighterByAccountResponse{}), nil
	}
	return connect.NewResponse(&hemav1.FindFighterByAccountResponse{Fighter: toProtoFighterAdmin(f)}), nil
}

// MergeFighters сводит дубль source в target (спека 0040, FR-10): участия
// переносятся на target, source помечается объединённым.
func (h *Handler) MergeFighters(
	ctx context.Context,
	req *connect.Request[hemav1.MergeFightersRequest],
) (*connect.Response[hemav1.MergeFightersResponse], error) {
	m := req.Msg
	f, err := h.svc.MergeFighters(ctx, m.SourceFighterId, m.TargetFighterId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.MergeFightersResponse{Fighter: toProtoFighterAdmin(f)}), nil
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
	case errors.Is(err, domain.ErrAlreadyWithdrawn), errors.Is(err, domain.ErrNotWithdrawn),
		errors.Is(err, domain.ErrAlreadyMerged):
		return connect.NewError(connect.CodeFailedPrecondition, err)
	case errors.Is(err, domain.ErrSameFighter), errors.Is(err, domain.ErrCrossTournamentMerge):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, domain.ErrOriginConflict):
		return connect.NewError(connect.CodeAlreadyExists, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}

// toProtoFighterAdmin мапит domain.Fighter → proto для FighterAdminService:
// единственный маппер, сериализующий linked_account_id/
// linked_account_display_name/merged_into_id (спека 0040, FR-8/FR-10) —
// обратная проекция «боец → учётка» видна только организатору. Граница
// ADR 0016 держится на уровне выбора маппера в хендлере, не на уровне
// proto-сообщения (см. plan.md, «modules/fighter»).
func toProtoFighterAdmin(f domain.Fighter) *hemav1.Fighter {
	out := toProtoFighterBase(f)
	out.LinkedAccountId = f.LinkedAccountID
	out.LinkedAccountDisplayName = f.LinkedAccountDisplayName
	out.MergedIntoId = f.MergedIntoID
	return out
}

// toProtoFighterPublic мапит domain.Fighter → proto для
// FighterPublicService/FighterService (свой боец, ADR 0016): без
// linked_account_*/merged_into_id — граница ADR 0016 не расширяется.
func toProtoFighterPublic(f domain.Fighter) *hemav1.Fighter {
	return toProtoFighterBase(f)
}

func toProtoFighterBase(f domain.Fighter) *hemav1.Fighter {
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
		FromApplication:  f.OriginUserID != nil,
	}
}

func toProtoStatus(s domain.Status) hemav1.FighterStatus {
	switch s {
	case domain.StatusActive:
		return hemav1.FighterStatus_FIGHTER_STATUS_ACTIVE
	case domain.StatusWithdrawn:
		return hemav1.FighterStatus_FIGHTER_STATUS_WITHDRAWN
	case domain.StatusMerged:
		return hemav1.FighterStatus_FIGHTER_STATUS_MERGED
	default:
		return hemav1.FighterStatus_FIGHTER_STATUS_UNSPECIFIED
	}
}

// fromProtoStatus мапит proto FighterStatus в domain.Status.
// FIGHTER_STATUS_UNSPECIFIED (в т.ч. неизвестное будущее значение) не имеет
// доменного эквивалента — ok=false, вызывающий код (fromProtoStatuses)
// пропускает такие значения, не превращая их в ложный фильтр.
func fromProtoStatus(s hemav1.FighterStatus) (domain.Status, bool) {
	switch s {
	case hemav1.FighterStatus_FIGHTER_STATUS_ACTIVE:
		return domain.StatusActive, true
	case hemav1.FighterStatus_FIGHTER_STATUS_WITHDRAWN:
		return domain.StatusWithdrawn, true
	case hemav1.FighterStatus_FIGHTER_STATUS_MERGED:
		return domain.StatusMerged, true
	default:
		return "", false
	}
}

// fromProtoStatuses мапит repeated FighterStatus запроса ListRoster в
// domain.RosterFilter.Statuses (спека 0041).
func fromProtoStatuses(statuses []hemav1.FighterStatus) []domain.Status {
	out := make([]domain.Status, 0, len(statuses))
	for _, s := range statuses {
		if ds, ok := fromProtoStatus(s); ok {
			out = append(out, ds)
		}
	}
	return out
}

// rosterStatusOrder — порядок FighterStatusCount в ответе ListRoster:
// детерминированный (не порядок итерации по map), все три статуса всегда
// присутствуют (count=0, если бойцов с этим статусом нет).
var rosterStatusOrder = []domain.Status{domain.StatusActive, domain.StatusWithdrawn, domain.StatusMerged}

// toProtoStatusCounts мапит счётчики по статусу (спека 0041, FR-4) в
// стабильном порядке rosterStatusOrder.
func toProtoStatusCounts(counts map[domain.Status]int) []*hemav1.FighterStatusCount {
	out := make([]*hemav1.FighterStatusCount, 0, len(rosterStatusOrder))
	for _, s := range rosterStatusOrder {
		out = append(out, &hemav1.FighterStatusCount{
			Status: toProtoStatus(s),
			Count:  int32(counts[s]),
		})
	}
	return out
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
