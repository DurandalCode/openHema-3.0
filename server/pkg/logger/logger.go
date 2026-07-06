// Package logger предоставляет структурированный логгер на базе slog.
package logger

import (
	"log/slog"
	"os"
)

// New создаёт JSON-логгер, пишущий в stdout.
func New() *slog.Logger {
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})
	return slog.New(handler)
}
