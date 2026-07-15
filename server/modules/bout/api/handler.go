// Package api реализует Connect BoutAdminService: маппинг proto ↔ domain и
// ошибок. Домен админский — публичного сервиса нет (спека 0010, FR-8).
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

// AdminHandler реализует BoutAdminServiceHandler (чтение боёв, сформированных
// внутри пулов номинации). Доступ ограничен интерсептором RequireAdmin.
type AdminHandler struct {
	svc *service.Service
}

// NewAdminHandler создаёт Connect-обработчик admin-операций боёв.
func NewAdminHandler(svc *service.Service) *AdminHandler {
	return &AdminHandler{svc: svc}
}

var _ hemav1connect.BoutAdminServiceHandler = (*AdminHandler)(nil)

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
