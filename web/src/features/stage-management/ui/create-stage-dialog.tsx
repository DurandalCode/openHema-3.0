"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Col } from "@/shared/ui/stack";
import { useCreateStage } from "../api/use-create-stage";

const BRACKET_SIZES = [4, 8, 16, 32] as const;

/**
 * CreateStageDialog — добавление этапа-сетки к номинации (FR-1/FR-2): имя,
 * размер сетки (степень двойки 4/8/16/32) и флаг боя за 3-е место. Сетка —
 * единственный тип этапа, создаваемый вручную (групповой заводится иначе,
 * спека 0009); поэтому диалог не спрашивает тип.
 */
export function CreateStageDialog({ nominationId }: { nominationId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Плейофф");
  const [bracketSize, setBracketSize] = useState<(typeof BRACKET_SIZES)[number]>(8);
  const [thirdPlace, setThirdPlace] = useState(false);
  const create = useCreateStage(nominationId);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setTitle("Плейофф");
      setBracketSize(8);
      setThirdPlace(false);
      create.reset();
    }
  }

  function onSubmit() {
    create.mutate(
      { title, bracketSize, thirdPlace },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus /> Добавить этап
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый этап-сетка</DialogTitle>
          <DialogDescription>
            Плейофф-сетка с ручным посевом (спека 0018). Размер и бой за 3-е место
            задаются один раз при создании.
          </DialogDescription>
        </DialogHeader>
        <Col gap={4}>
          <Col gap={1}>
            <Label htmlFor="create-stage-title">Название</Label>
            <Input
              id="create-stage-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Col>
          <Col gap={1}>
            <Label>Размер сетки</Label>
            <Select
              value={String(bracketSize)}
              onValueChange={(v) => setBracketSize(Number(v) as (typeof BRACKET_SIZES)[number])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BRACKET_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Col>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={thirdPlace}
              onCheckedChange={(checked) => setThirdPlace(checked === true)}
            />
            Бой за 3-е место
          </Label>
          {create.error && (
            <Alert variant="destructive">
              <AlertDescription>{create.error.message}</AlertDescription>
            </Alert>
          )}
        </Col>
        <DialogFooter>
          <Button type="button" loading={create.isPending} onClick={onSubmit}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
