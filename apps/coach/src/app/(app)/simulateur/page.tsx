import { Placeholder } from "@/components/ui/placeholder.tsx";

export default function SimulatorPage() {
  return (
    <Placeholder
      title="Simulateur"
      phase="Phase 7"
      description="Prédictions de performance affichées en fourchette, jamais en chiffre unique, avec un indice de confiance fondé sur la fraîcheur et la représentativité des données."
      items={[
        "Formule de Riegel (exposant ajustable)",
        "VDOT de Daniels et table chrono ↔ allures d'entraînement",
        "Modèle de vitesse critique à partir des meilleurs efforts",
        "Trajectoire vers l'objectif : en avance, dans les temps, ou en retard",
      ]}
      requires="Nécessite le moteur de calcul (phase 4)."
    />
  );
}
