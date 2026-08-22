# Plan: Расширение API учётки и профиля турнира

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: done
- Дата: 2026-08-22
- Спека: `./spec.md`

## Обзор решения

Два независимых куска в двух существующих модулях, новых bounded context'ов
нет. В `auth` появляются четыре RPC (запрос сброса, установка пароля по
ссылке, смена пароля, правка профиля), таблица одноразовых токенов сброса,
две колонки в `auth.users` (`club`, `password_changed_at`) и доменный порт
`Mailer` с двумя адаптерами (SMTP и лог). В `tournament` — шесть колонок
профиля и соответствующие поля в существующем `UpdateActiveTournament`
(семантика полной замены сохраняется). Web-часть цикла — только BFF-ручки,
типы и правка админской формы турнира, чтобы новые поля было чем заполнить;
экраны входа/кабинета/«о платформе» — спека 0038.

Инвалидация сессий (FR-12) делается без хранилища сессий: `Refresh`
сравнивает `iat` refresh-токена с `password_changed_at` пользователя,
которого и так читает из БД на каждый вызов.

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

### `proto/hema/v1/common.proto`

```proto
message User {
  string id = 1;
  string email = 2;
  string display_name = 3;
  google.protobuf.Timestamp created_at = 4;
  Role role = 5;
  // club — клуб пользователя (данные учётки, не бойца: спеки 0007/0026
  // связь учётка↔боец не восстанавливают). Опционально, пустая строка —
  // «не указан».
  string club = 6;
}
```

### `proto/hema/v1/auth.proto` — `AuthService`

```proto
  // RequestPasswordReset выдаёт ссылку восстановления и отправляет её на
  // почту. Публичный RPC. Ответ не зависит от существования аккаунта.
  rpc RequestPasswordReset(RequestPasswordResetRequest) returns (RequestPasswordResetResponse);
  // ResetPassword задаёт новый пароль по одноразовому токену из письма.
  // Публичный RPC. Сессию не выдаёт (спека 0037, решение 5).
  rpc ResetPassword(ResetPasswordRequest) returns (ResetPasswordResponse);
  // ChangePassword меняет пароль залогиненного пользователя (нужен текущий
  // пароль). Возвращает новую пару токенов: старые refresh обрываются.
  rpc ChangePassword(ChangePasswordRequest) returns (ChangePasswordResponse);
  // UpdateProfile правит отображаемое имя и клуб текущего пользователя.
  rpc UpdateProfile(UpdateProfileRequest) returns (UpdateProfileResponse);
```

```proto
message RequestPasswordResetRequest { string email = 1; }
message RequestPasswordResetResponse {}          // намеренно пустой: FR-2

message ResetPasswordRequest {
  string token = 1;          // сырой токен из ссылки письма
  string new_password = 2;
}
message ResetPasswordResponse {}                 // без TokenPair: FR-7

message ChangePasswordRequest {
  string current_password = 1;
  string new_password = 2;
}
message ChangePasswordResponse { TokenPair tokens = 1; }

message UpdateProfileRequest {
  string display_name = 1;
  string club = 2;           // пустая строка — «убрать клуб»
}
message UpdateProfileResponse { User user = 1; }
```

Access-токен `ChangePassword`/`UpdateProfile` берут из заголовка
`Authorization` тем же приёмом, что уже используется в `Me`
(`connectutil.BearerToken(req.Header())`), — отдельного поля в сообщении нет.

### `proto/hema/v1/tournament.proto`

`Tournament` — новые поля (нумерация продолжает существующую, 10 занято
`event_end_at`):

```proto
  // chief_judge — главный судья турнира (ФИО свободной строкой).
  string chief_judge = 11;
  // regulations_url — веб-адрес регламента (обычно PDF). Только http/https.
  string regulations_url = 12;
  // venue_name / venue_address — место проведения: название площадки и
  // почтовый адрес. Опциональны независимо друг от друга.
  string venue_name = 13;
  string venue_address = 14;
  // entry_fee_minor — взнос за участие в ОДНОЙ номинации, в минорных
  // единицах валюты (копейки). optional: presence различает «не задан» и
  // «ноль» (FR-21). Задан ⇒ entry_fee_currency непустой.
  optional int64 entry_fee_minor = 15;
  // entry_fee_currency — код валюты ISO-4217 ("RUB").
  string entry_fee_currency = 16;
```

