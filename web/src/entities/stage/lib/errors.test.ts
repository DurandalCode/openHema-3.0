import { describe, expect, it } from "vitest";
import { stageErrorMessage } from "./errors";

describe("entities/stage/lib/errors stageErrorMessage", () => {
  it("maps known CreateStage/SetStageRule errors to RU text", () => {
    expect(stageErrorMessage("pool: invalid seeding rule")).toBe(
      "Правило отбора некорректно: проверьте источник, селектор и границы мест.",
    );
    expect(stageErrorMessage("pool: seeding rule source is not allowed")).toBe(
      "Этап-источник недоступен: он должен быть групповым этапом этой номинации, стоящим раньше по схеме.",
    );
    expect(stageErrorMessage("pool: source assignment would create a cycle")).toBe(
      "Такой источник создал бы цикл: этап не может питаться сам от себя.",
    );
    expect(stageErrorMessage("pool: seeding rule is locked once the stage has members")).toBe(
      "Правило отбора нельзя менять: в этапе уже есть состав.",
    );
  });

  it("maps known UpdateStage/DeleteStage errors to RU text", () => {
    expect(stageErrorMessage("pool: stage config is locked once it has members")).toBe(
      "Параметры этапа нельзя менять: в нём уже есть состав. Сначала расформируйте этап.",
    );
    expect(stageErrorMessage("pool: stage is a source for another stage")).toBe(
      "Этап нельзя удалить: он служит источником для другого этапа. Сначала удалите зависимую ветку.",
    );
    expect(stageErrorMessage("pool: stage is not deletable")).toBe(
      "Этап нельзя удалить: в нём уже есть проведённые бои.",
    );
    expect(stageErrorMessage("pool: not found")).toBe("Этап не найден — возможно, его уже удалили.");
    expect(stageErrorMessage("pool: invalid input")).toBe("Проверьте заполненные поля — что-то введено некорректно.");
  });

  it("falls back to the raw message without the internal module prefix for unknown errors", () => {
    expect(stageErrorMessage("pool: something unmapped happened")).toBe("something unmapped happened");
  });

  it("falls back to the raw message as-is when there is no known prefix", () => {
    expect(stageErrorMessage("network error")).toBe("network error");
  });
});
