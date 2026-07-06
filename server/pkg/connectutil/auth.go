package connectutil

import (
	"net/http"
	"strings"
)

// BearerToken извлекает токен из заголовка Authorization ("Bearer <token>").
// Возвращает пустую строку, если заголовок отсутствует или имеет иной формат.
func BearerToken(h http.Header) string {
	const prefix = "Bearer "
	v := h.Get("Authorization")
	if len(v) > len(prefix) && strings.EqualFold(v[:len(prefix)], prefix) {
		return v[len(prefix):]
	}
	return ""
}
