# Tasks: Учётка, почта и файлы

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-28
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Пять блоков спеки лежат в непересекающихся файлах, поэтому серверная работа
идёт пятью треками одной волны. Волна 2 — то, что требует файлов нескольких
треков (composition root, интеграционные тесты) плюс два web-трека.

| Волна | Трек | Задачи   | Файлы (не пересекаются внутри волны)                                     | Зависит от |
| ----- | ---- | -------- | ------------------------------------------------------------------------ | ---------- |
| 0     | —    | T1–T3    | `proto/`, `docs/adr/0018`, `docs/adr/0019`                                | —          |
| 1     | A    | T4–T11   | `server/pkg/jwt/`, `server/modules/auth/**`                               | волна 0    |
| 1     | B    | T12–T17  | `server/pkg/filestore/`, `server/modules/tournament/**`                   | волна 0    |
| 1     | C    | T18–T21  | `server/pkg/notify/`, `server/pkg/connectutil/ratelimit*.go`, `pkg/config` | волна 0    |
| 1     | D    | T22–T23  | `server/modules/application/{domain,service,testutil}/**`                 | волна 0    |
| 1     | E    | T24–T25  | `server/modules/stage/{domain,service}/**`                                | волна 0    |
| 2     | join | T26–T29  | `server/internal/platform/**`, `internal/platform/integration/**`, `.env.example`, compose | треки A–E смержены |
| 2     | F    | T30–T35  | `web/src/app/api/auth/**`, `web/src/app/{verify-email,email-change}/**`, `web/src/features/profile/**`, `web/src/entities/user/**` | волна 0 |
| 2     | G    | T36–T41  | `web/src/app/api/{tournament/files,files}/**`, `web/src/entities/tournament/**`, `web/src/features/tournament-settings/**`, `web/src/widgets/home/**`, `web/src/app/about/**` | волна 0 |
| 3     | join | T42–T47  | проверка, докеризованный стек, индекс спек                                | всё смержено |

## Волна 0 — контракты и ADR

- [x] T1. `proto/hema/v1/{common,auth,tournament}.proto` — `NotificationSettings`,
      `Session`, поля `User`/`Tournament`, RPC подтверждения и смены адреса,
      сессий, настроек уведомлений, `TournamentFile`/`TournamentFileKind` и
      `UploadTournamentFile`/`DeleteTournamentFile`;
      `make generate`. _(контракты — не TDD-шаг, но идут первыми.)_
- [x] T2. `docs/adr/0018-session-persistence.md` — персистентность
      refresh-сессий: клейм `sid`, что отзывается мгновенно (продление) и
      что доживает свой TTL (access, FR-16), почему access остаётся
      stateless, судьба уже выданных токенов без `sid`, отказ от хранения
      IP/User-Agent (решение 2 спеки). Разворот решения 6 спеки 0037.
- [x] T3. `docs/adr/0019-file-storage.md` — порт `filestore` + адаптер
      «локальный том» (решение 3 спеки): лимиты типа/размера, отдача файла,
      порядок put→update→delete и осиротевшие объекты, почему не S3 сейчас
      и что меняется, когда понадобится.

## Волна 1, трек A — модуль `auth`

- [ ] T4. **jwt (red→green)** — `pkg/jwt/jwt_test.go`: `sid` попадает в
      refresh и отсутствует в access → затем `Claims.SessionID` и
      `Issue(userID, role, sessionID)`; обновить вызовы в `auth/service`.
- [ ] T5. **domain** — `modules/auth/domain/domain.go`: `EmailVerifiedAt`,
      `PendingEmail`, `NotificationSettings` у `User`; типы `EmailToken`,
      `Session`; ошибки `ErrInvalidEmailToken`, `ErrEmailTaken`,
      `ErrEmailNotVerified`, `ErrSessionNotFound`; расширение портов
      `Repository` и `Mailer`.
- [ ] T6. **testutil** — `modules/auth/testutil/fake_repo.go` и
      `fake_mailer.go`: новые методы порта (`var _ domain.Repository =
      (*FakeRepo)(nil)` держит компиляцию честной).
- [ ] T7. **service: подтверждение адреса (red→green)** —
      `service/email_verification_test.go`: письмо уходит при регистрации;
      подтверждение по валидному токену; просроченный/погашенный/чужой →
      `ErrInvalidEmailToken`; повторная отправка чаще 1/мин →
      `ErrThrottled`; новый запрос гасит прежний токен → затем
      `service/email_verification.go`.
