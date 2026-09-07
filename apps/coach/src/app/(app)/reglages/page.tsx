import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb.tsx";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card.tsx";
import { getEnv, isCoachConfigured, isStravaConfigured, isWebhookCapable } from "@/lib/env.ts";
import { getSyncStatus } from "@/lib/strava/sync.ts";
import { formatInstant } from "@/lib/time.ts";
import { SyncPanel } from "@/components/strava/sync-panel.tsx";
import { connectStrava, disconnectStrava } from "./actions.ts";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { tone: "ok" | "warn" | "danger"; text: string }> = {
  connecte: { tone: "ok", text: "Compte Strava connecté. L'import de l'historique a démarré." },
  refus: { tone: "warn", text: "Autorisation refusée sur Strava." },
  etat_invalide: { tone: "danger", text: "État OAuth invalide — tentative rejetée." },
  portee_insuffisante: {
    tone: "danger",
    text: "La portée activity:read_all n'a pas été accordée : les activités privées seraient invisibles. Reconnecter en cochant toutes les autorisations.",
  },
  echec: { tone: "danger", text: "Échec de l'échange du code avec Strava." },
  non_configure: {
    tone: "warn",
    text: "STRAVA_CLIENT_ID et STRAVA_CLIENT_SECRET ne sont pas renseignés dans .env.",
  },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ strava?: string; detail?: string }>;
}) {
  const { strava, detail } = await searchParams;
  const env = getEnv();
  const status = await getSyncStatus();
  const message = strava ? MESSAGES[strava] : undefined;

  return (
    <>
      <Breadcrumb trail={[{ label: "Réglages" }]} />
      <div className="p-4 md:p-6">
      <header>
        <h1 className="font-display text-lg font-semibold">Réglages</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Sources de données, cycle de postes et profil.
        </p>
      </header>

      {message ? (
        <p
          className={`mt-4 rounded-[var(--radius-card)] border px-3 py-2 text-xs ${
            message.tone === "ok"
              ? "border-[var(--color-ok)]/40 text-[var(--color-ok)]"
              : message.tone === "warn"
                ? "border-[var(--color-warn)]/40 text-[var(--color-warn)]"
                : "border-[var(--color-danger)]/40 text-[var(--color-danger)]"
          }`}
        >
          {message.text}
          {detail ? ` (${detail})` : null}
        </p>
      ) : null}

      <div className="mt-5 max-w-2xl space-y-5">
        <Card elevated>
          <CardHeader
            title="Strava"
            hint="La COROS n'expose pas d'API publique aux particuliers ; elle synchronise en revanche automatiquement vers Strava, qui sert donc de source principale."
            action={
              status.account ? (
                <Badge tone="ok">connecté</Badge>
              ) : (
                <Badge tone="warn">non connecté</Badge>
              )
            }
          />
          <CardBody>
            {!isStravaConfigured() ? (
              <p className="text-xs text-[var(--color-warn)]">
                Renseigner STRAVA_CLIENT_ID et STRAVA_CLIENT_SECRET dans le fichier
                .env, puis redémarrer. La procédure de création de l&apos;application
                sur le portail développeur Strava est décrite dans le README.
              </p>
            ) : status.account ? (
              <>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-[var(--color-muted)]">Athlète</dt>
                    <dd className="mt-0.5">
                      {status.account.athleteName ?? `#${status.account.athleteId}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-muted)]">Dernière synchronisation</dt>
                    <dd className="mt-0.5">
                      {status.account.lastSyncAt ? (
                        formatInstant(status.account.lastSyncAt)
                      ) : (
                        <Unavailable reason="Aucune synchronisation effectuée" />
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-muted)]">Mode de synchronisation</dt>
                    <dd className="mt-0.5">
                      {isWebhookCapable()
                        ? "Webhook temps réel"
                        : "Bouton + tâche planifiée"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-muted)]">Import de l&apos;historique</dt>
                    <dd className="mt-0.5">
                      {status.account.backfillDone ? "terminé" : "en cours"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <SyncPanel
                    backfillDone={status.account.backfillDone}
                    pending={status.pending}
                    failed={status.failed}
                  />
                </div>

                <form action={disconnectStrava} className="mt-4">
                  <Button variant="ghost" size="sm" type="submit">
                    Déconnecter Strava
                  </Button>
                </form>
              </>
            ) : (
              <form action={connectStrava}>
                <Button type="submit">
                  Connecter Strava <ExternalLink size={14} aria-hidden />
                </Button>
              </form>
            )}
          </CardBody>
          <div className="grid grid-cols-2 border-t border-[var(--color-border)] sm:grid-cols-4">
            <Stat
              label="Importées depuis Strava"
              value={status.activities}
              hint="hors import FIT COROS"
            />
            <Stat
              label="Avec flux, toutes sources"
              value={status.withStreams}
              hint="Strava + FIT COROS"
            />
            <Stat
              label="En file d'attente"
              value={status.pending}
              hint="reprise automatique"
            />
            <Stat
              label="En échec"
              value={status.failed}
              tone={status.failed > 0 ? "danger" : "default"}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Profil" hint="Repères cardiaques, VMA, historique de blessures." />
          <CardBody>
            <Link href="/reglages/profil" className="text-sm text-[var(--color-accent)] hover:underline">
              Renseigner le profil →
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Cycle de postes" hint="Séquence, horaires et contraintes." />
          <CardBody>
            <Link href="/reglages/postes" className="text-sm text-[var(--color-accent)] hover:underline">
              Configurer le cycle de postes →
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="État des intégrations" />
          <CardBody className="space-y-2 text-xs">
            <Row
              label="Import de fichiers FIT"
              value={`manuel (COROS) · ${status.corosWithStreams} activité(s) COROS avec flux`}
              hint="npm run import:coros puis import:coros:fit — sommeil, HRV nocturne et statut de récupération COROS, absents de Strava."
            />
            <Row
              label="Génération de plan par Claude"
              value={isCoachConfigured() ? `activée · ${env.ANTHROPIC_MODEL}` : "clé API absente"}
              hint="ANTHROPIC_API_KEY dans .env."
            />
            <Row
              label="URL publique"
              value={env.PUBLIC_URL ?? "non définie"}
              hint="Nécessaire au webhook Strava. Sans elle, synchronisation par bouton et cron."
            />
          </CardBody>
        </Card>
      </div>
      </div>
    </>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-2 last:border-0">
      <div>
        <div className="text-[var(--color-text)]">{label}</div>
        {hint ? <div className="text-[var(--color-faint)]">{hint}</div> : null}
      </div>
      {/* Pas de `shrink-0` : une valeur longue ("manuel (COROS) · 3
          activité(s) COROS avec flux") le forçait à garder toute sa largeur
          de contenu et débordait la page de 2 px à 390 px. */}
      <div className="text-right text-[var(--color-muted)]">{value}</div>
    </div>
  );
}
