# Tasks: Редизайн публичной стороны заявок — подача и «Мои заявки»

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-22
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах. Серверных
задач нет — `/proto` и Go-модули не меняются (plan, NFR-1).

## Треки и параллельность

Волна 0 — общий фундамент (чистые функции, транспорт, BFF), от неё зависят
все три экранных куска. Волна 1 — три трека, не пересекающихся по файлам.
Волна 2 — проверка на собранном целом.

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0 | — | T1–T3 | `entities/application/lib/state.ts`, `features/my-applications/api/{requests,errors}.ts`, `app/api/applications/route.ts` | — |
| 1 | A (подача) | T4–T6 | `features/my-applications/ui/apply-application-form.tsx`, `widgets/application-apply/*`, `app/nominations/[id]/apply/page.tsx` | волна 0 |
| 1 | B (мои заявки) | T7–T9 | `features/my-applications/ui/application-card.tsx`, `widgets/my-applications/*`, `app/applications/page.tsx`, удаление `ui/my-applications-list.tsx` | волна 0 |
| 1 | C (точки входа) | T10–T12 | `features/my-applications/ui/nomination-apply-cta.tsx`, `widgets/nomination-public/nomination-public-screen.tsx`, `app/nominations/[id]/page.tsx`, `widgets/nominations-list/nominations-list.tsx`, удаление `ui/submit-application-button.tsx` | волна 0 |
| 2 | join | T13–T17 | проверка, смоук, документация | треки A, B, C смержены |

## Волна 0 — фундамент

- [x] T1. **entities (red→green)** — `entities/application/lib/state.test.ts`:
      `stateTone` на все пять состояний + `UNSPECIFIED`; `applicationFunnel`
      — четыре шага в порядке воронки, подписи совпадают со `stateLabel`
      (FR-4/FR-16) → затем `state.ts`.
- [x] T2. **транспорт + отказы (red→green)** —
      `features/my-applications/api/errors.test.ts` на
      `applicationErrorMessage(error, status)` (409 — текст BFF как есть,
      401/403, 404, сеть/прочее) → `api/errors.ts`; в `api/requests.ts`
      добавить `status` в ветку отказа (аддитивно, существующий
      `requests.test.ts` остаётся зелёным) — FR-6.
- [x] T3. **BFF (red→green)** — `app/api/applications/route.test.ts`: POST
      при `ConnectError` c `AlreadyExists` → 409 «Вы уже подали заявку в эту
      номинацию», `FailedPrecondition` → 409 «Приём заявок в эту номинацию
      завершён», `NotFound` → 404 «Номинация не найдена» → затем разбор
      кода в `route.ts` перед общим `errorResponse` (FR-6).

## Волна 1 · трек A — экран подачи (14a)

- [x] T4. **форма (red→green)** —
      `features/my-applications/ui/apply-application-form.test.tsx`: поля
      контролируемы, клуб подписан как необязательный; успех →
      `toastSuccess` + `router.push("/applications")`; отказ → `toastError`
      с текстом `applicationErrorMessage` и сохранёнными значениями полей
      (FR-3/FR-5/FR-6, AC-3/AC-6) → `apply-application-form.tsx`.
- [x] T5. **блок «Что дальше» (red→green)** —
      `widgets/application-apply/apply-what-next.test.tsx`: четыре шага
      воронки в порядке + правило отзыва до регистрации (FR-4) →
      `apply-what-next.tsx`.
- [x] T6. **экран + роут (red→green)** —
      `widgets/application-apply/apply-screen.test.tsx`: ветка формы, ветка
      «приём завершён» со ссылкой в номинацию, ветка «заявка уже подана» с
      состоянием и ссылкой на «Мои заявки», шапка со ссылкой «← <название>»
      и подписью «турнир · номинация» (FR-2/FR-7/FR-8, AC-1/AC-4/AC-5) →
      `apply-screen.tsx`; затем серверная обёртка
      `app/nominations/[id]/apply/page.tsx` (сессия → `redirect("/login")`,
      `getNomination` → `notFound()`, `getActiveTournament`) — FR-1/FR-9.

## Волна 1 · трек B — «Мои заявки» (15a)

- [ ] T7. **карточка (red→green)** —
      `features/my-applications/ui/application-card.test.tsx`: название
      номинации первым, тон плашки по `stateTone`, приглушение терминальной,
      `nextExpectedStep` только у нетерминальной, клуб/тег экипировки только
      при заданных значениях, действия по `allowedApplicantActions`, отзыв —
      только после `ConfirmDialog` с последствиями, «Я оплатил» — без
      диалога, тосты на успех/отказ (FR-15..FR-23, AC-8/AC-9/AC-10/AC-11)
      → `application-card.tsx`.
- [ ] T8. **экран (red→green)** —
      `widgets/my-applications/my-applications-screen.test.tsx`: скелетон
      при загрузке, ошибка загрузки с повтором, пустое состояние со ссылкой
      на номинации, названия из карты, карточка без названия при промахе
      (FR-24..FR-26, AC-7/AC-12/AC-13) → `my-applications-screen.tsx` +
      `my-applications-skeleton.tsx`.
- [ ] T9. **роут** — `app/applications/page.tsx` сужается до серверной
      обёртки (сессия, `getActiveTournament` + `getNominations` → карта
      названий, рендер экрана); удалить
      `features/my-applications/ui/my-applications-list.tsx` (NFR-2).

## Волна 1 · трек C — точки входа

- [ ] T10. **CTA (red→green)** —
      `features/my-applications/ui/nomination-apply-cta.test.tsx`: закрытый
      приём → подпись «Приём заявок завершён»; открытый без активной заявки
      → кнопка-ссылка на `/nominations/[id]/apply`; с активной заявкой →
      состояние + ссылка «Мои заявки» (FR-10..FR-12, AC-5) →
      `nomination-apply-cta.tsx`.
- [ ] T11. **страница номинации (red→green)** —
      `widgets/nomination-public/nomination-public-screen.test.tsx`: при
      `isAuthenticated=false` блок подачи не рендерится, при `true` —
      рендерится (FR-14, AC-2) → проп `isAuthenticated` в экране + проброс
      из `app/nominations/[id]/page.tsx` (`getCurrentUser`).
- [ ] T12. **карточка главной** — в
      `widgets/nominations-list/nominations-list.tsx` инлайн-форма
      заменяется кнопкой-ссылкой на экран подачи; удалить
      `features/my-applications/ui/submit-application-button.tsx` (FR-13).

## Волна 2 — проверка

- [ ] T13. `make test-web` зелёный (весь web, включая существующие тесты
      номинации/главной, задетые пропом `isAuthenticated`).
- [ ] T14. `pnpm exec tsc --noEmit`.
- [ ] T15. `pnpm build`.
- [ ] T16. **Ручной смоук** на реальном BFF + сервере + Postgres: подача
      заявки с клубом и экипировкой, повторная подача (409 «дубль»), подача
      в номинацию с закрытым приёмом (409 «приём завершён»), отметка
      оплаты, отзыв через диалог, обновление списка после каждой мутации,
      обе ширины (1440 / 390).
- [ ] T17. **Документация** — статусы `spec.md`/`plan.md`/`tasks.md` → done,
      строка 0036 в `docs/specs/README.md` (резерв → done + описание итога),
      строка «Публичная — заявки» в `docs/design-sync.md` (реальные
      repo-пути после переезда композиции, подтверждение «новый API не
      нужен»).

_Задачи-шаблон адаптированы: server-раздел (domain/service/repo/migrations/
api/wiring) удалён — инкремент чисто клиентский._
