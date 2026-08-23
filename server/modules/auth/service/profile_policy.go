package service

import (
	"unicode/utf8"

	"github.com/hema/server/modules/auth/domain"
)

// MaxProfileFieldLen — предел длины отображаемого имени и клуба **в
// символах** (не байтах — см. validateProfileField: большинство имён в
// продукте кириллические, а len() в Go считает байты UTF-8, что вдвое
// занижало бы реальный лимит для них). Обе колонки (auth.users.display_name/
// club) — unbounded TEXT; без этого предела клиент мог бы отправить сколь
// угодно длинную строку, и она сохранилась бы без ошибки. Действует и в
// UpdateProfile, и в createUser (Register/CreateAdmin/bootstrap) — единая
// политика по тому же принципу, что и MinPasswordLen (решение 7, спека
// 0037): разные лимиты для «задать имя» и «изменить имя» были бы источником
// неотлаживаемых расхождений.
const MaxProfileFieldLen = 100

// validateProfileField проверяет строку на соответствие пределу длины
// (в рунах, не байтах).
func validateProfileField(value string) error {
	if utf8.RuneCountInString(value) > MaxProfileFieldLen {
		return domain.ErrInvalidProfile
	}
	return nil
}
