import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { RecordsWall, type RecordWallItem } from "@/components/progression/records-wall.tsx";
import {
  LongestRunStepsChart,
  type LongestRunStep,
} from "@/components/progression/longest-run-steps-chart.tsx";
import { PaceVsHrChart } from "@/components/progression/pace-vs-hr-chart.tsx";
import { WeeklyVolumeChart } from "@/components/progression/weekly-volume-chart.tsx";
import { MilestonesList } from "@/components/progression/milestones-list.tsx";
import {
  loadDistanceRecordProgression,
  loadDurationRecordProgression,
  loadLongestDurationProgression,
  loadLongestRunProgression,
  loadMilestones,
  loadPaceVsHr,
  loadWeeklyVolume,
  loadWeeklyVolumeTargetKm,
} from "@/lib/metrics/repository.ts";
import { today } from "@/lib/time.ts";
import { formatClock, formatDistance, formatDuration, formatPace } from "@/lib/utils.ts";

export const dynamic = "force-dynamic";

/** Distances de record « au sens usuel » — cf. BestEffortByDistance. */
const DISTANCE_RECORDS = [
  { distanceM: 1000, label: "1 km" },
  { distanceM: 1609, label: "1 mile" },
  { distanceM: 5000, label: "5 km" },
  { distanceM: 10000, label: "10 km" },
] as const;

/** Fenêtre de référence pour « meilleure allure sur 20 min ». */
const PACE_RECORD_DURATION_S = 20 * 60;

export default async function ProgressionPage() {
  const now = today();

  const [
    distanceProgressions,
    paceRecordProgression,
    longestRunProgression,
    longestDurationProgression,
    paceHrPoints,
    weeklyVolume,
    weeklyTargetKm,
    milestones,
  ] = await Promise.all([
    Promise.all(DISTANCE_RECORDS.map((d) => loadDistanceRecordProgression(d.distanceM))),
    loadDurationRecordProgression(PACE_RECORD_DURATION_S),
    loadLongestRunProgression(),
    loadLongestDurationProgression(),
    loadPaceVsHr(),
    loadWeeklyVolume(12),
    loadWeeklyVolumeTargetKm(now),
    loadMilestones(),
  ]);

  const recordItems: RecordWallItem[] = [
    ...DISTANCE_RECORDS.map((def, i) => ({
      key: `distance-${def.distanceM}`,
      label: def.label,
      progression: distanceProgressions[i]!,
      format: (value: number) => ({ value: formatClock(value) }),
      unavailableReason: `Aucune sortie ne couvre encore ${def.label}`,
    })),
    {
      key: "longest-distance",
      label: "Plus longue distance",
      progression: longestRunProgression.map((p) => ({
        day: p.day,
        activityId: p.activityId,
        value: p.distanceM,
      })),
      format: (value: number) => ({ value: formatDistance(value) }),
      unavailableReason: "Aucune course à pied enregistrée",
    },
    {
      key: "longest-duration",
      label: "Plus longue durée",
      progression: longestDurationProgression.map((p) => ({
        day: p.day,
        activityId: p.activityId,
        value: p.movingTimeS,
      })),
      format: (value: number) => ({ value: formatDuration(value) }),
      unavailableReason: "Aucune course à pied enregistrée",
    },
    {
      key: "pace-20min",
      label: "Meilleure allure sur 20 min",
      progression: paceRecordProgression,
      // La progression stocke la distance couverte, pas l'allure : on la
      // reconvertit ici plutôt que de dupliquer la fenêtre de vingt minutes
      // dans le composant d'affichage.
      format: (value: number) => ({ value: formatPace(PACE_RECORD_DURATION_S / (value / 1000)) }),
      unavailableReason: "Aucune sortie de vingt minutes ou plus avec flux détaillé",
    },
  ];

  const longestRunSteps: LongestRunStep[] = longestRunProgression.map((p) => ({
    day: p.day,
    distanceKm: p.distanceM / 1000,
  }));

  return (
    <div className="p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold">Progression</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Le chemin parcouru — uniquement des mesures, jamais une estimation.
        </p>
      </header>

      <Card className="mt-4">
        <CardHeader
          title="Mur des records"
          hint="Meilleur temps ou meilleure distance sur chaque référence, extraits des sorties réelles."
        />
        <CardBody>
          <RecordsWall items={recordItems} today={now} />
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Progression de la plus longue sortie"
          hint="Chaque marche est une sortie qui a battu le record du moment."
        />
        <CardBody>
          {longestRunSteps.length > 0 ? (
            <LongestRunStepsChart steps={longestRunSteps} />
          ) : (
            <p className="text-xs text-[var(--color-muted)]">Aucune course à pied enregistrée.</p>
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Allure à FC égale" hint="Courses de plus de trente minutes, colorées par mois." />
        <CardBody>
          {paceHrPoints.length > 0 ? (
            <>
              <PaceVsHrChart points={paceHrPoints} />
              <p className="mt-2 text-xs text-[var(--color-muted)]">
                C&apos;est le vrai indicateur de progression aérobie : quand le nuage glisse vers le
                bas-gauche — allure plus rapide pour une fréquence cardiaque égale — la filière
                aérobie progresse.
              </p>
            </>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">
              Aucune sortie de plus de trente minutes avec fréquence cardiaque mesurée.
            </p>
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Volume hebdomadaire"
          hint="Douze dernières semaines, course et vélo empilés."
        />
        <CardBody>
          <WeeklyVolumeChart rows={weeklyVolume} targetKm={weeklyTargetKm} />
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Jalons" hint="Détectés automatiquement depuis les données, du plus récent au plus ancien." />
        <MilestonesList milestones={milestones} />
      </Card>
    </div>
  );
}
