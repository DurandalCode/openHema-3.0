"use client";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Col, Row } from "@/shared/ui/stack";
import type { ProgramDayDraft, ProgramItemDraft } from "@/entities/tournament/lib/draft";

export type TournamentProgramEditorProps = {
  value: ProgramDayDraft[];
  onChange: (value: ProgramDayDraft[]) => void;
};

/**
 * TournamentProgramEditor — редактор программы турнира по дням в форме
 * настроек (спека 0040, FR-14): список дней, внутри каждого — упорядоченный
 * список пунктов «время + текст». Порядок — по индексу в массиве (FR-14a
 * не требует DnD): перестановка кнопками ▲/▼, тот же уровень сложности, что
 * уже выбран для этой задачи (без обязательного применения гайдов 0039 п.5
 * — это список коротких текстовых полей, не карточки с DnD-семантикой, как
 * посев/схема).
 *
 * **Контролируемый** компонент (`value`/`onChange`), как и
 * `TournamentSettingsForm` в целом — своего состояния и кнопки сохранения
 * нет. Пустые пункты (без текста) не блокируют ввод здесь — они отбрасываются
 * молча на границе отправки (`tournament-screen.tsx`, тот же приём, что
 * контакты), не как ошибка валидации.
 */
export function TournamentProgramEditor({ value, onChange }: TournamentProgramEditorProps) {
  function addDay() {
    onChange([...value, { date: "", items: [] }]);
  }

  function removeDay(dayIdx: number) {
    onChange(value.filter((_, idx) => idx !== dayIdx));
  }

  function moveDay(dayIdx: number, dir: -1 | 1) {
    const target = dayIdx + dir;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[dayIdx], next[target]] = [next[target], next[dayIdx]];
    onChange(next);
  }

  function updateDayDate(dayIdx: number, date: string) {
    onChange(value.map((d, idx) => (idx === dayIdx ? { ...d, date } : d)));
  }

  function addItem(dayIdx: number) {
    onChange(
      value.map((d, idx) =>
        idx === dayIdx ? { ...d, items: [...d.items, { timeLabel: "", text: "" }] } : d,
      ),
    );
  }

  function removeItem(dayIdx: number, itemIdx: number) {
    onChange(
      value.map((d, idx) =>
        idx === dayIdx ? { ...d, items: d.items.filter((_, j) => j !== itemIdx) } : d,
      ),
    );
  }

  function moveItem(dayIdx: number, itemIdx: number, dir: -1 | 1) {
    const day = value[dayIdx];
    const target = itemIdx + dir;
    if (!day || target < 0 || target >= day.items.length) return;
    const items = [...day.items];
    [items[itemIdx], items[target]] = [items[target], items[itemIdx]];
    onChange(value.map((d, idx) => (idx === dayIdx ? { ...d, items } : d)));
  }

  function updateItem(dayIdx: number, itemIdx: number, patch: Partial<ProgramItemDraft>) {
    onChange(
      value.map((d, idx) =>
        idx === dayIdx
          ? { ...d, items: d.items.map((it, j) => (j === itemIdx ? { ...it, ...patch } : it)) }
          : d,
      ),
    );
  }

  return (
    <Col gap={2}>
      <Row align="center" justify="between">
        <Label>Программа по дням</Label>
        <Button type="button" variant="outline" size="sm" onClick={addDay}>
          + Добавить день
        </Button>
      </Row>
      <p className="text-xs text-muted-foreground">
        Пустые пункты (без текста) не сохраняются.
      </p>

      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">Программа ещё не задана.</p>
      ) : (
        <Col gap={4}>
          {value.map((day, dayIdx) => (
            <Col key={dayIdx} gap={3} className="rounded-lg border border-border p-3">
              <Row align="center" gap={2} wrap>
                <Input
                  type="date"
                  aria-label={`Дата дня ${dayIdx + 1}`}
                  value={day.date}
                  onChange={(e) => updateDayDate(dayIdx, e.target.value)}
                  className="w-44"
                />
                <Row gap={1} className="ml-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={dayIdx === 0}
                    onClick={() => moveDay(dayIdx, -1)}
                    aria-label="Переместить день вверх"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={dayIdx === value.length - 1}
                    onClick={() => moveDay(dayIdx, 1)}
                    aria-label="Переместить день вниз"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeDay(dayIdx)}
                  >
                    Удалить день
                  </Button>
                </Row>
              </Row>

              {day.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Пункты ещё не добавлены.</p>
              ) : (
                <Col gap={2}>
                  {day.items.map((item, itemIdx) => (
                    <Row key={itemIdx} align="center" gap={2} wrap>
                      <Input
                        aria-label={`Время пункта ${itemIdx + 1} дня ${dayIdx + 1}`}
                        placeholder="9:00"
                        value={item.timeLabel}
                        onChange={(e) =>
                          updateItem(dayIdx, itemIdx, { timeLabel: e.target.value })
                        }
                        className="w-24"
                      />
                      <Input
                        aria-label={`Текст пункта ${itemIdx + 1} дня ${dayIdx + 1}`}
                        placeholder="Сбор участников"
                        value={item.text}
                        onChange={(e) => updateItem(dayIdx, itemIdx, { text: e.target.value })}
                        className="min-w-40 flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={itemIdx === 0}
                        onClick={() => moveItem(dayIdx, itemIdx, -1)}
                        aria-label="Переместить пункт вверх"
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={itemIdx === day.items.length - 1}
                        onClick={() => moveItem(dayIdx, itemIdx, 1)}
                        aria-label="Переместить пункт вниз"
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(dayIdx, itemIdx)}
                      >
                        Удалить
                      </Button>
                    </Row>
                  ))}
                </Col>
              )}

              <Button type="button" variant="outline" size="sm" onClick={() => addItem(dayIdx)}>
                + Добавить пункт
              </Button>
            </Col>
          ))}
        </Col>
      )}
    </Col>
  );
}
