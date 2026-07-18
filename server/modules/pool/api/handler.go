// Package api реализует Connect-хендлеры модуля pool: маппинг proto ↔
// domain и ошибок. PoolAdminService — управление раскладкой (спека 0009) и
// постановкой/снятием пула с арены (спека 0011, RequireAdmin);
// PoolPublicService — публичное чтение готовых пулов номинации (спека 0011,
// FR-11, без RequireAdmin).
package api

import (
	"context"
	"errors"
	"fmt"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/pool/domain"
	"github.com/hema/server/modules/pool/service"
)

// AdminHandler реализует PoolAdminServiceHandler (управление раскладкой
// бойцов по пулам, постановка/снятие пула с арены). Доступ ограничен
// интерсептором RequireAdmin.
type AdminHandler struct {
	svc *service.Service
}

// NewAdminHandler создаёт Connect-обработчик admin-операций пулов.
func NewAdminHandler(svc *service.Service) *AdminHandler {
	return &AdminHandler{svc: svc}
}

var _ hemav1connect.PoolAdminServiceHandler = (*AdminHandler)(nil)

// GetLayout возвращает раскладку номинации.
func (h *AdminHandler) GetLayout(
	ctx context.Context,
	req *connect.Request[hemav1.GetLayoutRequest],
) (*connect.Response[hemav1.GetLayoutResponse], error) {
	layout, err := h.svc.GetLayout(ctx, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.GetLayoutResponse{Layout: toProtoLayout(layout)}), nil
}

// CreatePool создаёт пул в номинации.
func (h *AdminHandler) CreatePool(
	ctx context.Context,
	req *connect.Request[hemav1.CreatePoolRequest],
) (*connect.Response[hemav1.CreatePoolResponse], error) {
	layout, err := h.svc.CreatePool(ctx, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.CreatePoolResponse{Layout: toProtoLayout(layout)}), nil
}

// DeletePool удаляет пул; его бойцы возвращаются в нераспределённые.
func (h *AdminHandler) DeletePool(
	ctx context.Context,
	req *connect.Request[hemav1.DeletePoolRequest],
) (*connect.Response[hemav1.DeletePoolResponse], error) {
	layout, err := h.svc.DeletePool(ctx, req.Msg.PoolId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.DeletePoolResponse{Layout: toProtoLayout(layout)}), nil
}

// ResetLayout удаляет все пулы номинации, возвращает всех бойцов в
// нераспределённые.
func (h *AdminHandler) ResetLayout(
	ctx context.Context,
	req *connect.Request[hemav1.ResetLayoutRequest],
) (*connect.Response[hemav1.ResetLayoutResponse], error) {
	layout, err := h.svc.ResetLayout(ctx, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ResetLayoutResponse{Layout: toProtoLayout(layout)}), nil
}

// AssignFighter кладёт бойца в пул (move, если он уже был в другом пуле).
func (h *AdminHandler) AssignFighter(
	ctx context.Context,
	req *connect.Request[hemav1.AssignFighterRequest],
) (*connect.Response[hemav1.AssignFighterResponse], error) {
	layout, err := h.svc.AssignFighter(ctx, req.Msg.NominationId, req.Msg.FighterId, req.Msg.PoolId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.AssignFighterResponse{Layout: toProtoLayout(layout)}), nil
}

// UnassignFighter возвращает бойца из пула в нераспределённые.
func (h *AdminHandler) UnassignFighter(
	ctx context.Context,
	req *connect.Request[hemav1.UnassignFighterRequest],
) (*connect.Response[hemav1.UnassignFighterResponse], error) {
	layout, err := h.svc.UnassignFighter(ctx, req.Msg.NominationId, req.Msg.FighterId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.UnassignFighterResponse{Layout: toProtoLayout(layout)}), nil
}

