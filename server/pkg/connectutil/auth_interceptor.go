package connectutil

import (
	"context"

	"connectrpc.com/connect"

	"github.com/hema/server/pkg/jwt"
)

// publicProcedures — RPC, доступные без access-токена (регистрация/логин/
// обновление сессии). Имена процедур в каноническом Connect-виде
// "/<package>.<Service>/<Method>".
var publicProcedures = map[string]struct{}{
	"/hema.v1.AuthService/Register":                  {},
	"/hema.v1.AuthService/Login":                     {},
	"/hema.v1.AuthService/Refresh":                   {},
	"/hema.v1.TournamentService/GetActiveTournament": {},
	"/hema.v1.NominationService/ListNominations":     {},
	"/hema.v1.NominationService/GetNomination":       {},
	"/hema.v1.ApplicationPublicService/ListNominationParticipants": {},
}

// Auth — Connect-интерсептор: валидирует Bearer access-токен и кладёт
// идентификатор пользователя + роль в контекст. Публичные RPC (см.
// publicProcedures) пропускаются без токена. Остальные без валидного токена
// отклоняются с CodeUnauthenticated.
func Auth(tokens *jwt.Manager) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			proc := req.Spec().Procedure
			if _, ok := publicProcedures[proc]; ok {
				return next(ctx, req)
			}

			token := BearerToken(req.Header())
			if token == "" {
				return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
			}
			claims, err := tokens.ParseAccess(token)
			if err != nil {
				return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
			}
			return next(WithAuth(ctx, claims.UserID, claims.Role), req)
		}
	}
}

// RequireAdmin — Connect-интерсептор: требует, чтобы вызывающий имел роль admin.
// Накладывается per-handler на admin-сервис, а не глобально. Требует, чтобы
// перед ним сработал Auth (кладёт role в контекст).
func RequireAdmin() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			if CallerRole(ctx) != "admin" {
				return nil, connect.NewError(connect.CodePermissionDenied, errForbidden)
			}
			return next(ctx, req)
		}
	}
}

type authError struct{ msg string }

func (e *authError) Error() string { return e.msg }

var (
	errUnauthenticated = &authError{"authentication required"}
	errForbidden       = &authError{"admin role required"}
)
