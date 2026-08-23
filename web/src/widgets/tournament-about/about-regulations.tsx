import { FileText } from "lucide-react";
import { Button } from "@/shared/ui/button";

/**
 * AboutRegulations — блок ссылки на регламент турнира (спека 0038, T13,
 * FR-45): отдельный блок, не строка внутри других плиток — открывается в
 * новой вкладке. `url` пуст ("" — регламент не задан, 0037 FR-19) — блок не
 * рендерится вовсе (правило 0001).
 */
export function AboutRegulations({ url }: { url: string }) {
  if (!url) return null;

  return (
    <Button asChild variant="outline" className="w-fit">
      <a href={url} target="_blank" rel="noopener noreferrer">
        <FileText className="size-4" />
        Регламент турнира
      </a>
    </Button>
  );
}
