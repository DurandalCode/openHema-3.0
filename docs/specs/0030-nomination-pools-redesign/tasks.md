# Tasks: Редизайн экрана «Посев — группы»

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-08-15
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

Контрактов и серверных задач в этом инкременте нет: `/proto` и `/server` не
меняются (plan «Контракты», «Server»), поэтому чеклист начинается сразу с
web. Отдельных треков/волн не заводим: весь объём — один тесно связанный
кластер файлов одной фичи (`entities/pool` + `features/nomination-pools`),
дизъюнктных по файлам кусков, которые стоило бы вести параллельно, нет.

## Web

- [x] T1. **сводка раскладки (red→green)** —
      `entities/pool/lib/types.test.ts`: `poolLayoutCounts` — пустая
      раскладка (`{assigned:0, total:0, poolCount:0}`), частично
      распределённая, полностью распределённая без нераспределённых (spec
      AC-1) → затем `poolLayoutCounts` в `entities/pool/lib/types.ts`.
- [x] T2. **статус в результатах запросов (red→green)** —
      `features/nomination-pools/api/requests.test.ts`: ошибочная ветка
      всех восьми запросов (создание/удаление/DnD×2/авто/undo/статус/
      чтение) несёт `status` из `res.status` → затем правка общей
      `fetchLayout` в `requests.ts` (`PoolLayoutResult.status?: number`).
- [x] T3. **перевод ошибок (red→green)** —
      `features/nomination-pools/api/errors.test.ts`: `poolsErrorMessage`
      на `409`/`400`/`401`/`403`/`undefined` — переведённый текст, без
      примеси английской строки сервера → затем `errors.ts` (по образцу
      `features/format-presets/api/errors.ts`, 0029).
- [x] T4. **хуки-мутации (red→green)** — точечная правка семи хуков
      (`use-create-pool.ts`, `use-delete-pool.ts`, `use-auto-distribute.ts`,
      `use-undo.ts`, `use-set-layout-status.ts`, `use-assign-fighter.ts`,
      `use-unassign-fighter.ts`): `mutationFn` при отказе бросает
      `new Error(poolsErrorMessage(res.error, res.status))` вместо
      `new Error(res.error)`; `use-create-pool`/`use-set-layout-status`
      получают `onSuccess: () => toastSuccess(...)` внутри хука (spec
      FR-3/FR-8, текст статуса — по направлению перехода). Тест — через
      T7 (компонент), отдельных unit-тестов на хуки не заводим (в фиче нет
      прецедента `renderHook`-тестов на RQ-мутации — toasты уже
      проверяются на уровне экрана, `preset-library.test.tsx`/0029).
- [x] T5. **тулбар — сводка, подписи, тон бейджа (red→green)** —
      `features/nomination-pools/ui/nomination-pools.test.tsx`: рендерится
      «N / M распределено · K пул(а/ов)» (spec AC-1); кнопки «+ Пул»,
      «Распределить автоматически», «Зафиксировать» есть, старых подписей
      нет (spec AC-2) → затем `Toolbar` в `nomination-pools.tsx`:
      `counts = poolLayoutCounts(layout)`, локальное склонение слова
      «пул» (по образцу `presetsCountWord`, 0029, не общий `shared/lib`),
      `<Badge tone={readOnly ? "success" : "warn"}>`, новые подписи кнопок.
- [x] T6. **удаление пула — без модалки, тост с отменой (red→green)** —
      тест: клик «Удалить» **не** открывает диалог, `deletePool.mutate`
      вызван сразу; на успех — `toastUndo` с сообщением и `onUndo`,
      вызывающим `undo.mutate`; на отказ — `toastError(err.message)` без
      `retry` (spec AC-4) → затем `PoolColumn`/`onDelete` в
      `nomination-pools.tsx`: прямой вызов `deletePool.mutate(pool.id, {
      onSuccess, onError })`, без `ConfirmDialog`.
- [x] T7. **автораспределение — тост с отменой (red→green)** — тест: успех
      → `toastUndo("Раскладка обновлена", …)`, клик «Отменить» в тосте
      зовёт `undo.mutate`; отказ → `toastError` без `retry` (spec AC-5) →
      затем обработчик кнопки «Распределить автоматически» в
      `nomination-pools.tsx`.
- [x] T8. **кнопка «Отменить» тулбара — тихий успех, тост на ошибку
      (red→green)** — тест: успешный `undo.mutate` не зовёт тост; отказ →
      `toastError` без `retry` (spec AC-7) → затем обработчик кнопки
      «Отменить» в `nomination-pools.tsx`.
- [x] T9. **смена статуса — тост (red→green)** — тест: `draft→ready` и
      `ready→draft` каждый дают `toastSuccess` со своим текстом; отказ —
      `toastError` без `retry` (spec AC-8) → затем обработчик
      `onToggleStatus` в `nomination-pools.tsx`.
