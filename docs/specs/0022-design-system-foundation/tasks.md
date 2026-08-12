# Tasks: Дизайн-система — токены и базовые UI-примитивы

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009).

- Статус: done
- Дата: 2026-08-12
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи, где применимо: сначала
падающий тест (red), затем минимальный код (green), затем рефактор при
зелёных тестах. Часть задач — чисто визуальный рестайлинг существующих
shadcn-компонентов без новой логики (сейчас в `shared/ui` тестов нет вообще
— подтверждено при разведке `plan.md`) — для них TDD-шаг неприменим
(ADR 0003: скриншот-тесты не заводим), отмечено явно.

## Треки и параллельность

Все примитивы — дизъюнктные файлы, зависят только от токенов (волна 0).
Можно вести последовательно одним агентом или параллельно (отдельные
worktree, см. `tdd-cycle`) — на усмотрение исполнителя.

| Волна | Трек | Задачи | Файлы | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0 | — | T1, T2 | `globals.css`, `layout.tsx` | — |
| 1 | A | T3 | `input.tsx`, `label.tsx`, `select.tsx` + тесты | волна 0 |
| 1 | B | T4 | `dialog.tsx` + тест | волна 0 |
| 1 | C | T5, T6, T7 | `button.tsx`, `badge.tsx` (+тест), `tag.tsx` | волна 0 |
| 1 | D | T8, T9, T10, T11 | `filter-chip.tsx`, `tabs.tsx`, `card.tsx`, `empty-state.tsx` | волна 0 |
| 1 | E | T12, T13 | `table-head.tsx`, `table-row.tsx` (+тест) | волна 0 |
| 1 | F | T14 | `shared/ui/app-shell.tsx`, `widgets/admin-shell/*`, `(admin)/admin/layout.tsx`, удаление `admin-nav.tsx`(+тест) | волна 0 |
| 2 | join | T15–T18 | verification, `docs/specs/README.md` | все треки волны 1 смержены |

## Web

- [x] T1. **Токены** — `web/src/app/globals.css`: перекрасить существующие
      shadcn-переменные под новую палитру (полный ребрендинг, `plan.md`
      таблица токенов) — `--background`/`--card`/`--popover` (3 уровня
      поверхности через новую `--surface-raised`), `--foreground`/
      `--muted-foreground`/новую `--caption-foreground`, `--primary` (design
      `--accent`, красный — **не** shadcn `--accent`), `--destructive`,
      новые `--success`/`--info`/`--warning`, `--border`/`--input`;
      пересчитать нейтральный `--accent`/`--accent-foreground` (hover-подложка,
      НЕ бренд) под новую палитру. Заменить derived-цепочку радиусов на
      прямые `--radius-sm/md/lg/xl` (6/8/12/16px). Добавить
      `--control-h-sm/md/lg`, `--row-h`, `--topbar-h`, `--header-h`.
      `--gold`/`--gold-foreground`, `--sidebar-*` — не трогать. Светлая тема
      — сверить точные hex по `Дизайн-система.dc.html` (разведка не
      зафиксировала подетально, см. `plan.md` «Риски»). Не TDD-шаг
      (CSS-переменные, проверка — визуально `pnpm dev` в обеих темах).
- [x] T2. **Шрифты** — подключить `next/font/google` (Archivo + JetBrains
      Mono) в `web/src/app/layout.tsx`, прокинуть как `--font-sans`/
      `--font-mono` в `@theme inline` (`globals.css`), применить через
      существующие классы `font-sans`/`font-mono` (без правок разметки
      компонентов). Не TDD-шаг. Проверка: `pnpm build` проходит,
      визуально шрифт применился.
- [x] T3. **Field (red→green)** — `shared/ui/input.test.tsx` (и/или
      `select.test.tsx`): контролируемый ввод текста/выбор значения реально
      меняет `value` и вызывает `onChange` (AC-2) → затем стилизация
      `input.tsx`/`label.tsx`/`select.tsx` под новые токены (высоты
      `--control-h-*`, состояние `invalid`/`hint`). **Не транскрипция мока**
      — `UiField` в дизайне нефункционален (см. `plan.md`).
- [x] T4. **Modal (red→green)** — `shared/ui/dialog.test.tsx`: закрытие по
      Escape и клику вне области, фокус не покидает диалог, пока открыт
      (AC-3) → рестайл `dialog.tsx` под новые токены/радиусы/`--surface-raised`
      поверх существующего Radix `Dialog` (focus-trap/ESC/ARIA уже есть, не
      переписывать с нуля).
