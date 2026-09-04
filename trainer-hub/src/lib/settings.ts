import { z } from "zod";
import { prisma } from "./db.ts";
import { DEFAULT_AVAILABILITY_RULES } from "./shifts/availability.ts";

/**
 * Réglages applicatifs, stockés en clé/valeur JSON et validés par Zod à la
 * lecture. Toute valeur absente ou corrompue retombe sur le défaut plutôt que
 * de faire tomber la page.
 */

export const availabilityRulesSchema = z.object({
  bufferBeforeMin: z.number().int().min(0).max(240),
  bufferAfterMin: z.number().int().min(0).max(240),
  sleepBlockMin: z.number().int().min(0).max(720),
  wakeTime: z.string().regex(/^\d{2}:\d{2}$/),
  bedTime: z.string().regex(/^\d{2}:\d{2}$/),
  minSessionMin: z.number().int().min(5).max(240),
  maxSessionOnWorkDayMin: z.number().int().min(15).max(600),
  longRunMinMin: z.number().int().min(30).max(600),
  qualityBlockAfterNightH: z.number().min(0).max(48),
  nightCodes: z.array(z.string().min(1).max(2)),
  earlyShiftBeforeTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const SETTING_KEYS = {
  availabilityRules: "availability_rules",
  coachModel: "coach_model",
} as const;

async function readSetting<T>(key: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(row.valueJson));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

async function writeSetting<T>(key: string, value: T): Promise<void> {
  const valueJson = JSON.stringify(value);
  await prisma.setting.upsert({
    where: { key },
    create: { key, valueJson },
    update: { valueJson },
  });
}

export function getAvailabilityRules() {
  return readSetting(
    SETTING_KEYS.availabilityRules,
    availabilityRulesSchema,
    DEFAULT_AVAILABILITY_RULES,
  );
}

export function setAvailabilityRules(rules: z.infer<typeof availabilityRulesSchema>) {
  return writeSetting(SETTING_KEYS.availabilityRules, rules);
}
