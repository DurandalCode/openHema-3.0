package notify

import (
	"fmt"

	"github.com/hema/server/pkg/mail"
)

// Тексты писем-уведомлений — на русском, plain text, одна цель на письмо
// (NFR-7), по образцу modules/auth/mailer (письмо восстановления пароля).
// В отличие от служебных писем учётки эти шаблоны не проставляют
// получателя (mail.Message.To остаётся пустым): один и тот же текст может
// уйти нескольким адресатам (постановка пула — сразу нескольким бойцам,
// AC-12) — получателя проставляет вызывающий код перед Enqueue.

// ApplicationStateChanged — уведомление заявителю о событии его заявки,
// автором которого он сам не является: подтверждение оплаты, регистрация
// бойца, правка заявки организатором (FR-23). Называет турнир, номинацию
// и новое состояние заявки, ведёт ссылкой на экран «Мои заявки» (FR-26).
func ApplicationStateChanged(tournamentTitle, nominationName, newState, link string) mail.Message {
	subject := fmt.Sprintf("%s: обновление вашей заявки — openHEMA", tournamentTitle)
	text := fmt.Sprintf(
		"Здравствуйте!\n\n"+
			"По вашей заявке на турнире «%s» (номинация «%s») произошло "+
			"изменение: %s.\n\n"+
			"Посмотреть заявку можно здесь:\n%s",
		tournamentTitle, nominationName, newState, link,
	)
	return mail.Message{Subject: subject, Text: text}
}

// PoolSeated — уведомление бойцу о постановке его пула на площадку
// (FR-24): одно письмо на бойца на каждую постановку. Называет турнир,
// номинацию, пул и площадку, ведёт ссылкой на страницу номинации (FR-26).
func PoolSeated(tournamentTitle, nominationName, poolName, arenaName, link string) mail.Message {
	subject := fmt.Sprintf("%s: ваш пул поставлен на площадку — openHEMA", tournamentTitle)
	text := fmt.Sprintf(
		"Здравствуйте!\n\n"+
			"На турнире «%s» (номинация «%s») ваш пул «%s» поставлен на "+
			"площадку «%s».\n\n"+
			"Смотреть номинацию можно здесь:\n%s",
		tournamentTitle, nominationName, poolName, arenaName, link,
	)
	return mail.Message{Subject: subject, Text: text}
}
