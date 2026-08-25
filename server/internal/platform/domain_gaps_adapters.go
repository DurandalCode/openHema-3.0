package platform

import (
	"github.com/jackc/pgx/v5/pgxpool"

	boutmodule "github.com/hema/server/modules/bout"
	boutrepo "github.com/hema/server/modules/bout/repo"
	boutsvc "github.com/hema/server/modules/bout/service"
	stagemodule "github.com/hema/server/modules/stage"
	stagerepo "github.com/hema/server/modules/stage/repo"
	stagesvc "github.com/hema/server/modules/stage/service"
)

// NewStageCrossModuleAdapters строит межмодульные адаптеры модуля stage,
// нужные спеке 0040: гейт на удаление номинации (сценарий 1,
// PoolOccupancyChecker), восстановление посева при возврате бойца
// (сценарий 2, SeedingWithdrawalSink) и репойнт членств при слиянии дублей
// (сценарий 3, StageRepointer). Поверх лёгкого экземпляра stage-сервиса —
// отдельного от того, что stagemodule.Register строит себе внутри (см.
// stagemodule.PoolOccupancyAdapter, «свой *service.Service, не отдельный
// экземпляр» относится только к идее переиспользования — на практике
// stagemodule.Register своего наружу не отдаёт, а методы этих адаптеров
// трогают только repo, поэтому остальные межмодульные зависимости
// stage-сервиса (Fighters/Bouts/Arenas/Nominations/LiveBus/Users) можно не
// собирать — nil).
//
// Экспортирована, чтобы composition root (platform.go) и интеграционные
// тесты, собирающие полную кросс-модульную композицию (напр.
// internal/platform/integration), использовали один и тот же код wiring, а
// не дублировали его порознь.
func NewStageCrossModuleAdapters(pool *pgxpool.Pool) (
	*stagemodule.PoolOccupancyAdapter,
	*stagemodule.SeedingSinkAdapter,
	*stagemodule.RepointAdapter,
) {
	svc := stagesvc.New(stagerepo.New(pool), nil, nil, nil, nil, nil, nil)
	return stagemodule.NewPoolOccupancyAdapter(svc),
		stagemodule.NewSeedingSinkAdapter(svc),
		stagemodule.NewRepointAdapter(svc)
}

// NewBoutCrossModuleAdapters строит межмодульные адаптеры модуля bout,
// нужные спеке 0040: гейт на удаление номинации (сценарий 1,
// BoutOccupancyChecker) и репойнт боёв при слиянии дублей (сценарий 3,
// BoutRepointer). bout не имеет собственных межмодульных зависимостей
// (см. bout/module.go), поэтому лёгкий экземпляр сервиса строится без
// дополнительных портов.
func NewBoutCrossModuleAdapters(pool *pgxpool.Pool) (
	*boutmodule.BoutOccupancyAdapter,
	*boutmodule.RepointAdapter,
) {
	svc := boutsvc.New(boutrepo.New(pool))
	return boutmodule.NewBoutOccupancyAdapter(svc), boutmodule.NewRepointAdapter(svc)
}
