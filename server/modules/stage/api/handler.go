// Package api реализует Connect-хендлеры модуля pool: маппинг proto ↔
// domain и ошибок. StageAdminService — управление раскладкой (спека 0009),
// постановкой/снятием пула с арены (спека 0011), ведением текущего боя
// (спека 0013, RequireAdmin) и этапом-сеткой (спека 0018); StagePublicService
// — публичное чтение готовых пулов номинации (спека 0011, FR-11, без
// RequireAdmin).
package api

import (
	"context"
	"errors"
	"strings"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/stage/domain"
	"github.com/hema/server/modules/stage/service"
	"github.com/hema/server/pkg/connectutil"
)

// AdminHandler реализует StageAdminServiceHandler (управление раскладкой
// бойцов по пулам, постановка/снятие пула с арены, этап-сетка). Доступ
// ограничен интерсептором RequireAdmin.
type AdminHandler struct {
	svc *service.Service
}

// NewAdminHandler создаёт Connect-обработчик admin-операций пулов.
func NewAdminHandler(svc *service.Service) *AdminHandler {
	return &AdminHandler{svc: svc}
}

var _ hemav1connect.StageAdminServiceHandler = (*AdminHandler)(nil)

// ---------------------------------------------------------------------
// Спека 0018: этапы, посев сетки.
// ---------------------------------------------------------------------

// ListStages возвращает этапы номинации (FR-18). Материализует групповой
// этап, если строки ещё нет (0017, FR-4).
func (h *AdminHandler) ListStages(
	ctx context.Context,
	req *connect.Request[hemav1.ListStagesRequest],
) (*connect.Response[hemav1.ListStagesResponse], error) {
	stages, err := h.svc.ListStages(ctx, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ListStagesResponse{Stages: toProtoStages(stages)}), nil
}

// CreateStage добавляет номинации новый этап — сетку (0018, FR-2) либо
// групповой этап (спека 0019, FR-7). UNSPECIFIED отклоняется с
// InvalidArgument до вызова сервиса; остальные гейты по типу (валидный
// размер сетки, group_count у групп) — в service.CreateStage.
func (h *AdminHandler) CreateStage(
	ctx context.Context,
	req *connect.Request[hemav1.CreateStageRequest],
) (*connect.Response[hemav1.CreateStageResponse], error) {
	var stageType domain.StageType
	switch req.Msg.Type {
	case hemav1.StageType_STAGE_TYPE_BRACKET:
		stageType = domain.StageTypeBracket
	case hemav1.StageType_STAGE_TYPE_GROUPS:
		stageType = domain.StageTypeGroups
	default:
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("stage: type must be BRACKET or GROUPS"))
	}
	cfg := domain.BracketConfig{}
	if req.Msg.Bracket != nil {
		cfg = domain.BracketConfig{Size: int(req.Msg.Bracket.Size), ThirdPlace: req.Msg.Bracket.ThirdPlace}
	}
	created, stages, err := h.svc.CreateStage(ctx, req.Msg.NominationId, stageType, req.Msg.Title, cfg,
		domainGroupsConfig(req.Msg.Groups), domainSeedingRule(req.Msg.Rule))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.CreateStageResponse{Created: toProtoStage(created), Stages: toProtoStages(stages)}), nil
}

// SetStageRule задаёт или снимает правило отбора этапа (спека 0019, FR-1/
// FR-6). Rule не заполнен в запросе (nil) — снять правило.
func (h *AdminHandler) SetStageRule(
	ctx context.Context,
	req *connect.Request[hemav1.SetStageRuleRequest],
) (*connect.Response[hemav1.SetStageRuleResponse], error) {
	stage, err := h.svc.SetStageRule(ctx, req.Msg.StageId, domainSeedingRule(req.Msg.Rule))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.SetStageRuleResponse{Stage: toProtoStage(stage)}), nil
}

// PreviewStageBuild считает, кто будет отобран текущим правилом этапа и
// куда каждый попадёт, без применения (спека 0019, FR-15).
func (h *AdminHandler) PreviewStageBuild(
	ctx context.Context,
	req *connect.Request[hemav1.PreviewStageBuildRequest],
) (*connect.Response[hemav1.PreviewStageBuildResponse], error) {
	preview, err := h.svc.PreviewStageBuild(ctx, req.Msg.StageId, domainTieResolutions(req.Msg.Ties))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.PreviewStageBuildResponse{Preview: toProtoStageBuildPreview(preview)}), nil
}

// BuildStage применяет план последнего PreviewStageBuild этого же вызова
// (спека 0019, FR-16): результат — Layout у целевого группового этапа,
// Bracket у целевой сетки (service.BuildStage возвращает ровно одно из
// двух, второе остаётся нулевым — Bracket.Stage.ID пуст, если применения к
// сетке не было).
func (h *AdminHandler) BuildStage(
	ctx context.Context,
	req *connect.Request[hemav1.BuildStageRequest],
) (*connect.Response[hemav1.BuildStageResponse], error) {
	layout, bracket, err := h.svc.BuildStage(ctx, req.Msg.StageId, domainTieResolutions(req.Msg.Ties))
	if err != nil {
		return nil, mapError(err)
	}
	resp := &hemav1.BuildStageResponse{}
	if bracket.Stage.ID != "" {
		resp.Result = &hemav1.BuildStageResponse_Bracket{Bracket: toProtoBracket(bracket)}
	} else {
		resp.Result = &hemav1.BuildStageResponse_Layout{Layout: toProtoLayout(layout)}
	}
	return connect.NewResponse(resp), nil
}

// DeleteStage удаляет этап-сетку, пока в ней не начат ни один бой (FR-3).
func (h *AdminHandler) DeleteStage(
	ctx context.Context,
	req *connect.Request[hemav1.DeleteStageRequest],
) (*connect.Response[hemav1.DeleteStageResponse], error) {
	stages, err := h.svc.DeleteStage(ctx, req.Msg.StageId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.DeleteStageResponse{Stages: toProtoStages(stages)}), nil
}

// GetBracket возвращает админский вид сетки (FR-7/FR-19).
func (h *AdminHandler) GetBracket(
	ctx context.Context,
	req *connect.Request[hemav1.GetBracketRequest],
) (*connect.Response[hemav1.GetBracketResponse], error) {
	bracket, err := h.svc.GetBracket(ctx, req.Msg.StageId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.GetBracketResponse{Bracket: toProtoBracket(bracket)}), nil
}