`UpdateActiveTournamentRequest` — те же шесть полей (номера 7–12), семантика
полной замены профиля сохраняется (FR-22).

`connectutil.publicProcedures` пополняется двумя записями:
`/hema.v1.AuthService/RequestPasswordReset`,
`/hema.v1.AuthService/ResetPassword`.

## Server (модули и слои)

### Общий пакет `pkg/mail`

- `pkg/mail/mail.go` — `Message{To, Subject, Text string}` и порт
  `Sender interface { Send(ctx context.Context, m Message) error }`.
- `pkg/mail/smtp.go` — `NewSMTP(host, port, username, password, from string) Sender`
  на `net/smtp` (stdlib, без новых зависимостей). PLAIN-аутентификация,
  если `username != ""`.
- `pkg/mail/logger.go` — `NewLogger(log *slog.Logger) Sender`: пишет письмо
  в журнал уровнем `Info`. Реализация по умолчанию, когда SMTP не настроен
  (NFR-3).
- `pkg/mail/mail_test.go` — юнит: `NewLogger` печатает адрес/тему/тело;
  сборка SMTP-сообщения (заголовки, UTF-8 subject) проверяется без сети.

### Модуль `auth` — расширение

- PG-схема: существующая `auth`.
- `domain/domain.go`:
  - `User` += `Club string`, `PasswordChangedAt time.Time`.
  - `ResetToken{ ID, UserID, TokenHash string; CreatedAt, ExpiresAt time.Time; UsedAt *time.Time }`.
  - Порт `Mailer interface { SendPasswordReset(ctx context.Context, to, link string) error }`
    — домен знает «отправить письмо со ссылкой», не знает SMTP.
  - Расширение порта `Repository`:
    `CreateResetToken(ctx, NewResetToken) (ResetToken, error)`,
    `LastResetTokenAt(ctx, userID string) (time.Time, error)` (нулевое время
    — токенов не было),
    `InvalidateActiveResetTokens(ctx, userID string) error`,
    `GetActiveResetToken(ctx, tokenHash string) (ResetToken, error)`,
    `MarkResetTokenUsed(ctx, id string) error`,
    `UpdatePassword(ctx, userID, passwordHash string) error` (двигает
    `password_changed_at`),
    `UpdateProfile(ctx, userID, displayName, club string) (User, error)`.
  - Новые ошибки: `ErrInvalidResetToken`, `ErrWeakPassword`,
    `ErrInvalidProfile`.
- `service/`:
  - `password_reset.go` — `RequestPasswordReset(ctx, email) error`:
    нормализация email → поиск пользователя (нет — тихий успех, FR-2) →
    троттлинг по `LastResetTokenAt` (< 1 мин — тихий успех, FR-6) →
    погашение активных токенов (FR-5) → генерация 32 случайных байт
    (`crypto/rand`, base64url) → сохранение **sha256-хеша** (NFR-1) с
    `expires_at = now + resetTTL` → сборка ссылки `publicAppURL +
    "/reset-password?token=" + raw` → `Mailer.SendPasswordReset`; ошибка
    отправки логируется и **не** меняет ответ (NFR-2).
  - `ResetPassword(ctx, rawToken, newPassword) error`: политика пароля →
    хеш токена → `GetActiveResetToken` (не найден/просрочен/погашен →
    `ErrInvalidResetToken`) → `UpdatePassword` → `MarkResetTokenUsed`.
  - `ChangePassword(ctx, accessToken, current, new) (jwt.Pair, error)`:
    разбор access-токена (как в `Me`) → сверка текущего пароля
    (`crypto.VerifyPassword`) → политика → `UpdatePassword` → выдача новой
    пары (текущее устройство остаётся в системе, FR-12/решение 6).
  - `UpdateProfile(ctx, accessToken, displayName, club) (domain.User, error)`:
    trim, пустое имя → `ErrInvalidProfile`.
  - `Refresh` — добавляется проверка: `claims.IssuedAt` строго раньше
    `user.PasswordChangedAt.Truncate(time.Second)` → `ErrInvalidCredentials`
    (FR-12). Усечение до секунды — потому что `iat` в JWT хранится в целых
    секундах; равенство считается валидным, иначе токен, выданный `Login`
    сразу после сброса в ту же секунду, отклонялся бы сам собой.
  - Единая политика пароля — `service/password_policy.go`:
    `const MinPasswordLen = 8`, `validatePassword(string) error`.
    Подключается в `Register`, `createUser` (в т.ч. `CreateAdmin` и
    bootstrap), `ResetPassword`, `ChangePassword` (FR-11).
  - Конструктор `New` получает новые зависимости: `mailer domain.Mailer`,
    `publicAppURL string`, `resetTTL time.Duration`, `now func() time.Time`
    (детерминизм тестов на TTL/троттлинг).
