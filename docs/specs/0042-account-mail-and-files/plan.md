# Plan: Учётка, почта и файлы

> Артефакт SDD (ADR 0008). Описывает **КАК** реализуем `spec.md` в архитектуре
> проекта. Заполняется только когда в `spec.md` нет открытых
> `[NEEDS CLARIFICATION]`.

- Статус: ready
- Дата: 2026-08-28
- Спека: `./spec.md`

## Обзор решения

Пять блоков спеки ложатся на четыре существующих модуля и три новых пакета
инфраструктуры — **новых bounded context не заводится**.

1. **Модуль `auth`** берёт на себя всё, что принадлежит учётке:
   подтверждение и смену адреса (новая таблица одноразовых токенов,
   родственная `password_reset_tokens` из 0037), реестр refresh-сессий
   (новая таблица + новый клейм `sid` в refresh-токене) и **личные**
   переключатели уведомлений (два булевых поля учётки).
2. **Модуль `tournament`** берёт **глобальные** переключатели уведомлений
   (решение 7 спеки: активный турнир один, виды уведомлений — о событиях
   турнира) и **два файла профиля** — регламент и эмблему (решение 10):
   идентификатор объекта в хранилище, взаимно исключающий соответствующую
   ссылку (`regulations_url`, `emblem_url`).
3. **Уведомления** — не модуль, а порт в домене модуля-источника
   (`application`, `stage`) плюс адаптер в `internal/platform`, ровно тем
   же приёмом, что `Users`/`LiveBus` сегодня (ADR 0002: чужие данные —
   через API модуля). Адаптер спрашивает у `auth` **готовый список
   получателей** (кому этот вид разрешён глобально, включён лично и на
   подтверждённый адрес) и отдаёт письмо в диспетчер `pkg/notify`, который
   отправляет вне запроса (FR-27, FR-28).
4. **Файловое хранилище** — порт `pkg/filestore` с единственным адаптером
   «локальный том» (решение 3); потребитель один — модуль `tournament`,
   в нём два поля (регламент и эмблема). Отдача файла — обычный
   HTTP-хендлер на том же `http.ServeMux`, что и Connect-сервисы, плюс
   проксирующий route handler BFF (браузер ходит только в BFF, ADR 0001).
5. **Ограничение частоты** — интерцептор `connectutil.RateLimit` на
   сервере; реальный адрес клиента приходит из BFF заголовком, доверие к
   заголовку включается конфигурацией (NFR-6).

Две новые ADR пишутся вместе с этим планом (ADR 0017, «Последствия»):
**ADR 0018 «Персистентность refresh-сессий»** (разворот решения 6 спеки
0037: что отзывается мгновенно, что доживает свой TTL, почему access
остаётся stateless) и **ADR 0019 «Файловое хранилище»** (порт + локальный
том, лимиты, отдача, почему не S3 сейчас).

## Контракты (proto)

> Источник истины API — `/proto`. Меняем только там, потом `make generate`.

### `proto/hema/v1/common.proto`

- `User` — новые поля: `bool email_verified = 7`, `string pending_email = 8`
  (непусто — есть незавершённый запрос смены, FR-6),
  `NotificationSettings notifications = 9` (личные переключатели, FR-20).
- Новое сообщение `NotificationSettings { bool application_state = 1;
  bool pool_seated = 2; }` — одна форма для личных (auth) и глобальных
  (tournament) переключателей: виды уведомлений совпадают, два разных
  сообщения разъехались бы при добавлении третьего вида.

### `proto/hema/v1/auth.proto`

`AuthService` (публичные RPC — в `publicProcedures` интерсептора `Auth`):

- `VerifyEmail(VerifyEmailRequest{string token}) → VerifyEmailResponse{}` —
  публичный, погашает токен (FR-3).
- `ConfirmEmailChange(ConfirmEmailChangeRequest{string token}) →
  ConfirmEmailChangeResponse{User user}` — публичный (переход из письма,
  сессии может не быть), FR-6/FR-8.

`AuthService` (требуют access-токена):

- `ResendEmailVerification(...Request{}) → ...Response{}` — FR-4,
  троттлинг 1/мин на адрес, ответ пустой (не раскрывает состояние).
- `RequestEmailChange(RequestEmailChangeRequest{string new_email,
  string current_password}) → RequestEmailChangeResponse{User user}` —
  FR-6/FR-8; в ответе `pending_email`.
