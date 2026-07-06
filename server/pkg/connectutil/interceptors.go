// Package connectutil содержит общие Connect-интерсепторы и хелперы.
package connectutil

import (
	"context"
	"log/slog"
	"runtime/debug"
	"time"

	"connectrpc.com/connect"
)

// Logging логирует каждый unary-запрос: процедуру, длительность и код ошибки.
func Logging(log *slog.Logger) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			start := time.Now()
			resp, err := next(ctx, req)
			attrs := []any{
				slog.String("procedure", req.Spec().Procedure),
				slog.Duration("took", time.Since(start)),
			}
			if err != nil {
				attrs = append(attrs, slog.String("code", connect.CodeOf(err).String()))
				log.Error("rpc failed", attrs...)
			} else {
				log.Info("rpc ok", attrs...)
			}
			return resp, err
		}
	}
}

// Recovery перехватывает панику в обработчике и возвращает internal-ошибку.
func Recovery(log *slog.Logger) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (resp connect.AnyResponse, err error) {
			defer func() {
				if r := recover(); r != nil {
					log.Error("panic recovered",
						slog.Any("panic", r),
						slog.String("stack", string(debug.Stack())),
					)
					err = connect.NewError(connect.CodeInternal, errInternal)
				}
			}()
			return next(ctx, req)
		}
	}
}

type internalError struct{}

func (internalError) Error() string { return "internal server error" }

var errInternal = internalError{}
