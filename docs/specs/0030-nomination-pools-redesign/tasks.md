# Tasks: Редизайн экрана «Посев — группы»

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
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

- [ ] T1. **сводка раскладки (red→green)** —
      `entities/pool/lib/types.test.ts`: `poolLayoutCounts` — пустая
      раскладка (`{assigned:0, total:0, poolCount:0}`), частично
      распределённая, полностью распределённая без нераспределённых (spec
      AC-1) → затем `poolLayoutCounts` в `entities/pool/lib/types.ts`.
- [ ] T2. **статус в результатах запросов (red→green)** —
      `features/nomination-pools/api/requests.test.ts`: ошибочная ветка
      всех восьми запросов (создание/удаление/DnD×2/авто/undo/статус/
      чтение) несёт `status` из `res.status` → затем правка общей
      `fetchLayout` в `requests.ts` (`PoolLayoutResult.status?: number`).
- [ ] T3. **перевод ошибок (red→green)** —
      `features/nomination-pools/api/errors.test.ts`: `poolsErrorMessage`
      на `409`/`400`/`401`/`403`/`undefined` — переведённый текст, без
      примеси английской строки сервера → затем `errors.ts` (по образцу
      `features/format-presets/api/errors.ts`, 0029).
- [ ] T4. **хуки-мутации (red→green)** — точечная правка семи хуков
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
- [ ] T5. **тулбар — сводка, подписи, тон бейджа (red→green)** —
      `features/nomination-pools/ui/nomination-pools.test.tsx`: рендерится
      «N / M распределено · K пул(а/ов)» (spec AC-1); кнопки «+ Пул»,
      «Распределить автоматически», «Зафиксировать» есть, старых подписей
      нет (spec AC-2) → затем `Toolbar` в `nomination-pools.tsx`:
      `counts = poolLayoutCounts(layout)`, локальное склонение слова
      «пул» (по образцу `presetsCountWord`, 0029, не общий `shared/lib`),
      `<Badge tone={readOnly ? "success" : "warn"}>`, новые подписи кнопок.
- [ ] T6. **удаление пула — без модалки, тост с отменой (red→green)** —
      тест: клик «Удалить» **не** открывает диалог, `deletePool.mutate`
      вызван сразу; на успех — `toastUndo` с сообщением и `onUndo`,
      вызывающим `undo.mutate`; на отказ — `toastError(err.message)` без
      `retry` (spec AC-4) → затем `PoolColumn`/`onDelete` в
      `nomination-pools.tsx`: прямой вызов `deletePool.mutate(pool.id, {
      onSuccess, onError })`, без `ConfirmDialog`.
- [ ] T7. **автораспределение — тост с отменой (red→green)** — тест: успех
      → `toastUndo("Раскладка обновлена", …)`, клик «Отменить» в тосте
      зовёт `undo.mutate`; отказ → `toastError` без `retry` (spec AC-5) →
      затем обработчик кнопки «Распределить автоматически» в
      `nomination-pools.tsx`.
- [ ] T8. **кнопка «Отменить» тулбара — тихий успех, тост на ошибку
      (red→green)** — тест: успешный `undo.mutate` не зовёт тост; отказ →
      `toastError` без `retry` (spec AC-7) → затем обработчик кнопки
      «Отменить» в `nomination-pools.tsx`.
- [ ] T9. **смена статуса — тост (red→green)** — тест: `draft→ready` и
      `ready→draft` каждый дают `toastSuccess` со своим текстом; отказ —
      `toastError` без `retry` (spec AC-8) → затем обработчик
      `onToggleStatus` в `nomination-pools.tsx`.
- [ ] T10. **DnD — тихий успех, тост на ошибку (red→green)** — тест:
      успешный `onDragEnd` не зовёт тост; смоделированный отказ
      `assign`/`unassign` откатывает позицию (существующий optimistic
      rollback — регрессия) и зовёт `toastError` без `retry` (spec AC-9) →
      затем `onDragEnd` в `nomination-pools.tsx` передаёт `onError` в
      `assign.mutate`/`unassign.mutate`.
- [ ] T11. **постоянный баннер убран (red→green)** — тест: после любой
      ошибочной мутации из T6–T10 на экране нет `Alert` с текстом ошибки
      (spec AC-10) → затем удалить агрегацию `mutationError` и её
      `<Alert>` из `nomination-pools.tsx` целиком.
- [ ] T12. **скелетон загрузки (red→green)** — тест: `isLoading` рендерит
      скелетон нужной формы (280px-колонка + сетка карточек), не текст
      «Загрузка…» (spec AC-11) → затем `NominationPoolsSkeleton` (локальный
      компонент в `nomination-pools.tsx` на `Skeleton`, 0022) вместо `<p>`.
- [ ] T13. **ошибка загрузки — повтор (red→green)** — тест: `error` от
      `useLayout` рендерит сообщение с кнопкой «Повторить», клик зовёт
      `refetch` (spec AC-12) → затем ветка `error` в `nomination-pools.tsx`
      использует `refetch` из `useLayout` (уже доступен, `useQuery`).
- [ ] T14. **пустые состояния различаются (red→green)** — тест: пустой
      список нераспределённых → «Пусто»; пустой пул → «Перетащите бойца
      сюда» (spec AC-13) → затем текст пустого состояния `PoolColumn`.

## Проверка

- [ ] T15. `make test-all` зелёный (сервер не задет — подтверждаем, а не
      правим).
- [ ] T16. `pnpm exec tsc --noEmit` + `pnpm build` + `go build ./...`.
- [ ] T17. Ручной смоук: `make dev` + существующие demo-данные с этапом
      группового посева (`make demo-bouts`/аналог) — создание/удаление
      пула, DnD в обе стороны, автораспределение, «Отменить» из тоста и из
      тулбара, смена статуса `draft⇄ready`, обе темы (light/dark). Если в
      среде реализации нет браузерного инструмента (headless Chromium/
      Playwright) — функциональный смоук через реальный BFF по образцу
      0026/0027, с явной пометкой, что визуальная проверка осталась на
      автотестах T5–T14.
- [ ] T18. Обновить статусы `spec.md`/`plan.md`/`tasks.md` (`done`) и
      строку 0030 в `docs/specs/README.md`. `docs/design-sync.md` не
      меняется — строка «Посев — группы» уже верна (репо-пути и «новый API
      не нужен» не изменились).

_Задачи-шаблон адаптированы под фичу: контрактов и серверных слоёв здесь
нет — `/proto` и `/server` не меняются; отдельных треков нет — один связный
кластер файлов._
