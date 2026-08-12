/**
 * stageErrorMessage — человекочитаемый текст доменной ошибки модуля stage
 * (RU) для admin-диалогов управления этапами (создание, правило отбора,
 * правка, удаление). BFF пробрасывает сырое сообщение Go-ошибки как есть
 * (`ConnectError.rawMessage`, см. `lib/grpc/errors.ts`) — исторический
 * префикс `pool:` (модуль назывался так до переименования в `stage`, спека
 * 0017) наружу утекать не должен. Неизвестная ошибка — сообщение без
 * префикса (не проглатывается совсем, но и не показывает внутренний
 * идентификатор модуля).
 */

const KNOWN_MESSAGES: Record<string, string> = {
  "pool: invalid seeding rule": "Правило отбора некорректно: проверьте источник, селектор и границы мест.",
  "pool: seeding rule source is not allowed":
    "Этап-источник недоступен: он должен быть групповым этапом этой номинации, стоящим раньше по схеме.",
  "pool: source assignment would create a cycle":
    "Такой источник создал бы цикл: этап не может питаться сам от себя.",
  "pool: seeding rule is locked once the stage has members": "Правило отбора нельзя менять: в этапе уже есть состав.",
  "pool: stage config is locked once it has members":
    "Параметры этапа нельзя менять: в нём уже есть состав. Сначала расформируйте этап.",
  "pool: stage is a source for another stage":
    "Этап нельзя удалить: он служит источником для другого этапа. Сначала удалите зависимую ветку.",
  "pool: stage is not deletable": "Этап нельзя удалить: в нём уже есть проведённые бои.",
  "pool: not found": "Этап не найден — возможно, его уже удалили.",
  "pool: invalid input": "Проверьте заполненные поля — что-то введено некорректно.",
};

const POOL_PREFIX = "pool: ";

export function stageErrorMessage(raw: string): string {
  const known = KNOWN_MESSAGES[raw];
  if (known) return known;
  if (raw.startsWith(POOL_PREFIX)) return raw.slice(POOL_PREFIX.length);
  return raw;
}