- `repo/queries/users.sql` — **все существующие SELECT'ы дополняются
  колонками `club, password_changed_at`** (иначе маппинг молча теряет поля);
  новые запросы: `UpdateUserPassword`, `UpdateUserProfile`,
  `CreateResetToken`, `LastResetTokenAt`, `InvalidateActiveResetTokens`,
  `GetActiveResetToken`, `MarkResetTokenUsed`. Затем `make sqlc`.
- `repo/repo.go` — реализация новых методов порта + маппинг новых колонок.
- `mailer/mailer.go` (новый пакет модуля) — адаптер
  `domain.Mailer` поверх `pkg/mail.Sender`: собирает русский текст письма
  (одна ссылка + срок жизни, NFR-4), тема «Восстановление доступа —
  openHEMA».
- `testutil/fake_repo.go` — in-memory реализация новых методов + `FakeMailer`
  (запоминает последнее письмо) для service-тестов.
- `api/handler.go` — четыре новых метода, маппинг ошибок:
  `ErrInvalidResetToken` → `CodeInvalidArgument` (не `NotFound`: код не
  должен различать «нет токена» и «просрочен», FR-8), `ErrWeakPassword` и
  `ErrInvalidProfile` → `CodeInvalidArgument`, `ErrInvalidCredentials` →
  `CodeUnauthenticated` (как сейчас).
- `migrations/00002_password_reset.sql` (goose):

```sql
-- +goose Up
ALTER TABLE auth.users
    ADD COLUMN club TEXT NOT NULL DEFAULT '',
    ADD COLUMN password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Одноразовые токены восстановления. Отдельная таблица, а не колонки в
-- users: у одного пользователя за жизнь их много, и нужна история выдачи
-- (троттлинг FR-6 читает время последней выдачи, в т.ч. погашенной).
CREATE TABLE auth.password_reset_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- sha256(raw) в hex: сырой токен живёт только в письме (NFR-1).
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    -- used_at — момент погашения: и «использован» (FR-4), и «вытеснен
    -- новым запросом» (FR-5). NULL — активен.
    used_at    TIMESTAMPTZ NULL,
    CONSTRAINT chk_prt_expires_after_created CHECK (expires_at > created_at)
);

CREATE INDEX idx_prt_user_active ON auth.password_reset_tokens (user_id)
    WHERE used_at IS NULL;
CREATE INDEX idx_prt_user_created ON auth.password_reset_tokens (user_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS auth.password_reset_tokens;
ALTER TABLE auth.users
    DROP COLUMN IF EXISTS password_changed_at,
    DROP COLUMN IF EXISTS club;
```

### Модуль `tournament` — расширение

- `domain/domain.go`: `Tournament` += `ChiefJudge`, `RegulationsURL`,
  `VenueName`, `VenueAddress string`, `EntryFeeMinor *int64`,
  `EntryFeeCurrency string`; те же поля в структуре обновления.
  Ошибка `ErrInvalidInput` переиспользуется.
- `service/service.go` — валидация в существующем `UpdateActive`:
  - `regulations_url` непустой ⇒ парсится `net/url` и схема ∈ {http, https}
    (FR-20);
  - `entry_fee_minor` задан ⇒ ≥ 0 и валюта непуста (по умолчанию
    подставляется `"RUB"`, если клиент прислал сумму без валюты); не задан ⇒
    валюта затирается в пустую строку (FR-21);
  - остальные поля — trim, без обязательности.
- `repo/queries/tournament.sql` + `repo/repo.go` — новые колонки в
  SELECT/UPDATE; `make sqlc`.
