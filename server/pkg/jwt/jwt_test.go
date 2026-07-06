package jwt

import (
	"testing"
	"time"
)

func testManager() *Manager {
	return NewManager("access-secret", "refresh-secret", 15*time.Minute, 720*time.Hour)
}

func TestIssue_BothTokens(t *testing.T) {
	m := testManager()
	pair, err := m.Issue("user-123")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if pair.Access == "" {
		t.Error("access token should not be empty")
	}
	if pair.Refresh == "" {
		t.Error("refresh token should not be empty")
	}
	if pair.Access == pair.Refresh {
		t.Error("access and refresh should differ")
	}
}

func TestParseAccess_Valid(t *testing.T) {
	m := testManager()
	pair, _ := m.Issue("user-123")

	claims, err := m.ParseAccess(pair.Access)
	if err != nil {
		t.Fatalf("ParseAccess: %v", err)
	}
	if claims.UserID != "user-123" {
		t.Errorf("UserID = %q, want %q", claims.UserID, "user-123")
	}
	if claims.Type != AccessToken {
		t.Errorf("Type = %q, want %q", claims.Type, AccessToken)
	}
}

func TestParseRefresh_Valid(t *testing.T) {
	m := testManager()
	pair, _ := m.Issue("user-123")

	claims, err := m.ParseRefresh(pair.Refresh)
	if err != nil {
		t.Fatalf("ParseRefresh: %v", err)
	}
	if claims.UserID != "user-123" {
		t.Errorf("UserID = %q, want %q", claims.UserID, "user-123")
	}
	if claims.Type != RefreshToken {
		t.Errorf("Type = %q, want %q", claims.Type, RefreshToken)
	}
}

func TestParseAccess_RefreshTokenRejected(t *testing.T) {
	m := testManager()
	pair, _ := m.Issue("user-123")

	_, err := m.ParseAccess(pair.Refresh)
	if err == nil {
		t.Error("ParseAccess should reject refresh token")
	}
}

func TestParseRefresh_AccessTokenRejected(t *testing.T) {
	m := testManager()
	pair, _ := m.Issue("user-123")

	_, err := m.ParseRefresh(pair.Access)
	if err == nil {
		t.Error("ParseRefresh should reject access token")
	}
}

func TestParseAccess_WrongSecret(t *testing.T) {
	m1 := NewManager("secret-a", "secret-a", 15*time.Minute, 720*time.Hour)
	m2 := NewManager("secret-b", "secret-b", 15*time.Minute, 720*time.Hour)

	pair, _ := m1.Issue("user-123")
	if _, err := m2.ParseAccess(pair.Access); err == nil {
		t.Error("token signed with secret-a should not validate with secret-b")
	}
}

func TestParseAccess_Expired(t *testing.T) {
	m := NewManager("s", "s", -1*time.Second, -1*time.Second)
	pair, _ := m.Issue("user-123")

	if _, err := m.ParseAccess(pair.Access); err == nil {
		t.Error("expired token should not validate")
	}
}

func TestParseAccess_Garbage(t *testing.T) {
	m := testManager()
	cases := []string{"", "garbage", "a.b.c", "not-a-jwt"}
	for _, tc := range cases {
		t.Run(tc, func(t *testing.T) {
			if _, err := m.ParseAccess(tc); err == nil {
				t.Error("expected error for garbage token")
			}
		})
	}
}
