import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Col } from "@/shared/ui/stack";

/**
 * StagePromise — блок-обещание для этапа, у которого ещё нет ни групп, ни
 * сетки (спека 0035, FR-21): название, краткая конфигурация (не рендерится,
 * если пуста) и подпись «Сформируется по результатам: <источник>» — либо
 * общая фраза «Сформируется по результатам предыдущего этапа», если
 * источник неизвестен (`waitingHint` пуст). Чистое отображение — используется
 * позже `stage-section.tsx` (join-волна) для несформированного этапа.
 */
export function StagePromise({
  title,
  configLabel,
  waitingHint,
}: {
  title: string;
  configLabel: string;
  waitingHint: string;
}) {
  const sentence = waitingHint
    ? `Сформируется по результатам: ${waitingHint}`
    : "Сформируется по результатам предыдущего этапа";
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Col gap={1}>
          {configLabel && <span className="text-sm text-muted-foreground">{configLabel}</span>}
          <span className="text-sm text-muted-foreground">{sentence}</span>
        </Col>
      </CardContent>
    </Card>
  );
}
