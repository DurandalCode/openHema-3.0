# Plan: Замена бойца

- Статус: draft, условный на D-SUB.
- Спека: [spec.md](spec.md). База:0055 и 0056; последовательное выполнение из-за общих fighter/stage файлов.

## Архитектура и обязательное решение

Предложение: локальная транзакция PostgreSQL через **явный unit-of-work и модульные порты**. Координатор в fighter вызывает stage-порт замены draft seeds; каждый модуль пишет только свою схему. Ни SQL к чужим таблицам, ни вызова чужого repo напрямую. Общий executor передаётся явно через transaction-bound adapters; глобального tx/context lookup нет. Bout вообще не репоинтится: при допустимом draft нет сформированных боёв.

Это новое архитектурное соглашение: до кода принять ADR с constructor wiring и контрактом transaction-bound модульных API. Если команда отвергнет общий UoW, требуется перепланирование; нельзя подменить атомарность цепочкой двух независимых commit. Общую асинхронную шину для этой операции не вводить.

0052 уже вводит nomination keyed guard. ADR должен определить единый порядок: внешний in-process nomination guard → начало UoW → transaction advisory locks номинаций в отсортированном порядке → locks строк. Вложенные transaction-bound вызовы stage не захватывают тот же keyed guard повторно; ownership передаётся явно. Нельзя оставлять ветку, берущую advisory lock перед keyed guard, или reentrant вызов обычного stage service под уже взятым guard. Сначала проверить и адаптировать существующие guard0052, а не вводить независимую конкурирующую блокировку.

Все изменения состава/seed и SetStatus одной номинации сериализуются transaction-level advisory lock по nomination_id. Операции нескольких номинаций берут locks в отсортированном порядке. До внесения изменений собрать все mutation paths (включая импорт, bulk0055, Move, Merge, Withdraw/Return, Undo, build/seed, фиксацию). Пропущенный writer делает AC-3 ложным, поэтому внедрение протокола блокировок — часть этой задачи, а не предположение.

## API и слои

`proto/hema/v1/fighter.proto`: `PreviewFighterSubstitution` и `SubstituteFighter`; поля nomination_id, source_fighter_id, target_fighter_id, reason, command_id и preview_token. Preview возвращает перечисление stage/pool/slot и fingerprint. Apply под locks повторяет checks/fingerprint. Ошибки invalid input/permission/failed precondition/conflict отличаются; не доверять токену как разрешению доступа.

`fighter/domain/service`: validation и координация; repo — roster mutations/log в UoW. `stage/domain` узкий порт preview/replace draft positions; stage service/repo проверяет статус и существование источника/цели в пределах своей схемы. `internal/platform` связывает transaction-bound implementations через существующий PG pool. Отдельный server-модуль не нужен. Существующий Merge не переиспользовать для смены личности.

## DDL

Новая таблица `fighter.substitutions` — audit и идемпотентный результат:

| Поле | Тип / ограничения |
| --- | --- |
| id | UUID PRIMARY KEY |
| command_id | UUID NOT NULL UNIQUE |
| nomination_id | UUID NOT NULL, без cross-schema FK |
| source_fighter_id | UUID NOT NULL REFERENCES fighter.fighters(id) |
| target_fighter_id | UUID NOT NULL REFERENCES fighter.fighters(id) |
| actor_id | UUID NOT NULL |
| reason | TEXT NOT NULL CHECK length(btrim(reason)) > 0 |
| request_hash | TEXT NOT NULL |
| positions | JSONB NOT NULL CHECK jsonb_typeof(positions) = 'array' |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

CHECK source != target; индекс `(nomination_id,created_at,id)`. positions — immutable снимок stage/pool/slot до/после для отображения истории; не источник текущего посева. Запись лога и mutations в одной транзакции; duplicate command сравнивает hash и возвращает сохранённый результат. Ограничения unique участия из текущей схемы сохраняются. Миграция add-only, без backfill; down только при пустом audit либо отказ, не стирать историю.

## Web

`features/fighter-management/ui/substitute-fighter-dialog.tsx` (новый), requests/mutations, кнопка в fighter row/card. BFF новый admin route в существующей группе fighter routes; server-only Connect. Preview показывает все этапы и отсутствие переноса оплаты; Apply disabled при конфликте, данные обновляются из сервера, ошибки не скрываются. Не импортировать widgets в feature.

## Проверки

Domain/service — все AC и области авторизации; handlers/BFF — stale token, чужой турнир, idempotency. DB integration с **двумя соединениями**: substitute vs fixation/import/bulk/withdraw/seed; fault injection перед commit доказывает rollback обоих модулей. Web — выбор цели, подтверждение, сохранение ошибки/данных, invalidation ростера/этапов. Build/test в изолированной БД. Стоимость этого трека выше обычной формы: её определяет обещанная атомарность, а не число кнопок.