- `CancelEmailChange(...Request{}) → ...Response{User user}` — FR-6.
- `UpdateNotificationSettings(UpdateNotificationSettingsRequest{
  NotificationSettings settings}) → ...Response{User user}` — FR-20/FR-21
  (отказ, если адрес не подтверждён).
- `ListSessions(ListSessionsRequest{}) → ListSessionsResponse{repeated
  Session sessions}` — FR-11.
- `RevokeSession(RevokeSessionRequest{string session_id}) → ...Response{}`
  — FR-12; чужая сессия → `PermissionDenied` (FR-17).
- `RevokeOtherSessions(...Request{}) → ...Response{int32 revoked_count}` —
  FR-12.
- `Logout(LogoutRequest{string refresh_token}) → LogoutResponse{}` —
  FR-13. Токен в теле, а не только cookie: сервер узнаёт сессию по клейму
  `sid`.
- Новое сообщение `Session { string id = 1;
  google.protobuf.Timestamp created_at = 2;
  google.protobuf.Timestamp last_seen_at = 3; bool current = 4; }` —
  без IP и User-Agent (FR-11, NFR-8).

`Refresh`/`Login`/`Register`/`ChangePassword`/`ResetPassword` — **сигнатуры
не меняются**, меняется поведение (создание/проверка/отзыв сессии, FR-10,
FR-14).

### `proto/hema/v1/tournament.proto`

- Новое сообщение `TournamentFile { string url = 1; string name = 2;
  int64 size = 3; }` — публичный адрес, исходное имя и размер загруженного
  файла; пустой `url` — файла нет. Одна форма на оба поля: у регламента и
  эмблемы одинаковый набор атрибутов, две пары плоских полей в
  `Tournament` разъехались бы при третьем файле.
- Новый enum `TournamentFileKind { TOURNAMENT_FILE_KIND_UNSPECIFIED = 0;
  TOURNAMENT_FILE_KIND_REGULATIONS = 1; TOURNAMENT_FILE_KIND_EMBLEM = 2; }`
  — вид файла как параметр, а не как отдельная пара RPC на каждое поле
  (см. ниже).
- `Tournament` — новые поля: `TournamentFile regulations_file = 18`,
  `TournamentFile emblem_file = 19`, `NotificationSettings notifications =
  20` (глобальные переключатели, FR-19).
- `UpdateActiveTournamentRequest` — новое поле `NotificationSettings
  notifications` (правится тем же экраном профиля, что и остальные поля).
  `regulations_url` и `emblem_url` остаются; непустая ссылка вытесняет
  соответствующий файл (FR-34) — инвариант проверяется в service, а не
  только в CHECK (см. «Риски»).
- `TournamentAdminService` — **одна пара RPC на оба файла**, вид передаётся
  параметром: политика (тип, порог) различается, а путь «проверить →
  положить в хранилище → обновить профиль → освободить прежний объект»
  общий, и дублировать его двумя парами RPC незачем.
  - `UploadTournamentFile(UploadTournamentFileRequest{
    TournamentFileKind kind = 1, bytes content = 2, string file_name = 3,
    string content_type = 4}) → UploadTournamentFileResponse{Tournament
    tournament}` — FR-30/FR-31. Файл целиком одним сообщением (пороги 10 и
    5 МБ, FR-32), стриминг не нужен.
  - `DeleteTournamentFile(DeleteTournamentFileRequest{
    TournamentFileKind kind = 1}) → DeleteTournamentFileResponse{Tournament
    tournament}` — FR-36.

## Server (модули и слои)

> См. ADR 0002 (модульный монолит) и `server/AGENTS.md`.

### Модуль `auth` — расширение

