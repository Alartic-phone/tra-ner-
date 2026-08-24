/**
 * Amorçage : écrit en base le cycle de postes et les horaires par défaut,
 * ainsi que la ligne unique de profil. Rien n'est écrasé si des valeurs
 * existent déjà.
 *
 *   npm run db:seed
 */
import { prisma } from "../src/lib/db.ts";
import {
  DEFAULT_SHIFT_CYCLE,
  DEFAULT_SHIFT_TIMINGS,
} from "../src/lib/shifts/defaults.ts";

async function main(): Promise<void> {
  const user = await prisma.user.findFirst();
  if (!user) {
    await prisma.user.create({ data: { id: "me" } });
    console.log("Profil créé.");
  }

  const pattern = await prisma.shiftPattern.findFirst();
  if (!pattern) {
    await prisma.shiftPattern.create({
      data: {
        anchorDay: DEFAULT_SHIFT_CYCLE.anchorDay,
        blocksJson: JSON.stringify(DEFAULT_SHIFT_CYCLE.blocks),
        isActive: true,
      },
    });
    console.log("Cycle de postes par défaut écrit — à vérifier dans les réglages.");
  }

  const codes = await prisma.shiftCode.count();
  if (codes === 0) {
    await prisma.shiftCode.createMany({
      data: DEFAULT_SHIFT_TIMINGS.map((t, i) => ({
        code: t.code,
        label: t.label,
        startTime: t.startTime,
        endTime: t.endTime,
        color: t.color ?? "#64748b",
        isWork: t.isWork,
        sortOrder: i,
      })),
    });
    console.log("Horaires de poste par défaut écrits — à ajuster dans les réglages.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
