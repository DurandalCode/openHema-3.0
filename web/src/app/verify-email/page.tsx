import { VerifyEmailScreen } from "@/widgets/verify-email/verify-email-screen";

export const runtime = "nodejs";

type PageProps = { searchParams: Promise<{ token?: string }> };

/**
 * /verify-email — публичная страница подтверждения адреса по ссылке из
 * письма (спека 0042, FR-3). Тот же приём, что `/reset-password` (spec
 * 0038): собственный экран, НЕ deep-link группы `(auth)`. Отсутствующий
 * token отдаётся дальше — экран сам показывает единый отказ.
 */
export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  return <VerifyEmailScreen token={token ?? ""} />;
}
