# Tasks: Общие паттерны состояний и обратной связи

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-12
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

Контрактов (proto) и server-части нет — фича чисто web-слоя (NFR-2), поэтому
обычный раздел «Server» отсутствует, а волна 0 — зависимости и токены вместо
`make generate`.

## Треки и параллельность

Три куска волны 1 не пересекаются по файлам: примитивы живут в
`shared/{ui,lib,hooks}`, обратная связь — в своих трёх файлах плюс
`web/AGENTS.md`, состояния маршрутов — в `app/**`. Пересечение начинается
только на wiring — он вынесен в join-волну.

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0 | — | T1–T2 | `web/package.json`, `pnpm-lock.yaml`, `app/globals.css` | — |
| 1 | A · примитивы | T3–T11 | `shared/ui/{pagination,breadcrumbs,tooltip,datetime-field,skeletons,app-shell}.tsx`, `shared/lib/{paginate,datetime}.ts`, `shared/hooks/use-pagination.ts` | волна 0 |
| 1 | B · обратная связь | T12–T15 | `shared/ui/{sonner,confirm-dialog}.tsx`, `shared/lib/toast.ts`, `web/AGENTS.md` | волна 0 (нужен `sonner`) |
| 1 | C · состояния маршрутов | T16–T19 | `shared/ui/status-page.tsx`, `app/not-found.tsx`, `app/error.tsx`, сегментные `not-found.tsx`, `app/(admin)/layout.tsx` | волна 0 |
| 2 | join | T20–T24 | `app/layout.tsx` + файлы фич (нужны примитивы A и обёртки B) | треки A, B, C смержены |
| 3 | — | T25–T29 | проверка и статусы | волна 2 |

После мержа трека в рабочую ветку — сразу `git worktree remove` и
`git branch -d` за собой (корневой `AGENTS.md`).

## Волна 0 — зависимости и токены

- [ ] T1. **Зависимости** — `pnpm add sonner react-day-picker` в `/web`;
      убедиться, что `pnpm build` и `pnpm test` проходят на пустом изменении
      кода. _(не TDD-шаг, но идёт первым: трек B без `sonner` не стартует.)_
- [ ] T2. **Токены фокуса и движения** — `app/globals.css`: `--ring` →
      `#8fb0f0` в обеих темах, `--focus-ring-w`/`--focus-ring-offset`,
      `--motion-fast`/`--motion-base`/`--motion-slow`, `--ease-standard`
      (+ проброс `--ease-*` в `@theme inline`); базовый слой переводится с
      `outline-ring/50` на непрозрачное кольцо по токенам.
      _Юнит-теста на CSS-переменные нет осознанно (ADR 0003 — без
      скриншот-тестов); критерий — зелёные существующие тесты и ручной смоук
      обеих тем в T28._

## Волна 1, трек A — примитивы

- [ ] T3. **paginate (red→green)** — `shared/lib/paginate.test.ts`: окно без
      многоточий, с одним, с двумя, границы, `pageCount ≤ 1` → затем
      `shared/lib/paginate.ts`.
- [ ] T4. **use-pagination (red→green)** — `shared/hooks/use-pagination.test.ts`:
      размер страницы, неполная последняя, сброс страницы при сжатии списка →
      затем `shared/hooks/use-pagination.ts`.
- [ ] T5. **Pagination (red→green)** — `shared/ui/pagination.test.tsx`:
      `aria-current` на текущей, «назад» недоступна на первой, клик вызывает
      `onPageChange` (AC-10) → затем `shared/ui/pagination.tsx`.
- [ ] T6. **Breadcrumbs (red→green)** — `shared/ui/breadcrumbs.test.tsx`:
      последний элемент — не ссылка и с `aria-current="page"`, остальные —
      ссылки (FR-11) → затем `shared/ui/breadcrumbs.tsx`.
- [ ] T7. **AppShell.crumb** — `shared/ui/app-shell.tsx`: тип `crumb` с
      `string` до `React.ReactNode` (иначе крошки не встают в слот 0022);
      существующие тесты `admin-shell` остаются зелёными без правок.
- [ ] T8. **Tooltip (red→green)** — `shared/ui/tooltip.test.tsx`: подсказка
      раскрывается по фокусу с клавиатуры, без мыши (AC-9) → затем
      `shared/ui/tooltip.tsx` поверх Radix `Tooltip` (зависимость уже стоит).
- [ ] T9. **datetime (red→green)** — `shared/lib/datetime.test.ts`: ISO ↔
      значение поля round-trip, пустое и невалидное → затем
      `shared/lib/datetime.ts` (сюда переезжает `toLocalInput` из формы
      турнира; сам перенос вызова — T23).
- [ ] T10. **DateTimeField (red→green)** — `shared/ui/datetime-field.test.tsx`:
      контролируемое значение отображается, выбор даты вызывает `onChange` с
      ISO (AC-12) → затем `shared/ui/datetime-field.tsx` (Radix `Popover` +
      `react-day-picker`). При перерасходе на стилизацию/локаль — запасной
      вариант из «Рисков» плана, публичный API не меняется.
- [ ] T11. **Скелетоны (red→green)** — `shared/ui/skeletons.test.tsx`:
      `SkeletonRows` рисует заданное число строк/колонок, `SkeletonCards` —
      заданное число карточек (FR-1) → затем `shared/ui/skeletons.tsx`.

## Волна 1, трек B — обратная связь

