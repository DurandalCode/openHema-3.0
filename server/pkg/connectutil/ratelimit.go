package connectutil

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect"
)

// bucket — счётчик запросов ключа в текущем окне.
type bucket struct {
	count       int
	windowStart time.Time
}

// RateLimiter — ограничение частоты запросов по произвольному ключу
// (обычно — адрес источника) в пределах одного экземпляра приложения
// (FR-39, NFR-5: общий счётчик между экземплярами — отдельная задача).
//
// Алгоритм — fixed window: окно фиксированной длины window, при первом
// запросе ключа заводится новое окно; каждый следующий запрос в пределах
// window увеличивает счётчик, при истечении window счётчик обнуляется.
// Осознанно не token bucket и не sliding window — задача (грубая защита от
// перебора и рассылки, FR-40) не требует точной равномерности на границе
// окна, а fixed window проще для чтения и тестирования (Allow — чистая
// функция от текущего состояния и now).
type RateLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*bucket
	requests int
	window   time.Duration
}

// NewRateLimiter создаёт лимитер: не более requests запросов на ключ за
// каждое окно длиной window.
func NewRateLimiter(requests int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		buckets:  make(map[string]*bucket),
		requests: requests,
		window:   window,
	}
}

// Allow сообщает, разрешён ли ещё один запрос по ключу key в момент now, и
// в случае разрешения сразу учитывает его в счётчике. Чистая логика без
// зависимости от connect/HTTP — тестируется отдельно от интерсептора.
func (r *RateLimiter) Allow(key string, now time.Time) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	b, ok := r.buckets[key]
	if !ok || now.Sub(b.windowStart) >= r.window {
		r.buckets[key] = &bucket{count: 1, windowStart: now}
		return true
	}
	if b.count >= r.requests {
		return false
	}
	b.count++
	return true
}

// Cleanup удаляет корзины ключей, чьё окно истекло к моменту now. Не
// запускает фонового таймера сама — composition root решает, когда и как
// часто её звать (напр. небольшая горутина с time.Ticker в internal/
// platform), чтобы карта не росла бесконечно на потоке уникальных
// адресов-источников.
func (r *RateLimiter) Cleanup(now time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for key, b := range r.buckets {
		if now.Sub(b.windowStart) >= r.window {
			delete(r.buckets, key)
		}
	}
}

// Len — число отслеживаемых ключей. Используется тестами Cleanup.
func (r *RateLimiter) Len() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.buckets)
}

// errRateLimited — единое сообщение об отказе для всех защищённых процедур
// (FR-40): не раскрывает, к какой конкретно операции относится отказ, и не
// раскрывает существование учётки.
var errRateLimited = errors.New("слишком много попыток, попробуйте позже")

// Interceptor — Connect-интерсептор: ограничивает частоту запросов к
// процедурам из procedures по адресу клиента (FR-39). Процедуры вне набора
// пропускаются без проверки — явный список безопаснее умолчания
// «лимитировать всё» (тот же приём, что publicProcedures у Auth,
// auth_interceptor.go). trustProxy передаётся сюда, а не в NewRateLimiter:
// это решение о конкретном месте включения интерсептора (composition root
// может смонтировать один RateLimiter за несколько сетевых входов с разным
// доверием к прокси), а не свойство самого счётчика.
//
// Возвращает connect.UnaryInterceptorFunc, а не полноценный
// connect.Interceptor: все процедуры, которых касается ограничение частоты
// (вход, регистрация, восстановление/смена пароля, подтверждение email,
// FR-39), — unary RPC; в отличие от Auth/Logging/Recovery, которым нужно
// защищать в том числе долгоживущие server-streaming вызовы, здесь
// WrapStreamingHandler был бы мёртвым кодом.
func (r *RateLimiter) Interceptor(procedures map[string]struct{}, trustProxy bool) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			if err := r.check(req.Spec().Procedure, req.Header(), procedures, trustProxy); err != nil {
				return nil, err
			}
			return next(ctx, req)
		}
	}
}

// check несёт всю логику интерсептора (процедура из набора? адрес клиента?
// лимит не превышен?), не завися от connect.AnyRequest — вынесена отдельно,
// чтобы юнит-тесты могли проверить её напрямую: connect.AnyRequest запечатан
// (internalOnly()), сконструировать его фейк за пределами пакета connect
// нельзя.
func (r *RateLimiter) check(procedure string, header http.Header, procedures map[string]struct{}, trustProxy bool) error {
	if _, limited := procedures[procedure]; !limited {
		return nil
	}
	ip := ClientIP(header, trustProxy)
	if !r.Allow(ip, time.Now()) {
		return connect.NewError(connect.CodeResourceExhausted, errRateLimited)
	}
	return nil
}

// ClientIP определяет адрес источника запроса (FR-39, NFR-6).
//
//   - trustProxy=true: адрес берётся из X-Forwarded-For (первый адрес в
//     списке — исходный клиент, остальные — промежуточные прокси). Требует
//     явного доверия развёртывания (RATE_LIMIT_TRUST_PROXY): без доверенного
//     прокси перед сервером клиент мог бы вписать в этот заголовок что
//     угодно и подменить свой адрес, обойдя лимит.
//   - trustProxy=false (по умолчанию): X-Forwarded-For игнорируется,
//     используется X-Real-IP, если он есть; иначе — пустая строка. Connect
//     в этом проекте не даёт интерсептору доступа к TCP-адресу пира без
//     отдельного протаскивания net.Conn через контекст на уровне
//     net/http.Server — заводить этот механизм ради одного заголовка-
//     фолбэка избыточно, а BFF (единственный сетевой клиент сервера, ADR
//     0001) всегда может проставить X-Real-IP сам.
func ClientIP(h http.Header, trustProxy bool) string {
	if trustProxy {
		if v := h.Get("X-Forwarded-For"); v != "" {
			if i := strings.IndexByte(v, ','); i >= 0 {
				return strings.TrimSpace(v[:i])
			}
			return strings.TrimSpace(v)
		}
	}
	return strings.TrimSpace(h.Get("X-Real-IP"))
}