- PG-схема: `auth` (существующая).
- `domain/`:
  - `User` +`EmailVerifiedAt *time.Time`, `PendingEmail string`,
    `Notifications NotificationSettings{ApplicationState, PoolSeated bool}`.
  - `EmailToken{ID, UserID, Purpose (verify|change), TokenHash, NewEmail,
    CreatedAt, ExpiresAt, UsedAt}` + `NewEmailToken` — родственник
    `ResetToken`, но **отдельный тип и таблица**: у него другой жизненный
    цикл (два назначения), другая полезная нагрузка (`new_email`) и другой
    TTL. Слияние с `password_reset_tokens` дало бы таблицу с
    полу-заполненными колонками и CHECK на три случая.
  - `Session{ID, UserID, CreatedAt, LastSeenAt, ExpiresAt, RevokedAt}`.
  - Ошибки: `ErrInvalidEmailToken` (не найден/просрочен/погашен — один код,
    как `ErrInvalidResetToken`), `ErrEmailTaken`, `ErrEmailNotVerified`
    (попытка включить уведомления, FR-21), `ErrSessionNotFound`,
    `ErrThrottled` (уже есть у сброса — переиспользуется).
  - `Mailer` (порт) += `SendEmailVerification(ctx, to, link)`,
    `SendEmailChangeConfirmation(ctx, newAddr, link)`,
    `SendEmailChangeNotice(ctx, oldAddr, newAddr)`.
  - `Repository` += `MarkEmailVerified`, `CreateEmailToken`,
    `GetActiveEmailToken`, `MarkEmailTokenUsed`,
    `InvalidateActiveEmailTokens(userID, purpose)`,
    `LastEmailTokenAt(userID, purpose)`, `SetPendingEmail`,
    `ApplyEmailChange(userID, newEmail, at)` (меняет email + сбрасывает
    `email_verified_at` в момент подтверждения нового адреса),
    `CreateSession`, `GetSession`, `TouchSession`, `ListActiveSessions`,
    `RevokeSession`, `RevokeUserSessions(userID, exceptID)`,
    `DeleteExpiredSessions`, `SetNotificationSettings`,
    `RecipientsFor(ctx, kind, userIDs)` (см. ниже).
- `service/`:
  - `email_verification.go` — `SendVerification` (вызывается из `Register`),
    `VerifyEmail`, `ResendVerification` (троттлинг, переиспользует правило
    0037 FR-6).
  - `email_change.go` — `RequestEmailChange` (проверка пароля + занятости),
    `ConfirmEmailChange` (повторная проверка занятости, FR-8),
    `CancelEmailChange`.
  - `sessions.go` — `ListSessions`, `RevokeSession`, `RevokeOtherSessions`,
    `Logout`; `Login`/`Register` создают сессию и кладут её id в
    `jwt.Issue`; `Refresh` читает `sid`, проверяет активность и `TouchSession`;
    `ChangePassword` → `RevokeUserSessions(except: current)`;
    `ResetPassword` → `RevokeUserSessions(except: "")` (FR-14).
  - `notifications.go` — `UpdateNotificationSettings` (гейт FR-21),
    `Recipients(ctx, kind, userIDs)` — межмодульная точка входа: возвращает
    `map[userID]email` только для тех, у кого вид включён лично **и** адрес
    подтверждён. Глобальный переключатель здесь **не** проверяется: он
    принадлежит `tournament`, и его читает адаптер-нотификатор до вызова
    (см. «Межмодульные зависимости»).
- `repo/queries/*.sql` + `make sqlc`; `repo/repo.go` — реализация порта.
- `api/` — новые хендлеры + маппинг: `ErrInvalidEmailToken` →
  `CodeInvalidArgument`, `ErrEmailTaken` → `CodeAlreadyExists`,
  `ErrEmailNotVerified` → `CodeFailedPrecondition`, `ErrSessionNotFound` →
  `CodeNotFound`, чужая сессия → `CodePermissionDenied`, `ErrThrottled` →
  `CodeResourceExhausted`.
- `mailer/` — три новых шаблона писем рядом с `SendPasswordReset`
  (plain text, RU, NFR-7).
- `migrations/00003_email_sessions_notifications.sql` (goose):

