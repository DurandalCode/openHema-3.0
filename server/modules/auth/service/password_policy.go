package service

import "github.com/hema/server/modules/auth/domain"

// MinPasswordLen — единая политика длины пароля (FR-11, спека 0037):
// действует везде, где пароль задаётся — регистрация, сброс, смена, создание
// админа, bootstrap. Отдельные правила для разных сценариев были бы
// источником неотлаживаемых расхождений между экранами (решение 7).
const MinPasswordLen = 8

// validatePassword проверяет пароль на соответствие единой политике длины.
func validatePassword(password string) error {
	if len(password) < MinPasswordLen {
		return domain.ErrWeakPassword
	}
	return nil
}