// SeedBracketSlot сажает бойца в слот первого круга (FR-7/FR-8).
func (h *AdminHandler) SeedBracketSlot(
	ctx context.Context,
	req *connect.Request[hemav1.SeedBracketSlotRequest],
) (*connect.Response[hemav1.SeedBracketSlotResponse], error) {
	bracket, err := h.svc.SeedBracketSlot(ctx, req.Msg.StageId, int(req.Msg.Slot), req.Msg.FighterId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.SeedBracketSlotResponse{Bracket: toProtoBracket(bracket)}), nil
}

// ClearBracketSlot освобождает слот (FR-8). Идемпотентно.
func (h *AdminHandler) ClearBracketSlot(
	ctx context.Context,
	req *connect.Request[hemav1.ClearBracketSlotRequest],
) (*connect.Response[hemav1.ClearBracketSlotResponse], error) {
	bracket, err := h.svc.ClearBracketSlot(ctx, req.Msg.StageId, int(req.Msg.Slot))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ClearBracketSlotResponse{Bracket: toProtoBracket(bracket)}), nil
}

// GetLayout возвращает раскладку этапа (спека 0018, FR-18 — адресация
// переехала с номинации на этап).
func (h *AdminHandler) GetLayout(
	ctx context.Context,
	req *connect.Request[hemav1.GetLayoutRequest],
) (*connect.Response[hemav1.GetLayoutResponse], error) {
	layout, err := h.svc.GetLayout(ctx, req.Msg.StageId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.GetLayoutResponse{Layout: toProtoLayout(layout)}), nil
}