```sql
ALTER TABLE auth.users
    -- NULL = адрес не подтверждён. Не BOOLEAN: момент подтверждения
    -- нужен интерфейсу («подтверждён 12 июля») и разбору инцидентов.
    ADD COLUMN email_verified_at        TIMESTAMPTZ NULL,
    -- Личные переключатели уведомлений (FR-20). Колонки, а не отдельная
    -- таблица: набор видов закрыт спекой (два), таблица «настройка на
    -- строку» здесь — оверинжиниринг. Третий вид добавит третью колонку.
    ADD COLUMN notify_application_state BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN notify_pool_seated       BOOLEAN NOT NULL DEFAULT FALSE;

-- Grandfather (FR-1): учётки, заведённые до фичи, считаются
-- подтверждёнными — иначе внедрение молча отключило бы им уведомления и
-- показало бы бейдж «адрес не подтверждён» всем разом, включая
-- bootstrap-админа. Колонка без DEFAULT: новые учётки создаются с NULL.
UPDATE auth.users SET email_verified_at = now();

-- Одноразовые токены подтверждения и смены адреса. Отдельная таблица от
-- password_reset_tokens: другое назначение, другой TTL и своя полезная
-- нагрузка (new_email).
CREATE TABLE auth.email_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    purpose    TEXT NOT NULL,
    -- sha256(raw) в hex: сырой токен живёт только в письме (NFR-1).
    token_hash TEXT NOT NULL UNIQUE,
    -- new_email заполнен ровно у purpose='change' (см. CHECK ниже).
    new_email  TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ NULL,
    CONSTRAINT chk_email_tokens_purpose CHECK (purpose IN ('verify', 'change')),
    -- Симметрично в обе стороны (тот же приём, что chk_entry_fee в
    -- tournament/00003): равенство предикатов запрещает и «change без
    -- адреса», и «verify с адресом».
    CONSTRAINT chk_email_tokens_new_email CHECK ((purpose = 'change') = (new_email IS NOT NULL)),
    CONSTRAINT chk_email_tokens_expires CHECK (expires_at > created_at)
);

CREATE INDEX idx_email_tokens_user_active ON auth.email_tokens (user_id, purpose)
    WHERE used_at IS NULL;
CREATE INDEX idx_email_tokens_user_created ON auth.email_tokens (user_id, purpose, created_at DESC);

-- Реестр refresh-сессий (ADR 0018). Одна строка — одна выданная сессия;
-- id строки попадает в клейм sid refresh-токена.
CREATE TABLE auth.sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- last_seen_at обновляется на каждом Refresh (FR-11). Не на каждом
    -- запросе: access-токен stateless и реестра не касается (FR-16).
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ NULL,
    CONSTRAINT chk_sessions_expires CHECK (expires_at > created_at)
);

CREATE INDEX idx_sessions_user_active ON auth.sessions (user_id) WHERE revoked_at IS NULL;
-- Для чистки просроченных (FR-15).
CREATE INDEX idx_sessions_expires ON auth.sessions (expires_at);
```

- Wiring: `auth.Deps` += `EmailTokenTTL`, `Now`; `auth.Register(...)` без
  изменений сигнатуры.

### Модуль `tournament` — расширение

- `domain/`: `Tournament` += `RegulationsFile StoredFile`,
  `EmblemFile StoredFile` (`StoredFile{ID, Name, Size}`),
  `Notifications NotificationSettings`; `FileKind` (`regulations`,
  `emblem`) и таблица политик `FilePolicy{AllowedTypes []string, MaxBytes
  int64}` — по одной на вид (FR-32), значения приходят из конфигурации,
  а не зашиты в домен. Ошибки `ErrFileTooLarge`, `ErrUnsupportedFileType`,
  `ErrStorageUnavailable` (NFR-4). Новый порт `FileStore` (см.
  `pkg/filestore`) в `Deps`.
- `service/`: `UploadFile(ctx, kind, content, name, declaredType)` —
  валидация вида, типа и размера → `filestore.Put` → сохранение id →
  удаление прежнего объекта (FR-36); `DeleteFile(ctx, kind)`; инвариант
  «файл ⊕ ссылка» **на оба поля** в `UpdateActiveTournament` (непустой
  `regulations_url`/`emblem_url` очищает соответствующий файл и
  освобождает объект). Тип определяется по содержимому (сигнатура файла),
  а не по заявленному `content_type` (NFR-9): заявленное значение служит
  только ранней отбраковкой на BFF.
  `NotificationsFor(ctx) → NotificationSettings` — межмодульная точка входа
  для адаптера-нотификатора (глобальные переключатели, FR-19).
- `api/`: `UploadTournamentFile`/`DeleteTournamentFile`; маппинг
  `ErrFileTooLarge`/`ErrUnsupportedFileType`/неизвестный `kind` →
  `CodeInvalidArgument`, `ErrStorageUnavailable` →
  `CodeFailedPrecondition` (FR-32, NFR-4).
- `migrations/00005_tournament_files_and_notifications.sql`:

