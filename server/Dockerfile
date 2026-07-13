# ── build ────────────────────────────────────────────────────
FROM golang:1.26-alpine AS build
WORKDIR /src

# Toolchain образа фиксирован; не докачиваем другой.
ENV GOTOOLCHAIN=local
ENV CGO_ENABLED=0

COPY go.mod go.sum ./
COPY . .

# Собираем сервер. `go build` подтягивает только нужные бинарю зависимости
# (tool-директивы buf/sqlc в сборку не попадают).
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    go build -o /out/server ./cmd/server

# ── goose (migrations tool) ──────────────────────────────────
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    go build -o /out/goose github.com/pressly/goose/v3/cmd/goose

# ── runtime ──────────────────────────────────────────────────
FROM alpine:3.20
WORKDIR /app
RUN adduser -D -u 10001 app

COPY --from=build /out/server /app/server
COPY --from=build /out/goose /app/goose
# Каждый модуль владеет своей PG-схемой и миграциями (ADR 0002). Goose гоняет
# свою директорию на модуль; при новом модуле добавить строку COPY здесь.
COPY --from=build /src/modules/auth/migrations        /app/modules/auth/migrations
COPY --from=build /src/modules/tournament/migrations  /app/modules/tournament/migrations
COPY --from=build /src/modules/nomination/migrations  /app/modules/nomination/migrations
COPY --from=build /src/modules/application/migrations /app/modules/application/migrations
COPY --from=build /src/modules/fighter/migrations      /app/modules/fighter/migrations
COPY --from=build /src/modules/arena/migrations        /app/modules/arena/migrations

USER app
EXPOSE 8080
ENTRYPOINT ["/app/server"]
