// Package crypto реализует хеширование паролей алгоритмом argon2id.
//
// Хеш хранится в самодостаточной PHC-строке формата:
//
//	$argon2id$v=19$m=65536,t=3,p=4$<base64-соль>$<base64-хеш>
//
// Параметры и соль встроены в строку, поэтому Verify не требует их отдельно.
package crypto

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// ErrInvalidHash — некорректный формат PHC-строки.
var ErrInvalidHash = errors.New("crypto: invalid argon2id hash format")

// ErrIncompatibleVersion — несовместимая версия argon2.
var ErrIncompatibleVersion = errors.New("crypto: incompatible argon2 version")

// params — параметры стоимости argon2id (рекомендации OWASP как база).
type params struct {
	memory      uint32 // KiB
	iterations  uint32
	parallelism uint8
	saltLen     uint32
	keyLen      uint32
}

// defaultParams — дефолтные параметры хеширования.
var defaultParams = params{
	memory:      64 * 1024, // 64 MiB
	iterations:  3,
	parallelism: 4,
	saltLen:     16,
	keyLen:      32,
}

// HashPassword хеширует пароль и возвращает PHC-строку.
func HashPassword(password string) (string, error) {
	p := defaultParams

	salt := make([]byte, p.saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), salt, p.iterations, p.memory, p.parallelism, p.keyLen)

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encoded := fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, p.memory, p.iterations, p.parallelism, b64Salt, b64Hash,
	)
	return encoded, nil
}

// VerifyPassword сравнивает пароль с ранее сохранённой PHC-строкой.
// Возвращает true при совпадении. Сравнение — в постоянном времени.
func VerifyPassword(password, encodedHash string) (bool, error) {
	p, salt, hash, err := decodeHash(encodedHash)
	if err != nil {
		return false, err
	}

	other := argon2.IDKey([]byte(password), salt, p.iterations, p.memory, p.parallelism, p.keyLen)

	if subtle.ConstantTimeEq(int32(len(hash)), int32(len(other))) == 0 {
		return false, nil
	}
	if subtle.ConstantTimeCompare(hash, other) == 1 {
		return true, nil
	}
	return false, nil
}

func decodeHash(encoded string) (params, []byte, []byte, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return params{}, nil, nil, ErrInvalidHash
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return params{}, nil, nil, ErrInvalidHash
	}
	if version != argon2.Version {
		return params{}, nil, nil, ErrIncompatibleVersion
	}

	var p params
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &p.memory, &p.iterations, &p.parallelism); err != nil {
		return params{}, nil, nil, ErrInvalidHash
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return params{}, nil, nil, ErrInvalidHash
	}
	hash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return params{}, nil, nil, ErrInvalidHash
	}
	p.saltLen = uint32(len(salt))
	p.keyLen = uint32(len(hash))

	return p, salt, hash, nil
}
