SHELL := /bin/bash
.DEFAULT_GOAL := help

# Загружаем .env, если есть (для локальных команд)
ifneq (,$(wildcard .env))
include .env
export
endif

BUF   := cd server && go tool buf
GOOSE := cd server && go tool goose
SQLC  := cd server && go tool sqlc
DB_URL ?= $(DATABASE_URL)

MIGRATIONS_DIR := server/modules/auth/migrations
TOURNAMENT_MIGRATIONS_DIR := server/modules/tournament/migrations
NOMINATION_MIGRATIONS_DIR := server/modules/nomination/migrations
APPLICATION_MIGRATIONS_DIR := server/modules/application/migrations

.PHONY: help
help: ## Показать доступные команды
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

.PHONY: tools
tools: ## Установить dev-инструменты (buf/sqlc/goose) в go.mod как tool
	cd server && go mod tidy

.PHONY: generate
generate: ## Генерация Go+TS из proto через buf
	$(BUF) generate ../proto --template ../proto/buf.gen.yaml

.PHONY: lint-proto
lint-proto: ## Линт proto
	$(BUF) lint ../proto

.PHONY: sqlc
sqlc: ## Генерация sqlc-репозиториев
	$(SQLC) generate

# Goose хранит версию НА МОДУЛЬ (отдельная таблица): модули могут иметь
# одинаково названные миграции (00001_init.sql), а общая goose_db_version
# привела бы к silent skip (ADR 0002 — модуль владеет своей схемой).
.PHONY: migrate
migrate: ## Прогон goose-миграций по всем модулям (требует DATABASE_URL)
	$(GOOSE) -dir ../$(MIGRATIONS_DIR)          -table goose_db_version_auth       postgres "$(DB_URL)" up
	$(GOOSE) -dir ../$(TOURNAMENT_MIGRATIONS_DIR) -table goose_db_version_tournament postgres "$(DB_URL)" up
	$(GOOSE) -dir ../$(NOMINATION_MIGRATIONS_DIR) -table goose_db_version_nomination postgres "$(DB_URL)" up
	$(GOOSE) -dir ../$(APPLICATION_MIGRATIONS_DIR) -table goose_db_version_application postgres "$(DB_URL)" up

.PHONY: migrate-down
migrate-down: ## Откат последней миграции во всех модулях
	$(GOOSE) -dir ../$(APPLICATION_MIGRATIONS_DIR) -table goose_db_version_application postgres "$(DB_URL)" down
	$(GOOSE) -dir ../$(NOMINATION_MIGRATIONS_DIR) -table goose_db_version_nomination postgres "$(DB_URL)" down
	$(GOOSE) -dir ../$(TOURNAMENT_MIGRATIONS_DIR) -table goose_db_version_tournament postgres "$(DB_URL)" down
	$(GOOSE) -dir ../$(MIGRATIONS_DIR)          -table goose_db_version_auth       postgres "$(DB_URL)" down

.PHONY: server
server: ## Локальный запуск Go-сервера
	cd server && go run ./cmd/server

.PHONY: web
web: ## Локальный запуск Next.js
	cd web && pnpm dev

.PHONY: build
build: ## Сборка сервера и клиента
	cd server && go build ./...
	cd web && pnpm build

.PHONY: test
test: ## Тесты сервера (go test ./..., без Docker — без build-tag integration)
	cd server && go test ./...

.PHONY: test-web
test-web: ## Тесты клиента (vitest: unit + e2e-route)
	cd web && pnpm test

.PHONY: test-all
test-all: ## Все unit/e2e без Docker (server + web)
	cd server && go test ./...
	cd web && pnpm test

.PHONY: test-integration
test-integration: ## Интеграционные тесты сервера с БД (требует Docker, ADR 0010)
	cd server && TESTCONTAINERS_RYUK_DISABLED=true go test -tags=integration ./...

.PHONY: dev
dev: ## Локальный дев: postgres в докере + миграции + server и web локально
	docker compose up -d --wait postgres
	$(MAKE) migrate
	$(MAKE) -j2 server web

.PHONY: demo
demo: migrate ## Наполнить БД тестовыми данными для ручной проверки UX (сбрасывает demo-сущности: users/nominations/applications)
	cd server && go run ./cmd/demo

.PHONY: prod
prod: ## Полная сборка и запуск всего стека в докере
	docker compose up --build

.PHONY: down
down: ## Остановить стек
	docker compose down
