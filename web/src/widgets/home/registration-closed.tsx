import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

/**
 * RegistrationClosed — блок «Приём заявок завершён» (спека 0034, FR-21):
 * показывается, если ни в одной номинации турнира приём не открыт, со
 * ссылкой в «Мои заявки» для аутентифицированного пользователя. В отличие
 * от `JoinSteps` (FR-9), гостю здесь ссылки не показывается вовсе — FR-21
 * оговаривает её только «для аутентифицированного пользователя», подавать
 * заявку всё равно некуда (приём закрыт), а вход гостю предлагать не
 * специфицировано.
 */
export function RegistrationClosed({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <section id="registration-closed" className="mx-auto w-full max-w-6xl px-4 py-8">
      <Card className="border-dashed">
        <CardHeader className="items-center text-center">
          <CardTitle>Приём заявок завершён</CardTitle>
          {isAuthenticated && (
            <CardDescription>
              <Link
                href="/applications"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Мои заявки
              </Link>
            </CardDescription>
          )}
        </CardHeader>
      </Card>
    </section>
  );
}
