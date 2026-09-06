import { prisma } from "@/lib/db.ts";
import { PhotoHero } from "@/components/ui/photo-hero.tsx";
import { RecordStaircase } from "@/components/ui/record-staircase.tsx";
import { TraceAtlas } from "@/components/ui/trace-atlas.tsx";
import { PaceHrCloud, WeeklyVolumeChart } from "@/components/analytics/progression-charts-lazy.tsx";
import { readPhotoManifest } from "@/lib/photo-manifest.ts";
import { pickPhoto, momentForContext } from "@/lib/photos.ts";
import { today, currentHour, formatDayShort } from "@/lib/time.ts";
import { diffDays } from "@/lib/shifts/day.ts";
import { loadTraceAtlas } from "@/lib/trace-atlas-repository.ts";
import { loadMilestones, loadPaceHrCloud, loadWeeklyVolumeSeries } from "@/lib/progression-repository.ts";
import {
  loadBestEfforts,
  loadBestKilometer,
  loadLongestRunProgression,
  loadRecordWeek,
  predictDistance,
} from "@/lib/metrics/repository.ts";
import { fixed, formatClock, formatPace } from "@/lib/utils.ts";

export const dynamic = "force-dynamic";

function RecordCard({
  label,
  value,
  unit,
  day,
  estimated,
}: {
  label: string;
  value: string | null;
  unit?: string;
  day: string | null;
  estimated?: boolean;
}) {
  const ageDays = day ? diffDays(day, today()) : null;
  const isRecent = ageDays != null && ageDays < 7;

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
        {label}
        {estimated ? (
          <span className="rounded-[var(--radius-pill)] border border-[var(--color-border-strong)] px-1 text-[10px] leading-4 text-[var(--color-warn)]">
            est.
          </span>
        ) : null}
      </div>
      <div
        className="tabular mt-1 text-xl font-semibold"
        style={{ color: isRecent ? "var(--color-signal)" : "var(--color-text)" }}
      >
        {value ?? <span className="text-sm font-normal text-[var(--color-faint)]">non disponible</span>}
        {unit ? <span className="ml-1 text-xs text-[var(--color-faint)]">{unit}</span> : null}
      </div>
      {day ? (
        <div className="mt-0.5 text-[11px]" style={{ color: isRecent ? "var(--color-signal)" : "var(--color-faint)" }}>
          {formatDayShort(day)}
          {isRecent ? " · nouveau" : ` · il y a ${ageDays} j`}
        </div>
      ) : null}
    </div>
  );
}

export default async function ProgressionPage() {
  const day = today();
  const yearStart = `${day.slice(0, 4)}-01-01`;

  const [
    manifest,
    yearActivities,
    longestRunProgression,
    bestKm,
    twentyMinBest,
    recordWeek,
    predicted5k,
    predicted10k,
    paceHrPoints,
    weeklyVolume,
    atlas,
    milestones,
  ] = await Promise.all([
    readPhotoManifest(),
    prisma.activity.findMany({
      where: { startDay: { gte: yearStart, lte: day }, type: { in: ["Run", "TrailRun", "VirtualRun"] } },
      select: { distanceM: true },
    }),
    loadLongestRunProgression(),
    loadBestKilometer(),
    loadBestEfforts("1970-01-01", day).then((efforts) => efforts.find((e) => e.durationS === 1200) ?? null),
    loadRecordWeek(),
    predictDistance(5000, "1970-01-01", day),
    predictDistance(10000, "1970-01-01", day),
    loadPaceHrCloud(`${Number(day.slice(0, 4)) - 1}-01-01`, day),
    loadWeeklyVolumeSeries(12),
    loadTraceAtlas("1970-01-01", day),
    loadMilestones(),
  ]);

  const moment = momentForContext({ shiftCode: null, isWorking: false, hour: currentHour() });
  const photo = pickPhoto(day, moment, manifest);
  const yearTotalKm = yearActivities.reduce((s, a) => s + a.distanceM, 0) / 1000;
  const longestRun = longestRunProgression[longestRunProgression.length - 1] ?? null;

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 p-4 md:p-6">
      <PhotoHero photo={photo} height={120}>
        <h1 className="font-display text-lg font-semibold text-[var(--color-text)]">Progression</h1>
        <p className="tabular mt-0.5 text-sm text-[var(--color-text)]">
          {fixed(yearTotalKm, 2)} km parcourus en {day.slice(0, 4)}
        </p>
      </PhotoHero>

      <section>
        <h2 className="text-sm font-medium">Mur des records</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <RecordCard
            label="Plus longue sortie"
            value={longestRun ? fixed(longestRun.distanceM / 1000, 2) : null}
            unit="km"
            day={longestRun?.day ?? null}
          />
          <RecordCard
            label="Meilleur km"
            value={bestKm ? formatPace(bestKm.movingTimeS / (bestKm.distanceM / 1000)).replace("/km", "") : null}
            unit="/km"
            day={bestKm?.day ?? null}
          />
          <RecordCard
            label="Allure sur 20 min"
            value={twentyMinBest ? formatPace(twentyMinBest.durationS / (twentyMinBest.distanceM / 1000)).replace("/km", "") : null}
            unit="/km"
            day={null}
          />
          <RecordCard
            label="Semaine record"
            value={recordWeek ? fixed(recordWeek.km, 2) : null}
            unit="km"
            day={recordWeek?.weekStart ?? null}
          />
          <RecordCard
            label="5 km"
            value={predicted5k ? formatClock(Math.round(predicted5k.medianTimeS)) : null}
            day={null}
            estimated
          />
          <RecordCard
            label="10 km"
            value={predicted10k ? formatClock(Math.round(predicted10k.medianTimeS)) : null}
            day={null}
            estimated
          />
        </div>
      </section>

      {longestRunProgression.length > 0 ? (
        <section>
          <h2 className="text-sm font-medium">Progression de la plus longue sortie</h2>
          <div className="mt-2 max-w-2xl">
            <RecordStaircase
              records={longestRunProgression.map((r) => ({ day: r.day, value: r.distanceM / 1000 }))}
            />
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-medium">Allure × fréquence cardiaque</h2>
        <div className="mt-2">
          <PaceHrCloud points={paceHrPoints} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium">Volume hebdomadaire — 12 semaines</h2>
        <div className="mt-2">
          <WeeklyVolumeChart points={weeklyVolume} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium">Atlas des tracés</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Tous les tracés de course superposés depuis le début de l&apos;historique.
        </p>
        <div className="mt-2">
          <TraceAtlas svg={atlas?.svg ?? null} />
        </div>
      </section>

      {milestones.length > 0 ? (
        <section>
          <h2 className="text-sm font-medium">Jalons</h2>
          <ul className="mt-2 space-y-1.5">
            {milestones.map((m, i) => (
              <li key={i} className="flex items-baseline gap-2 text-xs">
                <span className="tabular w-20 shrink-0 text-[var(--color-faint)]">{formatDayShort(m.day)}</span>
                <span className="text-[var(--color-text)]">{m.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