```sql
ALTER TABLE tournament.tournaments
    -- Идентификатор объекта в хранилище (см. ADR 0019), '' — файла нет.
    -- Не путь на диске: путь — деталь адаптера, домен знает только id.
    ADD COLUMN regulations_file_id   TEXT   NOT NULL DEFAULT '',
    -- Имя и размер — для интерфейса («Регламент.pdf · 2,4 МБ») и для
    -- заголовков отдачи; спрашивать их у хранилища на каждый показ
    -- профиля было бы лишним обращением к диску.
    ADD COLUMN regulations_file_name TEXT   NOT NULL DEFAULT '',
    ADD COLUMN regulations_file_size BIGINT NOT NULL DEFAULT 0,
    -- Эмблема файлом (FR-31, решение 10) — те же три колонки. Плоские
    -- колонки, а не дочерняя таблица «файлы турнира»: полей ровно два,
    -- они принадлежат самому профилю и живут его жизнью; таблица
    -- потребовалась бы, если бы файлы стали списком (галерея — вне
    -- скоупа).
    ADD COLUMN emblem_file_id        TEXT   NOT NULL DEFAULT '',
    ADD COLUMN emblem_file_name      TEXT   NOT NULL DEFAULT '',
    ADD COLUMN emblem_file_size      BIGINT NOT NULL DEFAULT 0,
    -- Глобальные переключатели уведомлений (FR-19, решение 7 спеки):
    -- активный турнир один, виды говорят о событиях турнира. Колонки по
    -- той же причине, что и в auth.users.
    ADD COLUMN notify_application_state BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN notify_pool_seated       BOOLEAN NOT NULL DEFAULT FALSE;

-- Источник ровно один у каждого поля (FR-34): ссылка и файл взаимно
-- исключаются. Существующие строки проходят: file_id по умолчанию ''.
ALTER TABLE tournament.tournaments
    ADD CONSTRAINT chk_regulations_one_of
        CHECK (regulations_url = '' OR regulations_file_id = ''),
    ADD CONSTRAINT chk_emblem_one_of
        CHECK (emblem_url = '' OR emblem_file_id = '');

-- Имя и размер имеют смысл только при заданном файле.
ALTER TABLE tournament.tournaments
    ADD CONSTRAINT chk_regulations_file_fields
        CHECK ((regulations_file_id = '') = (regulations_file_name = '' AND regulations_file_size = 0)),
    ADD CONSTRAINT chk_emblem_file_fields
        CHECK ((emblem_file_id = '') = (emblem_file_name = '' AND emblem_file_size = 0));
```

### Модуль `application` — точка уведомления

- `domain/`: новый порт
  `Notifier interface { ApplicationStateChanged(ctx, ApplicationNotice) }`,
  где `ApplicationNotice{ApplicantUserID, NominationName, State, EventType}`.
  Порт **не возвращает ошибку**: почта — побочный эффект, домен о её
  судьбе не знает (FR-27).
- `service/`: вызовы порта после успешного аппенда события в
  `ConfirmPayment`, `RegisterFighter`, `EditApplication` (FR-23).
  `DeclarePayment` и `WithdrawApplication` — не вызывают (собственные
  действия заявителя). Nil-`Notifier` допустим (no-op) — так работают
  существующие тесты сервиса без правки.

### Модуль `stage` — точка уведомления

- `domain/`: порт `Notifier interface { PoolSeated(ctx, PoolSeatedNotice) }`
  с `PoolSeatedNotice{FighterIDs, NominationID/Name, PoolName, ArenaName}`.
- `service/service.go`: вызов в `SeatPoolOnArena` после успешного
  `repo.SeatPool` — рядом с уже существующими `notifyNominationChanged` и
  `signalArenaBoard` (FR-24, FR-29). Состав бойцов пула читается тем же
  запросом раскладки, что уже используется.

### Новые пакеты `server/pkg`

- `pkg/notify` — `Dispatcher`: буферизованный канал + один воркер +
  `Close()` с дренажом. `Enqueue(Message)` никогда не блокирует: полный
  буфер → запись в журнал и дроп (FR-28). Ошибки `Sender.Send` — в журнал
  (FR-27). Здесь же — шаблоны писем-уведомлений (RU, plain text, NFR-7).
- `pkg/filestore` — порт `Store{ Put(ctx, r, meta) (id, error);
  Open(ctx, id) (io.ReadCloser, meta, error); Delete(ctx, id) error }` +
  адаптер `local.New(dir)`: файл на диске, имя объекта — случайный UUID,
  расширение из **определённого системой** типа (NFR-9). `nil`-Store =
  хранилище не настроено (NFR-4). Здесь же `Sniff(head []byte) (mime
  string, ok bool)` — определение типа по сигнатуре для белого списка
  PDF/PNG/JPEG/WebP; всё, что не опознано (включая SVG — текстовый формат
  без бинарной сигнатуры, FR-33), отвергается.
- `pkg/connectutil/ratelimit.go` — интерцептор: `map[ip]*bucket` под
  мьютексом, окно и порог из конфигурации, набор защищаемых процедур —
  явный список (FR-39). Превышение → `connect.CodeResourceExhausted` с
  единым сообщением (FR-40). Периодическая чистка протухших корзин.