- `migrations/00003_profile_extras.sql`:

```sql
-- +goose Up
ALTER TABLE tournament.tournaments
    ADD COLUMN chief_judge        TEXT   NOT NULL DEFAULT '',
    ADD COLUMN regulations_url    TEXT   NOT NULL DEFAULT '',
    ADD COLUMN venue_name         TEXT   NOT NULL DEFAULT '',
    ADD COLUMN venue_address      TEXT   NOT NULL DEFAULT '',
    -- NULL = «взнос не задан», 0 = «участие бесплатное» (FR-21).
    ADD COLUMN entry_fee_minor    BIGINT NULL,
    ADD COLUMN entry_fee_currency TEXT   NOT NULL DEFAULT '';

-- entry_fee_minor IS NOT NULL во втором дизъюнкте обязателен: NULL >= 0 в
-- SQL — unknown, не false, поэтому «валюта без суммы» без него молча
-- проходило бы CHECK (three-valued logic: OR с NULL даёт NULL — не false).
ALTER TABLE tournament.tournaments
    ADD CONSTRAINT chk_entry_fee CHECK (
        (entry_fee_minor IS NULL AND entry_fee_currency = '')
        OR (entry_fee_minor IS NOT NULL AND entry_fee_minor >= 0 AND entry_fee_currency <> '')
    );

-- +goose Down
ALTER TABLE tournament.tournaments DROP CONSTRAINT IF EXISTS chk_entry_fee;
ALTER TABLE tournament.tournaments
    DROP COLUMN IF EXISTS entry_fee_currency,
    DROP COLUMN IF EXISTS entry_fee_minor,
    DROP COLUMN IF EXISTS venue_address,
    DROP COLUMN IF EXISTS venue_name,
    DROP COLUMN IF EXISTS regulations_url,
    DROP COLUMN IF EXISTS chief_judge;
```

### Конфигурация и wiring

- `pkg/config/config.go` += `SMTPHost`, `SMTPPort`, `SMTPUsername`,
  `SMTPPassword`, `SMTPFrom`, `PublicAppURL` (дефолт
  `http://localhost:3000`), `PasswordResetTTL` (дефолт `30m`). Обязательных
  среди них нет: пустой `SMTP_HOST` — легальная конфигурация.
- `internal/platform/platform.go`: выбор адаптера почты —
  `cfg.SMTPHost != ""` ? `mail.NewSMTP(...)` : `mail.NewLogger(log)`
  (с предупреждением в журнал при старте), передача в `auth.Deps` вместе с
  `PublicAppURL`/`PasswordResetTTL`.
- `.env.example` и `docker-compose.yml` (сервис `server`) — новые
  переменные с плейсхолдерами; секреты не коммитим (правило 6 AGENTS.md).

## Web (FSD + BFF)

Экранов эта спека не делает — только транспорт и то, без чего новые поля
турнира нечем заполнить.

- BFF (Route Handlers, Node runtime):
  - `app/api/auth/password-reset/route.ts` — `POST {email}` →
    `RequestPasswordReset`; всегда `200 {ok:true}` (FR-2), ошибки транспорта
    — через `errorResponse`.
  - `app/api/auth/password-reset/confirm/route.ts` — `POST {token,password}`
    → `ResetPassword`; `InvalidArgument` → 400 с человеческим текстом
    «ссылка недействительна или устарела».
  - `app/api/auth/password/route.ts` — `POST {currentPassword,newPassword}`
    → `ChangePassword` с access-токеном из cookie; при успехе
    `setSessionCookies` новой парой (иначе устройство само себя разлогинит
    на следующем refresh).
  - `app/api/auth/profile/route.ts` — `PATCH {displayName,club}` →
    `UpdateProfile`, ответ `{user}` через `userToJson`.
- `entities/user/lib/types.ts` — `CurrentUser` += `club: string`;
  `lib/grpc/serialize.ts` — `userToJson` нормализует `club` (proto3 опускает
  пустые строки, как уже сделано для `Tournament`).
- `entities/tournament` (`TournamentDto`) + `tournamentToJson` — шесть новых
  полей с той же нормализацией; `entryFeeMinor` приходит как `number | null`
  (proto `optional int64` в JSON — строка, приводится в BFF).