- [x] T10. **DnD — тихий успех, тост на ошибку (red→green)** — тест:
      успешный `onDragEnd` не зовёт тост; смоделированный отказ
      `assign`/`unassign` откатывает позицию (существующий optimistic
      rollback — регрессия) и зовёт `toastError` без `retry` (spec AC-9) →
      затем `onDragEnd` в `nomination-pools.tsx` передаёт `onError` в
      `assign.mutate`/`unassign.mutate`.
- [x] T11. **постоянный баннер убран (red→green)** — тест: после любой
      ошибочной мутации из T6–T10 на экране нет `Alert` с текстом ошибки
      (spec AC-10) → затем удалить агрегацию `mutationError` и её
      `<Alert>` из `nomination-pools.tsx` целиком.
- [x] T12. **скелетон загрузки (red→green)** — тест: `isLoading` рендерит
      скелетон нужной формы (280px-колонка + сетка карточек), не текст
      «Загрузка…» (spec AC-11) → затем `NominationPoolsSkeleton` (локальный
      компонент в `nomination-pools.tsx` на `Skeleton`, 0022) вместо `<p>`.
- [x] T13. **ошибка загрузки — повтор (red→green)** — тест: `error` от
      `useLayout` рендерит сообщение с кнопкой «Повторить», клик зовёт
      `refetch` (spec AC-12) → затем ветка `error` в `nomination-pools.tsx`
      использует `refetch` из `useLayout` (уже доступен, `useQuery`).
- [x] T14. **пустые состояния различаются (red→green)** — тест: пустой
      список нераспределённых → «Пусто»; пустой пул → «Перетащите бойца
      сюда» (spec AC-13) → затем текст пустого состояния `PoolColumn`.

## Проверка

- [x] T15. `make test-all` зелёный: сервер — 24 пакета `ok` (кэш, не
      задет); web — 197 файлов / 1508 тестов зелёные (включая новые
      T1–T14).
- [x] T16. `pnpm exec tsc --noEmit` (чисто), `pnpm build` (прод-сборка
      прошла), `go build ./...` (чисто). `pnpm lint` — без новых
      предупреждений (три существующих не относятся к этой фиче).
- [x] T17. **Ручной смоук выполнен функционально через реальный BFF, не
      браузером** — в среде реализации нет headless Chromium/Playwright
      (проверено: пакет `playwright` ставится через `npx`, но браузерный
      бинарник не установлен), тот же случай, что 0026/0027. Поднят
      реальный стек: `postgres` (уже был healthy в докере), `go run
      ./cmd/server`, `pnpm dev`, `make demo-bouts` (сид демо-турнира). Все
      готовые групповые этапы демо-данных оказались в `ready`, поэтому
      для проверки **черновикового** пути создана и затем удалена
      отдельная тестовая номинация (`DELETE /api/nominations/[id]`, чисто
      после себя) — на её lazy-созданном авто-этапе через реальный
      залогиненный BFF (`admin@local`) подтверждены круглым трипом:
      создание пула ×2 (`POST .../pools`, 200, счётчики раскладки как у
      `poolLayoutCounts`), удаление пула (`DELETE /api/pools/[id]`, 200,
      `canUndo:true`), undo восстанавливает пул с тем же номером (`POST
      .../undo`, 200), смена статуса `draft→ready→draft` (`POST
      .../status`, 200 в обе стороны), автораспределение без
      нераспределённых — no-op успех (`POST .../distribute`, 200, состав
      не изменился, FR-7/AC-9 спеки 0009). Отдельно подтверждены оба
      маршрута ошибок, которые переводит `poolsErrorMessage`: `POST
      .../status {status:"draft"}` на этапе с пулом на арене →
      `pool: a pool of this nomination is seated on an arena`, HTTP 409;
      повторный `POST .../undo` без истории → `pool: nothing to undo`,
      HTTP 409 — оба реальных Go-текста подтверждают, что ветка `409` в
      `poolsErrorMessage` (T3) действительно достижима с продакшен-кодом
      сервера, не только в тестах на выдуманных строках. **Не проверено
      кликами** (нет браузера): визуальный вид тулбара/скелетона/тостов,
      реальный drag & drop мышью, обе темы — эти сценарии покрыты только
      автотестами (T5–T14).
- [x] T18. Статусы `spec.md`/`plan.md`/`tasks.md` → `done`; строка 0030 в
      `docs/specs/README.md` обновлена. `docs/design-sync.md` не менялся —
      строка «Посев — группы» уже верна (репо-пути и «новый API не нужен»
      не изменились, подтверждено T17: ни один вызов не потребовал
      незнакомого RPC).

_Задачи-шаблон адаптированы под фичу: контрактов и серверных слоёв здесь
нет — `/proto` и `/server` не меняются; отдельных треков нет — один связный
кластер файлов._
