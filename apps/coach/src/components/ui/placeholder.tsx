import { Card, CardBody, CardHeader } from "./card.tsx";
import { Badge } from "./badge.tsx";

/**
 * Page annoncée mais pas encore développée. Elle dit explicitement ce qui
 * viendra et ce qui la bloque, plutôt que d'afficher une interface vide ou,
 * pire, des chiffres provisoires.
 */
export function Placeholder({
  title,
  phase,
  description,
  items,
  requires,
}: {
  title: string;
  phase: string;
  description: string;
  items: string[];
  requires?: string;
}) {
  return (
    <div className="p-4 md:p-6">
      <header className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{title}</h1>
        <Badge tone="info">{phase}</Badge>
      </header>

      <Card className="mt-4 max-w-2xl">
        <CardHeader title="Pas encore développé" hint={description} />
        <CardBody>
          <ul className="space-y-1.5 text-xs text-[var(--color-muted)]">
            {items.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-[var(--color-faint)]">—</span>
                {item}
              </li>
            ))}
          </ul>
          {requires ? (
            <p className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-faint)]">
              {requires}
            </p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
