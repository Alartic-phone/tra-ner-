import { formatClock, formatDistance, formatPace } from "../utils.ts";
import type { ExportData } from "./schema.ts";

/**
 * Rendu Markdown, déterministe : à `ExportData` identique, sortie identique
 * au caractère près. Aucune horloge, aucun ordre de Map, aucune concurrence
 * n'entre dans cette fonction — tout ce qui varie (dates, hasard) a déjà été
 * figé dans `ExportData` par `collect.ts`.
 */

const EST = "[est]";
const NA = "non disponible";

function fmt(value: string | number | null | undefined, unit = ""): string {
  if (value == null) return NA;
  return `${value}${unit}`;
}

function fmtEst(value: string | number | null | undefined, unit = ""): string {
  if (value == null) return NA;
  return `${value}${unit} ${EST}`;
}

function round(n: number | null, decimals = 0): number | null {
  if (n == null) return null;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "_Aucune donnée._\n";
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}\n`;
}

export function renderMarkdown(data: ExportData): string {
  const sections: string[] = [];

  sections.push(`# EXPORT COACH — ${data.metadata.exportedAt.slice(0, 10)}`);
  sections.push(renderMetadata(data));

  if (data.profile) sections.push(renderProfile(data.profile));
  if (data.shifts) sections.push(renderShifts(data.shifts));
  if (data.weeks) sections.push(renderWeeks(data.weeks));
  if (data.activities) sections.push(renderActivities(data.activities));
  if (data.activityDetails.length > 0) sections.push(renderActivityDetails(data));
  if (data.health) sections.push(renderHealth(data.health));
  if (data.records) sections.push(renderRecords(data));
  if (data.plan) sections.push(renderPlan(data.plan));
  if (data.quality) sections.push(renderQuality(data.quality));

  return sections.join("\n") + "\n";
}

function renderMetadata(data: ExportData): string {
  const m = data.metadata;
  const lines = [
    "## 0. Métadonnées",
    "",
    `- Version du schéma d'export : ${m.schemaVersion}`,
    `- Date et heure d'export : ${m.exportedAt}`,
    `- Fuseau : ${m.timezone}`,
    `- Période couverte : ${m.period.from} → ${m.period.to}`,
    `- Activités : ${m.counts.activities}`,
    `- Jours de santé enregistrés : ${m.counts.healthDays}`,
    `- Séances planifiées : ${m.counts.plannedWorkouts}`,
    `- Sources présentes : ${m.sources.length > 0 ? m.sources.join(", ") : "aucune"}`,
    "",
    "Convention de notation, valable dans tout le document :",
    `- \`${m.notation.estimated}\` = valeur obtenue par approximation, jamais une mesure directe.`,
    `- « ${m.notation.unavailable} » = donnée absente. Jamais remplacée par une estimation silencieuse ni par zéro.`,
  ];
  return lines.join("\n") + "\n";
}

function renderProfile(p: NonNullable<ExportData["profile"]>): string {
  const lines = [
    "## 1. Profil et zones",
    "",
    `- Âge : ${fmt(p.ageYears, " ans")}`,
    `- Taille : ${fmt(p.heightCm, " cm")}`,
    `- Poids : ${p.weight ? `${p.weight.kg} kg (date de mesure : ${fmt(p.weight.measuredOn)})` : NA}`,
    `- FC max : ${fmt(p.hrMax, " bpm")}`,
    `- FC repos : ${fmt(p.hrRest, " bpm")}`,
    `- FC seuil : ${fmt(p.lactateThresholdHr, " bpm")}`,
    `- Méthode de calcul des zones : ${p.zoneMethod}`,
    `- VMA : ${p.vmaKmh != null ? `${p.vmaKmh} km/h` : NA}`,
    "",
    "### Zones de fréquence cardiaque",
    "",
    table(
      ["Zone", "Nom", "De (bpm)", "À (bpm)"],
      p.hrZones.map((z) => [`Z${z.index}`, z.name, String(z.fromBpm), String(z.toBpm)]),
    ),
  ];

  if (p.paceZones.length > 0) {
    lines.push(
      "### Zones d'allure",
      "",
      table(
        ["Zone", "% VMA", "Allure"],
        p.paceZones.map((z) => [
          z.name,
          `${Math.round(z.fromVmaPct * 100)}–${Math.round(z.toVmaPct * 100)} %`,
          `${formatPace(z.slowestSPerKm)} → ${formatPace(z.fastestSPerKm)}`,
        ]),
      ),
    );
  }

  return lines.join("\n") + "\n";
}

