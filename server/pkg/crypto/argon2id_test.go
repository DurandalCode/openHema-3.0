package crypto

import (
	"strings"
	"testing"
)

func TestHashPassword_Format(t *testing.T) {
	hash, err := HashPassword("mysecret")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Errorf("expected $argon2id$ prefix, got %q", hash)
	}
	parts := strings.Split(hash, "$")
	if len(parts) != 6 {
		t.Errorf("expected 6 parts separated by $, got %d", len(parts))
	}
}

func TestVerifyPassword_Correct(t *testing.T) {
	hash, err := HashPassword("longsword123")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	ok, err := VerifyPassword("longsword123", hash)
	if err != nil {
		t.Fatalf("VerifyPassword: %v", err)
	}
	if !ok {
		t.Error("expected password to verify, got false")
	}
}

func TestVerifyPassword_Wrong(t *testing.T) {
	hash, err := HashPassword("correct-pass")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	ok, err := VerifyPassword("wrong-pass", hash)
	if err != nil {
		t.Fatalf("VerifyPassword: %v", err)
	}
	if ok {
		t.Error("expected password to NOT verify, got true")
	}
}

func TestVerifyPassword_DifferentHashes(t *testing.T) {
	h1, _ := HashPassword("pass")
	h2, _ := HashPassword("pass")
	if h1 == h2 {
		t.Error("two hashes of same password should differ (random salt)")
	}

	ok, err := VerifyPassword("pass", h1)
	if err != nil || !ok {
		t.Errorf("h1 should verify: ok=%v err=%v", ok, err)
	}
	ok, err = VerifyPassword("pass", h2)
	if err != nil || !ok {
		t.Errorf("h2 should verify: ok=%v err=%v", ok, err)
	}
}

func TestVerifyPassword_InvalidHash(t *testing.T) {
	cases := []string{
		"",
		"not-a-hash",
		"$bcrypt$foo",
		"$argon2id$v=19$m=65536,t=3,p=4$badbase64$alsobad",
		"$argon2id$v=99$m=65536,t=3,p=4$abc$def",
	}
	for _, tc := range cases {
		t.Run(tc, func(t *testing.T) {
			_, err := VerifyPassword("pass", tc)
			if err == nil {
				t.Error("expected error for invalid hash, got nil")
			}
		})
	}
}
