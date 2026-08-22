# Tasks: Расширение API учётки и профиля турнира

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-22
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

## Треки и параллельность

Три дизъюнктных куска после контрактов: модуль `auth` (+ `pkg/mail`), модуль
`tournament`, web-слой (BFF/типы/форма — тесты на моках Connect-клиента, от
готовности сервера не зависят). Wiring (`internal/platform`, `pkg/config`,
env/compose) трогает файлы, общие для A и B, — join-волна.

| Волна | Трек | Задачи   | Файлы (не пересекаются внутри волны)                                   | Зависит от           |
| ----- | ---- | -------- | ---------------------------------------------------------------------- | -------------------- |
| 0     | —    | T1       | `proto/hema/v1/{common,auth,tournament}.proto`                          | —                    |
| 1     | A    | T2–T9    | `server/pkg/mail/**`, `server/modules/auth/**`                          | волна 0              |
| 1     | B    | T10–T13  | `server/modules/tournament/**`                                          | волна 0              |
| 1     | C    | T14–T17  | `web/src/{app/api/auth,entities,lib/grpc,features/tournament-settings}` | волна 0              |
| 2     | join | T18–T24  | `server/pkg/config`, `server/internal/platform`, `server/pkg/connectutil`, `.env.example`, `docker-compose.yml`, интеграционные тесты | треки A, B, C смержены |

## Контракты

