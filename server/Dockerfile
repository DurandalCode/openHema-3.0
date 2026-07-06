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
COPY --from=build /src/modules/auth/migrations /app/migrations

USER app
EXPOSE 8080
ENTRYPOINT ["/app/server"]
