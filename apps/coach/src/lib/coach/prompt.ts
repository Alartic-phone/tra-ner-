import { formatDayLong } from "../time.ts";
import { formatDistance, formatDuration } from "../utils.ts";
import type { CoachContext } from "./context.ts";

/**
 * Construction du prompt. Fonction pure : aucune lecture base ni réseau,
 * seulement la mise en forme du contexte déjà assemblé par `context.ts`.
 */

export function buildSystemPrompt(): string {
  return [
    "Tu es un coach de course à pied qui construit des plans d'entraînement",
    "structurés pour un coureur travaillant en horaires postés. Tu réponds",
    "STRICTEMENT au format JSON demandé, sans texte hors de ce format.",
    "",
    "Règles non négociables :",
    "- Tu ne donnes JAMAIS de conseil médical ou nutritionnel prescriptif.",
    "  En cas de douleur signalée, oriente vers une consultation d'un",
    "  professionnel de santé plutôt que vers une reprise ou une poursuite",
    "  de l'entraînement — jamais « pousser quand même ».",
    "- Toute séance doit tenir dans le créneau réellement disponible du jour",
    "  indiqué dans le contexte (durée, et type de séance autorisé ou non ce",
    "  jour-là). Ces contraintes sont dures : une séance qui les viole sera",
    "  rejetée et tu devras en proposer une autre.",
    "- Si le profil physiologique (zones FC, VMA) est incomplet, ne l'invente",
    "  pas : propose des allures relatives à l'objectif et signale la limite",
    "  dans `warnings`, ne la passe jamais sous silence.",
    "- Le raisonnement que tu écris dans `reasoning` doit être compréhensible",
    "  par le coureur : explique les choix de périodisation et pourquoi,",
    "  pas seulement ce qu'il doit courir.",
  ].join("\n");
}

function formatTargetTime(minS: number | null, maxS: number | null): string {
  if (minS == null || maxS == null) return "aucun chrono cible, terminer dans de bonnes conditions";
  if (minS === maxS) return formatDuration(minS);
  return `entre ${formatDuration(minS)} et ${formatDuration(maxS)}`;
}

export function buildUserPrompt(context: CoachContext): string {
  const lines: string[] = [];

  lines.push(`Aujourd'hui : ${formatDayLong(context.today)} (${context.today}).`);
  lines.push(
    `Objectif : "${context.goal.name}" — ${formatDistance(context.goal.distanceM)} le ` +
      `${formatDayLong(context.goal.day)} (${context.goal.day}). Chrono visé : ` +
      `${formatTargetTime(context.goal.targetTimeMinS, context.goal.targetTimeMaxS)}.`,
  );
  lines.push(
    `Fenêtre de préparation : environ ${context.weeksUntilGoal} semaines. C'est court : ` +
      "adapte la périodisation en conséquence (phases compressées), n'applique pas un cycle " +
      "standard de 12-16 semaines.",
  );

  lines.push("");
  lines.push("Profil physiologique :");
  if (context.profile) {
    lines.push(
      `- FC max ${context.profile.hrMax}, FC repos ${context.profile.hrRest}, sexe ${context.profile.sex}.`,
    );
  } else {
    lines.push("- Non renseigné.");
  }
  if (context.vmaKmh) lines.push(`- VMA : ${context.vmaKmh} km/h.`);
  if (context.hrZones) {
    lines.push(
      "- Zones FC : " +
        context.hrZones.map((z) => `Z${z.index} ${z.fromBpm}-${z.toBpm} bpm (${z.name})`).join(", "),
    );
  }
  if (context.paceZones) {
    lines.push(
      "- Zones d'allure (s/km, la plus rapide en premier) : " +
        context.paceZones
          .map((z) => `${z.name} ${Math.round(z.fastestSPerKm)}-${Math.round(z.slowestSPerKm)}`)
          .join(", "),
    );
  }

  lines.push("");
  lines.push("Forme actuelle :");
  if (context.fitness) {
    lines.push(
      `- CTL ${context.fitness.ctl.toFixed(1)}, ATL ${context.fitness.atl.toFixed(1)}, ` +
        `TSB ${context.fitness.tsb.toFixed(1)}${context.fitness.reliable ? "" : " (peu fiable, historique court)"}.`,
    );
    lines.push(
      `- Ratio aigu/chronique : ${context.fitness.acwr != null ? context.fitness.acwr.toFixed(2) : "non disponible"} ` +
        `(zone : ${context.fitness.acwrZone}).`,
    );
    if (context.fitness.acwrZone === "alerte") {
      lines.push(
        "  → Zone d'ALERTE : la première semaine du plan doit être allégée d'office par rapport à la deuxième.",
      );
    }
  } else {
    lines.push("- Non disponible (aucune activité importée récemment).");
  }

  if (context.prediction) {
    lines.push(
      `- Chrono actuellement prédit sur la distance de l'objectif : ` +
        `${formatDuration(context.prediction.medianTimeS)} (fourchette ${formatDuration(context.prediction.fastestTimeS)}–${formatDuration(context.prediction.slowestTimeS)}, confiance ${Math.round(context.prediction.confidence * 100)}%).`,
    );
  }

  lines.push("");
  lines.push("Cycle de postes — contraintes dures par jour, du début à l'objectif :");
  for (const resolvedDay of context.shiftRange.days) {
    const availability = context.shiftRange.byDay.get(resolvedDay.day)?.availability;
    if (!availability) continue;
    const parts = [
      resolvedDay.day,
      availability.isWorking ? `poste ${availability.code}` : "repos",
      `créneau max ${availability.maxSessionMin} min`,
      availability.allowsQuality ? "qualité OK" : "PAS de qualité",
      availability.allowsLongRun ? "sortie longue OK" : "PAS de sortie longue",
    ];
    if (availability.blockers.length > 0) parts.push(`(${availability.blockers.join(" ")})`);
    lines.push(`- ${parts.join(" — ")}`);
  }

  lines.push("");
  lines.push(
    `Taux de remplacements de postes accepté historiquement : ` +
      `${Math.round(context.replacementStats.replacementRate * 100)}% des jours de repos théoriques ` +
      "— à garder en tête pour ne pas caler trop de séances clés sur des repos qui pourraient sauter.",
  );

  if (context.injuryFlag) {
    lines.push("");
    lines.push("ALERTE DOULEUR — journal récent :");
    for (const note of context.injuryNotes) lines.push(`- ${note}`);
    lines.push(
      "→ Aucune séance de qualité dans les 7 prochains jours. Oriente vers la récupération " +
        "et, si pertinent, vers une consultation professionnelle.",
    );
  }

  if (context.dataCompleteness.length > 0) {
    lines.push("");
    lines.push("Données non disponibles (ne les invente pas, signale-les dans `warnings`) :");
    for (const note of context.dataCompleteness) lines.push(`- ${note}`);
  }

  lines.push("");
  lines.push(
    "Génère un plan complet, découpé en phases de périodisation adaptées à la fenêtre " +
      "disponible, avec les séances jour par jour respectant scrupuleusement les contraintes " +
      "ci-dessus, au format JSON demandé.",
  );

  return lines.join("\n");
}
