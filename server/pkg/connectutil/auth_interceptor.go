package connectutil

import (
	"context"
	"net/http"

	"connectrpc.com/connect"

	"github.com/hema/server/pkg/jwt"
)

// publicProcedures — RPC, доступные без access-токена (регистрация/логин/
// обновление сессии). Имена процедур в каноническом Connect-виде
// "/<package>.<Service>/<Method>".
var publicProcedures = map[string]struct{}{
	"/hema.v1.AuthService/Register":                                {},
	"/hema.v1.AuthService/Login":                                   {},
	"/hema.v1.AuthService/Refresh":                                 {},
	"/hema.v1.TournamentService/GetActiveTournament":               {},
	"/hema.v1.NominationService/ListNominations":                   {},
	"/hema.v1.NominationService/GetNomination":                     {},
	"/hema.v1.ApplicationPublicService/ListNominationParticipants": {},
	"/hema.v1.FighterPublicService/ListNominationRoster":           {},
	// Спека 0011: публичный экран номинации (пулы готовой раскладки + их
	// бои) — read-only, доступен без авторизации (FR-11/FR-13, AC-15).
	"/hema.v1.StagePublicService/ListPublicPools":             {},
	"/hema.v1.BoutPublicService/ListPublicBoutsByNomination": {},
	// Спека 0014: живой снапшот номинации (bout state/score/outcome +
	// исполнительный статус пула) — публичный экран, без авторизации.
	// GetNominationLive — unary; WatchNominationLive — server-streaming.
	// Оба проходят через один и тот же интерсептор Auth (см. ниже — он
	// полноценный connect.Interceptor, оборачивает и unary, и streaming).
	"/hema.v1.StagePublicService/GetNominationLive":   {},
	"/hema.v1.StagePublicService/WatchNominationLive": {},
	// Спека 0021: итоговый протокол номинации — публичный, без авторизации.
	"/hema.v1.StagePublicService/GetNominationResults": {},
}

// Auth — Connect-интерсептор: валидирует Bearer access-токен и кладёт
// идентификатор пользователя + роль в контекст. Публичные RPC (см.
// publicProcedures) пропускаются без токена. Остальные без валидного токена
// отклоняются с CodeUnauthenticated.
//
// Полноценный connect.Interceptor (не connect.UnaryInterceptorFunc): у
// UnaryInterceptorFunc методы WrapStreamingClient/WrapStreamingHandler —
// осознанный no-op в самом connect-go (оборачивает только unary), поэтому
// server-streaming RPC (напр. WatchArenaBoard, спека 0015) через него
// проходили бы вообще без проверки авторизации. Здесь WrapStreamingHandler
// реализован явно — та же проверка, что и для unary.
func Auth(tokens *jwt.Manager) connect.Interceptor {
	return &authInterceptor{tokens: tokens}
}

type authInterceptor struct {
	tokens *jwt.Manager
}

func (a *authInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		ctx, err := a.authenticate(ctx, req.Spec().Procedure, req.Header())
		if err != nil {
			return nil, err
		}
		return next(ctx, req)
	}
}

func (a *authInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (a *authInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		ctx, err := a.authenticate(ctx, conn.Spec().Procedure, conn.RequestHeader())
		if err != nil {
			return err
		}
		return next(ctx, conn)
	}
}

// authenticate — общая проверка для unary и streaming: публичные процедуры
// пропускаются без токена; остальные требуют валидный Bearer access-токен.
func (a *authInterceptor) authenticate(ctx context.Context, procedure string, header http.Header) (context.Context, error) {
	if _, ok := publicProcedures[procedure]; ok {
		return ctx, nil
	}

	token := BearerToken(header)
	if token == "" {
		return ctx, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}
	claims, err := a.tokens.ParseAccess(token)
	if err != nil {
		return ctx, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}
	return WithAuth(ctx, claims.UserID, claims.Role), nil
}

// RequireAdmin — Connect-интерсептор: требует, чтобы вызывающий имел роль
// admin. Накладывается per-handler на admin-сервис, а не глобально. Требует,
// чтобы перед ним сработал Auth (кладёт role в контекст).
//
// Как и Auth — полноценный connect.Interceptor, не connect.UnaryInterceptorFunc
// (см. комментарий у Auth): без явного WrapStreamingHandler admin-only
// server-streaming RPC (WatchArenaBoard, спека 0015) остался бы без проверки
// роли.
func RequireAdmin() connect.Interceptor {
	return requireAdminInterceptor{}
}

type requireAdminInterceptor struct{}

func (requireAdminInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		if CallerRole(ctx) != "admin" {
			return nil, connect.NewError(connect.CodePermissionDenied, errForbidden)
		}
		return next(ctx, req)
	}
}

func (requireAdminInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (requireAdminInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		if CallerRole(ctx) != "admin" {
			return connect.NewError(connect.CodePermissionDenied, errForbidden)
		}
		return next(ctx, conn)
	}
}

type authError struct{ msg string }

func (e *authError) Error() string { return e.msg }

var (
	errUnauthenticated = &authError{"authentication required"}
	errForbidden       = &authError{"admin role required"}
)