- [x] T5. **Button** — рестайл `button.tsx`: новый вариант `success`,
      размеры под `--control-h-sm/md/lg`. Визуальный рестайлинг, не TDD-шаг.
- [x] T6. **Badge (red→green)** — `shared/ui/badge.test.tsx`: маппинг
      `tone` (`live`/`success`/`info`/`warn`/`danger`/`neutral`) на visual
      variant, `live` даёт pulse-класс → реализация в `badge.tsx`. Есть
      настоящая логика маппинга (не чистая вёрстка) — оправдывает тест.
- [x] T7. **Tag** — новый `shared/ui/tag.tsx`: `label`, `tone` (5 цветов),
      `muted`. Переиспользует паттерн маппинга из T6, отдельного теста не
      заводим (чисто визуальный, без ветвления сверх tone→класс).
- [x] T8. **FilterChip** — новый `shared/ui/filter-chip.tsx`: `label`,
      `count`, `tone` (`idle`/`active`/`success`/`muted`), опциональный
      dropdown-слот. Визуальный, не TDD-шаг.
- [x] T9. **Tabs** — рестайл `tabs.tsx` под новые токены. Reál
      content-switching уже даёт Radix `Tabs` (мок в дизайне декоративен) —
      поведение не меняется, только визуал. Не TDD-шаг.
- [x] T10. **Card** — рестайл `card.tsx`: добавить stat-tile вариант
      (`eyebrow`/`title`/`meta`/`value`/`accent`/`dense`/`raised`). Визуальный,
      не TDD-шаг.
- [x] T11. **EmptyState** — новый `shared/ui/empty-state.tsx`: `eyebrow`,
      `title`, `hint`, `children`. Визуальный, не TDD-шаг.
- [x] T12. **TableHead** — новый `shared/ui/table-head.tsx`: `cols:
      {label,width,align}[]`. Визуальный, не TDD-шаг (в репо нет
      Table-примитива вообще — это его первое появление, но логики
      сверх рендера колонок нет).
- [x] T13. **TableRow (red→green)** — `shared/ui/table-row.test.tsx`:
      рендер `cells: {text,sub,width,mono,tone,tags,strike}[]` — тег
      `strike` даёт зачёркнутый текст, `tone` красит cell, `state`
      (`hover`/`selected`) переключает подсветку строки → `table-row.tsx`.
      Условная логика по пропам — оправдывает тест.
- [x] T14. **AppShell (red→green)** — `widgets/admin-shell/admin-shell.test.tsx`
      (перенос и расширение текущего `admin-nav.test.tsx`): рендерит только
      реальные пункты навигации (`Пользователи`/`Турнир`/`Номинации`/
      `Форматы`/`Площадки`/`Заявки`/`Бойцы`/`+ Создать админа`, **без**
      «Пульт» — фантомный пункт дефолта дизайна), активный пункт подсвечен
      по `pathname` (AC-4) → реализация: `shared/ui/app-shell.tsx`
      (презентационная оболочка: шапка, нав-строка, слоты `crumb`/`title`/
      `status`/`meta`/`action`/`secondary` как пропы, пока не заполняются)
      + `widgets/admin-shell/admin-shell.tsx` (server component: реальные
      пункты навигации + переиспользованный `UserMenu`). Заменить `AdminNav`
      в `src/app/(admin)/admin/layout.tsx` на новый widget, удалить
      `admin-nav.tsx`/`admin-nav.test.tsx` (логика перенесена).

## Проверка

- [x] T15. **Регрессия существующих потребителей (AC-5)** — прогнать/
      проверить тесты `Navbar`/`AuthDialog` (если есть) без правок в них
      самих; ручной смоук страниц, использующих `Button`/`Badge`/`Dialog`/
      `Tabs`/`Card` вне админки (лендинг, диалог входа) — не сломались
      визуально/функционально после рестайлинга примитивов.
- [x] T16. `pnpm test` (весь `web`) зелёный.
- [x] T17. `pnpm exec tsc --noEmit` — обязательно (сигнатуры `shared/ui`
      компонентов меняются: новые варианты/пропы).
- [x] T18. `pnpm build` проходит; ручная визуальная сверка обеих тем
      (`pnpm dev`) с галереей «Дизайн-система.dc.html» — компенсирует
      отсутствие скриншот-тестов (ADR 0003).
- [x] T19. Обновить статусы `spec.md`/`plan.md`/`tasks.md` на `done`,
      строку `0022` в `docs/specs/README.md` — `draft`/`ready` → `done`.
</content>
