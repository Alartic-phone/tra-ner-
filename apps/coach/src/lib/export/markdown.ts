import type { ExportData } from "./schema.ts";
import { fixed, formatTimeRange } from "../utils.ts";

/**
 * Rendu Markdown déterministe : mêmes données -> même fichier au caractère
 * près (pour être comparé par `diff` entre deux exports). Aucune valeur non
 * déterministe n'y entre — `meta.exportedAt` est un JOUR (Europe/Paris), pas
 * un horodatage à la seconde, précisément pour ça.
 */

const NA = "non disponible";

function fmtNum(v: number | null, decimals = 0): string {
  return v == null ? NA : fixed(v, decimals);
}
function fmtPaceSPerKm(v: number | null): string {
  if (v == null) return NA;
  const total = Math.round(v);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}'${String(s).padStart(2, "0")}"/km`;
}
function fmtClock(seconds: number | null | undefined): string {
  if (seconds == null) return NA;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}
function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return rows.length > 0 ? `${head}\n${sep}\n${body}` : `${head}\n${sep}\n| ${headers.map(() => "—").join(" | ")} |`;
}

/** Aucune valeur exploitable sur aucun jour de la période — l'import COROS
 * étant abandonné (voir README), c'est désormais le cas de toute période qui
 * ne recoupe pas le bloc archivé (6-28 août 2026). */
function healthSectionIsEmpty(d: ExportData): boolean {
  return d.health.every(
    (h) =>
      h.hrv == null &&
      h.restingHr == null &&
      h.sleepDurationMin == null &&
      h.sleepDeepMin == null &&
      h.sleepScore == null &&
      h.recoveryStatusPct == null,
  );
}

export function buildMarkdownExport(data: ExportData): string {
  const sections = [
    section0Metadata(data),
    section1Profile(data),
    section2Shifts(data),
    section3Weeks(data),
    section4Activities(data),
    section5ActivityDetails(data),
    // Section numérotée 6 conservée quand la période archivée (août) est
    // couverte — omise plutôt que vide sinon, pas une réécriture des autres
    // numéros : le format doit rester stable d'un export à l'autre.
    healthSectionIsEmpty(data) ? null : section6Health(data),
    section7Records(data),
    section8Plan(data),
    section9Quality(data),
  ].filter((s): s is string => s !== null);
  return sections.join("\n\n") + "\n";
}

function section0Metadata(d: ExportData): string {
  return [
    "# Export coach",
    "",
    "## 0. Métadonnées",
    "",
    `- Version du schéma : ${d.meta.schemaVersion}`,
    `- Date d'export : ${d.meta.exportedAt}`,
    `- Période : ${d.meta.periodFrom} → ${d.meta.periodTo} (portée : ${d.meta.scope})`,
    `- Fuseau : ${d.meta.timezone}`,
    `- Activités : ${d.meta.counts.activities} · Jours de santé : ${d.meta.counts.healthDays} · Semaines : ${d.meta.counts.weeks}`,
    `- Notation : une valeur marquée « ${d.meta.notation.estimated} » est un modèle, pas une mesure. Une valeur « ${d.meta.notation.unavailable} » n'a jamais été mesurée — elle n'est ni omise ni remplacée par zéro.`,
  ].join("\n");
}

function section1Profile(d: ExportData): string {
  const p = d.profile;
  const lines = [
    "## 1. Profil et zones",
    "",
    `- Sexe : ${p.sex ?? NA} · Poids : ${fmtNum(p.weightKg, 1)} kg`,
    `- FC max : ${p.hrMax ?? NA} bpm · FC repos : ${p.hrRest ?? NA} bpm · VMA : ${fmtNum(p.vma, 1)} km/h`,
    "",
    "### Zones de fréquence cardiaque (Karvonen, réserve cardiaque)",
    "",
  ];
  lines.push(
    p.hrZones
      ? table(
          ["Zone", "Nom", "De (bpm)", "À (bpm)"],
          p.hrZones.map((z) => [`Z${z.index}`, z.name, String(z.fromBpm), String(z.toBpm)]),
        )
      : `${NA} — FC max et FC repos requises au profil.`,
  );
  lines.push("", "### Zones d'allure (% VMA)", "");
  lines.push(
    p.paceZones
      ? table(
          ["Zone", "% VMA", "Allure la plus rapide", "Allure la plus lente"],
          p.paceZones.map((z) => [
            z.name,
            `${Math.round(z.fromVmaPct * 100)}–${Math.round(z.toVmaPct * 100)} %`,
            fmtPaceSPerKm(z.fastestSPerKm),
            fmtPaceSPerKm(z.slowestSPerKm),
          ]),
        )
      : `${NA} — VMA requise au profil.`,
  );
  return lines.join("\n");
}

