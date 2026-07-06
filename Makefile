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

.PHONY: migrate
migrate: ## Прогон goose-миграций (требует DATABASE_URL)
	$(GOOSE) -dir ../$(MIGRATIONS_DIR) postgres "$(DB_URL)" up

.PHONY: migrate-down
migrate-down: ## Откат последней миграции
	$(GOOSE) -dir ../$(MIGRATIONS_DIR) postgres "$(DB_URL)" down

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
test: ## Тесты сервера (go test ./...)
	cd server && go test ./...

.PHONY: test-web
test-web: ## Тесты клиента (vitest)
	cd web && pnpm test

.PHONY: test-all
test-all: ## Все тесты (server + web)
	cd server && go test ./...
	cd web && pnpm test

.PHONY: dev
dev: ## Поднять весь стек через docker-compose
	docker compose up --build

.PHONY: down
down: ## Остановить стек
	docker compose down
