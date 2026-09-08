"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input, Label } from "@/components/ui/field.tsx";
import { saveStravaCredentials } from "@/app/(app)/reglages/actions.ts";

/**
 * Formulaire de première configuration Strava : Client ID / Client Secret,
 * saisis une seule fois puis stockés chiffrés en base (voir
 * `lib/strava/credentials.ts`) — utile sur un déploiement sans accès facile
 * au fichier `.env` (Fly.io). `STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET` dans
 * `.env` restent une alternative pour docker compose ; cette page prend le
 * dessus si les deux sont renseignés.
 */
export function StravaCredentialsForm() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs text-[var(--color-muted)]">
        <p className="font-medium text-[var(--color-text)]">
          Première connexion : Strava demande un « Client ID » et un « Client Secret » propres à
          cette application. Cinq minutes, un simple formulaire chez Strava, aucun code à écrire.
        </p>
        <ol className="mt-2 list-inside list-decimal space-y-1">
          <li>
            Ouvrir{" "}
            <a
              href="https://www.strava.com/settings/api"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--color-accent)] underline"
            >
              strava.com/settings/api
              <ExternalLink size={11} aria-hidden />
            </a>{" "}
            (connecté à ton compte Strava).
          </li>
          <li>Remplir le formulaire : nom libre, catégorie « Training ».</li>
          <li>
            <strong className="text-[var(--color-text)]">Authorization Callback Domain</strong> :
            le domaine du site, sans <code>https://</code> ni chemin (par exemple{" "}
            <code>coach-entrainement.fly.dev</code>).
          </li>
          <li>Valider — Strava affiche un Client ID (un nombre) et un Client Secret.</li>
          <li>Les copier ci-dessous.</li>
        </ol>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData();
          formData.set("clientId", clientId);
          formData.set("clientSecret", clientSecret);
          startTransition(async () => {
            const result = await saveStravaCredentials(formData);
            setFeedback(
              result.ok
                ? { ok: true, text: "Identifiants enregistrés." }
                : { ok: false, text: result.error },
            );
          });
        }}
      >
        <div>
          <Label htmlFor="strava-client-id">Client ID</Label>
          <Input
            id="strava-client-id"
            inputMode="numeric"
            autoComplete="off"
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="strava-client-secret">Client Secret</Label>
          <Input
            id="strava-client-secret"
            type="password"
            autoComplete="off"
            required
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {feedback ? (
            <p className={feedback.ok ? "text-xs text-[var(--color-ok)]" : "text-xs text-[var(--color-danger)]"}>
              {feedback.text}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
