import { redirect } from "next/navigation";
import { authClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { LogoutButton } from "./logout-button";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Защищённый кабинет: доступен только с валидным access-токеном. */
export default async function DashboardPage() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    redirect("/login");
  }

  let email = "";
  let displayName = "";
  try {
    const res = await authClient.me(
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    email = res.user?.email ?? "";
    displayName = res.user?.displayName ?? "";
  } catch {
    redirect("/login");
  }

  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: 24 }}>
      <h1>Кабинет</h1>
      <p>Привет, {displayName || email}!</p>
      <p style={{ opacity: 0.7 }}>{email}</p>
      <LogoutButton />
    </main>
  );
}