function renderShifts(s: NonNullable<ExportData["shifts"]>): string {
  const lines = [
    "## 2. Postes",
    "",
    `- Date d'ancrage du cycle : ${s.cycleAnchorDay}`,
    "- Blocs : " +
      s.blocks.map((b) => `${b.sequence} + ${b.restDays} j de repos`).join(" · "),
    "",
    "### Journées de la période",
    "",
    table(
      ["Jour", "Poste", "Horaires", "Créneaux disponibles", "Écart"],
      s.days.map((d) => [
        d.day,
        d.code ?? "repos",
        d.startTime && d.endTime ? `${d.startTime}–${d.endTime}` : "—",
        d.windows.length > 0 ? d.windows.map((w) => `${w.start}–${w.end}`).join(", ") : "—",
        d.isException ? (d.isReplacement ? "remplacement" : "modifié") : "",
      ]),
    ),
    "### Remplacements saisis",
    "",
    table(
      ["Jour", "Poste", "Remplacement", "Note"],
      s.replacements.map((r) => [r.day, r.code ?? "repos", r.isReplacement ? "oui" : "non", r.note ?? ""]),
    ),
  ];
  return lines.join("\n") + "\n";
}

function renderWeeks(weeks: NonNullable<ExportData["weeks"]>): string {
  const lines = [
    "## 3. Semaines",
    "",
    table(
      ["Semaine", "Km course", "Km vélo", "Autres sports", "Séances", "D+", "Temps total", "TRIMP", "CTL", "ATL", "TSB", "% par zone FC"],
      weeks.map((w) => [
        `${w.weekStart} → ${w.weekEnd}`,
        String(round(w.runKm, 1)),
        String(round(w.rideKm, 1)),
        w.otherSports.length > 0
          ? w.otherSports.map((o) => `${o.sport} ${round(o.km, 1)} km`).join(", ")
          : "—",
        String(w.sessions),
        `${Math.round(w.elevationGainM)} m`,
        formatClock(w.totalTimeS),
        fmtEst(w.trimpTotal != null ? Math.round(w.trimpTotal) : null),
        fmtEst(w.ctl != null ? Math.round(w.ctl) : null),
        fmtEst(w.atl != null ? Math.round(w.atl) : null),
        fmtEst(w.tsb != null ? Math.round(w.tsb) : null),
        w.zoneDistributionPct
          ? w.zoneDistributionPct.map((z) => `Z${z.zone} ${Math.round(z.pct)}%`).join(" ")
          : NA,
      ]),
    ),
  ];
  return lines.join("\n") + "\n";
}

function renderActivities(rows: NonNullable<ExportData["activities"]>): string {
  const lines = [
    "## 4. Activités",
    "",
    table(
      [
        "Date",
        "Heure",
        "Sport",
        "Nom",
        "Distance",
        "Temps mvt",
        "Temps écoulé",
        "Allure/vitesse",
        "FC moy",
        "FC max",
        "D+",
        "Cadence",
        "Calories",
        "TRIMP",
        "Poste",
        "Source",
      ],
      rows.map((a) => [
        a.day,
        a.time ?? NA,
        a.sport,
        a.name,
        formatDistance(a.distanceM),
        formatClock(a.movingTimeS),
        formatClock(a.elapsedTimeS),
        a.avgSpeedMps != null ? formatPace(1000 / a.avgSpeedMps) : NA,
        fmt(a.avgHr, " bpm"),
        fmt(a.maxHr, " bpm"),
        a.elevationGainM != null ? `${Math.round(a.elevationGainM)} m` : NA,
        fmt(a.avgCadence != null ? Math.round(a.avgCadence) : null),
        fmt(a.calories != null ? Math.round(a.calories) : null),
        a.trimpEstimated ? fmtEst(a.trimp != null ? Math.round(a.trimp) : null) : fmt(a.trimp != null ? Math.round(a.trimp) : null),
        a.shiftCode ?? "repos",
        a.source,
      ]),
    ),
  ];
  return lines.join("\n") + "\n";
}

