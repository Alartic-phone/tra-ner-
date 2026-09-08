import { Card, CardBody } from "@/components/ui/card.tsx";
import { ErrorText, Input, Label } from "@/components/ui/field.tsx";
import { Button } from "@/components/ui/button.tsx";
import { APP_NAME } from "@/lib/app-config.ts";

export const metadata = { title: `Connexion — ${APP_NAME}` };

/** Chemin de retour : doit rester interne à l'application, jamais une redirection ouverte. */
function sanitizeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; limited?: string }>;
}) {
  const params = await searchParams;
  const next = sanitizeNext(params.next);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardBody>
          <h1 className="font-display text-lg font-medium">{APP_NAME}</h1>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Application privée — mot de passe requis.
          </p>
          <form method="post" action="/api/auth/login" className="mt-4 space-y-3">
            <input type="hidden" name="next" value={next} />
            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={12}
                autoFocus
                autoComplete="current-password"
                className="mt-1"
              />
              {params.limited ? (
                <ErrorText>Trop de tentatives. Réessayer dans quelques minutes.</ErrorText>
              ) : params.error ? (
                <ErrorText>Mot de passe incorrect.</ErrorText>
              ) : null}
            </div>
            <Button type="submit" className="w-full">
              Se connecter
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
