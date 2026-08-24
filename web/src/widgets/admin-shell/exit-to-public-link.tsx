import Link from "next/link";
import { ExternalLink } from "lucide-react";

/**
 * ExitToPublicLink — явный выход из админ-зоны на публичную часть сайта
 * (спека 0038, ручная проверка — раньше единственный путь наружу был
 * спрятан за пунктом «Кабинет» в выпадающем меню пользователя, который не
 * читается как «выйти на сайт»). Ведёт на `/` — не контекстно (не пытается
 * угадать публичный аналог текущей admin-страницы: у половины разделов
 * админки — «Пользователи», «Форматы» — такого аналога нет вовсе).
 */
export function ExitToPublicLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ExternalLink className="size-4" />
      На сайт
    </Link>
  );
}