function renderActivityDetails(data: ExportData): string {
  const byId = new Map((data.activities ?? []).map((a) => [a.id, a]));
  const lines = ["## 5. Détail des activités marquantes", ""];

  for (const detail of data.activityDetails) {
    const activity = byId.get(detail.activityId);
    lines.push(`### ${activity ? `${activity.day} — ${activity.name}` : detail.activityId}`, "");

    lines.push(
      "**Splits kilométriques**",
      "",
      table(
        ["#", "Distance", "Allure", "FC moy", "D+", "D−"],
        detail.splits.map((s) => [
          `${s.index}${s.partial ? " (partiel)" : ""}`,
          formatDistance(s.distanceM),
          fmtEst(s.paceSPerKm != null ? formatPace(s.paceSPerKm) : null),
          fmt(s.avgHr != null ? Math.round(s.avgHr) : null, " bpm"),
          s.elevGainM != null ? `${Math.round(s.elevGainM)} m` : NA,
          s.elevLossM != null ? `${Math.round(s.elevLossM)} m` : NA,
        ]),
      ),
    );

    if (detail.laps.length > 0) {
      lines.push(
        "**Laps manuels**",
        "",
        table(
          ["#", "Nom", "Distance", "Temps", "FC moy", "FC max"],
          detail.laps.map((l) => [
            String(l.lapIndex),
            l.name ?? "",
            formatDistance(l.distanceM),
            formatClock(l.movingTimeS),
            fmt(l.avgHr, " bpm"),
            fmt(l.maxHr, " bpm"),
          ]),
        ),
      );
    }

    lines.push(
      `**Temps par zone FC** : ${
        detail.zoneSeconds
          ? detail.zoneSeconds.map((z) => `Z${z.zone} ${formatClock(z.seconds)}`).join(" · ")
          : NA
      }`,
      "",
      `**Découplage aérobie (Pa:Hr)** : ${detail.decouplingPct != null ? fmtEst(`${detail.decouplingPct.toFixed(1)} %`) : NA}`,
      "",
      `**Meilleurs efforts** : ${
        detail.bestEfforts.length > 0
          ? detail.bestEfforts
              .map((e) => `${formatClock(e.durationS)} → ${formatDistance(e.distanceM)}`)
              .join(" · ")
          : NA
      }`,
      "",
    );
  }

  return lines.join("\n") + "\n";
}

function renderHealth(rows: NonNullable<ExportData["health"]>): string {
  const lines = [
    "## 6. Santé quotidienne",
    "",
    table(
      ["Jour", "VFC nocturne", "Poste (bornes)", "FC repos", "Sommeil", "Score sommeil", "Sommeil profond", "Siestes"],
      rows.map((r) => [
        r.day,
        fmt(r.hrv, " ms"),
        r.shiftWindow ? (r.shiftWindow.code ? `${r.shiftWindow.code} ${r.shiftWindow.start}–${r.shiftWindow.end}` : "repos") : NA,
        fmt(r.restingHr, " bpm"),
        r.sleepDurationMin != null ? formatClock(r.sleepDurationMin * 60) : NA,
        fmt(r.sleepScore),
        fmt(r.sleepDeepPct != null ? Math.round(r.sleepDeepPct) : null, " %"),
        NA,
      ]),
    ),
  ];
  return lines.join("\n") + "\n";
}

