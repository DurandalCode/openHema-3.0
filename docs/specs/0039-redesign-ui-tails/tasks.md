# Tasks: Хвосты редизайна и сквозные клиентские паттерны

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-24
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

Контрактов и серверных задач нет: инкремент чисто клиентский (NFR-1), волна 0
отсутствует.

## Треки и параллельность

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 1 | A «Афиша» | T1–T4 | `entities/tournament/{lib/format,ui/tournament-hero,ui/regulations-link}`, `widgets/tournament-about/*`, `widgets/home/home-screen.tsx` | — |
| 1 | D «Сеть/401» | T5–T9 | `shared/api/*`, `features/*/api/*`, ветки ошибок в `widgets/*` списков | — |
| 1 | E «Клавиатурный посев» | T10–T12 | `features/nomination-pools/ui/*`, `features/bracket-seeding/ui/*` | — |
| 2 | F «Каркас страницы» | T13–T20 | `shared/lib/public-nav-items*`, `shared/config/site-config*`, `entities/tournament-live/model/*`, `entities/tournament/model/get-active-tournament.ts`, `widgets/navbar/*`, `shared/lib/unsaved-guard*`, `widgets/unsaved-guard/*`, `app/layout.tsx`, `features/tournament-settings/ui/tournament-screen.tsx`, `widgets/nomination-schema/stage-inspector.tsx` | треки A/D/E смержены |
| 3 | join | T21–T24 | проверка целиком, индекс спек | трек F смержен |

Треки D и E оба заходят в `features/nomination-pools` и
`features/bracket-seeding`, но в **разные файлы** (`api/requests.ts` против
`ui/*.tsx`) — дизъюнктность по файлам соблюдена. Блоки B и C сведены в один
трек F, потому что оба монтируются в `app/layout.tsx`.

## Трек A — факты турнира в афише (FR-1..FR-5)

- [ ] T1. **`entities/tournament/lib/format.ts` (red→green)** — тест
      `venueLine`: название + адрес, только название, только адрес, ничего
      → затем реализация. Рефактор: `widgets/tournament-about/about-facts.tsx`
      переходит на хелпер вместо инлайновой склейки.
- [ ] T2. **`entities/tournament/ui/regulations-link.tsx`** — переезд из
      `widgets/tournament-about/about-regulations.tsx` вместе с тестом
      (разметка и текст без изменений); `tournament-about-screen.tsx`
      импортирует из `entities`; старые файл и тест удаляются.
- [ ] T3. **`entities/tournament/ui/tournament-hero.tsx` (red→green)** —
      тесты: место, взнос, число площадок, ссылка регламента показаны;
      каждое поле по отдельности скрыто при пустом значении (AC-1, AC-2);
      `arenasCount` не передан → счётчика нет → затем разметка фактов.
- [ ] T4. **`widgets/home/home-screen.tsx` (red→green)** — тест: в фазе
      `before` в афишу уходит число площадок из снапшота (AC-3) → затем
      проп.

## Трек D — сквозной перехват «неаутентифицирован» (FR-17..FR-20)

- [ ] T5. **`shared/api/api-fetch.ts` (red→green)** — тесты: 401 бросает
      `UnauthorizedError` (в т.ч. при не-JSON теле), сетевой сбой возвращает
      `{ ok:false }`, успех разбирается, ошибка сервера отдаёт текст → затем
      реализация. **Ключевое**: бросок 401 — вне сетевого `try`.
- [ ] T6. **Перевод админских срезов (red→green по одному)** —
      `features/admin/api/requests.ts`, `application-review`,
      `fighter-management`, `nomination-management`, `arena-management`,
      `format-presets`, `tournament-settings`. На каждый — тест «на 401
      бросается `UnauthorizedError`», затем перевод на `apiFetch`.
- [ ] T7. **Перевод срезов площадки и посева** — `arena-journal`,
      `arena-timer/api/use-arena-timer.ts`, `bout-board`, `pool-seating`,
      `nomination-pools`, `bracket-seeding`, `stage-build`,
      `stage-management`, `my-applications/api/requests.ts`. Тот же цикл.
      _(`features/profile/api/requests.ts` уже на `ensureAuthorized` —
      только сверить, что поведение совпало.)_
- [ ] T8. **Экраны перестают рисовать свою ошибку на 401 (red→green)** —
      тесты «при `UnauthorizedError` собственный блок ошибки не рендерится»
      для экранов бойцов, номинаций, схемы, посева групп и сетки, пресетов,
      заявок админа, журнала и панели площадки (AC-12) → затем ветка
      `error instanceof UnauthorizedError → null` по образцу 0038.
- [ ] T9. **`shared/api/no-direct-fetch.test.ts`** — страж NFR-5: прямой
      `fetch(` в `features/*/api/**` запрещён, allowlist —
      `features/auth/api/requests.ts` и живые хуки `tournament-live`,
      `nomination-live`, `arena-live` (FR-19, FR-20). Тест пишется
      **последним в треке**: до перевода он красный по всем файлам разом и
      не даёт вести цикл по одному срезу.

