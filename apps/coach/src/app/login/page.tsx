import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button.tsx";
import { Input, Label } from "@/components/ui/field.tsx";
import { checkPassword, createSession, isAuthenticated } from "@/lib/auth.ts";

export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    redirect("/login?error=1");
  }
  await createSession();
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAuthenticated()) redirect("/");
  const { error } = await searchParams;

  return (
    <main
      className="flex min-h-dvh items-center justify-center p-6"
      style={{ backgroundImage: "var(--surface-glow)" }}
    >
      <form
        action={login}
        className="w-full max-w-xs rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-elevated)]"
      >
        <h1 className="text-xl font-semibold">Coach</h1>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Application personnelle. Un seul utilisateur, un seul mot de passe.
        </p>

        <div className="mt-5">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            className="mt-1"
          />
          {error ? (
            <p className="mt-2 text-xs text-[var(--color-danger)]">
              Mot de passe incorrect.
            </p>
          ) : null}
        </div>

        <Button type="submit" className="mt-4 w-full">
          Entrer
        </Button>
      </form>
    </main>
  );
}
