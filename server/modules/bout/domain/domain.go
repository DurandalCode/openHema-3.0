// Package domain описывает сущности, порты, ошибки и чистую логику модуля
// bout (спека 0010): бои, сформированные внутри пулов номинации.
package domain

import (
	"context"
	"errors"
)

// ErrInvalidInput — некорректные входные данные (пустой nominationID и т.п.).
// Слой api мапит доменные ошибки в connect.Code.
var ErrInvalidInput = errors.New("bout: invalid input")

// FighterRef — снапшот бойца на момент формирования боя (имя/клуб не
// перечитываются из модуля fighter при чтении — спека, решение №5).
// Собственная копия, не шарится с pool/fighter (ADR 0002).
type FighterRef struct {
	ID   string
	Name string
	Club string
}

// Bout — один бой: пара бойцов внутри пула + место в порядке проведения.
// RoundNumber — тур (внутри одного тура боец участвует не более раза,
// FR-3a). SequenceNumber — итоговый порядок исполнения в пуле, 1..N,
// уникален в пределах PoolID (FR-3a/FR-3b).
type Bout struct {
	ID             string
	PoolID         string
	NominationID   string
	RoundNumber    int
	SequenceNumber int
	FighterA       FighterRef
	FighterB       FighterRef
}

// PoolInput — вход генерации: состав одного пула на момент фиксации
// раскладки (порядок Fighters неважен, GenerateRoundRobin сортирует сама).
type PoolInput struct {
	PoolID   string
	Fighters []FighterRef
}

// Repository — порт доступа к хранилищу боёв (PG-схема bout).
type Repository interface {
	// ReplaceForNomination одной транзакцией удаляет все бои номинации и
	// вставляет новые (bouts == nil → только удаление — используется и для
	// генерации, и для очистки, см. spec «Принятые решения» №3).
	ReplaceForNomination(ctx context.Context, nominationID string, bouts []Bout) error
	// ListByNomination возвращает бои номинации, отсортированные по
	// PoolID, затем SequenceNumber.
	ListByNomination(ctx context.Context, nominationID string) ([]Bout, error)
}