// CreatePool создаёт пул в этапе.
func (h *AdminHandler) CreatePool(
	ctx context.Context,
	req *connect.Request[hemav1.CreatePoolRequest],
) (*connect.Response[hemav1.CreatePoolResponse], error) {
	layout, err := h.svc.CreatePool(ctx, req.Msg.StageId)
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

// ResetLayout удаляет все пулы этапа, возвращает всех бойцов в
// нераспределённые.
func (h *AdminHandler) ResetLayout(
	ctx context.Context,
	req *connect.Request[hemav1.ResetLayoutRequest],
) (*connect.Response[hemav1.ResetLayoutResponse], error) {
	layout, err := h.svc.ResetLayout(ctx, req.Msg.StageId)
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
	layout, err := h.svc.AssignFighter(ctx, req.Msg.StageId, req.Msg.FighterId, req.Msg.PoolId)
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
	layout, err := h.svc.UnassignFighter(ctx, req.Msg.StageId, req.Msg.FighterId)
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
	layout, err := h.svc.AutoDistribute(ctx, req.Msg.StageId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.AutoDistributeResponse{Layout: toProtoLayout(layout)}), nil
}

// Undo откатывает последнее mutating-действие (авто, удаление пула или сброс).
func (h *AdminHandler) Undo(
	ctx context.Context,
	req *connect.Request[hemav1.UndoRequest],
) (*connect.Response[hemav1.UndoResponse], error) {
	layout, err := h.svc.Undo(ctx, req.Msg.StageId)
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
	layout, err := h.svc.SetStatus(ctx, req.Msg.StageId, fromProtoStatus(req.Msg.Status))
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

// ---------------------------------------------------------------------
// Спека 0013: ведение текущего боя пула на арене (доска ведения).
// ---------------------------------------------------------------------

// GetBoutBoard возвращает доску ведения боёв арены (спека 0013, FR-14):
// board пуст, если на арене никто не стоит.
func (h *AdminHandler) GetBoutBoard(
	ctx context.Context,
	req *connect.Request[hemav1.GetBoutBoardRequest],
) (*connect.Response[hemav1.GetBoutBoardResponse], error) {
	board, err := h.svc.GetBoutBoard(ctx, req.Msg.ArenaId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.GetBoutBoardResponse{Board: toProtoBoard(board)}), nil
}

// SetCurrentBout назначает текущим любой бой пула — циркуляция (спека
// 0013, FR-8).
func (h *AdminHandler) SetCurrentBout(
	ctx context.Context,
	req *connect.Request[hemav1.SetCurrentBoutRequest],
) (*connect.Response[hemav1.SetCurrentBoutResponse], error) {
	board, err := h.svc.SetCurrentBout(ctx, req.Msg.PoolId, req.Msg.BoutId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.SetCurrentBoutResponse{Board: toProtoBoard(board)}), nil
}

// StartCurrentBout переводит текущий бой пула не начат → идёт (спека 0013,
// FR-4).
func (h *AdminHandler) StartCurrentBout(
	ctx context.Context,
	req *connect.Request[hemav1.StartCurrentBoutRequest],
) (*connect.Response[hemav1.StartCurrentBoutResponse], error) {
	board, err := h.svc.StartCurrentBout(ctx, req.Msg.PoolId, connectutil.CallerID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.StartCurrentBoutResponse{Board: toProtoBoard(board)}), nil
}

// ScoreCurrentBout задаёт абсолютный счёт текущего боя (спека 0013,
// FR-2/FR-2a).
func (h *AdminHandler) ScoreCurrentBout(
	ctx context.Context,
	req *connect.Request[hemav1.ScoreCurrentBoutRequest],
) (*connect.Response[hemav1.ScoreCurrentBoutResponse], error) {
	board, err := h.svc.ScoreCurrentBout(ctx, req.Msg.PoolId, connectutil.CallerID(ctx), int(req.Msg.ScoreA), int(req.Msg.ScoreB))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ScoreCurrentBoutResponse{Board: toProtoBoard(board)}), nil
}

// FinishCurrentBout переводит текущий бой идёт → завершён и автоматически
// продвигает текущий указатель пула (спека 0013, FR-5/FR-9; спека 0018,
// FR-15 — ничья в сетке отклоняется).
func (h *AdminHandler) FinishCurrentBout(
	ctx context.Context,
	req *connect.Request[hemav1.FinishCurrentBoutRequest],
) (*connect.Response[hemav1.FinishCurrentBoutResponse], error) {
	board, err := h.svc.FinishCurrentBout(ctx, req.Msg.PoolId, connectutil.CallerID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.FinishCurrentBoutResponse{Board: toProtoBoard(board)}), nil
}

// ReopenCurrentBout переводит текущий бой завершён → идёт для правки счёта
// (спека 0013, FR-6; спека 0018, FR-16 — отклоняется, если следующий бой
// уже начат).
func (h *AdminHandler) ReopenCurrentBout(
	ctx context.Context,
	req *connect.Request[hemav1.ReopenCurrentBoutRequest],
) (*connect.Response[hemav1.ReopenCurrentBoutResponse], error) {
	board, err := h.svc.ReopenCurrentBout(ctx, req.Msg.PoolId, connectutil.CallerID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ReopenCurrentBoutResponse{Board: toProtoBoard(board)}), nil
}

// ResetCurrentBout переводит текущий бой идёт → не начат, счёт обнуляется
// (спека 0013, FR-6).
func (h *AdminHandler) ResetCurrentBout(
	ctx context.Context,
	req *connect.Request[hemav1.ResetCurrentBoutRequest],
) (*connect.Response[hemav1.ResetCurrentBoutResponse], error) {
	board, err := h.svc.ResetCurrentBout(ctx, req.Msg.PoolId, connectutil.CallerID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ResetCurrentBoutResponse{Board: toProtoBoard(board)}), nil
}

// ---------------------------------------------------------------------
// Спека 0015: живой канал табло арены (недоменный таймер, ADR 0013 — сервер
// как реле).
// ---------------------------------------------------------------------

// WatchArenaBoard — server-streaming живой канал табло арены (спека 0015,
// FR-1..FR-5/FR-14/FR-18): первый кадр — текущий снапшот (доска + таймер +
// комната), далее — по одному кадру на изменение доски/таймера/состава
// комнаты/swap (снапшот) либо на команду панели, адресованную этому
// участнику как источнику (команда). Завершается без ошибки по отмене
// контекста клиентом (обрыв соединения — штатный путь, как
// WatchNominationLive).
//
// ИЗВЕСТНЫЙ ПРОБЕЛ (обнаружен при написании этого хендлера, спека 0015,
// вне скоупа модуля pool): смонтированные на StageAdminService интерсепторы
// connectutil.Auth/RequireAdmin — connect.UnaryInterceptorFunc, у которого
// WrapStreamingHandler — намеренный no-op в самом connect-go («has no
// effect on streaming RPCs»). Это означает, что FR-1 («Admin-only») сейчас
// НЕ соблюдается для этого RPC — запрос без токена/от не-admin проходит и
// получает обычный снапшот. WatchNominationLive (спека 0014) — тоже
// streaming, но намеренно публичный, поэтому тот же пробел там незаметен.
// Фикс требует правки server/pkg/connectutil (полноценный
// connect.Interceptor с реальным WrapStreamingHandler) — за пределами
// разрешённых для этого трека файлов (server/modules/stage/**), см.
// handler_test.go рядом с (отсутствующими намеренно) auth-тестами этого
// RPC.
func (h *AdminHandler) WatchArenaBoard(
	ctx context.Context,
	req *connect.Request[hemav1.WatchArenaBoardRequest],
	stream *connect.ServerStream[hemav1.WatchArenaBoardResponse],
) error {
	arenaID := strings.TrimSpace(req.Msg.ArenaId)
	if arenaID == "" {
		return mapError(domain.ErrInvalidInput)
	}

	member := h.svc.JoinArenaBoard(arenaID, toDomainScoreboardRole(req.Msg.Role))
	defer member.Leave()

	snap, err := h.svc.ArenaLive(ctx, arenaID, member)
	if err != nil {
		return mapError(err)
	}
	if err := stream.Send(&hemav1.WatchArenaBoardResponse{
		Event: &hemav1.WatchArenaBoardResponse_Snapshot{Snapshot: toProtoArenaLiveSnapshot(snap)},
	}); err != nil {
		return err
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-member.BoardChanged():
			snap, err := h.svc.ArenaLive(ctx, arenaID, member)
			if err != nil {
				return mapError(err)
			}
			if err := stream.Send(&hemav1.WatchArenaBoardResponse{
				Event: &hemav1.WatchArenaBoardResponse_Snapshot{Snapshot: toProtoArenaLiveSnapshot(snap)},
			}); err != nil {
				return err
			}
		case cmd := <-member.Commands():
			if err := stream.Send(&hemav1.WatchArenaBoardResponse{
				Event: &hemav1.WatchArenaBoardResponse_Command{Command: toProtoTimerCommand(cmd)},
			}); err != nil {
				return err
			}
		}
	}
}

// PublishTimerFrame — авторитетное табло публикует полное состояние таймера
// (спека 0015, ADR 0013): сервер кеширует и ретранслирует, не проверяя
// личность вызывающего.
func (h *AdminHandler) PublishTimerFrame(
	ctx context.Context,
	req *connect.Request[hemav1.PublishTimerFrameRequest],
) (*connect.Response[hemav1.PublishTimerFrameResponse], error) {
	snap, err := h.svc.PublishTimerFrame(ctx, req.Msg.ArenaId, toDomainTimerFrame(req.Msg.Frame))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.PublishTimerFrameResponse{Snapshot: toProtoArenaLiveSnapshot(snap)}), nil
}

// ControlArenaTimer ретранслирует команду панели текущему источнику таймера
// (спека 0015, FR-7).
func (h *AdminHandler) ControlArenaTimer(
	ctx context.Context,
	req *connect.Request[hemav1.ControlArenaTimerRequest],
) (*connect.Response[hemav1.ControlArenaTimerResponse], error) {
	snap, err := h.svc.ControlArenaTimer(ctx, req.Msg.ArenaId, toDomainTimerCommand(req.Msg.Command))
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ControlArenaTimerResponse{Snapshot: toProtoArenaLiveSnapshot(snap)}), nil
}

// SetScoreboardSides — эфемерный swap синий/красный (спека 0015, FR-6).
func (h *AdminHandler) SetScoreboardSides(
	ctx context.Context,
	req *connect.Request[hemav1.SetScoreboardSidesRequest],
) (*connect.Response[hemav1.SetScoreboardSidesResponse], error) {
	snap, err := h.svc.SetScoreboardSides(ctx, req.Msg.ArenaId, req.Msg.Swapped)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.SetScoreboardSidesResponse{Snapshot: toProtoArenaLiveSnapshot(snap)}), nil
}

