// Package connectutil содержит общие Connect-интерсепторы и хелперы.
package connectutil

import (
	"context"
	"log/slog"
	"runtime/debug"
	"time"

	"connectrpc.com/connect"
)

// Logging логирует каждый запрос (unary и streaming): процедуру, длительность
// и код ошибки.
//
// Полноценный connect.Interceptor, не connect.UnaryInterceptorFunc: у
// последнего WrapStreamingHandler — no-op в самом connect-go, из-за чего
// server-streaming RPC (WatchArenaBoard/WatchNominationLive) вообще не
// логировались бы. WrapStreamingHandler ниже логирует длительность всего
// стрима (от открытия до закрытия) и итоговую ошибку — как ближайший streaming-
// аналог unary-лога, а не покадрово.
func Logging(log *slog.Logger) connect.Interceptor {
	return &loggingInterceptor{logger: log}
}

type loggingInterceptor struct {
	logger *slog.Logger
}

func (l *loggingInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		start := time.Now()
		resp, err := next(ctx, req)
		l.log(req.Spec().Procedure, start, err)
		return resp, err
	}
}

func (l *loggingInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (l *loggingInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		start := time.Now()
		err := next(ctx, conn)
		l.log(conn.Spec().Procedure, start, err)
		return err
	}
}

func (l *loggingInterceptor) log(procedure string, start time.Time, err error) {
	attrs := []any{
		slog.String("procedure", procedure),
		slog.Duration("took", time.Since(start)),
	}
	if err != nil {
		attrs = append(attrs, slog.String("code", connect.CodeOf(err).String()))
		l.logger.Error("rpc failed", attrs...)
	} else {
		l.logger.Info("rpc ok", attrs...)
	}
}

// Recovery перехватывает панику в обработчике (unary и streaming) и
// возвращает internal-ошибку вместо падения запроса без ответа.
//
// Как и Logging — полноценный connect.Interceptor (см. комментарий выше):
// без явного WrapStreamingHandler паника внутри server-streaming RPC не была
// бы перехвачена этим интерсептором (net/http сам восстановится на уровне
// соединения, но без единообразного CodeInternal и лога стека).
func Recovery(log *slog.Logger) connect.Interceptor {
	return &recoveryInterceptor{log: log}
}

type recoveryInterceptor struct {
	log *slog.Logger
}

func (r *recoveryInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (resp connect.AnyResponse, err error) {
		defer r.recover(&err)
		return next(ctx, req)
	}
}

func (r *recoveryInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (r *recoveryInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) (err error) {
		defer r.recover(&err)
		return next(ctx, conn)
	}
}

func (r *recoveryInterceptor) recover(err *error) {
	if rec := recover(); rec != nil {
		r.log.Error("panic recovered",
			slog.Any("panic", rec),
			slog.String("stack", string(debug.Stack())),
		)
		*err = connect.NewError(connect.CodeInternal, errInternal)
	}
}

type internalError struct{}

func (internalError) Error() string { return "internal server error" }

var errInternal = internalError{}
