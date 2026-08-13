# Tasks: Редизайн экрана «Заявки»

> Артефакт SDD (ADR 0008) + TDD-чеклист (ADR 0009). Упорядоченный список шагов.
> Каждая задача = слой/файл + пара «тест → код» по циклу red → green → refactor.

- Статус: draft
- Дата: 2026-08-13
- План: `./plan.md`

## Порядок

Задачи выполняются сверху вниз. Внутри задачи: сначала падающий тест (red),
затем минимальный код (green), затем рефактор при зелёных тестах.

Волна 0 — единственное изменение контракта (`actor_display_name`); от неё
зависят и Go-, и TS-типы, поэтому она идёт до всего остального.

## Треки и параллельность

| Волна | Трек | Задачи | Файлы (не пересекаются внутри волны) | Зависит от |
| ----- | ---- | ------ | ------------------------------------- | ---------- |
| 0 | — | T1 | `proto/hema/v1/application.proto` | — |
| 1 | A (server) | T2–T3 | `server/modules/application/{service,api}` | волна 0 |
| 1 | B (web-фундамент) | T4–T7 | `web/src/shared/ui/table-row.tsx`, `web/src/lib/grpc/serialize.ts`, `web/src/app/api/applications/[id]/route.test.ts`, `web/src/entities/application/**` | волна 0 |
| 1 | C (фича `application-review`) | T8–T14 | `web/src/features/application-review/**` | волна 0 |
| 2 | join | T15–T18 | `app/(admin)/admin/applications/page.tsx`, `docs/**` | треки A, B, C смержены |

Трек C на время волны 1 работает поверх **локальных заглушек** того, что
делает трек B (поле `actorDisplayName` в типе события, `node`-ячейка
`TableRow`, функции представления из `entities/application/lib/state.ts`) —
приём, отработанный на 0024. На join-волне заглушки заменяются реальными
импортами (T15).

## Контракты

- [ ] T1. `proto/hema/v1/application.proto` — добавить в `ApplicationEvent`
      поле `string actor_display_name = 5;` с комментарием «обогащается из
      домена auth, «» = имя недоступно»; `go tool buf lint`; `make generate`.
      _(контракты — не TDD-шаг, но идут первыми: от них зависят типы.)_

## Трек A — server (`modules/application`)

- [ ] T2. **service (red→green)** —
      `modules/application/service/service_test.go`: `Get` отдаёт историю, в
      которой у события заявителя стоит его имя, у события админа — имя
      админа (оба из `testutil.FakeUserProvider`); неизвестный автор → пустое
      имя; `DisplayNames` вызывается **одним батчем** на все события (счётчик
      вызовов у фейка) → затем `HistoryEvent.ActorDisplayName` +
      обогащение в `Service.Get` (собрать уникальные `ActorID`, один вызов
      порта, разложить по записям). Домен и repo не трогать.
- [ ] T3. **api (red→green)** — `modules/application/api/handler_test.go`:
      `GetApplication` отдаёт `actor_display_name` в записях истории; правила
      доступа (владелец — да, чужой — `PermissionDenied`, admin — да) не
      регрессируют (план, «Риски») → затем `toProtoHistory` в
      `api/handler.go`.

## Трек B — web-фундамент (shared/BFF/entities)

- [x] T4. **`TableRow` c `node`-ячейкой (red→green)** —
      `shared/ui/table-row.test.tsx`: ячейка с `node` рендерит переданный
      узел; ячейки с `text/sub/tags` продолжают работать как раньше →
      затем аддитивно расширить `TableRowCell` полем `node?: React.ReactNode`
      в `shared/ui/table-row.tsx` (план, `shared/`). `user-row.tsx` на новый
      слот **не переводить** — вне скоупа.
- [x] T5. **Сериализация истории (red→green)** —
      `lib/grpc/serialize.test.ts`: `applicationHistoryToJson` переносит
      `actorDisplayName`; при опущенном proto3-поле даёт `""` → затем правка
      `lib/grpc/serialize.ts`.
- [x] T6. **BFF-ручка** — `app/api/applications/[id]/route.test.ts`:
      дополнить проверку формы ответа новым полем (сам route handler
      меняться не должен — если меняется, значит поле протекло мимо
      сериализатора).
- [x] T7. **Представление сущности (red→green)** —
      `entities/application/lib/state.test.ts`: `stateCaption` (пять
      состояний, FR-2), `eventLabel` (шесть типов, включая `AMENDED` →
      «Заявка изменена», FR-17), `nextExpectedStep` (нетерминальные → шаг и
      чьего действия ждём, терминальные → `null`, FR-18), `isTerminal`
      (FR-3) → затем дополнить `entities/application/lib/state.ts`;
      `entities/application/lib/types.ts` — поле `actorDisplayName` в
      `ApplicationEvent`.

## Трек C — фича `application-review`

- [ ] T8. **Отбор и порядок (red→green)** —
      `features/application-review/lib/select-applications.test.ts`:
      `sortApplications` (группы очереди FR-6 и порядок внутри группы),
      `filterApplications` (статусы, номинации, экипировка, поиск по имени и
      клубу без учёта регистра, всё вместе — FR-8/9/10), `statusCounts` (не
      зависят от фильтров и поиска, FR-7/AC-2), `overfullNominationIds`
      (лимит не задан → пусто; ровно на границе → есть — FR-4),
      `rowAction` (действие либо текст-причина, FR-5) → затем
      `lib/select-applications.ts`.
