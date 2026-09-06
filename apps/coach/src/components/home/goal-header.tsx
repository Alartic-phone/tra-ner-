import { CountdownReveal } from "./countdown-reveal.tsx";
import { formatDayAbbrev } from "@/lib/time.ts";
import { formatDistance, formatPace, formatTimeRange } from "@/lib/utils.ts";
import { diffDays, type Day } from "@/lib/shifts/day.ts";

export type GoalHeaderData = {
  name: string;
  day: Day;
  distanceM: number;
  targetTimeMinS: number | null;
  targetTimeMaxS: number | null;
  /** Texte libre du profil parcours (départ, arrivée, contexte) — la seule
   * donnée réelle disponible : aucun champ structuré départ/arrivée
   * n'existe sur le modèle Goal. */
  notes: string | null;
};

/**
 * En-tête d'objectif — bloc dominant de l'accueil (section 3.1). Le chrono
 * est TOUJOURS rendu via `formatTimeRange` : une fourchette, jamais un point
 * unique, même quand les deux bornes stockées sont encore égales.
 *
 * Le profil de parcours en pointillés est décoratif et assumé (section 3.1
 * du cahier des charges le dit explicitement) : sans donnée d'altitude
 * réelle sur l'objectif, une silhouette générique en faux plat descendant
 * illustre le ton sans prétendre mesurer quoi que ce soit.
 */
export function GoalHeader({ goal, today }: { goal: GoalHeaderData; today: Day }) {
  const days = diffDays(today, goal.day);
  const targetRange = formatTimeRange(goal.targetTimeMinS, goal.targetTimeMaxS, (s) =>
    s == null ? "—" : formatHms(s),
  );
  const paceMin =
    goal.targetTimeMinS != null ? goal.targetTimeMinS / (goal.distanceM / 1000) : null;
  const paceMax =
    goal.targetTimeMaxS != null ? goal.targetTimeMaxS / (goal.distanceM / 1000) : null;
  const paceRange = formatTimeRange(paceMin, paceMax, (s) => (s == null ? "—" : formatPace(s)));

  return (
    <section className="border-b border-[var(--color-border)] pb-6">
      <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
        <div className="flex w-fit flex-col items-center rounded-[var(--radius-card)] border border-[var(--color-accent)] px-6 py-4">
          <span className="text-hero-number text-hero-xl" style={{ color: "var(--color-accent)" }}>
            <CountdownReveal value={days} />
          </span>
          <span className="mt-1 text-xs tracking-wide text-[var(--color-muted)]">
            {days <= 0 ? "C'EST AUJOURD'HUI" : "JOURS AVANT"}
          </span>
        </div>

        <div>
          <h1 className="font-display text-xl text-[var(--color-text)] sm:text-2xl">{goal.name}</h1>
          <dl className="tabular mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-[var(--color-muted)]">Date</dt>
              <dd className="mt-0.5">{formatDayAbbrev(goal.day)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-muted)]">Distance</dt>
              <dd className="mt-0.5">{formatDistance(goal.distanceM)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-muted)]">Chrono cible</dt>
              <dd className="mt-0.5">{targetRange ?? <span className="text-[var(--color-faint)]">non disponible</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-muted)]">Allure de course</dt>
              <dd className="mt-0.5">{paceRange ?? <span className="text-[var(--color-faint)]">non disponible</span>}</dd>
            </div>
          </dl>
          {goal.notes ? <p className="mt-3 max-w-2xl text-sm text-[var(--color-muted)]">{goal.notes}</p> : null}

          <RouteProfileDecoration />
        </div>
      </div>
    </section>
  );
}

function formatHms(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

/** Silhouette décorative en faux plat descendant — jamais une mesure. */
function RouteProfileDecoration() {
  return (
    <div className="mt-4 max-w-md">
      <svg viewBox="0 0 300 40" className="h-8 w-full" aria-hidden>
        <polyline
          points="0,10 60,14 120,18 180,24 240,29 300,33"
          fill="none"
          stroke="var(--color-border-strong)"
          strokeWidth="2"
          strokeDasharray="4 4"
          strokeLinecap="round"
        />
      </svg>
      <p className="mt-0.5 text-[11px] text-[var(--color-faint)]">
        faux plat descendant, ancienne voie ferrée
      </p>
    </div>
  );
}