// AutoDistribute раскладывает нераспределённых бойцов по существующим
// пулам.
func (h *AdminHandler) AutoDistribute(
	ctx context.Context,
	req *connect.Request[hemav1.AutoDistributeRequest],
) (*connect.Response[hemav1.AutoDistributeResponse], error) {
	layout, err := h.svc.AutoDistribute(ctx, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.AutoDistributeResponse{Layout: toProtoLayout(layout)}), nil
}

// Undo откатывает последнее mutating-действие (авто или удаление пула).
func (h *AdminHandler) Undo(
	ctx context.Context,
	req *connect.Request[hemav1.UndoRequest],
) (*connect.Response[hemav1.UndoResponse], error) {
	layout, err := h.svc.Undo(ctx, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.UndoResponse{Layout: toProtoLayout(layout)}), nil
}

// SetLayoutStatus переключает статус раскладки draft↔ready.
func (h *AdminHandler) SetLayoutStatus(
	ctx context.Context,
	req *connect.Request[hemav1.SetLayoutStatusRequest],
) (*connect.Response[hemav1.SetLayoutStatusResponse], error) {
	layout, err := h.svc.SetStatus(ctx, req.Msg.NominationId, fromProtoStatus(req.Msg.Status))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.SetLayoutStatusResponse{Layout: toProtoLayout(layout)}), nil
}

// SeatPoolOnArena ставит готовый пул на активную площадку целиком (спека
// 0011, FR-7).
func (h *AdminHandler) SeatPoolOnArena(
	ctx context.Context,
	req *connect.Request[hemav1.SeatPoolOnArenaRequest],
) (*connect.Response[hemav1.SeatPoolOnArenaResponse], error) {
	layout, err := h.svc.SeatPoolOnArena(ctx, req.Msg.PoolId, req.Msg.ArenaId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.SeatPoolOnArenaResponse{Layout: toProtoLayout(layout)}), nil
}

// UnseatPool снимает пул с площадки (спека 0011, FR-8).
func (h *AdminHandler) UnseatPool(
	ctx context.Context,
	req *connect.Request[hemav1.UnseatPoolRequest],
) (*connect.Response[hemav1.UnseatPoolResponse], error) {
	layout, err := h.svc.UnseatPool(ctx, req.Msg.PoolId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.UnseatPoolResponse{Layout: toProtoLayout(layout)}), nil
}

// GetPoolsForArena возвращает данные для страницы конкретной арены (спека
// 0011, FR-9): пул, стоящий на ней сейчас (если есть), и список готовых
// пулов, доступных для постановки.
func (h *AdminHandler) GetPoolsForArena(
	ctx context.Context,
	req *connect.Request[hemav1.GetPoolsForArenaRequest],
) (*connect.Response[hemav1.GetPoolsForArenaResponse], error) {
	pools, err := h.svc.GetPoolsForArena(ctx, req.Msg.ArenaId)
	if err != nil {
		return nil, mapError(err)
	}
	resp := &hemav1.GetPoolsForArenaResponse{Available: toProtoPools(pools.Available)}
	if pools.Seated != nil {
		resp.Seated = toProtoPool(*pools.Seated)
	}
	return connect.NewResponse(resp), nil
}

// PublicHandler реализует PoolPublicServiceHandler (спека 0011, FR-11):
// публичное чтение пулов готовой раскладки номинации. Без RequireAdmin.
type PublicHandler struct {
	svc *service.Service
}

// NewPublicHandler создаёт Connect-обработчик публичного чтения пулов.
func NewPublicHandler(svc *service.Service) *PublicHandler {
	return &PublicHandler{svc: svc}
}

var _ hemav1connect.PoolPublicServiceHandler = (*PublicHandler)(nil)

// ListPublicPools возвращает пулы готовой раскладки номинации с составом,
// статусом и (если поставлен) площадкой; пустой список, пока раскладка
// draft (AC-14).
func (h *PublicHandler) ListPublicPools(
	ctx context.Context,
	req *connect.Request[hemav1.ListPublicPoolsRequest],
) (*connect.Response[hemav1.ListPublicPoolsResponse], error) {
	pools, err := h.svc.ListPublicPools(ctx, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ListPublicPoolsResponse{Pools: toProtoPools(pools)}), nil
}

