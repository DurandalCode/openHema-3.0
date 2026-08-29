// Package tournament — bounded context профиля турнира (модуль монолита).
//
// Модуль экспортирует единую точку входа Register, которую вызывает composition
// root (internal/platform). Публичный TournamentService монтируется без
// RequireAdmin (GetActiveTournament доступен без access-токена — см.
// publicProcedures интерсептора Auth); TournamentAdminService — под RequireAdmin.
package tournament

import (
	"net/http"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hema/server/gen/hema/v1/hemav1connect"
	"github.com/hema/server/modules/tournament/api"
	"github.com/hema/server/modules/tournament/domain"
	"github.com/hema/server/modules/tournament/repo"
	"github.com/hema/server/modules/tournament/service"
	"github.com/hema/server/pkg/filestore"
)

// defaultPolicies — запасные пороги/типы файлов, если Deps.Policies не
// задан. AllowedTypes — константа политики модуля (ADR 0019 п.4, не
// переопределяется конфигурацией). Значения MaxBytes здесь — плейсхолдер:
// ADR 0019 отдаёт реальные пороги конфигурации
// (REGULATIONS_MAX_BYTES/EMBLEM_MAX_BYTES), но её проброс сюда — задача
// composition root (internal/platform), вне трека B этой фичи. Модуль
// остаётся рабочим и без этого провода: Deps.Policies кастомизируется
// извне тем же способом, каким Deps.Files подключает реальное хранилище.
var defaultPolicies = map[domain.FileKind]domain.FilePolicy{
	domain.FileKindRegulations: {AllowedTypes: []string{"application/pdf"}, MaxBytes: 10 << 20},
	domain.FileKindEmblem:      {AllowedTypes: []string{"image/png", "image/jpeg", "image/webp"}, MaxBytes: 5 << 20},
}

// Deps — явные зависимости модуля tournament (DI через конструктор).
type Deps struct {
	Pool *pgxpool.Pool
	// Files — файловое хранилище регламента/эмблемы (ADR 0019). nil —
	// легальное значение: «хранилище не настроено», загрузка файлов
	// отвечает domain.ErrStorageUnavailable, профиль турнира продолжает
	// работать на ссылках (NFR-4). Composition root оставляет это поле
	// нулевым, пока FILE_STORAGE_DIR не подключён отдельной задачей.
	Files filestore.Store
	// Policies — пороги/допустимые типы по видам файла. nil ⇒
	// используются defaultPolicies этого пакета.
	Policies map[domain.FileKind]domain.FilePolicy
}

// Register монтирует Connect-хендлеры модуля на переданный mux.
// baseOpts применяются к обоим сервисам (recovery/logging/auth);
// adminOpts дополнительно накладываются на TournamentAdminService
// (require-admin).
func Register(mux *http.ServeMux, deps Deps, baseOpts []connect.HandlerOption, adminOpts []connect.HandlerOption) {
	r := repo.New(deps.Pool)
	policies := deps.Policies
	if policies == nil {
		policies = defaultPolicies
	}
	svc := service.New(r, deps.Files, policies)

	pubHandler := api.NewHandler(svc)
	adminHandler := api.NewAdminHandler(svc)

	pubPath, pubH := hemav1connect.NewTournamentServiceHandler(pubHandler, baseOpts...)
	mux.Handle(pubPath, pubH)

	adminAll := make([]connect.HandlerOption, 0, len(baseOpts)+len(adminOpts))
	adminAll = append(adminAll, baseOpts...)
	adminAll = append(adminAll, adminOpts...)
	adminPath, adminH := hemav1connect.NewTournamentAdminServiceHandler(adminHandler, adminAll...)
	mux.Handle(adminPath, adminH)
}
