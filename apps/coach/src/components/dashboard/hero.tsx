import Link from "next/link";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card.tsx";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { LinearGauge } from "@/components/ui/linear-gauge.tsx";
import { formatDayShort } from "@/lib/time.ts";
import { addDays, type Day } from "@/lib/shifts/day.ts";

export type FreshnessVerdict = "Feu vert" | "Prudence" | "Repos";

export type FreshnessData =
  | { kind: "unavailable" }
  | { kind: "stale"; lastDay: Day; lastHrv: number; today: Day }
  | {
      kind: "available";
      hrv: number;
      restingHr: number;
      hrvRange: { mean: number; sd: number };
      restingHrRange: { mean: number; sd: number };
      verdict: FreshnessVerdict;
    };

export type SessionData =
  | { kind: "workout"; title: string; summary: string | null; statusLabel: string; statusTone: "ok" | "warn" | "danger" | "neutral" }
  | { kind: "cancelled" }
  | { kind: "none" };

const VERDICT_META: Record<
  FreshnessVerdict,
  { tone: "ok" | "warn" | "danger"; Icon: typeof CircleCheck }
> = {
  "Feu vert": { tone: "ok", Icon: CircleCheck },
  Prudence: { tone: "warn", Icon: TriangleAlert },
  Repos: { tone: "danger", Icon: CircleAlert },
};

/**
 * Le héros du tableau de bord : ce qu'on fait aujourd'hui, et si le corps
 * est prêt. Deux informations, un coup d'œil — tout le reste de la page se
 * mérite en scrollant. La tonalité --color-danger n'apparaît que si la
 * règle d'arrêt physiologique est déclenchée : Prudence reste visuellement
 * sobre, seul un vrai signal d'arrêt doit accrocher l'œil.
 */
export function DashboardHero({
  greeting,
  session,
  freshness,
}: {
  greeting: string;
  session: SessionData;
  freshness: FreshnessData;
}) {
  const danger = freshness.kind === "available" && freshness.verdict === "Repos";

  return (
    <Card
      elevated
      className="flex flex-col gap-8 p-5 py-10 sm:py-12"
      style={
        danger
          ? {
              borderColor: "color-mix(in oklab, var(--color-danger) 45%, transparent)",
              backgroundImage:
                "radial-gradient(120% 100% at 0% 0%, color-mix(in oklab, var(--color-danger) 16%, transparent) 0%, transparent 60%)",
            }
          : undefined
      }
    >
      <div>
        <p className="text-xs text-[var(--color-muted)]">{greeting}</p>
        <SessionBlock session={danger ? { kind: "cancelled" } : session} />
      </div>

      <FreshnessBlock freshness={freshness} />
    </Card>
  );
}

function SessionBlock({ session }: { session: SessionData }) {
  if (session.kind === "cancelled") {
    return (
      <div className="mt-2">
        <p className="text-3xl font-bold text-[var(--color-danger)] sm:text-4xl">Séance annulée</p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Marche ou vélo promenade conseillés à la place.
        </p>
      </div>
    );
  }

  if (session.kind === "none") {
    return (
      <div className="mt-2">
        <p className="text-3xl font-bold sm:text-4xl">Repos</p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">Aucune séance planifiée aujourd&apos;hui.</p>
        <Link href="/plan" className="mt-1 inline-block text-xs text-[var(--color-accent)] hover:underline">
          Voir le plan →
        </Link>
      </div>
    );
  }

  return (
    <Link href="/plan" className="mt-2 block">
      <div className="flex items-start justify-between gap-3">
        <p className="text-3xl font-bold sm:text-4xl">{session.title}</p>
        <Badge tone={session.statusTone}>{session.statusLabel}</Badge>
      </div>
      {session.summary ? (
        <p className="tabular mt-1 text-sm text-[var(--color-muted)]">{session.summary}</p>
      ) : null}
    </Link>
  );
}

function FreshnessBlock({ freshness }: { freshness: FreshnessData }) {
  if (freshness.kind === "unavailable") {
    return (
      <p className="text-xs text-[var(--color-faint)]">
        <Unavailable reason="Nécessite VFC et FC de repos du jour, plus au moins 7 jours de mesures antérieures" />{" "}
        — pas encore de fraîcheur calculable.
      </p>
    );
  }

  if (freshness.kind === "stale") {
    const isYesterday = freshness.lastDay === addDays(freshness.today, -1);
    return (
      <p className="text-xs text-[var(--color-faint)]">
        Pas encore de mesure aujourd&apos;hui — dernière valeur :{" "}
        {isYesterday ? "hier" : formatDayShort(freshness.lastDay)}, VFC {freshness.lastHrv.toFixed(0)} ms.
      </p>
    );
  }

  const { tone, Icon } = VERDICT_META[freshness.verdict];
  const color = `var(--color-${tone})`;

  return (
    <div className="flex items-center gap-3">
      <Icon size={20} style={{ color }} aria-hidden />
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <LinearGauge
          label="VFC"
          value={freshness.hrv}
          unit="ms"
          mean={freshness.hrvRange.mean}
          sd={freshness.hrvRange.sd}
          tone={tone}
        />
        <LinearGauge
          label="FC repos"
          value={freshness.restingHr}
          unit="bpm"
          mean={freshness.restingHrRange.mean}
          sd={freshness.restingHrRange.sd}
          tone={tone}
        />
      </div>
      <span className="shrink-0 text-sm font-semibold" style={{ color }}>
        {freshness.verdict}
      </span>
    </div>
  );
}
