# Tasks: Редизайн публичной страницы номинации — схема, группы, плейофф

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-22
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

Контрактов и сервера в этом инкременте нет (`plan.md` → «Контракты»,
«Server»): волна 0 отсутствует, работа начинается сразу с web.

## Треки и параллельность

Два дизъюнктных по файлам куска: «схема и шапка» и «бои: группы и сетка».
Пересечений внутри волны нет; всё, что их сшивает (секции этапов, композиция
экрана, страница, удаления), — join-волна.

| Волна | Трек | Задачи   | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | -------- | ------------------------------------ | ---------- |
| 1     | A    | T1–T4    | `entities/nomination-live/lib/position.*`, `entities/stage/lib/schema-chain.*`, `widgets/nomination-public/{nomination-header,schema-chain,stage-promise}.*` | — |
| 1     | B    | T5–T9    | `entities/pool/lib/types.*`, `entities/bracket/lib/types.*`, `widgets/bracket-view/bracket-view.*`, `widgets/nomination-public/{bout-row,pool-card}.*` | — |
| 2     | join | T10–T18  | `widgets/nomination-public/{stage-section,empty-layout,nomination-public-screen}.*`, `app/nominations/[id]/page.tsx`, удаления, проверка | треки A и B смержены |

## Трек A — схема и шапка

- [ ] T1. **entities (red→green)** — `entities/nomination-live/lib/position.test.ts`:
      номинация без этапов → `upcoming`; идущий бой в пуле → `running` с
      названием его этапа; все секции доиграны → `finished`. Затем
      `position.ts` (`nominationPosition`). FR-3/FR-4.
- [ ] T2. **entities (red→green)** — `entities/stage/lib/schema-chain.test.ts`:
      порядок уровней, два параллельных этапа одного уровня в одном
      элементе, `pending` с подписью ожидания источника, отсутствие правил
      посева и диагностики в выводе. Затем `schema-chain.ts`. FR-5/FR-6/FR-7/FR-9.
- [ ] T3. **widget (red→green)** — `widgets/nomination-public/nomination-header.test.tsx`:
      название/описание/ссылка на главную (AC-1), плашка закрытого приёма,
      отметка положения с подписью этапа (AC-2), пустое описание не
      рендерит пустой абзац. Затем `nomination-header.tsx`.
- [ ] T4. **widget (red→green)** — `widgets/nomination-public/schema-chain.test.tsx`
      (завершённый/идущий/пунктирный этап, AC-3/AC-4; пустой список этапов
      → ничего не рендерится, AC-5) и `stage-promise.test.tsx` (название,
      конфигурация, подпись «сформируется по результатам», AC-4). Затем
      `schema-chain.tsx` и `stage-promise.tsx`.

## Трек B — бои: группы и сетка

- [ ] T5. **entities (red→green)** — дополнить `entities/pool/lib/types.test.ts`:
      `boutScoreLabel` → `—:—` для не начатого боя, `A:B` для идущего и
      завершённого. Затем `boutScoreLabel` в `types.ts`. FR-13/AC-9.
- [ ] T6. **entities (red→green)** — дополнить `entities/bracket/lib/types.test.ts`:
      `bracketFinalRounds` на сетке с боем за 3-е место и без него, на
      незавершённой сетке. Затем функция в `types.ts`. FR-18.
- [ ] T7. **widget (red→green)** — `widgets/nomination-public/bout-row.test.tsx`:
      номер/пара/счёт/состояние, `—:—` у не начатого (AC-9), выделение
      текущего боя (AC-10), исход завершённого (AC-11). Затем `bout-row.tsx`.
- [ ] T8. **widget (red→green)** — `widgets/nomination-public/pool-card.test.tsx`:
      шапка со счётчиком, площадкой и статусом (AC-7), «площадка не
      назначена» (AC-8), разделы «Состав»/«Бои»/«Таблица», пустые разделы не
      рендерятся. Затем `pool-card.tsx`. FR-10..FR-12.
- [ ] T9. **widget (red→green)** — дополнить `widgets/bracket-view/bracket-view.test.tsx`:
      площадка на паре идущего боя (AC-12), выделенные блоки финала и боя за
      3-е место (AC-13), `—:—` у неначатой пары; существующие ожидания
      (источники слотов, чемпион, прокрутка) остаются зелёными. Затем правки
      `bracket-view.tsx`. FR-17/FR-18.

## Join-волна — композиция, страница, удаления

- [ ] T10. **widget (red→green)** — `widgets/nomination-public/empty-layout.test.tsx`:
      оформленное пустое состояние на `shared/ui/empty-state.tsx` (AC-6),
      без «Загрузка…». Затем `empty-layout.tsx`. FR-23/NFR-4.
- [ ] T11. **widget (red→green)** — `widgets/nomination-public/stage-section.test.tsx`:
      групповой этап → карточки групп под подписью этапа (FR-15), этап-сетка
      → `BracketView`, этап без данных → `stage-promise` (AC-4). Затем
      `stage-section.tsx`.
- [ ] T12. **widget (red→green)** — `widgets/nomination-public/nomination-public-screen.test.tsx`:
      порядок блоков (шапка → итоги → схема → секции этапов), итоги
      показываются только с доигранной секцией (AC-14, FR-22), черновая
      раскладка → `empty-layout` с сохранённой шапкой/схемой (AC-6), ровно
      одна подписка `useNominationLive` на экран (NFR-2, мок хука). Затем
      `nomination-public-screen.tsx`.
- [ ] T13. **страница** — `app/nominations/[id]/page.tsx` сужается до
      серверной обёртки: `getNomination` → `notFound()`, `getNominationLive`
      → `NominationPublicScreen`. Шапка уезжает из страницы (NFR-1/NFR-2).
- [ ] T14. **удаление** — `widgets/nomination-pools-public/` (компонент +
      тест): роль перешла к `widgets/nomination-public/`. Проверить, что
      сценарии его теста покрыты новыми тестами, и только потом удалять.
- [ ] T15. **удаление** — `widgets/nomination-schema/nomination-schema.tsx`
      + `nomination-schema.test.tsx` и тип `NominationSchemaMode`
      (`plan.md`, «Удаления»): потребителей не остаётся. Перед удалением —
      `grep` по `nomination-schema/nomination-schema` (ожидаем ноль
      импортов вне админского `nomination-schema-screen`).

## Проверка

- [ ] T16. `make test-all` зелёный; `pnpm exec tsc --noEmit`.
- [ ] T17. `pnpm build` (web) — сборка страницы без ошибок; глазами
      проверить обе темы и ширину 390px (NFR-3).
- [ ] T18. Обновить статус `spec.md`/`plan.md`/`tasks.md`, строку 0035 в
      `docs/specs/README.md` и строку «Публичная — номинация» в
      `docs/design-sync.md` (новый repo-путь `widgets/nomination-public/*`,
      судьба `widgets/nomination-schema/nomination-schema.tsx` — удалён).
