import { AuthForm } from "../auth-form";

export default function RegisterPage() {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: 24 }}>
      <AuthForm mode="register" />
    </main>
  );
}