// mapError переводит доменные ошибки в connect.Code.
func mapError(err error) error {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, domain.ErrInvalidInput):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, domain.ErrNotDraft),
		errors.Is(err, domain.ErrNoPools),
		errors.Is(err, domain.ErrNothingToUndo),
		errors.Is(err, domain.ErrNotReady),
		errors.Is(err, domain.ErrArenaBusy),
		errors.Is(err, domain.ErrAlreadySeated),
		errors.Is(err, domain.ErrPoolSeated),
		errors.Is(err, domain.ErrArenaNotAvailable):
		return connect.NewError(connect.CodeFailedPrecondition, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}

func toProtoLayout(l domain.Layout) *hemav1.PoolLayout {
	return &hemav1.PoolLayout{
		NominationId: l.NominationID,
		Status:       toProtoStatus(l.Status),
		Unassigned:   toProtoFighterRefs(l.Unassigned),
		Pools:        toProtoPools(l.Pools),
		CanUndo:      l.CanUndo,
	}
}

func toProtoPools(pools []domain.Pool) []*hemav1.Pool {
	out := make([]*hemav1.Pool, 0, len(pools))
	for _, p := range pools {
		out = append(out, toProtoPool(p))
	}
	return out
}

func toProtoPool(p domain.Pool) *hemav1.Pool {
	return &hemav1.Pool{
		Id:             p.ID,
		NominationId:   p.NominationID,
		Number:         int32(p.Number),
		Name:           poolName(p.Number),
		Members:        toProtoFighterRefs(p.Members),
		Status:         toProtoPoolStatus(p.Status),
		ArenaId:        p.ArenaID,
		ArenaName:      p.ArenaName,
		NominationName: p.NominationName,
	}
}

func toProtoFighterRefs(refs []domain.FighterRef) []*hemav1.FighterRef {
	out := make([]*hemav1.FighterRef, 0, len(refs))
	for _, f := range refs {
		out = append(out, &hemav1.FighterRef{FighterId: f.ID, Name: f.Name, Club: f.Club})
	}
	return out
}

// poolName генерирует презентационное имя пула из номера (спека 0009,
// FR-3): «Пул N». Не хранится отдельно — вычисляется из number на чтении.
func poolName(number int) string {
	return fmt.Sprintf("Пул %d", number)
}

func toProtoStatus(s domain.LayoutStatus) hemav1.PoolLayoutStatus {
	switch s {
	case domain.LayoutDraft:
		return hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_DRAFT
	case domain.LayoutReady:
		return hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY
	default:
		return hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_UNSPECIFIED
	}
}

func fromProtoStatus(s hemav1.PoolLayoutStatus) domain.LayoutStatus {
	switch s {
	case hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_DRAFT:
		return domain.LayoutDraft
	case hemav1.PoolLayoutStatus_POOL_LAYOUT_STATUS_READY:
		return domain.LayoutReady
	default:
		return ""
	}
}

// toProtoPoolStatus маппит статус отдельного пула (спека 0011, FR-1).
func toProtoPoolStatus(s domain.PoolStatus) hemav1.PoolStatus {
	switch s {
	case domain.PoolStatusNotReady:
		return hemav1.PoolStatus_POOL_STATUS_NOT_READY
	case domain.PoolStatusReady:
		return hemav1.PoolStatus_POOL_STATUS_READY
	case domain.PoolStatusPreparing:
		return hemav1.PoolStatus_POOL_STATUS_PREPARING
	case domain.PoolStatusActive:
		return hemav1.PoolStatus_POOL_STATUS_ACTIVE
	case domain.PoolStatusFinished:
		return hemav1.PoolStatus_POOL_STATUS_FINISHED
	default:
		return hemav1.PoolStatus_POOL_STATUS_UNSPECIFIED
	}
}
