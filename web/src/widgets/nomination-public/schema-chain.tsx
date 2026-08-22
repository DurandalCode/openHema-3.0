import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import type { SchemaChainItem, SchemaChainStageItem } from "@/entities/stage/lib/schema-chain";

const DEFAULT_WAITING_HINT = "ждёт результаты предыдущего этапа";

/**
 * StageChip — один этап цепочки (спека 0035, FR-5/FR-6): завершённый —
 * приглушённая карточка со статусом «Завершён», идущий — живой маркер
 * (`Badge tone="live"`), ещё не сформированный — пунктирная рамка и подпись
 * ожидания источника (либо общая фраза, если источник неизвестен, AC-4).
 * Только то, что видит зритель — без правил посева и диагностики (FR-7).
 */
function StageChip({ stage }: { stage: SchemaChainStageItem }) {
  const pending = stage.state === "pending";
  return (
    <Card
      className={cn("min-w-[180px] gap-2 py-3", pending && "border-dashed bg-muted/30")}
      data-testid="schema-chain-stage"
      data-state={stage.state}
    >
      <CardHeader className="px-3">
        <Row align="center" justify="between" gap={2} className="flex-wrap">
          <CardTitle className={cn("text-sm", pending && "text-muted-foreground")}>{stage.title}</CardTitle>
          {stage.state === "running" && <Badge tone="live">идёт</Badge>}
          {stage.state === "finished" && <Badge tone="success">завершён</Badge>}
        </Row>
      </CardHeader>
      {(stage.configLabel || pending) && (
        <CardContent className="px-3">
          <Col gap={1}>
            {stage.configLabel && <span className="text-xs text-muted-foreground">{stage.configLabel}</span>}
            {pending && (
              <span className="text-xs text-muted-foreground italic">{stage.waitingHint || DEFAULT_WAITING_HINT}</span>
            )}
          </Col>
        </CardContent>
      )}
    </Card>
  );
}

/**
 * SchemaChain — горизонтальная цепочка этапов номинации (спека 0035,
 * FR-5/FR-6/FR-9): один уровень схемы — одна ссылка цепочки, параллельные
 * этапы уровня стоят рядом. Ничего не рендерит при пустом `chain` (AC-5) —
 * решение «схемы нет вовсе» принимает вызывающая композиция, здесь просто
 * нет входных данных для отрисовки. Прокрутка внутри блока на узком экране
 * (NFR-3), тот же приём, что `widgets/bracket-view/bracket-view.tsx`.
 */
export function SchemaChain({ chain }: { chain: SchemaChainItem[] }) {
  if (chain.length === 0) return null;
  return (
    <div className="overflow-x-auto" data-testid="schema-chain">
      <Row gap={3} align="center" className="w-max pb-2">
        {chain.map((item, index) => (
          <Row key={`level-${index}`} gap={3} align="center">
            {index > 0 && <span className="text-muted-foreground">→</span>}
            <Row gap={2} wrap align="start">
              {item.stages.map((stage) => (
                <StageChip key={stage.id} stage={stage} />
              ))}
            </Row>
          </Row>
        ))}
      </Row>
    </div>
  );
}
