package platform

import (
	"errors"
	"io"
	"net/http"
	"os"
	"strconv"

	"github.com/hema/server/pkg/filestore"
)

// filesHandler отдаёт загруженные файлы турнира (регламент, эмблема —
// спека 0042, ADR 0019 п.6) обычным публичным GET, а не через Connect —
// показ страницы с эмблемой не должен быть недешёвым RPC. Один хендлер на
// оба вида файлов: адресует объект по id, о том, регламент это или
// эмблема, не знает — эта граница проведена уровнем выше (proto
// TournamentFileKind), не здесь.
//
// store == nil (хранилище не настроено, NFR-4) — хендлер всегда отвечает
// 404: раз хранилище выключено, ни один id не может быть валиден.
func filesHandler(store filestore.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if id == "" || store == nil {
			http.NotFound(w, r)
			return
		}

		rc, meta, err := store.Open(r.Context(), id)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				http.NotFound(w, r)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		defer rc.Close()

		// Content-Type — из метаданных, определённых при загрузке по
		// бинарной сигнатуре (Sniff), а не из заявленного загружающим
		// значения (ADR 0019 п.3, NFR-9 спеки). nosniff запрещает браузеру
		// переопределить тип самостоятельно — файл отдаётся с нашего
		// origin, подмена типа на пользовательском домене — известный
		// класс уязвимости.
		w.Header().Set("Content-Type", meta.ContentType)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Disposition", "inline")
		if meta.Size > 0 {
			w.Header().Set("Content-Length", strconv.FormatInt(meta.Size, 10))
		}
		_, _ = io.Copy(w, rc)
	}
}
