import { getActiveCycle, getTimings } from "@/lib/shifts/repository.ts";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { ShiftSettingsForm } from "@/components/calendar/shift-settings-form.tsx";
import { Breadcrumb } from "@/components/breadcrumb.tsx";
import { PageContainer } from "@/components/page-container.tsx";

export const dynamic = "force-dynamic";

export default async function ShiftSettingsPage() {
  const [cycle, timings, rules] = await Promise.all([
    getActiveCycle(),
    getTimings(),
    getAvailabilityRules(),
  ]);

  return (
    <>
      <Breadcrumb trail={[{ label: "Réglages", href: "/reglages" }, { label: "Cycle de postes" }]} />
      <PageContainer>
      <header>
        <h1 className="font-display text-lg font-semibold">Cycle de postes</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          La séquence, les horaires et les contraintes sont entièrement
          paramétrables : aucune valeur n&apos;est figée dans le code.
        </p>
      </header>

      <div className="mt-5 max-w-2xl">
        <ShiftSettingsForm cycle={cycle} timings={timings} rules={rules} />
      </div>
      </PageContainer>
    </>
  );
}