function renderRecords(data: ExportData): string {
  const records = data.records!;
  const byId = new Map((data.activities ?? []).map((a) => [a.id, a]));
  const lines = [
    "## 7. Records et meilleurs efforts",
    "",
    "### Records par durée de référence",
    "",
    table(
      ["Durée", "Distance", "Date", "Activité"],
      records.byDuration.map((r) => [
        formatClock(r.durationS),
        formatDistance(r.distanceM),
        r.day || NA,
        r.activityId ? (byId.get(r.activityId)?.name ?? r.activityId) : NA,
      ]),
    ),
    "### Historique de la plus longue sortie",
    "",
    table(
      ["Date", "Distance"],
      records.longestRunProgression.map((p) => [p.day, formatDistance(p.distanceM)]),
    ),
  ];
  return lines.join("\n") + "\n";
}

function renderPlan(plan: NonNullable<ExportData["plan"]>): string {
  const lines = [
    "## 8. Plan",
    "",
    `**Objectif en cours** : ${
      plan.activeGoal
        ? `${plan.activeGoal.name} — ${plan.activeGoal.day} — ${formatDistance(plan.activeGoal.distanceM)}${plan.activeGoal.targetTimeS ? ` en ${formatClock(plan.activeGoal.targetTimeS)}` : ""}`
        : NA
    }`,
    "",
    table(
      ["Jour", "Type", "Titre", "Distance cible", "Zone cible", "Statut", "Réalisé", "Écart distance", "FC moy réalisée", "Zone respectée"],
      plan.workouts.map((w) => [
        w.day,
        w.type,
        w.title,
        w.targetDistanceM != null ? formatDistance(w.targetDistanceM) : NA,
        w.targetHrZone != null ? `Z${w.targetHrZone}` : NA,
        w.status,
        w.realized ? formatDistance(w.realized.distanceM) : NA,
        w.realized?.distanceDeltaPct != null ? `${w.realized.distanceDeltaPct > 0 ? "+" : ""}${w.realized.distanceDeltaPct.toFixed(1)} %` : NA,
        w.realized?.avgHr != null ? `${w.realized.avgHr} bpm` : NA,
        w.realized?.inTargetZone == null ? NA : w.realized.inTargetZone ? "oui" : "non",
      ]),
    ),
  ];
  return lines.join("\n") + "\n";
}

function renderQuality(q: NonNullable<ExportData["quality"]>): string {
  const lines = [
    "## 9. Qualité des données",
    "",
    `- Jours sans mesure de santé : ${q.healthDaysMissing} / ${q.healthDaysTotal}`,
    `- Activités sans flux cardiaque : ${q.activitiesWithoutHr}`,
    `- Activités sans GPS : ${q.activitiesWithoutGps}`,
    `- Périodes où les postes ne sont pas renseignés : ${q.shiftsUnconfiguredDays > 0 ? `${q.shiftsUnconfiguredDays} jour(s) sans cycle personnalisé (valeurs par défaut utilisées)` : "aucune — un cycle personnalisé est configuré"}`,
    "",
    "**Doublons suspects** (départs à moins de 10 min, distances à moins de 5 % d'écart) :",
    "",
    q.suspectedDuplicates.length > 0
      ? table(
          ["Jour", "Activité A", "Activité B", "Écart"],
          q.suspectedDuplicates.map((d) => [
            d.day,
            d.activityIds[0],
            d.activityIds[1],
            `${Math.round(d.gapMinutes)} min`,
          ]),
        )
      : "_Aucun doublon détecté sur la période._\n",
    "**Champs estimés dans cet export** :",
    "",
    q.estimatedFields.length > 0 ? q.estimatedFields.map((f) => `- ${f}`).join("\n") + "\n" : "_Aucun._\n",
  ];
  return lines.join("\n") + "\n";
}
