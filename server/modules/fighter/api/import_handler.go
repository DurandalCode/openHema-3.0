package api

import (
	"context"
	"errors"
	"fmt"

	"connectrpc.com/connect"

	hemav1 "github.com/hema/server/gen/hema/v1"
	"github.com/hema/server/modules/fighter/domain"
	"github.com/hema/server/modules/fighter/service"
)

// maxImportBytes — жёсткий предел размера загружаемого файла (2 МиБ).
// Дублирует гейт BFF намеренно: сервер не полагается на клиента. Синхронно
// держать эти числа не нужно — достаточно, чтобы серверное было не меньше.
const maxImportBytes = 2 << 20

// ImportFighters разбирает файл со списком участников и заводит бойцов
// (спека 0049). dry_run=true возвращает тот же отчёт, ничего не записав.
func (h *Handler) ImportFighters(
	ctx context.Context,
	req *connect.Request[hemav1.ImportFightersRequest],
) (*connect.Response[hemav1.ImportFightersResponse], error) {
	m := req.Msg
	if len(m.Content) > maxImportBytes {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			fmt.Errorf("fighter: import file is larger than %d bytes", maxImportBytes))
	}

	res, err := h.svc.ImportFighters(ctx, service.ImportCommand{
		TournamentID:         m.GetTournamentId(),
		Content:              m.Content,
		FileName:             m.FileName,
		DefaultNominationIDs: m.DefaultNominationIds,
		DryRun:               m.DryRun,
	})
	if err != nil {
		return nil, mapImportError(err)
	}

	return connect.NewResponse(&hemav1.ImportFightersResponse{
		Summary: &hemav1.ImportSummary{
			RowsRead: int32(res.Summary.RowsRead),
			Created:  int32(res.Summary.Created),
			Updated:  int32(res.Summary.Updated),
			Skipped:  int32(res.Summary.Skipped),
			Rejected: int32(res.Summary.Rejected),
		},
		Rows:   toProtoImportRows(res.Rows),
		DryRun: res.DryRun,
	}), nil
}

// mapImportError мапит ошибки импорта в connect.Code. Все ошибки уровня
// файла — вина запроса, а не сервера; ErrNominationNotFound здесь тоже
// InvalidArgument (а не NotFound, как в остальных ручках): это чужой
// nomination_id в умолчаниях запроса, а не обращение к несуществующему
// ресурсу.
func mapImportError(err error) error {
	switch {
	case errors.Is(err, domain.ErrUnsupportedFile),
		errors.Is(err, domain.ErrEmptyFile),
		errors.Is(err, domain.ErrMissingNameColumn),
		errors.Is(err, domain.ErrMalformedFile),
		errors.Is(err, domain.ErrTooManyRows),
		errors.Is(err, domain.ErrNominationNotFound):
		return connect.NewError(connect.CodeInvalidArgument, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}

func toProtoImportRows(rows []domain.RowResult) []*hemav1.ImportRowReport {
	out := make([]*hemav1.ImportRowReport, 0, len(rows))
	for _, r := range rows {
		out = append(out, &hemav1.ImportRowReport{
			Line:               int32(r.Row.Line),
			Name:               r.Row.Name,
			Club:               r.Row.Club,
			Outcome:            toProtoOutcome(r.Outcome),
			NominationTitles:   r.Row.NominationTitles,
			AddedNominationIds: r.AddedNominationIDs,
			FighterId:          r.FighterID,
			Error:              toProtoRowError(r.Error),
			ErrorDetail:        r.ErrorDetail,
		})
	}
	return out
}

func toProtoOutcome(o domain.RowOutcome) hemav1.ImportRowOutcome {
	switch o {
	case domain.OutcomeCreated:
		return hemav1.ImportRowOutcome_IMPORT_ROW_OUTCOME_CREATED
	case domain.OutcomeUpdated:
		return hemav1.ImportRowOutcome_IMPORT_ROW_OUTCOME_UPDATED
	case domain.OutcomeSkipped:
		return hemav1.ImportRowOutcome_IMPORT_ROW_OUTCOME_SKIPPED
	case domain.OutcomeRejected:
		return hemav1.ImportRowOutcome_IMPORT_ROW_OUTCOME_REJECTED
	default:
		return hemav1.ImportRowOutcome_IMPORT_ROW_OUTCOME_UNSPECIFIED
	}
}

func toProtoRowError(e domain.RowError) hemav1.ImportRowError {
	switch e {
	case domain.RowErrorEmptyName:
		return hemav1.ImportRowError_IMPORT_ROW_ERROR_EMPTY_NAME
	case domain.RowErrorUnknownNomination:
		return hemav1.ImportRowError_IMPORT_ROW_ERROR_UNKNOWN_NOMINATION
	case domain.RowErrorFighterWithdrawn:
		return hemav1.ImportRowError_IMPORT_ROW_ERROR_FIGHTER_WITHDRAWN
	default:
		return hemav1.ImportRowError_IMPORT_ROW_ERROR_UNSPECIFIED
	}
}
