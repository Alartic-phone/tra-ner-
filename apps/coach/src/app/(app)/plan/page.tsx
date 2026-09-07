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

  const importedSessions = goal && !plan ? await loadImportedSessions() : [];

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

      {!goal ? (
        <div className="mt-5 max-w-3xl">
          <GoalForm />
        </div>
      ) : null}

      {goal && plan ? (
        <div className="mt-5">
          <PlanView goal={goal} plan={plan} />
        </div>
      ) : null}

      {goal && !plan ? (
        <div className="mt-5 max-w-3xl space-y-5">
          <Card>
            <CardHeader
              title="Objectif enregistré"
              hint={`${goal.name} — ${formatDistance(goal.distanceM)} le ${formatDayLong(goal.day)}${goalTargetRange ? `, chrono visé ${goalTargetRange}` : ""}`}
            />
          </Card>

          <PlanImportForm />

          <AddSessionCard />

          <ImportedPlanView sessions={importedSessions} />

          {/*
           * Génération abandonnée comme mécanisme PRINCIPAL : le code
           * (lib/coach/, GenerateButton, actions generate/regenerate) reste
           * en place, simplement plus appelé depuis cette page — signalé
           * ici plutôt que supprimé, comme demandé.
           */}
          <p className="text-[11px] text-[var(--color-faint)]">
            Génération automatique par l&apos;API Claude : conservée dans le code,
            désactivée au profit de l&apos;import de fichier ci-dessus.
            {!isCoachConfigured() ? " (clé ANTHROPIC_API_KEY non configurée par ailleurs.)" : ""}
          </p>
        </div>
      ) : null}
    </PageContainer>
  );
}