- `pkg/jwt` — `Claims` += `SessionID string \`json:"sid,omitempty"\``;
  `Issue(userID, role, sessionID string)`. Клейм кладётся **только** в
  refresh (access остаётся stateless, FR-16).

### `internal/platform` — composition root

- `NewApplicationNotifier(pool, dispatcher, recipients, tournaments)` и
  `NewStageNotifier(pool, dispatcher, recipients, tournaments, fighters)` —
  новые адаптеры (`notification_adapters.go`). Каждый: читает глобальный
  переключатель у `tournament` (FR-19) → если выключен, выходит; иначе
  спрашивает у `auth` получателей (`Recipients`, фильтр «включено лично +
  адрес подтверждён») → кладёт письма в `notify.Dispatcher`.
- `NewFighterAccountProvider(pool)` — резолв `fighterID →
  linkedAccountID` через API модуля `fighter` (0040, FR-8), чтобы адаптер
  `stage` не лез в чужую схему (FR-25).
- Регистрация HTTP-хендлера отдачи файла: `mux.Handle("GET /files/",
  filesHandler(store))` — публично (FR-35). `Content-Type` берётся из
  метаданных объекта, определённых при загрузке (NFR-9), плюс
  `X-Content-Type-Options: nosniff`; `Content-Disposition: inline` с
  исходным именем. Хендлер один на оба вида файлов — он адресует объект по
  id и о том, регламент это или эмблема, не знает.
- `App.Close()` дренирует `notify.Dispatcher` перед закрытием пула.

### Конфигурация (`pkg/config` + `.env.example`)

`EMAIL_TOKEN_TTL` (24h), `FILE_STORAGE_DIR` (пусто — хранилище выключено,
NFR-4), `REGULATIONS_MAX_BYTES` (10485760), `EMBLEM_MAX_BYTES` (5242880),
`RATE_LIMIT_REQUESTS` (20), `RATE_LIMIT_WINDOW` (1m),
`RATE_LIMIT_TRUST_PROXY` (false). Списки допустимых типов (FR-32) —
константы политики в модуле `tournament`, конфигурацией не переопределяются:
их расширение требует поддержки в `Sniff` и осмысленного решения о
безопасности отдачи. `docker-compose` получает том под `FILE_STORAGE_DIR`
(FR-37).

### Межмодульные зависимости

- `application` → `Notifier` (порт) ← адаптер platform → `tournament`
  (глобальный переключатель) + `auth` (получатели).
- `stage` → `Notifier` (порт) ← адаптер platform → `tournament` + `auth` +
  `fighter` (связанная учётка).
- Прямого доступа к чужим схемам нет: всё через сервисы модулей (ADR 0002),
  тем же приёмом, что `DisplayNameProvider`.

## Web (FSD + BFF)

> См. ADR 0005 (UI) и ADR 0006 (state), `web/AGENTS.md`.

### BFF (Route Handlers, Node runtime)

- `app/api/auth/email/verify/route.ts` (POST, публичный),
  `.../email/resend/route.ts`, `.../email/change/route.ts` (POST — запрос,
  DELETE — отмена), `.../email/change/confirm/route.ts` (POST, публичный).
- `app/api/auth/sessions/route.ts` (GET — список, DELETE — все, кроме
  текущей), `app/api/auth/sessions/[id]/route.ts` (DELETE — одна).
- `app/api/auth/logout/route.ts` — существующий; теперь до стирания cookie
  вызывает `Logout` с refresh-токеном (FR-13).
- `app/api/auth/notifications/route.ts` (PUT).
- `app/api/tournament/files/[kind]/route.ts` — POST (multipart → `bytes` в
  Connect), DELETE; `kind` — `regulations` | `emblem`, маппится в
  `TournamentFileKind`.
- `app/api/files/[id]/route.ts` — GET, стримит с Go-сервера (браузер в
  Go-сервер не ходит), прокидывая `Content-Type` и `nosniff`.
- Все route handlers прокидывают адрес клиента в `X-Forwarded-For`
  (NFR-6).

### Слои

- `entities/user` — типы `User` += `emailVerified`, `pendingEmail`,
  `notifications`; новый тип `Session`.
- `features/profile` — `api/` (`use-verify-email`, `use-resend-verification`,
  `use-request-email-change`, `use-cancel-email-change`,
  `use-sessions`, `use-revoke-session`, `use-revoke-other-sessions`,
  `use-update-notifications`), `ui/`:
  - `email-status-card.tsx` — бейдж «подтверждён / не подтверждён / ожидает
    подтверждения: …» + «отправить снова» + «сменить адрес» (FR-4, FR-6).
  - `change-email-dialog.tsx` — новый адрес + текущий пароль.
  - `sessions-card.tsx` — список сессий, «текущая», «завершить», «выйти со
    всех устройств» (FR-11, FR-12).
  - `notifications-card.tsx` — переключатели; заблокированы с объяснением,
    если адрес не подтверждён (FR-21) или вид выключен организатором
    (FR-22).
