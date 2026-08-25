package api

import (
	"context"
	"errors"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/fighter/domain"
	"github.com/hema/server/modules/fighter/service"
	"github.com/hema/server/pkg/connectutil"
)

// MeHandler реализует FighterServiceHandler — чтение своего бойца
// пользователем (спека 0038, ADR 0016: только владелец, только чтение).
type MeHandler struct {
	svc *service.Service
}

// NewMeHandler создаёт Connect-обработчик FighterService.
func NewMeHandler(svc *service.Service) *MeHandler {
	return &MeHandler{svc: svc}
}

var _ hemav1connect.FighterServiceHandler = (*MeHandler)(nil)

// GetMyFighter возвращает бойца вызывающего пользователя в турнире.
// Идентификатор пользователя берётся только из CallerID(ctx) (из
// access-токена) — поле запроса tournament_id используется исключительно как
// tournamentID для поиска, не как способ заявить чужого пользователя.
func (h *MeHandler) GetMyFighter(
	ctx context.Context,
	req *connect.Request[hemav1.GetMyFighterRequest],
) (*connect.Response[hemav1.GetMyFighterResponse], error) {
	userID := connectutil.CallerID(ctx)
	if userID == "" {
		// Страховка: Auth-интерсептор уже требует токен для этого RPC (он не
		// входит в publicProcedures), сюда без CallerID попасть не должно.
		// Проверка на случай ошибочного добавления процедуры в
		// publicProcedures в будущем.
		return nil, connect.NewError(connect.CodeUnauthenticated, errNoCaller)
	}

	f, err := h.svc.MyFighter(ctx, userID, req.Msg.GetTournamentId())
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			// Осознанное расхождение с общим mapError этого пакета: «у
			// пользователя нет бойца» — не ошибка, а нормальный ответ с
			// пустым fighter (FR-41, plan.md «Server»).
			return connect.NewResponse(&hemav1.GetMyFighterResponse{}), nil
		}
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.GetMyFighterResponse{Fighter: toProtoFighterPublic(f)}), nil
}

var errNoCaller = errors.New("fighter: missing caller id")
