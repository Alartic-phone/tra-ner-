import { prisma } from "@/lib/db.ts";
import { isCoachConfigured } from "@/lib/env.ts";
import { GoalForm } from "@/components/plan/goal-form.tsx";
import { PlanView } from "@/components/plan/plan-view.tsx";
import { PlanImportForm } from "@/components/plan/plan-import-form.tsx";
import { ImportedPlanView } from "@/components/plan/imported-plan-view.tsx";
import { AddSessionCard } from "@/components/plan/add-session-card.tsx";
import { Card, CardHeader } from "@/components/ui/card.tsx";
import { PageContainer } from "@/components/page-container.tsx";
import { loadImportedSessions } from "@/lib/plan-import/repository.ts";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { loadShiftRange } from "@/lib/shifts/repository.ts";
import type { Day } from "@/lib/shifts/day.ts";
import { formatDayLong } from "@/lib/time.ts";
import { formatDistance, formatTimeRange } from "@/lib/utils.ts";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const goal = await prisma.goal.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  // Un plan déjà généré par l'API Claude continue de s'afficher tel quel,
  // qu'elle soit encore configurée ou non aujourd'hui — la génération est
  // désactivée comme CHEMIN D'ENTRÉE (plus bas), pas comme cause de
  // disparition d'un plan existant.
  const plan = goal
    ? await prisma.trainingPlan.findFirst({
        where: { goalId: goal.id, status: "active" },
        orderBy: { generatedAt: "desc" },
        include: { workouts: true, revisions: true },
      })
    : null;

  // Chargées inconditionnellement : l'objectif alimente le compte à rebours
  // de l'accueil et la trajectoire du simulateur, mais ne conditionne plus
  // l'affichage du plan (R1.2 — sans lui, les séances importées restaient
  // invisibles).
  const importedSessions = await loadImportedSessions();

  // Poste réel par jour (session-row.tsx, §2.5) — via lib/shifts/, jamais
  // via la colonne poste_F6 du CSV (cf. parse.ts, qui ne la stocke pas).
  const shiftLabelByDay = new Map<Day, string>();
  if (importedSessions.length > 0) {
    const days = importedSessions.map((s) => s.day).sort();
    const rules = await getAvailabilityRules();
    const range = await loadShiftRange(days[0]!, days[days.length - 1]!, rules);
    for (const [day, entry] of range.byDay) {
      const code = entry.resolved.code;
      shiftLabelByDay.set(day, code ? (range.timings.find((t) => t.code === code)?.label ?? code) : "Repos");
    }
  }

  const goalTargetRange = goal ? formatTimeRange(goal.targetTimeMinS, goal.targetTimeMaxS) : null;

  return (
    <PageContainer>
      <header>
        <h1 className="font-display text-lg font-semibold">Mon plan</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Plan fourni par fichier CSV — date, séance, statut, distance,
          durée, fourchette FC, objectif, détail muscu et fractionné.
        </p>
      </header>

      <div className="mt-5 max-w-3xl space-y-5">
        {!goal ? (
          <GoalForm />
        ) : (
          <Card>
            <CardHeader
              title="Objectif enregistré"
              hint={`${goal.name} — ${formatDistance(goal.distanceM)} le ${formatDayLong(goal.day)}${goalTargetRange ? `, chrono visé ${goalTargetRange}` : ""}`}
            />
          </Card>
        )}

        <PlanImportForm />

        <AddSessionCard />
      </div>

      {plan ? (
        <div className="mt-5">
          {importedSessions.length > 0 ? (
            <h2 className="font-display text-base font-semibold">Plan généré</h2>
          ) : null}
          <div className={importedSessions.length > 0 ? "mt-2" : undefined}>
            <PlanView goal={goal!} plan={plan} />
          </div>
        </div>
      ) : null}

      {importedSessions.length > 0 ? (
        <div className="mt-5">
          {plan ? (
            <h2 className="font-display text-base font-semibold">Séances importées</h2>
          ) : null}
          <div className={plan ? "mt-2" : undefined}>
            <ImportedPlanView sessions={importedSessions} shiftLabelByDay={shiftLabelByDay} />
          </div>
        </div>
      ) : null}

      {/*
       * Génération abandonnée comme mécanisme PRINCIPAL : le code
       * (lib/coach/, GenerateButton, actions generate/regenerate) reste
       * en place, simplement plus appelé depuis cette page — signalé
       * ici plutôt que supprimé, comme demandé.
       */}
      <p className="mt-5 max-w-3xl text-[11px] text-[var(--color-faint)]">
        Génération automatique par l&apos;API Claude : conservée dans le code,
        désactivée au profit de l&apos;import de fichier ci-dessus.
        {!isCoachConfigured() ? " (clé ANTHROPIC_API_KEY non configurée par ailleurs.)" : ""}
      </p>
    </PageContainer>
  );
}
