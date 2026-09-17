# ── Образ кодогенерации (спека 0050, ADR 0023) ────────────────
# Плагины кодгена исполняются ЗДЕСЬ, а не на хосте: удалённое исполнение
# (`remote: buf.build/...`) отдаёт 403 Forbidden с адреса препрод-ВМ и рвёт
# `make deploy` на первом же шаге, а ставить тулчейны генераторов на саму ВМ
# мы не хотим. Хосту для кодгена нужен только Docker.
#
# Своего списка версий у образа НЕТ — всё выводится из манифестов репозитория:
#   buf, protoc-gen-go, protoc-gen-connect-go → server/go.mod
#   protoc-gen-es                             → web/package.json
# Поэтому контекст сборки — корень репозитория, а не подкаталог.

# ── Go-инструменты ───────────────────────────────────────────
FROM golang:1.26-alpine AS gotools
WORKDIR /tools

# Toolchain образа фиксирован; не докачиваем другой (как в server/Dockerfile).
ENV GOTOOLCHAIN=local
ENV CGO_ENABLED=0

# Только манифесты: исходники модуля для сборки чужих команд не нужны, зато
# слой кешируется по go.mod/go.sum и пересобирается лишь при смене версий.
COPY server/go.mod server/go.sum ./

# Без `--mount=type=cache`: на препрод-ВМ Docker собирает КЛАССИЧЕСКИМ
# билдером (плагин buildx не установлен, `DOCKER_BUILDKIT=1` там падает), а
# cache-mount — синтаксис BuildKit. Кеширования это стоит недорого: слой и так
# пересобирается только при смене go.mod/go.sum. Не добавляй сюда
# BuildKit-only синтаксис, не проверив на ВМ.
RUN go build -o /out/buf                   github.com/bufbuild/buf/cmd/buf && \
    go build -o /out/protoc-gen-go         google.golang.org/protobuf/cmd/protoc-gen-go && \
    go build -o /out/protoc-gen-connect-go connectrpc.com/connect/cmd/protoc-gen-connect-go

# ── Итоговый образ ───────────────────────────────────────────
# Базовый — node: он нужен как среда исполнения protoc-gen-es. Go-бинари
# статические (CGO_ENABLED=0), поэтому переезжают в alpine как есть.
FROM node:22-alpine
COPY --from=gotools /out/ /usr/local/bin/

# Версия TS-генератора берётся из манифеста web, а не дублируется здесь.
# Страж пары «генератор = runtime» — web/codegen-versions.test.ts.
COPY web/package.json /tmp/package.json
RUN npm i -g "@bufbuild/protoc-gen-es@$(node -p "require('/tmp/package.json').devDependencies['@bufbuild/protoc-gen-es']")" \
    && rm /tmp/package.json

# buf пишет кеш в $HOME. Контейнер запускается со сквозным uid хозяина репо
# (чтобы сгенерированные файлы не достались root), а у такого uid своего
# домашнего каталога в образе нет — отправляем кеш в /tmp.
ENV HOME=/tmp

# Тот же CWD, что был у хостового запуска: пути `gen` и `../web/src/gen` в
# proto/buf.gen.yaml отсчитываются от server/.
WORKDIR /src/server
