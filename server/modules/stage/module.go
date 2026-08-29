// Package stage — bounded context этапов номинации: раскладка бойцов по
// пулам внутри этапа (спека 0009, расширено спекой 0011 — постановка пула
// на арену; спека 0017 — сам этап как сущность).
//
// Модуль экспортирует единую точку входа Register, которую вызывает
// composition root (internal/platform). StageAdminService монтируется под
// RequireAdmin (FR-13); StagePublicService (спека 0011, FR-11) — под
// baseOpts без admin-опций, публичное чтение готовых пулов номинации.
package stage

import (
	"net/http"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/stage/api"
	"github.com/hema/server/modules/stage/domain"
	"github.com/hema/server/modules/stage/repo"
	"github.com/hema/server/modules/stage/service"
)

// Deps — явные зависимости модуля stage (DI через конструктор). Fighters,
// Bouts, Arenas и Nominations — межмодульные зависимости (порты, не прямой
// доступ к чужим PG-схемам, ADR 0002); направления зависимостей — только
// stage → fighter, stage → bout (спека 0010, лайфсайкл-команды добавлены
// спекой 0013), stage → arena (спека 0011, «Обзор решения») и stage →
// nomination (резолв имени номинации пула для экрана арены, FR-9). Bouts —
// реальный адаптер к модулю bout (BoutConductor) подключается отдельной
// join-волной в internal/platform (см. tasks.md T15); до этого поле может
// быть nil при локальной сборке composition root — модуль сам этим не
// управляет. LiveBus — порт живой шины (спека 0014, ADR 0012): реальный
// адаптер над pkg/livebus.Bus подключается тоже отдельной join-волной в
// internal/platform — до этого поле может быть nil, как и Bouts.
type Deps struct {
	Pool        *pgxpool.Pool
	Fighters    domain.ActiveFightersProvider
	Bouts       domain.BoutConductor
	Arenas      domain.ArenaProvider
	Nominations domain.NominationProvider
	LiveBus     domain.LiveBus
	// Users — межмодульная зависимость stage → auth (спека 0033, приём
	// 0025): резолв имён авторов записей журнала боёв площадки
	// (GetArenaJournal). Реальный адаптер (auth.NewDisplayNameProvider) —
	// тот же объект, что уже получает модуль application (internal/platform).
	Users domain.UserProvider
	// Notifier — почтовое уведомление о постановке пула на площадку (спека
	// 0042, FR-24). nil — уведомления отключены (no-op).
	Notifier domain.Notifier
}

// Register монтирует Connect-хендлеры модуля на переданный mux. baseOpts
// применяются ко всем сервисам (recovery/logging/auth); adminOpts
// дополнительно накладываются на StageAdminService (require-admin).
// StagePublicService — только baseOpts, без adminOpts (публичный доступ).
func Register(mux *http.ServeMux, deps Deps, baseOpts []connect.HandlerOption, adminOpts []connect.HandlerOption) {
	r := repo.New(deps.Pool)
	svc := service.New(r, deps.Fighters, deps.Bouts, deps.Arenas, deps.Nominations, deps.LiveBus, deps.Users, deps.Notifier)

	adminHandler := api.NewAdminHandler(svc)
	publicHandler := api.NewPublicHandler(svc)

	adminAll := make([]connect.HandlerOption, 0, len(baseOpts)+len(adminOpts))
	adminAll = append(adminAll, baseOpts...)
	adminAll = append(adminAll, adminOpts...)
	adminPath, adminH := hemav1connect.NewStageAdminServiceHandler(adminHandler, adminAll...)
	mux.Handle(adminPath, adminH)

	publicPath, publicH := hemav1connect.NewStagePublicServiceHandler(publicHandler, baseOpts...)
	mux.Handle(publicPath, publicH)
}