- [ ] T1. `proto/hema/v1/common.proto` (`User.club`),
      `proto/hema/v1/auth.proto` (4 RPC + сообщения),
      `proto/hema/v1/tournament.proto` (6 полей в `Tournament` и в
      `UpdateActiveTournamentRequest`); `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Трек A — модуль `auth` и почта

- [ ] T2. **pkg/mail (red→green)** — `server/pkg/mail/mail_test.go`: лог-адаптер
      печатает адрес/тему/тело; SMTP-адаптер собирает корректные заголовки и
      UTF-8-тему без сети → затем `mail.go` (порт `Sender`, `Message`),
      `logger.go`, `smtp.go`.
- [ ] T3. **domain** — `modules/auth/domain/domain.go`: `User.Club`,
      `User.PasswordChangedAt`, `ResetToken`, порт `Mailer`, расширение
      `Repository` (7 методов), ошибки `ErrInvalidResetToken`,
      `ErrWeakPassword`, `ErrInvalidProfile`.
- [ ] T4. **testutil** — `modules/auth/testutil/fake_repo.go`: новые методы
      порта in-memory + `FakeMailer` (запоминает последнее письмо);
      `var _ domain.Repository = (*FakeRepo)(nil)`.
- [ ] T5. **service: политика пароля (red→green)** —
      `service/password_policy_test.go` (граница 7/8 символов) → затем
      `password_policy.go` и подключение в `Register`/`createUser`/
      `CreateAdmin` (AC-10, FR-11).
- [ ] T6. **service: запрос сброса (red→green)** —
      `service/password_reset_test.go`: несуществующий email → успех без
      письма (AC-2); существующий → письмо со ссылкой, содержащей выданный
      токен (AC-1); повтор < 1 мин → второго письма нет (AC-7); повтор > 1 мин
      гасит прежний токен (AC-6); ошибка `Mailer` не даёт ошибки RPC (NFR-2);
      в репозитории лежит только хеш токена (NFR-1) → затем
      `service/password_reset.go` (`RequestPasswordReset`) и новые параметры
      конструктора `New` (mailer, publicAppURL, resetTTL, now).
- [ ] T7. **service: установка пароля по ссылке (red→green)** — тесты: успех
      и вход новым паролем (AC-3), повторное использование (AC-4),
      просроченный токен (AC-5), короткий пароль (AC-10), отсутствие пары
      токенов в ответе (FR-7) → затем `ResetPassword`.
- [ ] T8. **service: смена пароля, профиль, обрыв сессий (red→green)** —
      тесты: смена пароля с верным/неверным текущим (AC-8/9) и выдача новой
      пары; `Refresh` со старым `iat` после смены → отказ, с новым → успех
      (AC-11); правка имени/клуба (AC-12), пустое имя (AC-13) → затем
      `ChangePassword`, `UpdateProfile`, проверка `password_changed_at` в
      `Refresh`.
- [ ] T9. **repo + migrations + api** —
      `repo/queries/users.sql` (новые колонки во всех SELECT'ах + 7 новых
      запросов), `make sqlc`, `repo/repo.go`;
      `migrations/00002_password_reset.sql` (DDL — см. `plan.md`);
      `mailer/mailer.go` (текст письма на русском, срок жизни ссылки, NFR-4);
      `api/handler_test.go` (httptest + Connect, fake-репо): 4 RPC —
      счастливый путь и маппинг ошибок в `connect.Code`, приватность
      `ChangePassword`/`UpdateProfile` без токена → затем `api/handler.go`.

## Трек B — модуль `tournament`

- [ ] T10. **domain** — `modules/tournament/domain/domain.go`: 6 новых полей
      в `Tournament` и в структуре обновления (`EntryFeeMinor *int64`).
- [ ] T11. **service (red→green)** — `service/service_test.go`: регламент —
      только `http(s)` (AC-15), взнос «не задан» ≠ 0 (AC-16), отрицательный
      взнос — отказ, сумма без валюты получает `RUB`, «не задан» затирает
      валюту → затем валидация в `UpdateActive`.
- [ ] T12. **repo + migrations** — `repo/queries/tournament.sql` (новые
      колонки в SELECT/UPDATE), `make sqlc`, `repo/repo.go`;
      `migrations/00003_profile_extras.sql` (DDL — см. `plan.md`).
- [ ] T13. **api (red→green)** — `api/handler_test.go`: новые поля проходят
      туда-обратно, `presence` взноса не теряется → затем `api/handler.go`
      (маппинг proto↔domain).

## Трек C — web (BFF, типы, форма турнира)

- [ ] T14. **BFF: сброс пароля (red→green)** —
      `app/api/auth/password-reset/route.test.ts` и
      `password-reset/confirm/route.test.ts` (mock Connect-клиента): запрос
      всегда 200 (FR-2); `InvalidArgument` → 400 «ссылка недействительна или
      устарела» → затем оба `route.ts`.
- [ ] T15. **BFF: пароль и профиль (red→green)** —
      `app/api/auth/password/route.test.ts`: без cookie — 401, при успехе
      выставляются новые cookie; `app/api/auth/profile/route.test.ts`: PATCH
      возвращает `{user}`, пустое имя → 400 → затем оба `route.ts`.
- [ ] T16. **типы и сериализация (red→green)** — тесты `userToJson`
      (`club` не теряется на proto3-дефолте) и `tournamentToJson` (6 полей,
      `entryFeeMinor` — `number | null` из строки int64) → затем
      `entities/user/lib/types.ts`, `entities/tournament` DTO,
      `lib/grpc/serialize.ts`.
- [ ] T17. **форма профиля турнира (red→green)** —
      `features/tournament-settings/ui/tournament-settings-form.test.tsx`:
      новые поля отображаются, отправляются и **не обнуляются** при
      сохранении (семантика полной замены, FR-22) → затем поля в форме,
      схема валидации и `api/requests.ts`.

## Join-волна — конфигурация, wiring, проверка

- [ ] T18. **публичность RPC** — `pkg/connectutil/auth_interceptor.go`:
      `RequestPasswordReset` и `ResetPassword` в `publicProcedures` + тест
      на прохождение без `Authorization`.
- [ ] T19. **config (red→green)** — `pkg/config/config_test.go`: дефолты
      `PUBLIC_APP_URL`, `PASSWORD_RESET_TTL=30m`, пустой `SMTP_HOST` —
      легальная конфигурация → затем `pkg/config/config.go`.
- [ ] T20. **wiring** — `internal/platform/platform.go`: выбор адаптера почты
      (`SMTP_HOST` пуст → лог-адаптер с предупреждением при старте, NFR-3),
      передача `Mailer`/`PublicAppURL`/`PasswordResetTTL` в `auth.Deps` и
      `auth.Register`.
- [ ] T21. **окружение** — `.env.example` и `docker-compose.yml` (сервис
      `server`): `SMTP_HOST/PORT/USERNAME/PASSWORD/FROM`, `PUBLIC_APP_URL`,
      `PASSWORD_RESET_TTL` — плейсхолдеры, без секретов.
- [ ] T22. **интеграционные с БД (testcontainers)** — миграции `auth 00002` и
      `tournament 00003` применяются и откатываются; уникальность
      `token_hash`; `CHECK chk_entry_fee` отклоняет «сумма без валюты»;
      round-trip профиля турнира со всеми новыми полями.
- [ ] T23. **сквозной сценарий сброса** — интеграционный тест на лог-адаптере:
      запрос → токен из письма → установка пароля → вход новым паролем →
      старый refresh отклонён (AC-3, AC-11, AC-17).
- [ ] T24. **проверка** — `make test-all` зелёный;
      `pnpm exec tsc --noEmit`; `go build ./...` + `pnpm build`;
      `docker compose up --build` (миграции обоих модулей в полном стеке);
      обновить статусы `spec.md`/`plan.md`/`tasks.md` и строку 0037 в
      `docs/specs/README.md`.