// RevealCurrentBout — секретарь явно показывает текущий бой на всех
// подключённых табло (спека 0015, UX-уточнение): развязывает оглашение
// результата и переход к следующему бою на табло на разные кнопки панели.
func (h *AdminHandler) RevealCurrentBout(
	ctx context.Context,
	req *connect.Request[hemav1.RevealCurrentBoutRequest],
) (*connect.Response[hemav1.RevealCurrentBoutResponse], error) {
	snap, err := h.svc.RevealCurrentBout(ctx, req.Msg.ArenaId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.RevealCurrentBoutResponse{Snapshot: toProtoArenaLiveSnapshot(snap)}), nil
}

// PublicHandler реализует StagePublicServiceHandler (спека 0011, FR-11):
// публичное чтение пулов готовой раскладки номинации. Без RequireAdmin.
type PublicHandler struct {
	svc *service.Service
}

// NewPublicHandler создаёт Connect-обработчик публичного чтения пулов.
func NewPublicHandler(svc *service.Service) *PublicHandler {
	return &PublicHandler{svc: svc}
}

var _ hemav1connect.StagePublicServiceHandler = (*PublicHandler)(nil)

// ListPublicPools возвращает пулы только групповых этапов номинации с
// составом, статусом и (если поставлен) площадкой (спека 0011, FR-11/FR-12;
// спека 0018 — сетка публикуется отдельно через GetNominationLive.brackets).
// Stages — этапы номинации (спека 0017, FR-11).
func (h *PublicHandler) ListPublicPools(
	ctx context.Context,
	req *connect.Request[hemav1.ListPublicPoolsRequest],
) (*connect.Response[hemav1.ListPublicPoolsResponse], error) {
	pools, err := h.svc.ListPublicPools(ctx, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	stages, err := h.svc.StagesForNomination(ctx, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.ListPublicPoolsResponse{Pools: toProtoPools(pools), Stages: toProtoStages(stages)}), nil
}

// ---------------------------------------------------------------------
// Спека 0014: публичный живой снапшот номинации (bout state/score/outcome +
// исполнительный статус пула, экран номинации). Спека 0018: brackets.
// ---------------------------------------------------------------------

// GetNominationLive возвращает живой снапшот номинации (спека 0014, FR-1..
// FR-3): пустой список пулов, пока раскладка draft (FR-12); brackets —
// зафиксированные сетки номинации (спека 0018, FR-19).
func (h *PublicHandler) GetNominationLive(
	ctx context.Context,
	req *connect.Request[hemav1.GetNominationLiveRequest],
) (*connect.Response[hemav1.GetNominationLiveResponse], error) {
	snap, err := h.svc.NominationLive(ctx, req.Msg.NominationId)
	if err != nil {
		return nil, mapError(err)
	}
	return connect.NewResponse(&hemav1.GetNominationLiveResponse{Snapshot: toProtoNominationSnapshot(snap)}), nil
}

// WatchNominationLive — server-streaming живой канал (спека 0014, FR-6/FR-8):
// первый кадр — текущий снапшот (как GetNominationLive), далее — по одному
// кадру на каждый сигнал шины (ADR 0012: сигнал без payload, «топик мог
// измениться» — перечитываем снапшот целиком, не полагаемся на порядок/
// накопление сигналов). Завершается без ошибки, когда клиент отменяет
// контекст запроса (обрыв соединения — штатный путь для watch-стримов, не
// ошибка).
func (h *PublicHandler) WatchNominationLive(
	ctx context.Context,
	req *connect.Request[hemav1.WatchNominationLiveRequest],
	stream *connect.ServerStream[hemav1.WatchNominationLiveResponse],
) error {
	nominationID := strings.TrimSpace(req.Msg.NominationId)
	if nominationID == "" {
		return mapError(domain.ErrInvalidInput)
	}

	snap, err := h.svc.NominationLive(ctx, nominationID)
	if err != nil {
		return mapError(err)
	}
	if err := stream.Send(&hemav1.WatchNominationLiveResponse{Snapshot: toProtoNominationSnapshot(snap)}); err != nil {
		return err
	}

	ch, cancel := h.svc.SubscribeNomination(nominationID)
	defer cancel()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ch:
			snap, err := h.svc.NominationLive(ctx, nominationID)
			if err != nil {
				return mapError(err)
			}
			if err := stream.Send(&hemav1.WatchNominationLiveResponse{Snapshot: toProtoNominationSnapshot(snap)}); err != nil {
				return err
			}
		}
	}
}

// mapError переводит доменные ошибки в connect.Code. Спека 0018 добавляет
// ErrStageTypeMismatch/ErrDrawNotAllowed/ErrDownstreamStarted/
// ErrSlotOccupied/ErrStageNotDeletable/ErrNotEnoughSeeds →
// FailedPrecondition (план «api/handler.go»).
func mapError(err error) error {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, domain.ErrInvalidInput):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, domain.ErrConcurrency):
		return connect.NewError(connect.CodeAborted, err)
	case errors.Is(err, domain.ErrNotDraft),
		errors.Is(err, domain.ErrNoPools),
		errors.Is(err, domain.ErrNothingToUndo),
		errors.Is(err, domain.ErrNotReady),
		errors.Is(err, domain.ErrArenaBusy),
		errors.Is(err, domain.ErrAlreadySeated),
		errors.Is(err, domain.ErrPoolSeated),
		errors.Is(err, domain.ErrArenaNotAvailable),
		errors.Is(err, domain.ErrPoolNotSeated),
		errors.Is(err, domain.ErrNoCurrentBout),
		errors.Is(err, domain.ErrHasResults),
		errors.Is(err, domain.ErrInvalidTransition),
		errors.Is(err, domain.ErrStageTypeMismatch),
		errors.Is(err, domain.ErrDrawNotAllowed),
		errors.Is(err, domain.ErrDownstreamStarted),
		errors.Is(err, domain.ErrSlotOccupied),
		errors.Is(err, domain.ErrStageNotDeletable),
		errors.Is(err, domain.ErrNotEnoughSeeds),
		errors.Is(err, domain.ErrNoSeedingRule),
		errors.Is(err, domain.ErrStageNotEmpty),
		errors.Is(err, domain.ErrRuleLocked),
		errors.Is(err, domain.ErrSelectorOverlap),
		errors.Is(err, domain.ErrCapacityExceeded),
		errors.Is(err, domain.ErrTieUnresolved),
		errors.Is(err, domain.ErrStageIsSource):
		return connect.NewError(connect.CodeFailedPrecondition, err)
	case errors.Is(err, domain.ErrInvalidRule),
		errors.Is(err, domain.ErrSourceNotAllowed):
		return connect.NewError(connect.CodeInvalidArgument, err)
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
		Stage:        toProtoStage(l.Stage),
	}
}