- `features/tournament-settings` — форма профиля турнира (экран 0029)
  получает новые поля: «Главный судья», «Ссылка на регламент», «Место
  проведения» (название + адрес), «Взнос за номинацию» (сумма + валюта).
  Обязательно: `UpdateActiveTournament` заменяет профиль целиком, поэтому
  форма, не отправляющая новые поля, обнуляла бы их при каждом сохранении.
  `features/tournament-settings/api/requests.ts` + схема валидации + тесты
  обновляются вместе.
- Server components vs client: правки — внутри существующей клиентской формы
  настроек; новых страниц нет.
- State: без изменений (server-state — TanStack Query, ключи существующие).

## События

> Placeholder. Event-Driven Design ещё не введён (ADR появится с первой
> событийной фичей).

- Издаёт: нет.
- Потребляет: нет.
- На будущее: «пароль сменён» и «запрошено восстановление» — естественные
  кандидаты в доменные события (аудит), но до EDD-ADR не реализуем.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит (`pkg/`)**: `pkg/mail` — сборка сообщения и лог-адаптер;
  `pkg/jwt` — без изменений.
- **Юнит (`service/` с fake-репо и `FakeMailer`, детерминированные часы)**:
  - несуществующий email → успех без письма (AC-2);
  - существующий → письмо ушло, ссылка содержит выданный токен (AC-1);
  - повтор в пределах минуты → второго письма нет (AC-7);
  - повторный запрос спустя минуту гасит прежний токен (AC-6);
  - сброс: успех, повтор по тому же токену, просроченный токен (AC-3/4/5);
  - сброс не возвращает пару токенов (FR-7);
  - смена пароля: успех + новая пара, неверный текущий (AC-8/9);
  - политика длины во всех четырёх точках (AC-10);
  - `Refresh` со старым `iat` после смены пароля → отказ; с новым → успех
    (AC-11);
  - профиль: успех (AC-12), пустое имя (AC-13);
  - ошибка `Mailer` не превращается в ошибку RPC (NFR-2);
  - tournament: валидация регламент-URL (AC-15), взнос «не задан» vs 0
    (AC-16), отрицательный взнос.
- **E2E ручек (`api/` через httptest + Connect, fake-репо)**: четыре новых
  RPC — счастливый путь и маппинг доменных ошибок в `connect.Code`;
  публичность `RequestPasswordReset`/`ResetPassword` (без `Authorization`
  проходят) и приватность `ChangePassword`/`UpdateProfile` (без токена —
  `Unauthenticated`).
- **Интеграционные с БД (testcontainers, `internal/testdb`)**: миграции
  `auth 00002` и `tournament 00003` применяются и откатываются; уникальность
  `token_hash`; `CHECK chk_entry_fee` не пускает «сумма без валюты»;
  round-trip профиля турнира со всеми новыми полями.
- **Web (Vitest)**: четыре новых route handler'а (mock Connect-клиента,
  маппинг кодов в HTTP, установка cookie при смене пароля); `userToJson` и
  `tournamentToJson` с новыми полями; форма настроек турнира — новые поля
  отправляются и не теряются при сохранении.

## Риски и открытые вопросы

- **Ротация `password_changed_at` разлогинивает всех при первом
  развёртывании?** Нет: `DEFAULT now()` проставляется в момент миграции, а
  токены, выданные **до** неё, окажутся старше — все активные refresh-сессии
  оборвутся один раз. Это разовое последствие; для пет-проекта приемлемо,
  но упомянуть в описании PR.
- **Уборка старых токенов сброса.** Таблица растёт: строки не удаляются.
  При текущих объёмах не проблема; если понадобится — отдельная задача
  (периодическая чистка `expires_at < now() - 30d`), не в этой спеке.
- **SMTP в докере.** `make prod` без внешнего SMTP работает на лог-адаптере;
  проверять реальную отправку в CI не будем.
- **`optional int64` в JSON.** Connect-ES отдаёт 64-битные числа строкой —
  BFF обязан приводить; забыть об этом легко, поэтому явный тест на
  `tournamentToJson`.
- **Форма турнира.** Правка существующей формы (0029) — единственное место,
  где эта спека трогает готовый редизайн; менять композицию экрана нельзя,
  только добавить поля в существующие секции.