- [ ] T12. **toast-обёртка (red→green)** — `shared/lib/toast.test.ts` (мок
      `sonner`): четыре случая вызывают библиотеку нужным типом,
      «Отменить»/«Повторить» доходят как действие (FR-6) → затем
      `shared/lib/toast.ts`.
- [ ] T13. **Toaster (red→green)** — `shared/ui/sonner.test.tsx`: тема берётся
      из `next-themes`, а не определяется компонентом самостоятельно (NFR-1)
      → затем `shared/ui/sonner.tsx`.
- [ ] T14. **ConfirmDialog (red→green)** — `shared/ui/confirm-dialog.test.tsx`:
      без `confirmWord` подтверждение активно сразу; с `confirmWord` —
      заблокировано до точного совпадения ввода; отмена не вызывает
      `onConfirm` (AC-7, AC-8) → затем `shared/ui/confirm-dialog.tsx` поверх
      `dialog.tsx` (0022).
- [ ] T15. **Правило каналов** — `web/AGENTS.md`: новый раздел «Обратная связь
      и состояния экрана» с правилом FR-5 (тост — успех и отменяемое;
      инлайн-ошибка — валидация; модалка — только необратимое) и указанием,
      что вход к тостам — только через `shared/lib/toast.ts`.

## Волна 1, трек C — состояния маршрутов

- [ ] T16. **StatusPage (red→green)** — `shared/ui/status-page.test.tsx`: код,
      заголовок, описание и действия отрисованы → затем
      `shared/ui/status-page.tsx`.
- [ ] T17. **Страницы «не найдено»** — `app/not-found.tsx` (общая) плюс
      сегментные: `app/(admin)/admin/arenas/[id]/not-found.tsx`,
      `app/nominations/[id]/not-found.tsx`,
      `app/(admin)/admin/nominations/[id]/stages/[stageId]/not-found.tsx`
      (AC-2). Тексты — под реальные сущности, переход как минимум один.
- [ ] T18. **Страница ошибки (red→green)** — `app/error.test.tsx`: кнопка
      повтора вызывает `reset`, идентификатор ошибки показан, **и в тексте
      нет обещания идемпотентности** (явный ассерт — AC-5, NFR-4) → затем
      `app/error.tsx` (клиентский компонент). Решить по `global-error.tsx`
      (см. «Риски» плана) и зафиксировать решение в плане.
- [ ] T19. **403 вместо молчаливого редиректа (red→green)** —
      `app/(admin)/layout.test.tsx`: гость → `redirect("/login")`; не-админ →
      отрисован 403 и `redirect` не вызван; админ → дети отрисованы
      (AC-3, AC-4) → затем правка `app/(admin)/layout.tsx`. Названия ролей —
      из RBAC (ADR 0007), а не из текста макета.

## Волна 2 — join (wiring)

- [ ] T20. **Toaster в приложении** — `app/layout.tsx`: `<Toaster/>` рядом с
      `AuthDialog`, внутри `ThemeProvider`.
- [ ] T21. **Раскладка пулов** — `features/nomination-pools/ui/nomination-pools.tsx`:
      `window.confirm` → `ConfirmDialog` (без `confirmWord` — действие
      покрыто undo, FR-8); успех → `toastUndo`, ошибка → `toastError`.
      Существующий тест фичи обновить под новое взаимодействие.
- [ ] T22. **Посев сетки** — `features/bracket-seeding/ui/bracket-seeding.tsx`:
      то же для сброса посева. `bracket-seeding.test.tsx` сейчас стабит
      `window.confirm` (`vi.spyOn`) — переписать на взаимодействие с
      `ConfirmDialog` (ожидаемое изменение теста, не поломка).
- [ ] T23. **Даты турнира** — `features/tournament-settings/ui/tournament-settings-form.tsx`:
      два `<Input type="datetime-local">` → `DateTimeField`; локальный
      `toLocalInput` удаляется в пользу `shared/lib/datetime.ts` (AC-12).
- [ ] T24. **Скелетоны вместо текущих веток загрузки** — заменить существующие
      ветки в `features/admin/ui/admin-list.tsx` (локальный `RowsSkeleton` →
      общий), `fighter-management/ui/fighter-roster.tsx` («Загрузка…»),
      `my-applications/ui/my-applications-list.tsx`,
      `nomination-management/ui/nomination-management.tsx`,
      `pool-seating/ui/pool-seating.tsx`,
      `bracket-seeding/ui/bracket-seeding.tsx`,
      `stage-management/ui/stage-management.tsx`,
      `format-presets/ui/preset-library.tsx` (AC-1). **Новых** веток загрузки
      не добавлять — это уже спеки 0024+.

## Проверка

- [ ] T25. `make test-all` зелёный.
- [ ] T26. `pnpm exec tsc --noEmit` (менялась сигнатура `AppShell.crumb`,
      появились новые пропы примитивов).
- [ ] T27. `pnpm build` проходит с новыми зависимостями; `pnpm-lock.yaml`
      закоммичен.
- [ ] T28. **Ручной смоук в обеих темах** (`pnpm dev`): кольцо фокуса на
      брендовой кнопке (AC-11), тост с «Отменить», диалог подтверждения,
      404 на несуществующей арене, 403 под не-админом, календарь в датах
      турнира, скелетоны при медленной сети. Смена `--ring` затрагивает все
      экраны 0022 — смотреть не один экран.
- [ ] T29. Обновить статусы `spec.md`/`plan.md`/`tasks.md` и строку в
      `docs/specs/README.md`; при расхождениях с картой — поправить
      `docs/design-sync.md` (раздел «Как поддерживать в актуальном
      состоянии»).
