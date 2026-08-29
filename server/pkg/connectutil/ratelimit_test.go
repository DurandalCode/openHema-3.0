package connectutil

import (
	"net/http"
	"testing"
	"time"

	"connectrpc.com/connect"
)

// --- Allow: чистая логика, без зависимости от connect (FR-39). ---

func TestAllow_AllowsUpToLimitThenRejects(t *testing.T) {
	rl := NewRateLimiter(3, time.Minute)
	now := time.Now()

	for i := 0; i < 3; i++ {
		if !rl.Allow("1.2.3.4", now) {
			t.Fatalf("request %d within the limit should be allowed", i+1)
		}
	}
	if rl.Allow("1.2.3.4", now) {
		t.Fatal("request over the limit within the same window should be rejected")
	}
}

func TestAllow_ResetsAfterWindowElapses(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	now := time.Now()

	if !rl.Allow("1.2.3.4", now) {
		t.Fatal("first request should be allowed")
	}
	if rl.Allow("1.2.3.4", now.Add(30*time.Second)) {
		t.Fatal("second request within the same window should still be rejected")
	}
	if !rl.Allow("1.2.3.4", now.Add(61*time.Second)) {
		t.Fatal("request after the window elapsed should be allowed again")
	}
}

func TestAllow_DifferentKeysAreIndependent(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	now := time.Now()

	if !rl.Allow("1.1.1.1", now) {
		t.Fatal("first key's first request should be allowed")
	}
	if !rl.Allow("2.2.2.2", now) {
		t.Fatal("second key's first request should be allowed regardless of the first key's state")
	}
	if rl.Allow("1.1.1.1", now) {
		t.Fatal("first key's second request should still be rejected")
	}
}

// --- Cleanup: удаление протухших корзин. ---

func TestCleanup_RemovesStaleBuckets(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	now := time.Now()
	rl.Allow("1.1.1.1", now)
	rl.Allow("2.2.2.2", now)

	if got := rl.Len(); got != 2 {
		t.Fatalf("Len() = %d, want 2", got)
	}

	rl.Cleanup(now.Add(2 * time.Minute))

	if got := rl.Len(); got != 0 {
		t.Fatalf("Len() after Cleanup = %d, want 0 (both buckets stale)", got)
	}
}

func TestCleanup_KeepsFreshBuckets(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	now := time.Now()
	rl.Allow("1.1.1.1", now)

	rl.Cleanup(now.Add(10 * time.Second))

	if got := rl.Len(); got != 1 {
		t.Fatalf("Len() after Cleanup = %d, want 1 (bucket still fresh)", got)
	}
}

// --- Interceptor: проверка процедур из набора, единый код ошибки. ---
//
// AnyRequest запечатан (internalOnly()) — только типы пакета connect могут
// его реализовать, поэтому напрямую сконструировать фейковый
// connect.AnyRequest в тестах этого пакета нельзя. Проверяем поэтому
// внутреннюю check(), которую Interceptor.WrapUnary вызывает первым делом —
// она несёт всю логику интерсептора (процедура/IP/лимит) без обвязки
// connect.AnyRequest.

func TestCheck_RejectsOverLimitWithResourceExhausted(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	procedures := map[string]struct{}{"/hema.v1.AuthService/Login": {}}
	header := realIPHeader("9.9.9.9")

	if err := rl.check("/hema.v1.AuthService/Login", header, procedures, false); err != nil {
		t.Fatalf("first request: unexpected error: %v", err)
	}

	err := rl.check("/hema.v1.AuthService/Login", header, procedures, false)
	if err == nil {
		t.Fatal("second request over the limit should be rejected")
	}
	if connect.CodeOf(err) != connect.CodeResourceExhausted {
		t.Errorf("code = %v, want CodeResourceExhausted", connect.CodeOf(err))
	}
}

func TestCheck_SkipsUnlistedProcedures(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	procedures := map[string]struct{}{"/hema.v1.AuthService/Login": {}}
	header := realIPHeader("9.9.9.9")

	for i := 0; i < 5; i++ {
		if err := rl.check("/hema.v1.OtherService/Method", header, procedures, false); err != nil {
			t.Fatalf("request %d: unlisted procedure should never be rate-limited: %v", i, err)
		}
	}
}

func TestCheck_DifferentClientIPsAreIndependent(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	procedures := map[string]struct{}{"/hema.v1.AuthService/Login": {}}

	if err := rl.check("/hema.v1.AuthService/Login", realIPHeader("1.1.1.1"), procedures, false); err != nil {
		t.Fatalf("first IP: unexpected error: %v", err)
	}
	if err := rl.check("/hema.v1.AuthService/Login", realIPHeader("2.2.2.2"), procedures, false); err != nil {
		t.Fatalf("second IP: unexpected error: %v", err)
	}
}

// --- ClientIP: выбор адреса источника, доверие к прокси задаётся явно (NFR-6). ---

func TestClientIP(t *testing.T) {
	cases := []struct {
		name       string
		header     http.Header
		trustProxy bool
		want       string
	}{
		{
			name:       "trusts X-Forwarded-For when trustProxy is set",
			header:     http.Header{"X-Forwarded-For": []string{"1.1.1.1, 2.2.2.2"}},
			trustProxy: true,
			want:       "1.1.1.1",
		},
		{
			name:       "ignores X-Forwarded-For without trustProxy",
			header:     mergeHeaders(http.Header{"X-Forwarded-For": []string{"1.1.1.1"}}, realIPHeader("3.3.3.3")),
			trustProxy: false,
			want:       "3.3.3.3",
		},
		{
			name:   "falls back to X-Real-IP when trustProxy is not set",
			header: realIPHeader("3.3.3.3"),
			want:   "3.3.3.3",
		},
		{
			name:   "empty when neither header is present",
			header: http.Header{},
			want:   "",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ClientIP(tc.header, tc.trustProxy); got != tc.want {
				t.Errorf("ClientIP() = %q, want %q", got, tc.want)
			}
		})
	}
}

// realIPHeader строит http.Header с X-Real-IP через Set (не литералом
// карты), чтобы ключ гарантированно оказался в канонической MIME-форме —
// как и в реальном запросе, где заголовки приходят через http.Header.Set/
// Add, а не собираются вручную.
func realIPHeader(ip string) http.Header {
	h := http.Header{}
	h.Set("X-Real-IP", ip)
	return h
}

// mergeHeaders объединяет несколько http.Header в один (для тестовых
// случаев с несколькими заголовками сразу).
func mergeHeaders(hs ...http.Header) http.Header {
	out := http.Header{}
	for _, h := range hs {
		for k, vs := range h {
			out[k] = append(out[k], vs...)
		}
	}
	return out
}
