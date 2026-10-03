# Tasks: Вкладки «Бои / Рейтинг» в карточке группы

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: done
- Дата: 2026-10-03
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

Треков нет: T3 и T4 зависят от общего компонента T2, сама работа небольшая —
выполняется последовательно одним исполнителем.

## Контракты / Server

Не меняются (plan: «Контракты», «Server»).

## Web

- [x] T1. **lib (red→green)** — `entities/pool/lib/pool-tab.test.ts`: таблица
      всех `PoolStatus` → `"bouts"` только для `ACTIVE`, иначе `"standings"`
      → затем `entities/pool/lib/pool-tab.ts` (`PoolTab`, `defaultPoolTab`).
- [x] T2. **entities/ui (red→green)** —
      `entities/pool/ui/pool-results-tabs.test.tsx`: AC-1/2 (ACTIVE → «Бои»,
      переключение), AC-3 (READY без итогов → список бойцов + «Итогов пока
      нет», без мест), AC-5 (FINISHED → таблица), AC-6 (rerender по статусам
      без клика → вкладка следует), AC-4/AC-7 (ручной выбор переживает смену
      статуса и новые standings), роли/`aria-selected` → затем
      `entities/pool/ui/pool-results-tabs.tsx` на `shared/ui/tabs`, `BoutRow`,
      `PoolStandingsTable`.
- [x] T3. **admin (red→green)** —
      `features/nomination-pools/ui/nomination-pools.test.tsx`: readOnly + живые
      бои → вкладки, отдельного состава нет, статус берётся из живого пула;
      черновик → DnD-зона и меню без вкладок (AC-8); обновить проверки 0051
      под вкладки → затем `nomination-pools.tsx`: `PoolColumn` + проброс
      `status`, удалить ненужный `BoutList`.
- [x] T4. **public (red→green)** — `widgets/nomination-public/pool-card.test.tsx`:
      с боями → вкладки без «Состав»; без боёв → «Состав» без вкладок;
      адаптировать существующие кейсы 0035 → затем `pool-card.tsx` + JSDoc.
- [x] T5. **refactor** — убрать дубли рендера бойца/боёв, если остались;
      проверить, что `entities` не импортирует `features`/`widgets`.

## Проверка

- [x] T6. `make test-web` зелёный; `pnpm exec tsc --noEmit`; `pnpm lint`.
- [x] T7. `pnpm build`.
- [x] T8. Ручная приёмка: AC-9 (360/390 px, клавиатура, тёмная тема),
      AC-10 (Network при переключениях), живой бой на двух клиентах
      admin + public: старт группы → «Бои», завершение → «Рейтинг»,
      ручной выбор не сбрасывается; обрыв канала (SF-QA-05).
- [x] T9. Обновить статусы spec/plan/tasks, индекс `docs/specs/README.md`;
      отметить S-GROUPS/D-UX (вкладки) в пакете
      `docs/implementation/2026-09-feedback/` (decisions, small-fixes SF-03 →
      ссылка на 0061).
