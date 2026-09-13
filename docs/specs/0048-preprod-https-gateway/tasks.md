# Tasks: HTTPS-шлюз для preprod (TLS перед веб-слоем)

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Фича инфраструктурная (docker-compose) — код server/web не меняется, поэтому
> цикла red→green по слоям здесь нет; порядок задач — по зависимости
> конфигурации, проверка — смоуком, а не unit-тестами.

- Статус: draft
- Дата: 2026-09-13
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз — каждая следующая опирается на файлы,
созданные предыдущей.

## Треки и параллельность

Не применимо — все задачи трогают общий набор инфраструктурных файлов
(`docker-compose.yml`, `Makefile`, `.env.example`), выполняются
последовательно одним треком.

## Инфраструктура

- [ ] T1. `deploy/Caddyfile` — блок `{$PUBLIC_DOMAIN}` с `reverse_proxy
      web:3000` и глобальной опцией `email {$ACME_EMAIL}` (см. `plan.md`).
- [ ] T2. `docker-compose.yml`:
      - убрать `ports:` у `server` и `web`;
      - добавить сервис `proxy` (`caddy:2-alpine`, `profiles: ["prod"]`,
        порты `80:80`/`443:443`, тома `caddy_data`/`caddy_config` +
        смонтированный `deploy/Caddyfile`, `environment: PUBLIC_DOMAIN,
        ACME_EMAIL`, `depends_on: web`);
      - объявить именованные тома `caddy_data`, `caddy_config`.
- [ ] T3. `docker-compose.override.yml` (новый) — возвращает `ports:
      8080:8080` серверу и `${WEB_PORT:-3000}:3000` веб-сервису, чтобы
      обычный `docker compose up` (без `-f`) вёл себя как до фичи.
- [ ] T4. `Makefile` — новый таргет `deploy` (`docker compose -f
      docker-compose.yml --profile prod up -d --build`, с `codegen`
      перед запуском). Имя `prod` не трогаем — таргет уже занят локальным
      докер-прогоном (Definition of Done, корневой `AGENTS.md`); имя
      compose-профиля (`prod`) и имя make-таргета (`deploy`) намеренно не
      совпадают, см. `plan.md`.
- [ ] T5. `.env.example` — секция `PUBLIC_DOMAIN`/`ACME_EMAIL` (см.
      `plan.md`, «Инфраструктура»).
- [ ] T6. `README.md` (корень) — короткая процедура разворачивания рядом
      с «Быстрый старт»: указать DNS → заполнить `.env` → `make deploy`
      (FR-5).

## Проверка

- [ ] T7. `docker compose -f docker-compose.yml -f docker-compose.override.yml
      config` и `docker compose -f docker-compose.yml --profile prod
      config` — оба без ошибок.
- [ ] T8. `make prod` локально — стек поднимается, `server`/`web` отвечают
      на прежних портах, сервис `proxy` не создаётся (AC-6, регрессия
      исключена).
- [ ] T9. `make deploy` на реальном сервере с настроенным `PUBLIC_DOMAIN`
      (ручной смоук, не автоматизируется в CI):
      - `https://<домен>` открывается без предупреждения браузера (AC-1);
      - `http://<домен>/...` редиректит на `https://<домен>/...` (AC-2);
      - порты 8080/3000 не отвечают на внешний хост (AC-3);
      - `https://<домен>/api/health` отвечает как раньше (AC-7).
- [ ] T10. Обновить статус спеки/плана/индекс в `docs/specs/README.md` на
       `done` после смоука T9 на реальном сервере.

_Задачи адаптированы под инфраструктурную фичу без кода server/web: разделы
«Контракты»/«Server»/«Web» шаблона опущены как неприменимые (см. `plan.md`)._
