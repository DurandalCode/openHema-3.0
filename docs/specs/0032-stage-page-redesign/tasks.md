# Tasks: Редизайн страницы этапа

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-15
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

Инкремент клиентский: `/proto`, Go-сервер и миграции не трогаются (NFR-1),
поэтому раздела «Server» здесь нет — контрактная волна сводится к DTO и
чистым функциям, от которых зависят все остальные треки.

## Треки и параллельность

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0 | — | T1–T2 | `lib/grpc/serialize.ts`, `entities/stage/lib/{types,labels,progress}.ts` | — |
| 1 | A | T3–T4 | `features/bracket-seeding/**`, `widgets/bracket-view/bracket-view.tsx` | волна 0 |
| 1 | B | T5–T6 | `features/stage-build/**` | волна 0 |
| 1 | C | T7 | `features/nomination-pools/ui/nomination-pools.tsx` (+тест) | волна 0 |
| 1 | D | T8–T10 | `features/nomination-live/api/{keys,use-live-snapshot}.ts`, `widgets/stage-page/{stage-rail,stage-summary-cards,stage-page-skeleton}.tsx` (+тесты) | волна 0 |
| 2 | join | T11–T12 | `widgets/stage-page/{stage-actions,stage-page-screen}.tsx` (+тесты), `app/(admin)/.../stages/[stageId]/page.tsx` | треки A–D смержены |
| 3 | — | T13–T17 | проверка | волна 2 |

Треки волны 1 дизъюнктны по файлам и не ждут друг друга: A и C правят
собственные фичи, B — окно формирования (карточка этапа схемы продолжает
открывать его тем же способом, `DialogTrigger` остаётся по умолчанию), D
собирает части каркаса на моках хуков.

## Контракты и чистая логика (волна 0)

- [x] T1. **`executionStatus` в DTO (red→green)** — `lib/grpc/serialize.test.ts`:
      `stageToJson` отдаёт `executionStatus` (включая proto3-omitted →
      `STAGE_STATUS_UNSPECIFIED`) → затем `lib/grpc/serialize.ts`,
      `entities/stage/lib/types.ts` (тип `StageStatus` + поле `Stage`),
      `entities/stage/lib/labels.ts` (`stageExecutionStatusLabel`, FR-5/FR-17)
      + тест подписи. _(Поле уже приходит с сервера — 0021, — но терялось в
      сериализаторе; см. `plan.md`, «Контракты».)_
- [x] T2. **`stageProgressFromSnapshot` (red→green)** —
      `entities/stage/lib/progress.test.ts`: групповой этап (бойцы, X из Y
      завершённых боёв), сетка (занятые слоты, материализованные пары),
      этап-черновик без записи в снапшоте → отсутствует в результате,
      смешанная схема → затем `entities/stage/lib/progress.ts` (FR-18, NFR-5).

## Волна 1 · трек A — редизайн посева сетки

- [ ] T3. **errors (red→green)** — `features/bracket-seeding/api/errors.test.ts`:
      перевод отказов по HTTP-статусу (409 — слот занят/состав зафиксирован,
      404, сеть) → затем `api/errors.ts` (санкционированный дубль тонкого
      модуля соседней фичи, правило 6 `web/AGENTS.md`).
- [ ] T4. **экран (red→green)** — `ui/bracket-seeding.test.tsx`: тост-успех и
      тост-ошибка на мутациях вместо постоянного баннера (FR-21, AC-14),
      `toastUndo` на сбросе посева (FR-22), скелетон в форме экрана (FR-23),
      ошибка загрузки с «Повторить» (FR-24), пустые состояния «Пусто» /
      «Перетащите бойца сюда» (FR-25), отсутствие статуса/сводки/фиксации в
      тулбаре (FR-3) → затем `ui/bracket-seeding.tsx` + точечный рестайл
      токенами `widgets/bracket-view/bracket-view.tsx`.

## Волна 1 · трек B — окно формирования

- [ ] T5. **`buildBlockedReason` (red→green)** —
      `features/stage-build/lib/build-gate.test.ts`: дележи → «пока есть
      неразрешённые дележи», пересечения → «пока есть пересечение веток»,
      чисто → `null`, приоритет при обоих сразу → затем `lib/build-gate.ts`
      (FR-16).