// toProtoStage маппит этап номинации (спека 0017, FR-1/FR-11; спека 0018 —
// status/bracket). Виртуальный этап (Stage.ID пуст — строки в БД ещё нет,
// см. service.virtualStage) маппится как обычно: пустой id, остальные поля
// — дефолты этапа.
func toProtoStage(s domain.Stage) *hemav1.Stage {
	out := &hemav1.Stage{
		Id:           s.ID,
		NominationId: s.NominationID,
		Position:     int32(s.Position),
		Title:        s.Title,
		Type:         toProtoStageType(s.Type),
		Status:       toProtoStatus(s.Status),
		Groups:       toProtoGroupsConfig(s.Groups),
		Rule:         toProtoSeedingRule(s.Rule),
	}
	if s.Type == domain.StageTypeBracket {
		out.Bracket = &hemav1.BracketConfig{Size: int32(s.Bracket.Size), ThirdPlace: s.Bracket.ThirdPlace}
	}
	return out
}

// ---------------------------------------------------------------------
// Спека 0019: переходы между этапами (правило отбора, превью, формирование).
// ---------------------------------------------------------------------

// toProtoGroupsConfig — Stage.groups заполнен только у явно созданного
// группового этапа (GroupCount > 0, FR-8); у авто-этапа (0017, FR-4,
// GroupCount = 0) — nil (FR-9).
func toProtoGroupsConfig(g domain.GroupsConfig) *hemav1.GroupsConfig {
	if g.GroupCount <= 0 {
		return nil
	}
	return &hemav1.GroupsConfig{GroupCount: int32(g.GroupCount)}
}

func domainGroupsConfig(g *hemav1.GroupsConfig) domain.GroupsConfig {
	if g == nil {
		return domain.GroupsConfig{}
	}
	return domain.GroupsConfig{GroupCount: int(g.GroupCount)}
}

// toProtoSeedingRule — Stage.rule не заполнен (nil), если у этапа правила
// нет (FR-1) — presence, а не нулевые значения полей, отличает «нет
// правила» от заданного.
func toProtoSeedingRule(r domain.SeedingRule) *hemav1.SeedingRule {
	if r.IsZero() {
		return nil
	}
	return &hemav1.SeedingRule{
		SourceKind:    toProtoStageSourceKind(r.SourceKind),
		SourceStageId: r.SourceStageID,
		Selector:      toProtoStageSelectorKind(r.Selector),
		PlaceFrom:     int32(r.PlaceFrom),
		PlaceTo:       int32(r.PlaceTo),
		Method:        toProtoStageLayoutMethod(r.Method),
	}
}

func domainSeedingRule(r *hemav1.SeedingRule) domain.SeedingRule {
	if r == nil {
		return domain.SeedingRule{}
	}
	return domain.SeedingRule{
		SourceKind:    domainSourceKind(r.SourceKind),
		SourceStageID: r.SourceStageId,
		Selector:      domainSelectorKind(r.Selector),
		PlaceFrom:     int(r.PlaceFrom),
		PlaceTo:       int(r.PlaceTo),
		Method:        domainLayoutMethod(r.Method),
	}
}

func toProtoStageSourceKind(k domain.SourceKind) hemav1.StageSourceKind {
	switch k {
	case domain.SourceKindRoster:
		return hemav1.StageSourceKind_STAGE_SOURCE_KIND_ROSTER
	case domain.SourceKindStage:
		return hemav1.StageSourceKind_STAGE_SOURCE_KIND_STAGE
	default:
		return hemav1.StageSourceKind_STAGE_SOURCE_KIND_UNSPECIFIED
	}
}

func domainSourceKind(k hemav1.StageSourceKind) domain.SourceKind {
	switch k {
	case hemav1.StageSourceKind_STAGE_SOURCE_KIND_ROSTER:
		return domain.SourceKindRoster
	case hemav1.StageSourceKind_STAGE_SOURCE_KIND_STAGE:
		return domain.SourceKindStage
	default:
		return ""
	}
}

func toProtoStageSelectorKind(k domain.SelectorKind) hemav1.StageSelectorKind {
	switch k {
	case domain.SelectorKindAll:
		return hemav1.StageSelectorKind_STAGE_SELECTOR_KIND_ALL
	case domain.SelectorKindGroupPlaces:
		return hemav1.StageSelectorKind_STAGE_SELECTOR_KIND_GROUP_PLACES
	case domain.SelectorKindOverallPlaces:
		return hemav1.StageSelectorKind_STAGE_SELECTOR_KIND_OVERALL_PLACES
	default:
		return hemav1.StageSelectorKind_STAGE_SELECTOR_KIND_UNSPECIFIED
	}
}

func domainSelectorKind(k hemav1.StageSelectorKind) domain.SelectorKind {
	switch k {
	case hemav1.StageSelectorKind_STAGE_SELECTOR_KIND_ALL:
		return domain.SelectorKindAll
	case hemav1.StageSelectorKind_STAGE_SELECTOR_KIND_GROUP_PLACES:
		return domain.SelectorKindGroupPlaces
	case hemav1.StageSelectorKind_STAGE_SELECTOR_KIND_OVERALL_PLACES:
		return domain.SelectorKindOverallPlaces
	default:
		return ""
	}
}

func toProtoStageLayoutMethod(m domain.LayoutMethod) hemav1.StageLayoutMethod {
	switch m {
	case domain.LayoutMethodSnake:
		return hemav1.StageLayoutMethod_STAGE_LAYOUT_METHOD_SNAKE
	case domain.LayoutMethodSeeded:
		return hemav1.StageLayoutMethod_STAGE_LAYOUT_METHOD_SEEDED
	default:
		return hemav1.StageLayoutMethod_STAGE_LAYOUT_METHOD_UNSPECIFIED
	}
}

