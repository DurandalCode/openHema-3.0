// Package pool — bounded context раскладки бойцов номинации по пулам
// (спека 0009, расширено спекой 0011 — постановка пула на арену).
//
// Модуль экспортирует единую точку входа Register, которую вызывает
// composition root (internal/platform). PoolAdminService монтируется под
// RequireAdmin (FR-13); PoolPublicService (спека 0011, FR-11) — под
// baseOpts без admin-опций, публичное чтение готовых пулов номинации.
package pool

import (
	"net/http"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/pool/api"
	"github.com/hema/server/modules/pool/domain"
	"github.com/hema/server/modules/pool/repo"
	"github.com/hema/server/modules/pool/service"
)

// Deps — явные зависимости модуля pool (DI через конструктор). Fighters,
// Bouts, Arenas и Nominations — межмодульные зависимости (порты, не прямой
// доступ к чужим PG-схемам, ADR 0002); направления зависимостей — только
// pool → fighter, pool → bout (спека 0010), pool → arena (спека 0011,
// «Обзор решения») и pool → nomination (резолв имени номинации пула для
// экрана арены, FR-9). Arenas/Nominations — реальные адаптеры подключаются
// отдельной join-волной в internal/platform (см. tasks.md T8); до этого поле
// может быть nil при локальной сборке composition root — модуль сам этим не
// управляет.
type Deps struct {
	Pool         *pgxpool.Pool
	Fighters     domain.ActiveFightersProvider
	Bouts        domain.BoutGenerator
	Arenas       domain.ArenaProvider
	Nominations  domain.NominationProvider
}

// Register монтирует Connect-хендлеры модуля на переданный mux. baseOpts
// применяются ко всем сервисам (recovery/logging/auth); adminOpts
// дополнительно накладываются на PoolAdminService (require-admin).
// PoolPublicService — только baseOpts, без adminOpts (публичный доступ).
func Register(mux *http.ServeMux, deps Deps, baseOpts []connect.HandlerOption, adminOpts []connect.HandlerOption) {
	r := repo.New(deps.Pool)
	svc := service.New(r, deps.Fighters, deps.Bouts, deps.Arenas, deps.Nominations)

	adminHandler := api.NewAdminHandler(svc)
	publicHandler := api.NewPublicHandler(svc)

	adminAll := make([]connect.HandlerOption, 0, len(baseOpts)+len(adminOpts))
	adminAll = append(adminAll, baseOpts...)
	adminAll = append(adminAll, adminOpts...)
	adminPath, adminH := hemav1connect.NewPoolAdminServiceHandler(adminHandler, adminAll...)
	mux.Handle(adminPath, adminH)

	publicPath, publicH := hemav1connect.NewPoolPublicServiceHandler(publicHandler, baseOpts...)
	mux.Handle(publicPath, publicH)
}