- [ ] T8. **service: смена адреса (red→green)** —
      `service/email_change_test.go`: неверный текущий пароль → отказ;
      занятый адрес при запросе и при подтверждении (FR-8);
      до подтверждения адрес учётки не меняется и `PendingEmail` виден;
      подтверждение меняет адрес и сбрасывает признак подтверждённости;
      отмена очищает запрос; письмо-предупреждение уходит на прежний адрес
      → затем `service/email_change.go`.
- [ ] T9. **service: сессии (red→green)** — `service/sessions_test.go`:
      вход/регистрация создают сессию; `Refresh` отклоняет отозванную и
      несуществующую и обновляет `last_seen_at`; `RevokeOtherSessions` не
      гасит текущую; `Logout` гасит текущую; смена пароля гасит все, кроме
      текущей; сброс пароля гасит все; чужая сессия не отзывается →
      затем `service/sessions.go` (+ правки `service.go`).
- [ ] T10. **service: настройки уведомлений (red→green)** —
      `service/notifications_test.go`: включение при неподтверждённом
      адресе → `ErrEmailNotVerified`; `Recipients` возвращает только тех,
      у кого вид включён лично **и** адрес подтверждён → затем
      `service/notifications.go`.
- [ ] T11. **repo + migrations + api (red→green)** —
      `repo/queries/{email_tokens,sessions,users}.sql`, `make sqlc`,
      `repo/repo.go`; `migrations/00003_email_sessions_notifications.sql`
      (DDL — в `plan.md`, включая grandfather-`UPDATE`);
      `api/handler_test.go` (httptest + Connect, fake-репо): счастливый
      путь новых RPC и маппинг доменных ошибок в `connect.Code` → затем
      `api/handler.go`, `mailer/mailer.go` (три новых письма) и
      `module.go`/`Deps` (TTL токенов).

## Волна 1, трек B — файловое хранилище и модуль `tournament`

- [ ] T12. **filestore (red→green)** — `pkg/filestore/filestore_test.go` и
      `local/local_test.go`: put→open→delete, чужой/несуществующий id,
      отсутствующий каталог, `nil`-Store = «хранилище не настроено»;
      `Sniff` опознаёт PDF/PNG/JPEG/WebP по сигнатуре и отвергает SVG и
      текстовый мусор с любым заявленным `content_type` (FR-33, NFR-9) →
      затем порт `Store`, `Sniff` и адаптер `local`.
- [ ] T13. **domain** — `modules/tournament/domain/domain.go`:
      `StoredFile{ID,Name,Size}` у полей `RegulationsFile`/`EmblemFile`,
      `FileKind` и `FilePolicy` (свой белый список и порог на вид),
      `Notifications`, ошибки `ErrFileTooLarge`, `ErrUnsupportedFileType`,
      `ErrStorageUnavailable`; порт файлового хранилища в `Deps`.
- [ ] T14. **service: загрузка файлов (red→green)** —
      `service/files_test.go`, **по обоим видам**: не-PDF в регламент,
      SVG и не-картинка в эмблему, превышение своего порога → отказ,
      прежний файл цел; заявленный `content_type` не влияет на решение
      (NFR-9); загрузка вытесняет ссылку, а задание ссылки вытесняет файл
      (оба направления × два поля, FR-34); замена и удаление освобождают
      прежний объект (FR-36); правка одного вида не трогает другой;
      отсутствующее хранилище → `ErrStorageUnavailable` → затем
      `service/files.go`.
- [ ] T15. **service: глобальные переключатели (red→green)** —
      `service/notifications_test.go`: дефолт — оба выключены;
      `UpdateActiveTournament` их правит; `NotificationsFor` отдаёт
      текущее значение → затем код.
- [ ] T16. **migrations** —
      `migrations/00005_tournament_files_and_notifications.sql` (DDL — в
      `plan.md`: по три колонки на каждый файл, глобальные флаги,
      `chk_regulations_one_of`/`chk_emblem_one_of` и
      `chk_*_file_fields`); `make sqlc` после правки запросов.
