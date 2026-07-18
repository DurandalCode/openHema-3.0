// Package api реализует Connect-хендлеры модуля bout: маппинг proto ↔
// domain и ошибок. Домен/сервис/репо не различают admin/public — оба
// сервиса читают один и тот же набор боёв (спека 0010, FR-8, урезано
// спекой 0011, FR-11: BoutPublicService — тот же read-хендлер, смонтирован
// без RequireAdmin).
package api

import (
	"context"
	"errors"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/bout/domain"
	"github.com/hema/server/modules/bout/service"
)

// AdminHandler реализует и BoutAdminServiceHandler (RequireAdmin), и
// BoutPublicServiceHandler (спека 0011, без RequireAdmin) — один и тот же
// read-хендлер, module.go монтирует его под обоими именами сервисов с
// разными наборами опций (план «Обзор решения»: «переиспользовать один и
// тот же handler-объект для обоих сервисов»).
type AdminHandler struct {
	svc *service.Service
}

// NewAdminHandler создаёт Connect-обработчик операций боёв (admin+public).
func NewAdminHandler(svc *service.Service) *AdminHandler {
	return &AdminHandler{svc: svc}
}

var (
	_ hemav1connect.BoutAdminServiceHandler  = (*AdminHandler)(nil)
	_ hemav1connect.BoutPublicServiceHandler = (*AdminHandler)(nil)
)

// ListBoutsByNomination возвращает бои всех пулов номинации, отсортированные
// по pool_id, затем sequence_number.
func (h *AdminHandler) ListBoutsByNomination(
	ctx context.Context,
	req *connect.Request[hemav1.ListBoutsByNominationRequest],
) (*connect.Response[hemav1.ListBoutsByNominationResponse], error) {
	bouts, err := h.svc.ListByNomination(ctx, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ListBoutsByNominationResponse{Bouts: toProtoBouts(bouts)}), nil
}

// ListPublicBoutsByNomination — публичное чтение (спека 0011, FR-11): тот
// же набор боёв, что и ListBoutsByNomination (см. BoutPublicService в
// bout.proto — публичная видимость регулируется PoolPublicService, не
// здесь).
func (h *AdminHandler) ListPublicBoutsByNomination(
	ctx context.Context,
	req *connect.Request[hemav1.ListBoutsByNominationRequest],
) (*connect.Response[hemav1.ListBoutsByNominationResponse], error) {
	return h.ListBoutsByNomination(ctx, req)
}

// mapError переводит доменные ошибки в connect.Code.
func mapError(err error) error {
	switch {
	case errors.Is(err, domain.ErrInvalidInput):
		return connect.NewError(connect.CodeInvalidArgument, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}

func toProtoBouts(bouts []domain.Bout) []*hemav1.Bout {
	out := make([]*hemav1.Bout, 0, len(bouts))
	for _, b := range bouts {
		out = append(out, &hemav1.Bout{
			Id:             b.ID,
			PoolId:         b.PoolID,
			NominationId:   b.NominationID,
			RoundNumber:    int32(b.RoundNumber),
			SequenceNumber: int32(b.SequenceNumber),
			FighterA:       toProtoFighterRef(b.FighterA),
			FighterB:       toProtoFighterRef(b.FighterB),
		})
	}
	return out
}

func toProtoFighterRef(f domain.FighterRef) *hemav1.BoutFighterRef {
	return &hemav1.BoutFighterRef{FighterId: f.ID, Name: f.Name, Club: f.Club}
}