- [ ] T6. **диалог (red→green)** — `ui/build-stage-dialog.test.tsx`:
      управляемость (`open`/`onOpenChange`, опциональный триггер), подпись
      блокировки рядом с кнопкой (AC-8/AC-9), доступность кнопки при
      незавершённом источнике (AC-10), отсутствие «FR-…» в пользовательских
      текстах → затем `ui/build-stage-dialog.tsx` (FR-15/FR-16).

## Волна 1 · трек C — тулбар посева групп

- [ ] T7. **(red→green)** — `features/nomination-pools/ui/nomination-pools.test.tsx`:
      статуса, сводки «N/M распределено · K пула» и кнопки фиксации в тулбаре
      **больше нет** (переехали в `PageHeader`, FR-3); «+ Пул»,
      автораспределение, «Отменить», «Сбросить», DnD и read-only при `ready`
      сохранены → затем `ui/nomination-pools.tsx`.

## Волна 1 · трек D — части каркаса

- [ ] T8. **живой снапшот (red→green)** —
      `features/nomination-live/api/use-live-snapshot.test.ts`: запрос
      `/api/nominations/[id]/live-snapshot`, ключ, обработка ошибки → затем
      `api/keys.ts` + `api/use-live-snapshot.ts`.
- [ ] T9. **рельс (red→green)** — `widgets/stage-page/stage-rail.test.tsx`:
      порядок этапов и пометка «текущий» (AC-11), ссылки на страницы этапов,
      счётчики «18 бойцов · 45 из 45 боёв» и их отсутствие у черновика
      (AC-12), диагностика и «Схема корректна» + ссылка «Открыть схему»
      (AC-13) → затем `stage-rail.tsx` (FR-17..FR-20).
- [ ] T10. **сводка и скелетон (red→green)** —
      `widgets/stage-page/stage-summary-cards.test.tsx`: три карточки, подпись
      правила и «Правила нет — состав набирается руками», «Заполнено N / M»,
      ссылка на схему (AC-2, FR-6..FR-8) → затем `stage-summary-cards.tsx` и
      `stage-page-skeleton.tsx` (FR-26).

## Волна 2 · join — сборка страницы

- [ ] T11. **действия этапа (red→green)** —
      `widgets/stage-page/stage-actions.test.tsx`: «Сформировать» открывает
      окно превью (AC-4), у этапа с непустым составом кнопка —
      «Сформировать заново» и заблокирована с объяснением, мутация не
      уходит (AC-5), «Сбросить этап» с `ConfirmDialog` без ввода названия,
      тост-успех и тост-ошибка по-русски (AC-6), «Отменить последнее
      действие» (AC-7) → затем `stage-actions.tsx` (FR-12..FR-14).
- [ ] T12. **экран и роут (red→green)** —
      `widgets/stage-page/stage-page-screen.test.tsx`: `PageHeader` с
      крошкой/названием/статусом/сводкой/фиксацией и «← Схема номинации»,
      отсутствие «← Все этапы» (AC-1), тело по типу этапа (AC-3), скелетон
      и ошибка с повтором (AC-15), инвалидация снапшота после формирования/
      сброса/фиксации → затем `stage-page-screen.tsx` и
      `app/(admin)/admin/nominations/[id]/stages/[stageId]/page.tsx`
      (server component: `notFound()`, initial-данные, один виджет; уходят
      `AdminHeader`, «← Все этапы», узкая колонка — FR-2/FR-10, NFR-2).

## Проверка (волна 3)

- [ ] T13. **Границы слоёв (AC-16)** — грепом убедиться, что ни один файл
      `features/**` не импортирует другую фичу, а композиция страницы живёт
      в `widgets/stage-page/**`.
- [ ] T14. `make test-web` зелёный (в т.ч. переписанные тесты 0030/0018).
- [ ] T15. `pnpm exec tsc --noEmit` — обязателен: `executionStatus` меняет
      форму protobuf-моков во всех тестах со `Stage` (T1).
- [ ] T16. `pnpm build` + ручной смоук на реальном BFF: групповой этап и
      этап-сетка, формирование по правилу, сброс, undo, переход по рельсу
      между этапами, обе темы, ширина < 1024px (FR-11).
- [ ] T17. Обновить статус спеки/плана, строку в `docs/specs/README.md` и
      строку «Страница этапа» в `docs/design-sync.md` (repo-пути виджета,
      как это сделали 0030/0031).