- [ ] T17. **api (red→green)** — `api/handler_test.go`:
      `UploadTournamentFile`/`DeleteTournamentFile` для обоих видов,
      неизвестный `kind` → `InvalidArgument`, маппинг новых ошибок в
      `connect.Code` → затем `api/handler.go`.

## Волна 1, трек C — уведомления и ограничение частоты

- [ ] T18. **notify (red→green)** — `pkg/notify/notify_test.go`: `Close`
      дренирует очередь; полный буфер не блокирует отправителя и пишет в
      журнал; ошибка `Sender` не роняет воркер → затем
      `pkg/notify/dispatcher.go`.
- [ ] T19. **шаблоны писем (red→green)** — `pkg/notify/templates_test.go`:
      письмо о смене состояния заявки и письмо о постановке пула содержат
      турнир, номинацию, суть события и ссылку (FR-26), RU plain text →
      затем `pkg/notify/templates.go`.
- [ ] T20. **rate limit (red→green)** —
      `pkg/connectutil/ratelimit_test.go`: порог за окно, независимость
      разных адресов, незащищённые процедуры не ограничиваются, ответ —
      `CodeResourceExhausted` с единым сообщением, чистка протухших
      корзин → затем `pkg/connectutil/ratelimit.go`.
- [ ] T21. **config** — `pkg/config/config.go` (+тест): `EMAIL_TOKEN_TTL`,
      `FILE_STORAGE_DIR`, `REGULATIONS_MAX_BYTES`, `RATE_LIMIT_REQUESTS`,
      `RATE_LIMIT_WINDOW`, `RATE_LIMIT_TRUST_PROXY` с дефолтами из
      `plan.md`.

## Волна 1, трек D — точка уведомления в `application`

- [ ] T22. **domain + testutil** — порт
      `Notifier.ApplicationStateChanged(ctx, ApplicationNotice)` (без
      возврата ошибки) и фейк в `testutil`.
- [ ] T23. **service (red→green)** — тесты: `ConfirmPayment`,
      `RegisterFighter`, `EditApplication` зовут нотификатор ровно один
      раз; `DeclarePayment` и `WithdrawApplication` — не зовут (FR-23);
      `nil`-нотификатор не роняет юзкейс; паника/задержка внутри
      нотификатора не отменяет операцию (FR-27) → затем вызовы в
      `service/service.go`.

## Волна 1, трек E — точка уведомления в `stage`

- [ ] T24. **domain** — порт `Notifier.PoolSeated(ctx, PoolSeatedNotice)`
      с составом бойцов, номинацией, пулом и площадкой.
- [ ] T25. **service (red→green)** — тесты: `SeatPoolOnArena` зовёт
      нотификатор после успешной посадки и **не** зовёт при отказах
      (`ErrArenaBusy`, `ErrNotReady`, `ErrAlreadySeated`); повторная
      посадка после снятия зовёт снова (FR-29); `nil`-нотификатор — no-op
      → затем вызов в `service/service.go`.

## Волна 2, join — composition root и интеграция

- [x] T26. **адаптеры уведомлений** —
      `internal/platform/notification_adapters.go` (+тест): глобальный
      переключатель выключен → писем нет; включён, но лично не подписан
      или адрес не подтверждён → писем нет; все условия выполнены →
      письмо в диспетчер (FR-21); `NewFighterAccountProvider` — резолв
      связанной учётки бойца, боец без учётки пропускается (FR-25).
- [x] T27. **отдача файла** — HTTP-хендлер `GET /files/…` на общем
      `ServeMux` (+тест): 200 на PDF и на картинку, 404 на
      неизвестный id, публичный доступ без токена, `nosniff` и тип из
      метаданных объекта (FR-35, NFR-9).
- [x] T28. **wiring** — `internal/platform/platform.go`: `filestore`,
      `notify.Dispatcher` (дренаж в `App.Close`), интерцептор
      `RateLimit`, новые `Deps` модулей; `.env.example` и
      `docker-compose` (том под `FILE_STORAGE_DIR`).
- [x] T29. **интеграционные с БД (testcontainers, ADR 0010)** — миграции
      `auth/00003` и `tournament/00005` вверх и вниз; grandfather проставил
      `email_verified_at`; `chk_regulations_one_of` и
      `chk_email_tokens_new_email` реально ловят нарушения; отзыв сессии
      виден следующему `Refresh`.

