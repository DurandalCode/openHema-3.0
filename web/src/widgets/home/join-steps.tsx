import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Col } from "@/shared/ui/stack";

const STEPS: { title: string; description: string }[] = [
  {
    title: "Создайте аккаунт",
    description: "Регистрация занимает меньше минуты — понадобится только email.",
  },
  {
    title: "Подайте заявку в номинацию",
    description: "Выберите номинацию с открытым приёмом и укажите клуб.",
  },
  {
    title: "Оплатите и зарегистрируйтесь",
    description: "Организаторы подтвердят оплату и зарегистрируют вас в номинации.",
  },
];

/**
 * JoinSteps — блок «Как участвовать» (спека 0034, FR-9): три статичных шага
 * (аккаунт → заявка → оплата и регистрация) со ссылкой в «Мои заявки».
 * Гостю ссылка ведёт на вход (`/login`, deep-link stub, открывающий
 * `AuthDialog`) — тот же паттерн `isAuthenticated`, что уже использует
 * `app/page.tsx` для `<AuthCta />`.
 */
export function JoinSteps({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <section id="join" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 md:py-24">
      <Col align="center" gap={8}>
        <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
          Как участвовать
        </h2>
        <div className="grid w-full gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <Card key={step.title}>
              <CardHeader>
                <span className="font-mono text-[11px] uppercase tracking-[.1em] text-muted-foreground">
                  Шаг {i + 1}
                </span>
                <CardTitle>{step.title}</CardTitle>
                <CardDescription>{step.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
        <Link
          href={isAuthenticated ? "/applications" : "/login"}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Мои заявки
        </Link>
      </Col>
    </section>
  );
}