func domainLayoutMethod(m hemav1.StageLayoutMethod) domain.LayoutMethod {
	switch m {
	case hemav1.StageLayoutMethod_STAGE_LAYOUT_METHOD_SNAKE:
		return domain.LayoutMethodSnake
	case hemav1.StageLayoutMethod_STAGE_LAYOUT_METHOD_SEEDED:
		return domain.LayoutMethodSeeded
	default:
		return ""
	}
}

func domainTieResolutions(in []*hemav1.TieResolution) []domain.TieResolution {
	out := make([]domain.TieResolution, 0, len(in))
	for _, t := range in {
		out = append(out, domain.TieResolution{SourcePoolID: t.SourcePoolId, Place: int(t.Place), FighterIDs: t.FighterIds})
	}
	return out
}

// toProtoStageBuildEntries объединяет отобранных (Entries) с планом
// раскладки (Groups/Seeds — заполнено ровно одно из двух, по типу целевого
// этапа) в проекцию для показа (FR-15): у кого какой TargetPoolNumber/
// TargetSlot.
func toProtoStageBuildEntries(preview domain.StageBuildPreview) []*hemav1.StageBuildEntry {
	slotByFighter := make(map[string]int32, len(preview.Seeds))
	for _, sp := range preview.Seeds {
		slotByFighter[sp.FighterID] = int32(sp.Slot)
	}
	poolByFighter := make(map[string]int32, len(preview.Groups))
	for _, g := range preview.Groups {
		for _, fid := range g.FighterIDs {
			poolByFighter[fid] = int32(g.Number)
		}
	}
	out := make([]*hemav1.StageBuildEntry, 0, len(preview.Entries))
	for _, sf := range preview.Entries {
		out = append(out, &hemav1.StageBuildEntry{
			Fighter:          toProtoFighterRef(sf.Fighter),
			OriginLabel:      sf.OriginLabel,
			SourcePlace:      int32(sf.GroupPlace),
			OverallPlace:     int32(sf.OverallPlace),
			TargetPoolNumber: poolByFighter[sf.Fighter.ID],
			TargetSlot:       slotByFighter[sf.Fighter.ID],
		})
	}
	return out
}

func toProtoStageBuildTies(ties []domain.TieAsk) []*hemav1.StageBuildTie {
	out := make([]*hemav1.StageBuildTie, 0, len(ties))
	for _, t := range ties {
		out = append(out, &hemav1.StageBuildTie{
			SourcePoolId: t.SourcePoolID,
			GroupLabel:   t.GroupLabel,
			Place:        int32(t.Place),
			Contenders:   toProtoFighterRefs(t.Contenders),
			SlotsLeft:    int32(t.SlotsLeft),
		})
	}
	return out
}

func toProtoStageBuildPreview(preview domain.StageBuildPreview) *hemav1.StageBuildPreview {
	return &hemav1.StageBuildPreview{
		Entries:               toProtoStageBuildEntries(preview),
		Unselected:            toProtoFighterRefs(preview.Unselected),
		Capacity:              int32(preview.Capacity),
		Ties:                  toProtoStageBuildTies(preview.Ties),
		Overlaps:              toProtoFighterRefs(preview.Overlaps),
		SourceUnfinishedBouts: int32(preview.SourceUnfinishedBouts),
	}
}

func toProtoStages(stages []domain.Stage) []*hemav1.Stage {
	out := make([]*hemav1.Stage, 0, len(stages))
	for _, s := range stages {
		out = append(out, toProtoStage(s))
	}
	return out
}

func toProtoStageType(t domain.StageType) hemav1.StageType {
	switch t {
	case domain.StageTypeGroups:
		return hemav1.StageType_STAGE_TYPE_GROUPS
	case domain.StageTypeBracket:
		return hemav1.StageType_STAGE_TYPE_BRACKET
	default:
		return hemav1.StageType_STAGE_TYPE_UNSPECIFIED
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
		Name:           p.Name,
		Members:        toProtoFighterRefs(p.Members),
		Status:         toProtoPoolStatus(p.Status),
		ArenaId:        p.ArenaID,
		ArenaName:      p.ArenaName,
		NominationName: p.NominationName,
		Standings:      toProtoStandings(p.Standings),
		StageId:        p.StageID,
	}
}

func toProtoFighterRefs(refs []domain.FighterRef) []*hemav1.FighterRef {
	out := make([]*hemav1.FighterRef, 0, len(refs))
	for _, f := range refs {
		out = append(out, &hemav1.FighterRef{FighterId: f.ID, Name: f.Name, Club: f.Club})
	}
	return out
}

func toProtoFighterRef(f domain.FighterRef) *hemav1.FighterRef {
	return &hemav1.FighterRef{FighterId: f.ID, Name: f.Name, Club: f.Club}
}