## Трек E — клавиатурный путь в посеве (FR-21..FR-25)

- [ ] T10. **`features/nomination-pools/ui/nomination-pools.tsx`
      (red→green)** — тесты: меню «Переместить» на карточке бойца зовёт
      `assign` с тем же `poolId`, что и drop; «В нераспределённые» зовёт
      `unassign`; в `readOnly` меню недоступно; кнопка меню имеет `aria-label`
      с именем бойца (AC-14, FR-23) → затем меню.
- [ ] T11. **`features/bracket-seeding/ui/bracket-seeding.tsx` (red→green)**
      — тесты: постановка в слот и снятие со слота через меню (AC-15) →
      затем меню.
- [ ] T12. **Объявление результата (red→green)** — тест: успешный перенос
      показывает тост с именем бойца и местом назначения (AC-14, FR-24) →
      затем `toastSuccess`. Проверить, что перетаскивание мышью не
      изменилось (AC-16) — существующие тесты обоих файлов должны остаться
      зелёными без правок.

## Трек F — каркас страницы: навигация и guard (FR-6..FR-16)

### Навигация

- [ ] T13. **`shared/lib/public-nav-items.ts` (red→green)** — тесты состава
      по трём фазам × (гость / вошедший) из таблицы `plan.md`; отдельным
      кейсом — в `running` нет пунктов на `#tournament` и `#nominations`
      (AC-4) → затем чистая функция.
- [ ] T14. **`shared/config/site-config.test.ts` (red→green)** — расширить:
      якоря пунктов каждой фазы должны входить в множество секций, которые
      главная рендерит **в этой фазе**; списки секций по фазам — рядом с
      тестом → затем правки `site-config.ts`, если понадобятся.
- [ ] T15. **`entities/tournament-live/model/get-public-phase.ts`
      (red→green)** — тест: склейка «нет турнира → `before`», «есть running
      номинация → `running`», ошибка gRPC → `before` → затем реализация
      поверх `tournamentPhase`. Тем же шагом — `cache()` на
      `get-active-tournament.ts` и `get-tournament-live.ts` (NFR-3).
- [ ] T16. **`widgets/navbar/nav-links.tsx` + `navbar.tsx` (red→green)** —
      тест: `NavLinks` рендерит переданные пункты и подсвечивает активный;
      навбар отдаёт в него результат `publicNavItems` для текущей фазы →
      затем проп вместо чтения `siteConfig`.
- [ ] T17. **`widgets/navbar/mobile-nav.tsx` (red→green)** — тесты: те же
      пункты, что у широкого меню; активный помечен `aria-current` (AC-7);
      в `/admin/**` не рендерится (AC-8) → затем нижняя панель.
- [ ] T18. **`app/layout.tsx`** — монтаж `MobileNav` внутри
      `NavbarVisibilityGate`, нижний отступ `main` на узком экране, позиция
      `Toaster` над панелью.

### Guard несохранённых изменений

- [ ] T19. **`shared/lib/unsaved-guard-store.ts` +
      `use-unsaved-guard.ts` (red→green)** — тесты: признак ставится и
      снимается, `beforeunload` вешается и снимается при размонтировании →
      затем стор и хук (по образцу `session-expired-store`).
- [ ] T20. **`widgets/unsaved-guard/unsaved-guard-dialog.tsx` (red→green)**
      — тесты: клик по внутренней ссылке при dirty открывает подтверждение и
      не уходит (AC-9); подтверждение зовёт `router.push` и снимает признак;
      чистое состояние — переход обычный (AC-10); внешняя ссылка,
      `target="_blank"`, клик с модификатором и `data-unsaved-guard="ignore"`
      не перехватываются → затем диалог и монтаж в `app/layout.tsx`.
      Тем же шагом — подключение хука в
      `features/tournament-settings/ui/tournament-screen.tsx` (dirty =
      непустой `tournamentDraftChanges`, тест на снятие признака после
      сохранения) и в `widgets/nomination-schema/stage-inspector.tsx`.

## Проверка (join-волна)

- [ ] T21. `make test-web` зелёный; `pnpm exec tsc --noEmit` без ошибок.
- [ ] T22. `pnpm build` проходит; `make test` (сервер) не запускался зря —
      `/server` не менялся, изменения только в `web/` и `docs/`.
- [ ] T23. Ручная проверка того, что тесты не ловят: нижняя панель на узком
      экране не перекрывает контент и тосты; в обеих темах; на `/admin/**`
      её нет; в день турнира (фаза `running`) пункты меню ведут к реально
      отрисованным секциям.
- [ ] T24. Обновить статусы `spec.md`/`plan.md`/`tasks.md` на `done` и
      строку 0039 в `docs/specs/README.md` (со «резерв» на «done»).
