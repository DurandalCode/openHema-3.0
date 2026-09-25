# Tasks: Граф боёв плейоффа

- Статус: in progress
- Дата: 2026-09-25
- План: `./plan.md`

## Порядок

Реализация согласована и ведётся одним исполнителем в отдельном worktree;
каждая задача — red → green → refactor. Новых proto/server шагов нет.

## Web

- [x] T1. `entities/bracket/lib/graph-layout.test.ts` → `graph-layout.ts`:
  4/8/16/32, глобальные индексы через половины, стабильные ключи,
  winner/loser-связи, бронза выключена/включена, геометрия с разными
  размерами карточек. AC-1/2/4; спортивное разрешение не дублировать.
- [x] T2. `entities/bracket/ui/bracket-graph.test.tsx` → renderer:
  DOM-карточки/линии по модели T1, состояния слотов, имена/счёт/исходы,
  статусы/арены половин, чемпионы и доступные описания связей. AC-3/4.
- [x] T3. Там же тесты навигации, rerender и ResizeObserver → измерение,
  прокрутка внутри контейнера и переход к кругу, сохранение позиции на
  изменениях результатов, сброс при смене этапа. AC-5/6.
- [x] T4. Регрессионные тесты `widgets/bracket-view/bracket-view.test.tsx`,
  `features/bracket-seeding/ui/bracket-seeding.test.tsx` → общий renderer
  и корректные FSD-импорты. Проверить draft/ready/live и read-only public;
  не менять поведение управляющих действий. AC-7.

## Проверка

- [x] T5. Регрессии `widgets/nomination-public/stage-section.test.tsx`,
  `widgets/stage-page/stage-page-screen*.test.tsx`, `use-bracket-live-sync`;
  браузерная проверка AC-1..7 на 360/390/768/1280 px и масштабе 200%,
  темы, длинные имена, клавиатура. Записать результат/ограничения приёмки.
- [x] T6. `make test-all`, `cd web && pnpm exec tsc --noEmit`, `pnpm lint`,
  `pnpm build`; `cd server && go build ./...`. Не закрывать визуальные AC
  только по зелёному Vitest.
- [ ] T7. Координатор после интеграции обновляет spec/plan/tasks и индекс
  `docs/specs/README.md`, отмечает M11 в аудите; исполнитель отдаёт commit,
  результаты проверок и остатки, не меняет общий индекс параллельно.

## Треки и параллельность

T1→T2→T3→T4→T5→T6→T7 последовательны внутри одного трека. Внешняя параллель:
arena/timer, fighter и backend 0054. С другими правками `bracket-seeding.tsx`
пересечение только в T4: сначала мерж одного владельца, затем интеграция второго.
Не дробить один renderer между чатами, правящими общие файлы.
