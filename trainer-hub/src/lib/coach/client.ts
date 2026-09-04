import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getEnv } from "../env.ts";
import type { CoachContext } from "./context.ts";
import { checkGuardrails } from "./guardrails.ts";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.ts";
import { planOutputSchema, type PlanOutput } from "./schema.ts";

/**
 * Échec explicite de génération, jamais avalé. Le message porte la dernière
 * violation ou erreur rencontrée, affiché tel quel dans l'interface.
 */
export class CoachGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoachGenerationError";
  }
}

const MAX_ATTEMPTS = 2;

export type CoachResult = {
  output: PlanOutput;
  model: string;
};

/**
 * Appelle l'API Claude pour générer un plan, avec au plus deux tentatives.
 * La sortie est contrainte par le schéma Zod côté serveur (structured
 * outputs) ET revérifiée côté code contre les contraintes de postes et les
 * garde-fous (`checkGuardrails`). Une séance qui viole une contrainte dure
 * est rejetée : l'erreur exacte est renvoyée au modèle pour la tentative
 * suivante, jamais silencieusement corrigée ou ignorée.
 */
export async function generatePlanWithCoach(context: CoachContext): Promise<CoachResult> {
  const env = getEnv();
  const client = new Anthropic();
  const system = buildSystemPrompt();

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildUserPrompt(context) }];

  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (lastError) {
      messages.push({
        role: "user",
        content:
          `La proposition précédente est invalide : ${lastError}\n` +
          "Corrige uniquement ce qui pose problème et renvoie un plan complet conforme au format demandé.",
      });
    }

    let response;
    try {
      response = await client.messages.parse({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 16000,
        system,
        messages,
        output_config: { format: zodOutputFormat(planOutputSchema) },
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        throw new CoachGenerationError("Clé API Anthropic invalide ou absente.");
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new CoachGenerationError("Quota de l'API Anthropic atteint — réessayer plus tard.");
      }
      if (error instanceof Anthropic.APIConnectionError) {
        throw new CoachGenerationError("Impossible de joindre l'API Anthropic — vérifier la connexion.");
      }
      if (error instanceof Anthropic.APIError) {
        throw new CoachGenerationError(`Erreur de l'API Anthropic (${error.status}) : ${error.message}`);
      }
      throw error;
    }

    if (!response.parsed_output) {
      lastError = "Sortie non conforme au schéma JSON attendu.";
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const violations = checkGuardrails(response.parsed_output, context);
    if (violations.length === 0) {
      return { output: response.parsed_output, model: env.ANTHROPIC_MODEL };
    }

    lastError = violations.join(" ; ");
    messages.push({ role: "assistant", content: response.content });
  }

  throw new CoachGenerationError(
    lastError ?? "Échec de génération du plan après deux tentatives, cause inconnue.",
  );
}