- [ ] T9. **История (red→green)** —
      `features/application-review/lib/history.test.ts`: порядок записей по
      времени, роль автора («заявитель» при совпадении с заявителем, иначе
      «организатор»), пустое имя → только роль без идентификатора (AC-12),
      ожидаемый шаг добавляется только для нетерминальных состояний (FR-18)
      → затем `lib/history.ts`.
- [ ] T10. **API-слой (red→green)** —
      `features/application-review/api/requests.test.ts`:
      `getApplicationRequest` зовёт `GET /api/applications/<id>` и
      возвращает `{application, history}`, сетевая ошибка → `ok: false` →
      затем `api/requests.ts`, `api/keys.ts` (`detail`),
      `api/use-application-detail.ts` (`enabled` по открытости карточки) и
      инвалидация `detail` в существующих мутациях.
- [ ] T11. **Строка (red→green)** —
      `features/application-review/ui/application-row.test.tsx`: пять
      колонок, подстрока «состояние + дата» (FR-2), теги «номинация
      переполнена» и «нужна экипировка» (FR-4), действие либо причина
      (FR-5), приглушение терминальных и зачёркивание отозванной (FR-3),
      клик по строке открывает карточку, клик по кнопке — **не** открывает
      (AC-16) → затем `ui/application-row.tsx`.
- [ ] T12. **Фильтры (red→green)** —
      `features/application-review/ui/applications-filters.test.tsx`: чипы
      статусов со счётчиками и множественным выбором (`aria-pressed`,
      AC-3), выпадающий список номинаций с подписью «Все номинации» /
      название / «N номинаций» (AC-4), чип экипировки, поиск с доступным
      именем, сброс всех фильтров → затем `ui/applications-filters.tsx`.
- [ ] T13. **Таблица (red→green)** —
      `features/application-review/ui/applications-table.test.tsx`: шапка из
      пяти колонок, строки в порядке `sortApplications`, скелетон в форме
      таблицы (FR-24), ошибка с повтором (FR-25), два разных пустых
      состояния (FR-26/AC-14) → затем `ui/applications-table.tsx`.
- [ ] T14. **Карточка заявки (red→green)** —
      `features/application-review/ui/application-card-dialog.test.tsx`:
      шапка (имя, номинация, клуб), статус с пояснением, история с авторами
      и ожидаемым шагом (AC-9), предупреждение о переполнении, действие
      флоу оставляет карточку открытой и обновляет статус и историю
      (AC-10), «Редактировать» открывает форму правки и после сохранения
      карточка показывает новые данные (AC-11), ошибка загрузки истории не
      ломает карточку (FR-25) → затем `ui/application-card-dialog.tsx`,
      `ui/application-history.tsx` и перевод `ui/edit-application-dialog.tsx`
      в контролируемый режим (`open`/`onOpenChange`, без собственного
      триггера). Здесь же — развилка из «Рисков» плана: вложенные диалоги
      против последовательного режима; выбранный вариант зафиксировать
      комментарием и тестом на фокус.

## Волна 2 — join

- [ ] T15. **Экран целиком (red→green)** —
      `features/application-review/ui/applications-screen.test.tsx` (моки
      `useApplicationsOverview`, мутаций и `shared/lib/toast`): порядок
      очереди (AC-1), счётчики (AC-2), фильтры и предвыбор номинации
      (AC-3/AC-4/AC-5), тост успеха при подтверждении оплаты (AC-6), тост
      успеха с предупреждением о переполнении при регистрации (AC-7), отказ
      → `toastError` **без** `retry` (AC-8), сброс страницы при смене
      фильтра (AC-15), шапка раздела (AC-13) → затем
      `ui/applications-screen.tsx`; подключить реальные импорты вместо
      заглушек трека C; удалить `ui/applications-overview.tsx`.
- [ ] T16. **Сборка на роуте** —
      `app/(admin)/admin/applications/page.tsx`: рендерит
      `<ApplicationsScreen …>` (турнир, номинации, название турнира для
      крошки, предвыбранная номинация из `?nominationId=`), убрать
      `AdminHeader` и обёртку `mx-auto max-w-4xl px-4 py-16`; ветку
      «активный турнир не найден» сохранить. Грепом убедиться, что
      `ApplicationsOverview` больше нигде не импортируется.
- [ ] T17. **`docs/design-sync.md`** — обновить строку «Заявки»: реальные
      repo-пути после инкремента и **«новый API нужен? — да, имя автора
      события в истории»** с ссылкой на эту спеку (раздел «Как поддерживать
      в актуальном состоянии»); строку `UiTableRow` дополнить упоминанием
      `node`-слота.
- [ ] T18. **Ручной смоук** в обеих темах (`make dev`): очередь и порядок
      строк, счётчики, фильтры и выпадающий список номинаций, поиск,
      пагинация, подтверждение оплаты и регистрация с тостами (включая
      переполненную номинацию), карточка с историей и авторами, правка из
      карточки, скелетон и пустые состояния, клавиатурная навигация и
      видимое кольцо фокуса (NFR-3/NFR-4), клик по кнопке не открывает
      карточку (AC-16).

## Проверка

- [ ] T19. `make test-all` зелёный (server + web).
- [ ] T20. `pnpm exec tsc --noEmit` без ошибок.
- [ ] T21. `go build ./...` + `pnpm build` проходят.
- [ ] T22. Обновить статусы `spec.md`/`plan.md`/`tasks.md` и строку 0025 в
      `docs/specs/README.md`.
