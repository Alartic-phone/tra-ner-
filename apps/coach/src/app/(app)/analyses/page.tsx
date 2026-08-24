import { Placeholder } from "@/components/ui/placeholder.tsx";

export default function AnalyticsPage() {
  return (
    <Placeholder
      title="Analyses"
      phase="Phase 4"
      description="Volume et charge dans le temps, répartition par zones, évolution de la VDOT, corrélations sommeil / HRV / performance."
      items={[
        "TRIMP de Banister, CTL (42 j), ATL (7 j), TSB",
        "Ratio aigu/chronique avec seuils 0,8–1,3 et alerte au-delà de 1,5",
        "Monotonie et contrainte de Foster",
        "Découplage cardiaque Pa:Hr sur les sorties longues",
      ]}
      requires="Prochaine phase de développement."
    />
  );
}