function section2Shifts(d: ExportData): string {
  const lines = [
    "## 2. Postes",
    "",
    `- Cycle ancré le : ${d.shifts.cycleAnchorDay}`,
    `- Blocs : ${d.shifts.blocks.map((b) => `${b.sequence} + ${b.restDays}j repos`).join(" · ")}`,
    "",
    "### Jour par jour",
    "",
    table(
      ["Jour", "Code", "Poste", "Exception", "Remplacement"],
      d.shifts.days.map((day) => [
        day.day,
        day.code ?? "—",
        day.label,
        day.isException ? "oui" : "non",
        day.isReplacement ? "oui" : "non",
      ]),
    ),
    "",
    "### Remplacements de la période",
    "",
    d.shifts.replacements.length > 0
      ? table(
          ["Jour", "Code", "Note"],
          d.shifts.replacements.map((r) => [r.day, r.code ?? "repos", r.note ?? "—"]),
        )
      : "Aucun remplacement sur la période.",
  ];
  return lines.join("\n");
}

function section3Weeks(d: ExportData): string {
  return [
    "## 3. Semaines",
    "",
    table(
      [
        "Semaine",
        "Km course",
        "Km vélo",
        "Séances",
        "D+ (m)",
        "Temps",
        "TRIMP (est.)",
        "CTL fin (est.)",
        "ATL fin (est.)",
        "TSB fin (est.)",
        "Répartition zones (%)",
      ],
      d.weeks.map((w) => [
        `${w.weekStart} → ${w.weekEnd}`,
        fixed(w.runKm, 2),
        fixed(w.rideKm, 2),
        String(w.sessions),
        fixed(w.elevationM, 0),
        fmtClock(w.durationS),
        fmtNum(w.trimp, 0),
        fmtNum(w.ctlEnd, 1),
        fmtNum(w.atlEnd, 1),
        fmtNum(w.tsbEnd, 1),
        w.zonePct
          ? Object.entries(w.zonePct)
              .map(([z, pct]) => `${z} ${pct}%`)
              .join(" ")
          : NA,
      ]),
    ),
  ].join("\n");
}

function section4Activities(d: ExportData): string {
  return [
    "## 4. Activités",
    "",
    table(
      ["Jour", "Nom", "Type", "Distance (km)", "Temps", "D+ (m)", "FC moy.", "TRIMP", "GAP"],
      d.activities.map((a) => [
        a.day,
        a.name,
        a.type,
        fixed(a.distanceM / 1000, 2),
        fmtClock(a.movingTimeS),
        fmtNum(a.elevationGainM, 0),
        a.avgHr != null ? String(a.avgHr) : NA,
        a.trimp != null ? `${Math.round(a.trimp)} (est.)` : NA,
        a.gapPaceSPerKm != null ? `${fmtPaceSPerKm(a.gapPaceSPerKm)} (est.)` : NA,
      ]),
    ),
  ].join("\n");
}

function section5ActivityDetails(d: ExportData): string {
  if (d.activityDetails.length === 0) {
    return ["## 5. Détail des activités sélectionnées", "", "Aucune activité sélectionnée pour le détail."].join("\n");
  }
  const blocks = d.activityDetails.map((det) => {
    const activity = d.activities.find((a) => a.id === det.activityId);
    const title = activity ? `${activity.day} — ${activity.name}` : det.activityId;
    const lines = [`### ${title}`, ""];
    lines.push("**Splits kilométriques**", "");
    lines.push(
      det.splits.length > 0
        ? table(
            ["#", "Distance (m)", "Temps", "FC moy."],
            det.splits.map((s) => [String(s.index), fixed(s.distanceM, 0), fmtClock(s.movingTimeS), s.avgHr != null ? String(s.avgHr) : NA]),
          )
        : "Aucun split.",
    );
    lines.push("", "**Tours**", "");
    lines.push(
      det.laps.length > 0
        ? table(
            ["#", "Distance (m)", "Temps", "FC moy.", "Manuel"],
            det.laps.map((l) => [String(l.index), fixed(l.distanceM, 0), fmtClock(l.movingTimeS), l.avgHr != null ? String(l.avgHr) : NA, l.isManual ? "oui" : "non"]),
          )
        : "Aucun tour.",
    );
    lines.push("", "**Temps par zone**", "");
    lines.push(
      det.zoneSecondsByZone
        ? table(["Zone", "Temps"], det.zoneSecondsByZone.map((s, i) => [`Z${i + 1}`, fmtClock(s)]))
        : `${NA} — pas de flux cardiaque ou profil incomplet.`,
    );
    lines.push("", "**Meilleurs efforts**", "");
    lines.push(
      det.bestEfforts.length > 0
        ? table(
            ["Durée", "Distance (m)"],
            det.bestEfforts.map((e) => [fmtClock(e.durationS), fixed(e.distanceM, 0)]),
          )
        : "Aucun meilleur effort extrait.",
    );
    return lines.join("\n");
  });

  return ["## 5. Détail des activités sélectionnées", "", blocks.join("\n\n")].join("\n");
}

