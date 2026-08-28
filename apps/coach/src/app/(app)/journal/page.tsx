import { Placeholder } from "@/components/ui/placeholder.tsx";

export default function JournalPage() {
  return (
    <Placeholder
      title="Journal"
      phase="Phase 5"
      description="Saisie quotidienne en moins de 30 secondes, et vue historique croisant ressenti et charge."
      items={[
        "Ressenti général, fatigue, motivation, qualité de sommeil subjective",
        "Douleurs : zone et intensité, avec suivi de la persistance",
        "RPE de la séance du jour",
        "Croisement ressenti / charge / sommeil dans la vue historique",
      ]}
    />
  );
}
