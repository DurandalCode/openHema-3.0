import { EmailChangeConfirmScreen } from "@/widgets/email-change-confirm/email-change-confirm-screen";

export const runtime = "nodejs";

type PageProps = { searchParams: Promise<{ token?: string }> };

/**
 * /email-change/confirm — публичная страница подтверждения смены адреса
 * по ссылке из письма, отправленного на новый адрес (спека 0042, FR-6).
 * Тот же приём, что `/verify-email` и `/reset-password` (spec 0038).
 */
export default async function EmailChangeConfirmPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  return <EmailChangeConfirmScreen token={token ?? ""} />;
}
