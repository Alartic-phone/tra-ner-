import { prisma } from "@/lib/db.ts";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { loadCycleRibbonDays } from "@/lib/shifts/repository.ts";
import { mondayOf, addDays } from "@/lib/shifts/day.ts";
import { today } from "@/lib/time.ts";
import {
  getProfileStatus,
  loadBestEfforts,
  loadNextGoal,
  loadWeeklyVolumeTargetKm,
} from "@/lib/metrics/repository.ts";
import { computeHeartRateZones } from "@/lib/metrics/zones.ts";
import {
  loadAgendaDays,
  loadDaysSinceLastStrength,
  loadDaysSinceLastWeighing,
  loadHasAnyPlan,
  loadNextSession,
  loadRecentActivities,
  loadSuspiciousActivities,
  loadTodaySessions,
  loadWeekOutOfZone12Fraction,
  loadWeeklyLoadInputs,
} from "@/lib/home-repository.ts";
import { buildWeeklyLoadBars, daysLeftInWeek, detectVigilancePoints } from "@/lib/home.ts";
import { PageContainer } from "@/components/page-container.tsx";
import { GoalHeader } from "@/components/home/goal-header.tsx";
import { ZoneInstrument } from "@/components/home/zone-instrument.tsx";
import { WeeklyLoadChart } from "@/components/home/weekly-load-chart.tsx";
import { TodayCard } from "@/components/home/today-card.tsx";
import { NextSession } from "@/components/home/next-session.tsx";
import { Agenda } from "@/components/home/agenda.tsx";
import { TrainingLog } from "@/components/home/training-log.tsx";
import { VigilancePoints } from "@/components/home/vigilance-points.tsx";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const day = today();
  const weekStart = mondayOf(day);
  const weekEnd = addDays(weekStart, 6);
  const rules = await getAvailabilityRules();

  const [
    nextGoal,
    profileStatus,
    ribbonDays,
    weeklyLoad,
    nextSession,
    recentActivities,
    daysSinceWeighing,
    daysSinceStrength,
    weekOutOfZone12Fraction,
    suspiciousActivities,
    bestEfforts,
    weeklyVolumeTargetKm,
    user,
    todaySessions,
    hasAnyPlan,
  ] = await Promise.all([
    loadNextGoal(),
    getProfileStatus(),
    loadCycleRibbonDays(day, rules, 0, 6),
    loadWeeklyLoadInputs(day),
    loadNextSession(day),
    loadRecentActivities(5),
    loadDaysSinceLastWeighing(day),
    loadDaysSinceLastStrength(day),
    loadWeekOutOfZone12Fraction(weekStart, weekEnd),
    loadSuspiciousActivities(day),
    loadBestEfforts("1970-01-01", day),
    loadWeeklyVolumeTargetKm(day),
    prisma.user.findFirst({ select: { weeklyVolumeKm: true } }),
    loadTodaySessions(day),
    loadHasAnyPlan(),
  ]);

  const hrZones =
    profileStatus.thresholdHr != null
      ? computeHeartRateZones(profileStatus.thresholdHr, profileStatus.profile?.hrMax ?? null)
      : [];

  const measuredThresholdEffort = bestEfforts.find((e) => e.durationS === 1200) ?? null;
  const measuredThresholdPaceSPerKm = measuredThresholdEffort
    ? measuredThresholdEffort.durationS / (measuredThresholdEffort.distanceM / 1000)
    : null;

  // Cible de la semaine : celle du plan actif si elle existe, sinon le
  // volume hebdomadaire du profil — même repli que l'ancien accueil. La
  // charge hebdomadaire (WeeklyLoadChart), elle, n'affiche QUE la cible du
  // plan pour ses barres "prévu" : le repli sur le profil n'a de sens que
  // pour cette alerte-ci, pas pour prétendre qu'un plan existe.
  const weekTargetKm = weeklyVolumeTargetKm ?? user?.weeklyVolumeKm ?? null;
  const weekRealizedKm = weeklyLoad.weeks.find((w) => w.weekStart === weekStart)?.realizedKm ?? 0;

  const vigilanceEntries = detectVigilancePoints({
    today: day,
    daysSinceLastWeighing: daysSinceWeighing,
    daysSinceLastStrength: daysSinceStrength,
    daysLeftInWeek: daysLeftInWeek(day),
    weekRealizedKm,
    weekTargetKm,
    weekOutOfZone12Fraction,
    suspiciousActivities,
  });

  const loadBars = buildWeeklyLoadBars(weeklyLoad.weeks, day);
  const agendaDays = await loadAgendaDays(day, ribbonDays);

  return (
    <PageContainer className="space-y-8">
      {nextGoal ? (
        <GoalHeader
          goal={{
            name: nextGoal.name,
            day: nextGoal.day,
            distanceM: nextGoal.distanceM,
            targetTimeMinS: nextGoal.targetTimeMinS,
            targetTimeMaxS: nextGoal.targetTimeMaxS,
            notes: nextGoal.notes,
          }}
          today={day}
        />
      ) : (
        <section className="border-b border-[var(--color-border)] pb-6">
          <p className="text-sm text-[var(--color-muted)]">
            Aucun objectif actif — un objectif se crée sur la page{" "}
            <a href="/plan" className="underline">
              Plan
            </a>
            .
          </p>
        </section>
      )}

      {profileStatus.thresholdHr != null ? (
        <ZoneInstrument
          data={{
            zones: hrZones,
            thresholdHr: profileStatus.thresholdHr,
            hrMax: profileStatus.profile?.hrMax ?? null,
            hrRest: profileStatus.profile?.hrRest ?? null,
            measuredThresholdPaceSPerKm,
          }}
        />
      ) : null}

      {/*
       * `grid-cols-1` explicite en base : sans lui, une grille sans piste
       * déclarée reste un unique conteneur "auto", qui grandit pour
       * accueillir le contenu de sa colonne au lieu de se contraindre à la
       * largeur du parent — la charge hebdomadaire (plusieurs semaines,
       * texte non compressible) débordait la page de ~25 px à 390 px
       * (trouvé à l'audit mobile). `min-w-0` sur chaque colonne pour la
       * même raison côté item de grille.
       */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-8">
          <WeeklyLoadChart bars={loadBars} hasPlan={weeklyLoad.hasPlan} />
          <TrainingLog activities={recentActivities} zones={hrZones} />
        </div>
        <div className="min-w-0 space-y-8">
          <TodayCard
            sessions={todaySessions}
            hasAnyPlan={hasAnyPlan}
            shiftLabel={ribbonDays[0]?.label ?? "Repos"}
            shiftCode={ribbonDays[0]?.code ?? null}
            startTime={ribbonDays[0]?.startTime ?? null}
            endTime={ribbonDays[0]?.endTime ?? null}
          />
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-[var(--color-muted)]">
              PROCHAINE SÉANCE
            </p>
            <NextSession session={nextSession} />
          </div>
          <Agenda days={agendaDays} />
          <VigilancePoints entries={vigilanceEntries} />
        </div>
      </div>
    </PageContainer>
  );
}
