import { Placeholder } from "@/components/ui/placeholder.tsx";

export default function PlanPage() {
  return (
    <Placeholder
      title="Mon plan"
      phase="Phase 6"
      description="Plan généré par l'API Claude sous contraintes, phases de périodisation, semaine détaillée, et historique des adaptations avec le raisonnement conservé."
      items={[
        "Génération complète d'un plan vers un objectif, découpé en phases",
        "Adaptation hebdomadaire avec explication de ce qui a changé et pourquoi",
        "Replanification ciblée déclenchée par un remplacement ou une séance manquée",
        "Vérification systématique des allures proposées contre les zones calculées",
      ]}
      requires="Nécessite le moteur de calcul (phase 4) et les objectifs saisis à l'onboarding (phase 5)."
    />
  );
}
