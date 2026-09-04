"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveCycle, saveRules, saveTimings } from "@/app/(app)/reglages/postes/actions.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { Hint, Input, Label } from "@/components/ui/field.tsx";
import type { AvailabilityRules } from "@/lib/shifts/availability.ts";
import type { ShiftBlock, ShiftCycle, ShiftTiming } from "@/lib/shifts/types.ts";

type FeedbackState = { ok: boolean; text: string } | null;

export function ShiftSettingsForm({
  cycle,
  timings,
  rules,
}: {
  cycle: ShiftCycle;
  timings: ShiftTiming[];
  rules: AvailabilityRules;
}) {
  return (
    <div className="space-y-5">
      <CycleCard cycle={cycle} />
      <TimingsCard timings={timings} />
      <RulesCard rules={rules} />
    </div>
  );
}

function Feedback({ feedback }: { feedback: FeedbackState }) {
  if (!feedback) return null;
  return (
    <p
      className={
        feedback.ok
          ? "mt-3 text-xs text-[var(--color-ok)]"
          : "mt-3 text-xs text-[var(--color-danger)]"
      }
    >
      {feedback.text}
    </p>
  );
}

function CycleCard({ cycle }: { cycle: ShiftCycle }) {
  const [anchorDay, setAnchorDay] = useState(cycle.anchorDay);
  const [blocks, setBlocks] = useState<ShiftBlock[]>(cycle.blocks);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [pending, startTransition] = useTransition();

  const total = blocks.reduce((sum, b) => sum + b.sequence.length + b.restDays, 0);

  function update(index: number, patch: Partial<ShiftBlock>) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function submit() {
    startTransition(async () => {
      const result = await saveCycle({ anchorDay, blocks });
      setFeedback(
        result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error },
      );
    });
  }

  return (
    <Card>
      <CardHeader
        title="Définition du cycle"
        hint="Une suite de blocs « postes + repos », répétée à partir du jour d'ancrage."
      />
      <CardBody>
        <div className="max-w-xs">
          <Label htmlFor="anchor">Premier jour du premier bloc</Label>
          <Input
            id="anchor"
            type="date"
            value={anchorDay}
            onChange={(e) => setAnchorDay(e.target.value)}
            className="mt-1"
          />
        </div>

        <div className="mt-4 space-y-2">
          {blocks.map((block, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor={`seq-${i}`}>Bloc {i + 1} — séquence</Label>
                <Input
                  id={`seq-${i}`}
                  value={block.sequence}
                  onChange={(e) =>
                    update(i, { sequence: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })
                  }
                  placeholder="MMAAANN"
                  className="mt-1 font-mono tracking-widest"
                />
              </div>
              <div className="w-28">
                <Label htmlFor={`rest-${i}`}>Repos après</Label>
                <Input
                  id={`rest-${i}`}
                  type="number"
                  min={0}
                  value={block.restDays}
                  onChange={(e) => update(i, { restDays: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Supprimer le bloc ${i + 1}`}
                disabled={blocks.length <= 1}
                onClick={() => setBlocks((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setBlocks((prev) => [...prev, { sequence: "", restDays: 0 }])}
        >
          <Plus size={14} aria-hidden /> Ajouter un bloc
        </Button>

        <Hint>
          Longueur totale : {total} jours
          {total % 7 === 0
            ? ` — soit ${total / 7} semaines exactement. Le cycle retombe sur les mêmes jours de la semaine, le planning est donc parfaitement prévisible.`
            : " — ce n'est pas un multiple de 7 : les postes glisseront d'une semaine à l'autre."}
        </Hint>

        <div className="mt-4">
          <Button onClick={submit} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer le cycle"}
          </Button>
        </div>
        <Feedback feedback={feedback} />
      </CardBody>
    </Card>
  );
}

function TimingsCard({ timings }: { timings: ShiftTiming[] }) {
  const [rows, setRows] = useState<ShiftTiming[]>(timings);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [pending, startTransition] = useTransition();

  function update(index: number, patch: Partial<ShiftTiming>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function submit() {
    startTransition(async () => {
      const result = await saveTimings(
        rows.map((r) => ({ ...r, color: r.color ?? "#64748b" })),
      );
      setFeedback(
        result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error },
      );
    });
  }

  return (
    <Card>
      <CardHeader
        title="Codes et horaires de poste"
        hint="La durée du créneau d'entraînement disponible se déduit directement de ces horaires."
      />
      <CardBody>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="w-14">
                <Label htmlFor={`code-${i}`}>Code</Label>
                <Input
                  id={`code-${i}`}
                  value={row.code}
                  maxLength={2}
                  onChange={(e) => update(i, { code: e.target.value.toUpperCase() })}
                  className="mt-1 text-center font-mono"
                />
              </div>
              <div className="min-w-28 flex-1">
                <Label htmlFor={`label-${i}`}>Libellé</Label>
                <Input
                  id={`label-${i}`}
                  value={row.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="w-24">
                <Label htmlFor={`start-${i}`}>Début</Label>
                <Input
                  id={`start-${i}`}
                  type="time"
                  value={row.startTime}
                  onChange={(e) => update(i, { startTime: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="w-24">
                <Label htmlFor={`end-${i}`}>Fin</Label>
                <Input
                  id={`end-${i}`}
                  type="time"
                  value={row.endTime}
                  onChange={(e) => update(i, { endTime: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="w-16">
                <Label htmlFor={`color-${i}`}>Couleur</Label>
                <Input
                  id={`color-${i}`}
                  type="color"
                  value={row.color ?? "#64748b"}
                  onChange={(e) => update(i, { color: e.target.value })}
                  className="mt-1 p-1"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Supprimer le poste ${row.code}`}
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
        </div>

        <Hint>
          Une heure de fin antérieure à l&apos;heure de début signifie que le poste
          passe minuit — c&apos;est le cas normal d&apos;un poste de nuit.
        </Hint>

        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              {
                code: "",
                label: "",
                startTime: "08:00",
                endTime: "16:00",
                isWork: true,
                color: "#64748b",
              },
            ])
          }
        >
          <Plus size={14} aria-hidden /> Ajouter un poste
        </Button>

        <div className="mt-4">
          <Button onClick={submit} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer les horaires"}
          </Button>
        </div>
        <Feedback feedback={feedback} />
      </CardBody>
    </Card>
  );
}

function RulesCard({ rules }: { rules: AvailabilityRules }) {
  const [form, setForm] = useState(rules);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [pending, startTransition] = useTransition();

  function num(key: keyof AvailabilityRules, label: string, hint?: string) {
    return (
      <div>
        <Label htmlFor={String(key)}>{label}</Label>
        <Input
          id={String(key)}
          type="number"
          value={String(form[key])}
          onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
          className="mt-1"
        />
        {hint ? <Hint>{hint}</Hint> : null}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Contraintes d'entraînement"
        hint="Règles physiologiques appliquées automatiquement par le planificateur."
      />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="wake">Lever</Label>
            <Input
              id="wake"
              type="time"
              value={form.wakeTime}
              onChange={(e) => setForm({ ...form, wakeTime: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="bed">Coucher</Label>
            <Input
              id="bed"
              type="time"
              value={form.bedTime}
              onChange={(e) => setForm({ ...form, bedTime: e.target.value })}
              className="mt-1"
            />
          </div>
          {num("bufferBeforeMin", "Tampon avant le poste (min)", "Préparation et trajet.")}
          {num("bufferAfterMin", "Tampon après le poste (min)")}
          {num("sleepBlockMin", "Sommeil réservé autour d'un poste (min)")}
          {num("minSessionMin", "Créneau minimum exploitable (min)")}
          {num("maxSessionOnWorkDayMin", "Séance maximale un jour travaillé (min)")}
          {num("longRunMinMin", "Durée minimale d'une sortie longue (min)")}
          {num(
            "qualityBlockAfterNightH",
            "Délai après une nuit avant une séance de qualité (h)",
            "VMA, seuil et côtes sont interdits pendant ce délai.",
          )}
          {num(
            "qualityMinSessionMin",
            "Durée minimale pour une séance de qualité (min)",
            "Échauffement + corps de séance + retour au calme.",
          )}
          <div>
            <Label htmlFor="lateEvening">Pas de qualité à partir de</Label>
            <Input
              id="lateEvening"
              type="time"
              value={form.lateEveningTime}
              onChange={(e) => setForm({ ...form, lateEveningTime: e.target.value })}
              className="mt-1"
            />
            <Hint>Un créneau qui démarre après cette heure reste facile, jamais qualité.</Hint>
          </div>
          <div>
            <Label htmlFor="nightCodes">Codes considérés comme nuit</Label>
            <Input
              id="nightCodes"
              value={form.nightCodes.join(", ")}
              onChange={(e) =>
                setForm({
                  ...form,
                  nightCodes: e.target.value
                    .split(",")
                    .map((c) => c.trim().toUpperCase())
                    .filter(Boolean),
                })
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="early">Un poste avant cette heure est « matinal »</Label>
            <Input
              id="early"
              type="time"
              value={form.earlyShiftBeforeTime}
              onChange={(e) => setForm({ ...form, earlyShiftBeforeTime: e.target.value })}
              className="mt-1"
            />
            <Hint>Il impose un lever anticipé, donc une nuit écourtée.</Hint>
          </div>
        </div>

        <div className="mt-4">
          <Button
            onClick={() =>
              startTransition(async () => {
                const result = await saveRules(form);
                setFeedback(
                  result.ok
                    ? { ok: true, text: result.message }
                    : { ok: false, text: result.error },
                );
              })
            }
            disabled={pending}
          >
            {pending ? "Enregistrement…" : "Enregistrer les contraintes"}
          </Button>
        </div>
        <Feedback feedback={feedback} />
      </CardBody>
    </Card>
  );
}