- `app/verify-email/page.tsx` и `app/email-change/confirm/page.tsx` —
  публичные страницы перехода по ссылке (сестра `/reset-password` из 0038):
  состояния «подтверждаем / готово / ссылка недействительна».
- `features/tournament-settings` — общий `file-or-link-field.tsx`
  (переключение «ссылка ⇄ файл», выбор файла, отказы по типу/размеру
  FR-32, удаление, показ имени и размера), применённый дважды: к
  регламенту и к эмблеме (последний с превью — заменяет нынешний
  `EmblemPreview` по URL в `tournament-settings-form.tsx`);
  `notifications-section.tsx` — глобальные переключатели (FR-19).
- `entities/tournament` — `lib/types.ts` и `lib/draft.ts` получают поля
  файлов; `ui/tournament-hero.tsx` рисует эмблему из файла, если он задан,
  иначе из `emblemUrl` (единственное место показа эмблемы сегодня).
- `widgets/home/tournament-strip.tsx` и страница `/about` — ссылка
  «Регламент» ведёт на файл (`/api/files/…`), если он задан, иначе на
  `regulations_url` (0039 уже вывела регламент на афишу).
- Резолв «файл или ссылка» — одна общая функция в
  `entities/tournament/lib` (`regulationsHref`, `emblemSrc`), а не
  повторённое условие на каждом экране.
- Server components vs client: публичные страницы перехода по ссылке —
  клиентские (читают токен из query и дергают BFF); карточки кабинета —
  клиентские (мутации); афиша и `/about` остаются серверными.
- State: server-state → TanStack Query (`sessions`, `me`); UI-state
  (открытые диалоги) → локальный `useState`.

## События

> Placeholder. Event-Driven Design для межмодульных событий ещё не введён.

- Издаёт: нет новых доменных событий. Уведомления — **побочный эффект**
  синхронного юзкейса через явный порт, а не публикация в шину. Это ровно
  тот случай, который ADR 0011 (п. 5) предусмотрел: «кроссдоменная доставка
  идёт через API модуля, конкретный механизм выбирает фича».
- Потребляет: нет. Журнал заявки (`application`, ADR 0011) остаётся
  внутренним журналом модуля; нотификатор вызывается сервисом, а не
  подписан на журнал.
- Если позже понадобится доставка «не в момент запроса» (ретраи, outbox) —
  это меняет реализацию `pkg/notify`, не контракт порта.

## Тестирование

> См. ADR 0003 (стратегия) и ADR 0009 (TDD-цикл).

- **Юнит (`pkg/`)**: `notify.Dispatcher` (дренаж при `Close`, дроп при
  полном буфере, ошибка `Sender` не паникует); `filestore/local`
  (put→open→delete, отсутствие каталога, чужой id); `connectutil.RateLimit`
  (порог, окно, разные IP независимы, незащищённые процедуры не
  ограничиваются); `jwt` (`sid` в refresh, отсутствует в access).
- **Юнит `service/` с fake-репо**: `auth` — подтверждение адреса
  (happy/просрочен/погашен/повторный переход), троттлинг повтора, смена
  адреса (пароль неверен, адрес занят при запросе и при подтверждении,
  отмена), сессии (создание при входе, отказ продления отозванной,
  `RevokeOtherSessions` не гасит текущую, смена пароля гасит остальные,
  сброс гасит все), `UpdateNotificationSettings` на неподтверждённом
  адресе; `tournament` — загрузка обоих видов файлов (свой порог и свой
  белый список у каждого, SVG и подменённый `content_type` отвергнуты,
  замена освобождает прежний объект, ссылка вытесняет файл и наоборот,
  правка одного вида не трогает другой), `NotificationsFor`;
  `application`/`stage`
  — вызов `Notifier` ровно на нужных переходах и **отсутствие** вызова на
  собственных действиях заявителя, а также успех операции при
  паникующем/медленном нотификаторе (FR-27, FR-28).
- **E2E ручек (`api/` через httptest + Connect, fake-репо)**: новые RPC
  `auth` и `tournament`, маппинг доменных ошибок в коды; отдача файла
  обычным HTTP-хендлером (200/404/`Content-Type`).