## Волна 2, трек F — web: учётка

- [x] T30. **BFF: адрес (red→green)** — `app/api/auth/email/**/route.ts` +
      тесты: подтверждение, повторная отправка, запрос/подтверждение/отмена
      смены; маппинг `connect.Code`→HTTP; проброс `X-Forwarded-For`.
- [x] T31. **BFF: сессии и выход (red→green)** —
      `app/api/auth/sessions/**` и правка `app/api/auth/logout/route.ts`
      (серверный `Logout` до стирания cookie, FR-13) + тесты.
- [x] T32. **BFF: настройки уведомлений (red→green)** —
      `app/api/auth/notifications/route.ts` + тест.
- [x] T33. **entities/features** — `entities/user` (типы `Session`, новые
      поля `User`), `features/profile/api/*` (хуки RQ) + тесты фетчеров.
- [x] T34. **ui кабинета (red→green)** — `email-status-card`,
      `change-email-dialog`, `sessions-card`, `notifications-card`:
      состояния бейджа адреса, «ожидает подтверждения», отметка текущей
      сессии, блокировка переключателей с объяснением при
      неподтверждённом адресе (FR-21) и при глобальном запрете (FR-22).
- [x] T35. **публичные страницы перехода** — `app/verify-email/page.tsx` и
      `app/email-change/confirm/page.tsx` (+тесты): «подтверждаем /
      готово / ссылка недействительна» с предложением запросить новую.

## Волна 2, трек G — web: файлы турнира и глобальные уведомления

- [x] T36. **BFF: загрузка (red→green)** —
      `app/api/tournament/files/[kind]/route.ts` (POST multipart→`bytes`,
      DELETE) + тесты: маппинг `kind`, неизвестный `kind` → 400, отказ по
      типу и размеру до похода на сервер (свой порог у каждого вида),
      маппинг ошибок.
- [x] T37. **BFF: отдача (red→green)** — `app/api/files/[id]/route.ts` +
      тест: стриминг с Go-сервера, проброс `Content-Type` и `nosniff`,
      404.
- [x] T38. **entities/tournament** — типы и черновик (`lib/types.ts`,
      `lib/draft.ts`) получают поля файлов; резолв `regulationsHref`/
      `emblemSrc` (файл приоритетнее ссылки) + юнит-тесты обеих веток.
- [x] T39. **ui профиля турнира (red→green)** — общий
      `file-or-link-field.tsx`, применённый к регламенту и к эмблеме:
      переключение «ссылка ⇄ файл», загрузка, отказы по типу/размеру,
      удаление, показ имени и размера, превью эмблемы (заменяет нынешний
      `EmblemPreview` по URL).
- [x] T40. **ui глобальных уведомлений (red→green)** —
      `notifications-section.tsx` в профиле турнира: два переключателя,
      выключены по умолчанию, объяснение эффекта (FR-19, FR-22).
- [x] T41. **афиша, `/about` и `tournament-hero`** — «Регламент» ведёт на
      файл, если он задан, иначе на ссылку; эмблема рисуется из файла,
      иначе из `emblemUrl` (+тесты на обе ветки).

## Волна 3 — проверка

- [ ] T42. `make test-all` зелёный.
- [ ] T43. `pnpm exec tsc --noEmit` (менялись protobuf-типы и моки).
- [ ] T44. `go build ./...` + `pnpm build`.
- [ ] T45. `docker compose up --build`: миграции обоих модулей проходят в
      полном стеке, том хранилища переживает пересборку (FR-37) — оба
      файла на месте после `--build`, письма без SMTP уходят в журнал
      (NFR-3).
- [ ] T46. Ручная проверка сквозных сценариев: регистрация → письмо →
      подтверждение; смена адреса с предупреждением на прежний; вход с
      трёх сессий → «выйти со всех устройств»; включение уведомлений при
      обоих переключателях и проверка AC-9/AC-10; загрузка регламента и
      эмблемы файлами и возврат к ссылкам (AC-15 – AC-18).
- [ ] T47. Обновить статусы `spec.md`/`plan.md`/`tasks.md` и строку `0042`
      в `docs/specs/README.md`; убедиться, что ADR 0018 и 0019 лежат в
      `docs/adr/` со статусом «принято» и на них ссылаются `plan.md` и
      затронутые места кода.
