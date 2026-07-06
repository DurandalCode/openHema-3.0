package connectutil

import "context"

// ctxKey — непубличный тип для ключей контекста, чтобы избежать коллизий.
type ctxKey int

const (
	keyUserID ctxKey = iota
	keyRole
)

// WithAuth кладёт идентификатор пользователя и его роль в контекст.
// Используется Auth-интерсептором после успешной валидации access-токена.
func WithAuth(ctx context.Context, userID, role string) context.Context {
	ctx = context.WithValue(ctx, keyUserID, userID)
	return context.WithValue(ctx, keyRole, role)
}

// CallerID возвращает идентификатор аутентифицированного пользователя из контекста
// или пустую строку, если контекст не несёт аутентификационных данных.
func CallerID(ctx context.Context) string {
	v, _ := ctx.Value(keyUserID).(string)
	return v
}

// CallerRole возвращает роль аутентифицированного пользователя из контекста
// или пустую строку, если контекст не несёт аутентификационных данных.
func CallerRole(ctx context.Context) string {
	v, _ := ctx.Value(keyRole).(string)
	return v
}