- **Интеграционные с БД (testcontainers, ADR 0010)**: миграции
  `auth/00003` и `tournament/00005` применяются и откатываются; grandfather
  проставил `email_verified_at` существующим строкам; CHECK
  `chk_regulations_one_of` и `chk_emblem_one_of` реально ловят «и ссылка, и
  файл»; `chk_email_tokens_new_email` ловит обе несимметричные комбинации;
  отзыв сессии виден следующему `Refresh`.
- **Web (Vitest)**: route handlers (маппинг `connect.Code`→HTTP, multipart
  → `bytes`, маппинг `kind`, проброс `X-Forwarded-For`, стриминг файла с
  заголовками); карточки кабинета (состояния бейджа адреса, блокировка
  переключателей с объяснением, список сессий с отметкой текущей);
  `file-or-link-field` на обоих полях (переключение ссылка⇄файл, отказы по
  типу/размеру, превью эмблемы); `tournament-hero` и афиша — обе ветки
  резолва (файл имеет приоритет; при пустом файле рисуется ссылка).
- **Ручная проверка в докеризованном стеке** (`docker compose up --build`):
  том хранилища переживает пересборку (FR-37), письма без SMTP уходят в
  журнал (NFR-3).

## Риски и открытые вопросы

- **`sid` в refresh-токене ломает уже выданные токены.** Токены без `sid`
  после выката не пройдут проверку по реестру. Решение: `Refresh` с
  токеном без `sid` трактуется как невалидный (пользователь входит заново)
  — единичное неудобство в момент выката, зафиксировать в ADR 0018.
  Альтернатива «grandfather по отсутствию клейма» оставила бы дыру в
  отзыве.
- **Инвариант «файл ⊕ ссылка» на двух уровнях и на двух полях.** CHECK в
  БД защищает от рассинхрона, но выдаёт техническую ошибку; поэтому
  основная проверка и внятное сообщение — в `service`, CHECK — страховка.
  Риск: забыть очистить `regulations_file_id`/`emblem_file_id` при задании
  соответствующей ссылки в `UpdateActiveTournament` → ошибка констрейнта
  вместо понятного поведения. Закрывается тестами на оба направления
  вытеснения **для каждого из двух полей** — с появлением эмблемы число
  веток удвоилось, и это самое вероятное место, где второй файл забудут.
- **Эмблема отдаётся с нашего домена.** До этой спеки картинка приходила с
  чужого хостинга, и браузер трактовал её как чужое содержимое; теперь она
  живёт на нашем origin. Отсюда белый список по бинарной сигнатуре
  (`Sniff`), отказ от SVG (FR-33) и `X-Content-Type-Options: nosniff` при
  отдаче. Если позже понадобится принимать SVG или произвольные типы —
  это отдельный домен для пользовательского содержимого, а не ослабление
  проверок здесь.
- **Осиротевшие файлы при сбое между `filestore.Put` и `UPDATE`.**
  Транзакции поверх диска нет. Порядок операций: сначала `Put` нового,
  затем `UPDATE`, затем `Delete` прежнего — при сбое остаётся лишний файл,
  но никогда не теряется тот, на который ссылается БД. Уборку осиротевших
  объектов эта спека не автоматизирует (зафиксировать в ADR 0019).
- **Диспетчер уведомлений теряет письма при остановке процесса.** Ретраев
  и persistent-очереди нет (FR-27 это допускает). Если доставка станет
  критичной — outbox поверх той же таблицы событий заявки; смена
  реализации не трогает порт.
- **Рассылка на постановке крупного пула.** Пул из 12 бойцов = до 12 писем
  за одну операцию; буфер диспетчера подобрать с запасом, порог дропа —
  в журнал. Прогнозные рассылки `0043` пойдут через тот же диспетчер —
  заложить это в ADR 0018/0019 не нужно, но помнить при выборе размера
  буфера.
- **Определение адреса клиента.** BFF всегда один и тот же хост, поэтому
  без проброса `X-Forwarded-For` лимитер защищал бы «всех сразу». Риск
  обратный: доверие заголовку без доверенного прокси = обход лимита.
  Поэтому `RATE_LIMIT_TRUST_PROXY` по умолчанию `false`, а в
  docker-compose (где BFF — единственный источник) включается явно.
- **Две новые ADR — часть работы, а не сюрприз** (ADR 0017,
  «Последствия»): ADR 0018 и ADR 0019 пишутся в первой волне задач, до
  кода соответствующих блоков.