function section6Health(d: ExportData): string {
  return [
    "## 6. Santé quotidienne",
    "",
    table(
      ["Jour", "VFC (ms)", "FC repos", "Sommeil", "Sommeil profond", "Score sommeil", "Récupération"],
      d.health.map((h) => [
        h.day,
        h.hrv != null ? String(h.hrv) : NA,
        h.restingHr != null ? String(h.restingHr) : NA,
        h.sleepDurationMin != null ? `${h.sleepDurationMin} min` : NA,
        h.sleepDeepMin != null ? `${h.sleepDeepMin} min` : NA,
        h.sleepScore != null ? String(h.sleepScore) : NA,
        h.recoveryStatusPct != null ? `${h.recoveryStatusPct} %` : NA,
      ]),
    ),
  ].join("\n");
}

function section7Records(d: ExportData): string {
  return [
    "## 7. Records et meilleurs efforts",
    "",
    table(
      ["Record", "Valeur", "Date"],
      d.records.map((r) => [
        r.label + (r.estimated ? " (est.)" : ""),
        r.value == null
          ? NA
          : r.unit === "s/km"
            ? fmtPaceSPerKm(r.value)
            : `${fixed(r.value, 2)} ${r.unit}`,
        r.day ?? "—",
      ]),
    ),
  ].join("\n");
}

function section8Plan(d: ExportData): string {
  const lines = ["## 8. Plan", ""];
  lines.push(
    d.plan.goal
      ? (() => {
          const range = formatTimeRange(d.plan.goal.targetTimeMinS, d.plan.goal.targetTimeMaxS, fmtClock);
          return `- Objectif : ${d.plan.goal.name}, le ${d.plan.goal.day}, ${fixed(d.plan.goal.distanceM / 1000, 1)} km${range ? `, chrono visé ${range}` : ""}`;
        })()
      : "- Aucun objectif actif.",
  );
  lines.push("", "### Séances planifiées", "");
  lines.push(
    d.plan.workouts.length > 0
      ? table(
          ["Jour", "Titre", "Type", "Statut", "Distance cible", "Durée cible", "Activité liée"],
          d.plan.workouts.map((w) => [
            w.day,
            w.title,
            w.type,
            w.status,
            w.targetDistanceM != null ? `${fixed(w.targetDistanceM / 1000, 1)} km` : "—",
            w.targetDurationS != null ? fmtClock(w.targetDurationS) : "—",
            w.activityId ?? "—",
          ]),
        )
      : "Aucune séance planifiée sur la période.",
  );
  return lines.join("\n");
}

function section9Quality(d: ExportData): string {
  const q = d.quality;
  const lines = ["## 9. Qualité des données", ""];
  const isClean =
    q.daysWithoutHealthMetric === 0 &&
    q.activitiesWithoutHr === 0 &&
    q.activitiesWithoutGps === 0 &&
    q.suspectedDuplicates.length === 0;

  if (isClean) {
    lines.push("Aucune anomalie détectée sur la période : tous les jours ont une mesure de santé, toutes les activités ont un flux cardiaque et un flux GPS, aucun doublon suspect.");
  } else {
    lines.push(`- Jours sans mesure de santé : ${q.daysWithoutHealthMetric}`);
    lines.push(`- Activités sans flux cardiaque : ${q.activitiesWithoutHr}`);
    lines.push(`- Activités sans flux GPS (approximation, voir note du générateur) : ${q.activitiesWithoutGps}`);
    lines.push(
      q.suspectedDuplicates.length > 0
        ? `- Doublons suspects (départs à moins de 10 min, distances à moins de 5 % d'écart) : ${q.suspectedDuplicates.map((s) => `${s.a}/${s.b}`).join(", ")}`
        : "- Aucun doublon suspect détecté.",
    );
  }

  lines.push("", "### Champs estimés et méthode", "");
  lines.push(...q.estimatedFields.map((f) => `- ${f}`));

  lines.push("", "### Périodes sans poste renseigné", "");
  lines.push(
    q.periodsWithoutShift.length > 0
      ? q.periodsWithoutShift.map((p) => `- ${p}`).join("\n")
      : "Aucune — le cycle de postes résout toujours un code (éventuellement repos) pour chaque jour.",
  );

  return lines.join("\n");
}