// toProtoStandings маппит итоговую таблицу пула (спека 0016). Пустой срез
// (не nil), если Standings пуст — согласуется с остальными repeated-полями
// этого файла (FR-7: пусто значит «нечего показывать»).
func toProtoStandings(standings []domain.Standing) []*hemav1.PoolStanding {
	out := make([]*hemav1.PoolStanding, 0, len(standings))
	for _, s := range standings {
		out = append(out, &hemav1.PoolStanding{
			Fighter:        &hemav1.FighterRef{FighterId: s.Fighter.ID, Name: s.Fighter.Name, Club: s.Fighter.Club},
			Wins:           int32(s.Wins),
			Draws:          int32(s.Draws),
			Losses:         int32(s.Losses),
			PointsScored:   int32(s.PointsScored),
			PointsConceded: int32(s.PointsConceded),
			Place:          int32(s.Place),
		})
	}
	return out
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

// toProtoPoolStatus маппит статус отдельного пула (спека 0011, FR-1;
// active/finished наполнены спекой 0013, FR-10).
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

// toProtoBoard маппит доску ведения (спека 0013, FR-14). Пустой
// domain.BoutBoard (Pool.ID пуст — на арене никто не стоит) даёт нулевой
// *hemav1.BoutBoard{} (Pool=nil, Bouts=[], CurrentBoutId="") — proto-поле
// board в ответе присутствует, но без содержимого.
func toProtoBoard(b domain.BoutBoard) *hemav1.BoutBoard {
	out := &hemav1.BoutBoard{Bouts: toProtoBoardBouts(b.Bouts), CurrentBoutId: b.CurrentBoutID}
	if b.Pool.ID != "" {
		out.Pool = toProtoPool(b.Pool)
	}
	return out
}

func toProtoBoardBouts(bouts []domain.BoutRef) []*hemav1.BoardBout {
	out := make([]*hemav1.BoardBout, 0, len(bouts))
	for _, b := range bouts {
		out = append(out, toProtoBoardBout(b))
	}
	return out
}

func toProtoBoardBout(b domain.BoutRef) *hemav1.BoardBout {
	return &hemav1.BoardBout{
		Id:             b.ID,
		RoundNumber:    int32(b.RoundNumber),
		SequenceNumber: int32(b.SequenceNumber),
		FighterA:       &hemav1.FighterRef{FighterId: b.FighterA.ID, Name: b.FighterA.Name, Club: b.FighterA.Club},
		FighterB:       &hemav1.FighterRef{FighterId: b.FighterB.ID, Name: b.FighterB.Name, Club: b.FighterB.Club},
		State:          toProtoBoutState(b.State),
		ScoreA:         int32(b.ScoreA),
		ScoreB:         int32(b.ScoreB),
	}
}

// toProtoNominationSnapshot маппит живой снапшот номинации (спека 0014,
// FR-1..FR-3). Stages — этапы номинации (спека 0017, FR-11). Brackets —
// сетки номинации (спека 0018, FR-19).
func toProtoNominationSnapshot(s domain.NominationSnapshot) *hemav1.NominationLiveSnapshot {
	out := &hemav1.NominationLiveSnapshot{
		NominationId: s.NominationID,
		Pools:        make([]*hemav1.LivePool, 0, len(s.Pools)),
		Stages:       toProtoStages(s.Stages),
		Brackets:     make([]*hemav1.Bracket, 0, len(s.Brackets)),
	}
	for _, p := range s.Pools {
		out.Pools = append(out.Pools, toProtoLivePool(p))
	}
	for _, b := range s.Brackets {
		out.Brackets = append(out.Brackets, toProtoBracket(b))
	}
	return out
}

// toProtoLivePool маппит один пул живого снапшота (спека 0014): переиспользует
// toProtoPool/toProtoBoardBouts — та же композиция/бои, что и на доске
// ведения (BoutBoard), просто без обёртки в одну арену.
func toProtoLivePool(p domain.LivePool) *hemav1.LivePool {
	return &hemav1.LivePool{
		Pool:          toProtoPool(p.Pool),
		Bouts:         toProtoBoardBouts(p.Bouts),
		CurrentBoutId: p.CurrentBoutID,
	}
}

// toProtoBoutState маппит состояние боя доски ведения (спека 0013, FR-1).
func toProtoBoutState(s domain.BoutState) hemav1.BoutState {
	switch s {
	case domain.BoutStateNotStarted:
		return hemav1.BoutState_BOUT_STATE_NOT_STARTED
	case domain.BoutStateInProgress:
		return hemav1.BoutState_BOUT_STATE_IN_PROGRESS
	case domain.BoutStateFinished:
		return hemav1.BoutState_BOUT_STATE_FINISHED
	default:
		return hemav1.BoutState_BOUT_STATE_UNSPECIFIED
	}
}

// ---------------------------------------------------------------------
// Спека 0018: маппинг сетки (FR-19).
// ---------------------------------------------------------------------

func toProtoBracket(b domain.Bracket) *hemav1.Bracket {
	out := &hemav1.Bracket{
		Stage:            toProtoStage(b.Stage),
		Rounds:           make([]*hemav1.BracketRound, 0, len(b.Rounds)),
		Unassigned:       toProtoFighterRefs(b.Unassigned),
		CanUndo:          b.CanUndo,
		Champion:         toProtoFighterRef(b.Champion),
		ThirdPlaceWinner: toProtoFighterRef(b.ThirdPlaceWinner),
	}
	for _, r := range b.Rounds {
		out.Rounds = append(out.Rounds, toProtoBracketRound(r))
	}
	return out
}

func toProtoBracketRound(r domain.BracketRoundView) *hemav1.BracketRound {
	out := &hemav1.BracketRound{
		Number:     int32(r.Number),
		Title:      r.Title,
		ThirdPlace: r.ThirdPlace,
		Halves:     make([]*hemav1.BracketHalf, 0, len(r.Halves)),
	}
	for _, h := range r.Halves {
		out.Halves = append(out.Halves, toProtoBracketHalf(h))
	}
	return out
}

func toProtoBracketHalf(h domain.BracketHalfView) *hemav1.BracketHalf {
	out := &hemav1.BracketHalf{
		Half:          int32(h.Number),
		Title:         h.Title,
		Container:     toProtoPool(h.Container),
		Pairs:         make([]*hemav1.BracketPair, 0, len(h.Pairs)),
		CurrentBoutId: h.CurrentBoutID,
	}
	for _, p := range h.Pairs {
		out.Pairs = append(out.Pairs, toProtoBracketPair(p))
	}
	return out
}

func toProtoBracketPair(p domain.BracketPairView) *hemav1.BracketPair {
	out := &hemav1.BracketPair{
		Index:    int32(p.Index),
		SlotA:    toProtoBracketSlot(p.A),
		SlotB:    toProtoBracketSlot(p.B),
		Resolved: p.Resolved,
	}
	if p.Bout != nil {
		out.Bout = toProtoBoardBout(*p.Bout)
	}
	return out
}

func toProtoBracketSlot(s domain.Slot) *hemav1.BracketSlot {
	return &hemav1.BracketSlot{
		Slot:        int32(s.Number),
		State:       toProtoBracketSlotState(s.State),
		Fighter:     toProtoFighterRef(s.Fighter),
		SourceLabel: s.SourceLabel,
	}
}

func toProtoBracketSlotState(s domain.SlotState) hemav1.BracketSlotState {
	switch s {
	case domain.SlotFilled:
		return hemav1.BracketSlotState_BRACKET_SLOT_STATE_FILLED
	case domain.SlotEmpty:
		return hemav1.BracketSlotState_BRACKET_SLOT_STATE_EMPTY
	case domain.SlotPending:
		return hemav1.BracketSlotState_BRACKET_SLOT_STATE_PENDING
	default:
		return hemav1.BracketSlotState_BRACKET_SLOT_STATE_UNSPECIFIED
	}
}

// ---------------------------------------------------------------------
// Спека 0015: живой канал табло арены (недоменный таймер, ADR 0013).
// ---------------------------------------------------------------------

// toProtoArenaLiveSnapshot маппит живой снапшот табло арены целиком (спека
// 0015): переиспользует toProtoBoard для поля board.
func toProtoArenaLiveSnapshot(s domain.ArenaLiveSnapshot) *hemav1.ArenaLiveSnapshot {
	return &hemav1.ArenaLiveSnapshot{
		Board:                  toProtoBoard(s.Board),
		Timer:                  toProtoTimerFrame(s.Timer),
		Room:                   toProtoScoreboardRoom(s.Room),
		DefaultDurationSeconds: s.DefaultDurationSeconds,
		ServerNowUnixMs:        s.ServerNowUnixMS,
	}
}

func toProtoTimerFrame(f domain.TimerFrame) *hemav1.TimerFrame {
	return &hemav1.TimerFrame{
		Status:        toProtoTimerStatus(f.Status),
		RemainingCs:   f.RemainingCS,
		SampledUnixMs: f.SampledUnixMS,
		DefaultCs:     f.DefaultCS,
	}
}

func toDomainTimerFrame(f *hemav1.TimerFrame) domain.TimerFrame {
	if f == nil {
		return domain.TimerFrame{}
	}
	return domain.TimerFrame{
		Status:        toDomainTimerStatus(f.Status),
		RemainingCS:   f.RemainingCs,
		SampledUnixMS: f.SampledUnixMs,
		DefaultCS:     f.DefaultCs,
	}
}

func toProtoTimerStatus(s domain.TimerStatus) hemav1.TimerStatus {
	switch s {
	case domain.TimerStatusStopped:
		return hemav1.TimerStatus_TIMER_STATUS_STOPPED
	case domain.TimerStatusRunning:
		return hemav1.TimerStatus_TIMER_STATUS_RUNNING
	case domain.TimerStatusPaused:
		return hemav1.TimerStatus_TIMER_STATUS_PAUSED
	case domain.TimerStatusExpired:
		return hemav1.TimerStatus_TIMER_STATUS_EXPIRED
	default:
		return hemav1.TimerStatus_TIMER_STATUS_UNSPECIFIED
	}
}

func toDomainTimerStatus(s hemav1.TimerStatus) domain.TimerStatus {
	switch s {
	case hemav1.TimerStatus_TIMER_STATUS_STOPPED:
		return domain.TimerStatusStopped
	case hemav1.TimerStatus_TIMER_STATUS_RUNNING:
		return domain.TimerStatusRunning
	case hemav1.TimerStatus_TIMER_STATUS_PAUSED:
		return domain.TimerStatusPaused
	case hemav1.TimerStatus_TIMER_STATUS_EXPIRED:
		return domain.TimerStatusExpired
	default:
		return ""
	}
}

func toProtoScoreboardRoom(r domain.ScoreboardRoom) *hemav1.ScoreboardRoom {
	return &hemav1.ScoreboardRoom{
		ScoreboardCount:  int32(r.ScoreboardCount),
		ThisOrdinal:      int32(r.ThisOrdinal),
		ThisIsSource:     r.ThisIsSource,
		SidesSwapped:     r.SidesSwapped,
		RevealGeneration: r.RevealGeneration,
	}
}

func toProtoTimerCommand(c domain.TimerCommand) *hemav1.TimerCommand {
	return &hemav1.TimerCommand{
		Kind:          toProtoTimerCommandKind(c.Kind),
		AmountSeconds: c.AmountSeconds,
	}
}

func toDomainTimerCommand(c *hemav1.TimerCommand) domain.TimerCommand {
	if c == nil {
		return domain.TimerCommand{}
	}
	return domain.TimerCommand{
		Kind:          toDomainTimerCommandKind(c.Kind),
		AmountSeconds: c.AmountSeconds,
	}
}

func toProtoTimerCommandKind(k domain.TimerCommandKind) hemav1.TimerCommandKind {
	switch k {
	case domain.TimerCommandStart:
		return hemav1.TimerCommandKind_TIMER_COMMAND_KIND_START
	case domain.TimerCommandPause:
		return hemav1.TimerCommandKind_TIMER_COMMAND_KIND_PAUSE
	case domain.TimerCommandReset:
		return hemav1.TimerCommandKind_TIMER_COMMAND_KIND_RESET
	case domain.TimerCommandAdjust:
		return hemav1.TimerCommandKind_TIMER_COMMAND_KIND_ADJUST
	default:
		return hemav1.TimerCommandKind_TIMER_COMMAND_KIND_UNSPECIFIED
	}
}

func toDomainTimerCommandKind(k hemav1.TimerCommandKind) domain.TimerCommandKind {
	switch k {
	case hemav1.TimerCommandKind_TIMER_COMMAND_KIND_START:
		return domain.TimerCommandStart
	case hemav1.TimerCommandKind_TIMER_COMMAND_KIND_PAUSE:
		return domain.TimerCommandPause
	case hemav1.TimerCommandKind_TIMER_COMMAND_KIND_RESET:
		return domain.TimerCommandReset
	case hemav1.TimerCommandKind_TIMER_COMMAND_KIND_ADJUST:
		return domain.TimerCommandAdjust
	default:
		return ""
	}
}

// toDomainScoreboardRole маппит роль подписчика WatchArenaBoard (спека
// 0015): неизвестное/UNSPECIFIED значение трактуется как PANEL (не участвует
// в ordinal/source, this_ordinal всегда 0) — консервативный дефолт, не
// позволяющий немаркированному клиенту случайно стать источником таймера.
func toDomainScoreboardRole(r hemav1.ScoreboardRole) domain.ScoreboardRole {
	if r == hemav1.ScoreboardRole_SCOREBOARD_ROLE_SCOREBOARD {
		return domain.ScoreboardRoleScoreboard
	}
	return domain.ScoreboardRolePanel
}
