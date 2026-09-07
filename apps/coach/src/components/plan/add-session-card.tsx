"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { SessionForm } from "@/components/plan/session-form.tsx";

/** Ajout manuel d'une séance, repliable — pour un ajustement ponctuel sans repasser par le CSV. */
export function AddSessionCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Ajouter une séance manuellement
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader title="Nouvelle séance" hint="Mêmes règles de validation qu'une ligne du fichier CSV." />
      <CardBody>
        <SessionForm
          mode="create"
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
          onCancel={() => setOpen(false)}
        />
      </CardBody>
    </Card>
  );
}
