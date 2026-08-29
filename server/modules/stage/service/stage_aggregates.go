// Спека 0041: агрегирующие RPC живого статуса турнира (FR-7/FR-8) — доска
// всех неархивных площадок и схема+диагностика всех номинаций турнира одним
// обращением вместо одного на площадку/номинацию за цикл обновления (0027
// NFR-3, 0028 NFR-2 — рассмотрено и отложено этими спеками, теперь
// реализовано). Оба RPC — тонкая обёртка вокруг уже существующих одиночных
// GetBoutBoard/ListStages, вызванных в цикле по уже резолвленному через
// существующие межмодульные порты списку площадок/номинаций (план, «Server»,
// modules/stage/): никакой новой логики сборки доски/схемы, никаких новых
// межмодульных зависимостей.
package service

import (
	"context"
	"strings"

	"github.com/hema/server/modules/stage/domain"
)

// GetArenaBoards возвращает доску ведения боёв каждой неархивной площадки
// турнира за одно обращение (FR-7/FR-9): резолвит ArenaProvider.ActiveArenas
// (тот же охват и admin-порядок, что использует TournamentLive/
// GetTournamentLive, спека 0034) и для каждой площадки вызывает уже
// существующий GetBoutBoard — не дублирует его логику сборки доски. Площадка
// без пула на ней получает запись с пустым board (Pool.ID == "") — не
// ошибка, та же семантика, что у одиночного GetBoutBoard.
//
// Обработка ошибок одной записи: proto ArenaBoardEntry (и domain-эквивалент
// ArenaBoardEntry) не несёт отдельного флага ошибки — только arena_id и
// board (NFR-2 спеки 0041 — форма ответа не вводит новых состояний). Это не
// произвольное решение: в отличие от клиентского useArenaBoards (спека
// 0027), где N независимых HTTP-запросов TanStack Query действительно могут
// завершиться независимо, здесь все площадки читаются последовательно в
// одном процессе поверх одного и того же порта/хранилища за один вызов
// GetArenaBoards. ArenaRef на входе GetBoutBoard уже резолвлен и валиден
// (пришёл из ActiveArenas) — единственный реалистичный источник ошибки на
// чтении доски ОДНОЙ площадки здесь тот же отказ хранилища/порта, что
// уронил бы и чтение остальных площадок этого же запроса, а не что-то
// специфичное для площадки. Поэтому ошибка чтения доски любой площадки
// возвращается как ошибка всего запроса — как и ошибка резолва списка
// площадок целиком.
//
// idle_state/free_since (спека 0043, FR-26/FR-28) и forecast каждого не
// начатого боя доски (ADR 0020, FR-9/FR-24) — обогащение ПОВЕРХ уже
// собранной GetBoutBoard доски (см. applyForecast ниже), не вторая логика
// сборки: домен доски (Pool/Standings/Status) остаётся единственным
// источником истины GetBoutBoard, прогноз накладывается отдельным
// проходом, посчитанным один раз на весь турнир (не на площадку).
func (s *Service) GetArenaBoards(ctx context.Context, tournamentID string) ([]domain.ArenaBoardEntry, error) {
	tournamentID = strings.TrimSpace(tournamentID)
	if tournamentID == "" {
		return nil, domain.ErrInvalidInput
	}
	arenas, err := s.arenas.ActiveArenas(ctx, tournamentID)
	if err != nil {
		return nil, err
	}

	gathered, err := s.gatherTournament(ctx, tournamentID)
	if err != nil {
		return nil, err
	}

	entries := make([]domain.ArenaBoardEntry, 0, len(arenas))
	for _, arena := range arenas {
		board, err := s.GetBoutBoard(ctx, arena.ID)
		if err != nil {
			return nil, err
		}
		applyForecastToBoard(&board, gathered.forecasts)
		idleState, freeSince := domain.IdleStateOf(board.Pool.ID != "", arena.LastFreedAt)
		entries = append(entries, domain.ArenaBoardEntry{
			ArenaID:   arena.ID,
			Board:     board,
			IdleState: idleState,
			FreeSince: freeSince,
		})
	}
	return entries, nil
}

// applyForecastToBoard накладывает прогноз (по id пула доски) на каждый бой
// board.Bouts — мутирует срез на месте, только Forecast; остальные поля боя
// (уже собранные GetBoutBoard) не трогает.
func applyForecastToBoard(board *domain.BoutBoard, forecasts map[string]containerForecast) {
	if board.Pool.ID == "" {
		return
	}
	cf, ok := forecasts[board.Pool.ID]
	if !ok {
		return
	}
	for i := range board.Bouts {
		if f, ok := cf.byBout[board.Bouts[i].ID]; ok {
			forecast := f
			board.Bouts[i].Forecast = &forecast
		}
	}
}

// ListStagesForTournament возвращает схему этапов и диагностику каждой
// номинации турнира за одно обращение (FR-8/FR-10): резолвит
// NominationProvider.NominationsByTournament (тот же охват и admin-порядок,
// что использует TournamentLive, спека 0034) и для каждой номинации вызывает
// уже существующий ListStages — включая материализацию авто-этапа (спека
// 0017, FR-4): ListStages остаётся единственным местом, где виртуальный этап
// получает постоянный id, эта ручка лишь вызывает его в цикле по уже
// резолвленному списку номинаций, ничего не материализует сама.
//
// Обработка ошибок одной записи — тем же решением, что у GetArenaBoards
// выше: domain/proto NominationStagesEntry не несёт отдельного флага ошибки
// (только nomination_id/stages/issues), NominationRef на входе уже
// резолвлен и валиден — ошибка чтения схемы любой номинации возвращается как
// ошибка всего запроса.
func (s *Service) ListStagesForTournament(ctx context.Context, tournamentID string) ([]domain.NominationStagesEntry, error) {
	tournamentID = strings.TrimSpace(tournamentID)
	if tournamentID == "" {
		return nil, domain.ErrInvalidInput
	}
	nominations, err := s.nominations.NominationsByTournament(ctx, tournamentID)
	if err != nil {
		return nil, err
	}
	entries := make([]domain.NominationStagesEntry, 0, len(nominations))
	for _, nom := range nominations {
		stages, issues, err := s.ListStages(ctx, nom.ID)
		if err != nil {
			return nil, err
		}
		entries = append(entries, domain.NominationStagesEntry{NominationID: nom.ID, Stages: stages, Issues: issues})
	}
	return entries, nil
}
