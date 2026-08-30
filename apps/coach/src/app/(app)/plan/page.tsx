import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { isCoachConfigured } from "@/lib/env.ts";
import { GoalForm } from "@/components/plan/goal-form.tsx";
import { GenerateButton } from "@/components/plan/generate-button.tsx";
import { PlanView } from "@/components/plan/plan-view.tsx";
import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { formatDayLong } from "@/lib/time.ts";
import { formatDistance, formatDuration } from "@/lib/utils.ts";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const goal = await prisma.goal.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  const plan =
    goal && isCoachConfigured()
      ? await prisma.trainingPlan.findFirst({
          where: { goalId: goal.id, status: "active" },
          orderBy: { generatedAt: "desc" },
          include: { workouts: true, revisions: true },
        })
      : null;

  return (
    <div className="p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold">Mon plan</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Plan généré par l&apos;API Claude sous contraintes de postes, avec le
          raisonnement conservé — le plan doit pouvoir être compris, pas subi.
        </p>
      </header>

      <div className="mt-5 max-w-3xl">
        {!goal ? (
          <GoalForm />
        ) : !isCoachConfigured() ? (
          <Card>
            <CardHeader title="Génération non configurée" />
            <CardBody className="space-y-2 text-xs text-[var(--color-muted)]">
              <p>
                Objectif enregistré : <strong>{goal.name}</strong>,{" "}
                {formatDistance(goal.distanceM)} le {formatDayLong(goal.day)}
                {goal.targetTimeS ? `, chrono visé ${formatDuration(goal.targetTimeS)}` : ""}.
              </p>
              <p>
                La génération de plan appelle l&apos;API Claude, dont la clé
                (<code>ANTHROPIC_API_KEY</code>) n&apos;est pas renseignée dans{" "}
                <code>.env</code>. Voir le README, section « Récupérer la clé
                API Anthropic ».
              </p>
              <Link href="/reglages" className="inline-block underline">
                Aller aux réglages
              </Link>
            </CardBody>
          </Card>
        ) : !plan ? (
          <Card>
            <CardHeader title="Objectif enregistré" />
            <CardBody className="space-y-3 text-xs text-[var(--color-muted)]">
              <p>
                <strong>{goal.name}</strong> — {formatDistance(goal.distanceM)} le{" "}
                {formatDayLong(goal.day)}
                {goal.targetTimeS ? `, chrono visé ${formatDuration(goal.targetTimeS)}` : ""}.
              </p>
              <p>
                Aucun plan généré pour l&apos;instant. La génération peut prendre
                jusqu&apos;à une minute et interroge l&apos;API Claude.
              </p>
              <GenerateButton goalId={goal.id} mode="generate" />
            </CardBody>
          </Card>
        ) : (
          <PlanView goal={goal} plan={plan} />
        )}
      </div>
    </div>
  );
}
