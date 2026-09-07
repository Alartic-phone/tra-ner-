import { prisma } from "@/lib/db.ts";
import { ProfileForm } from "@/components/profile/profile-form.tsx";
import { Breadcrumb } from "@/components/breadcrumb.tsx";
import { PageContainer } from "@/components/page-container.tsx";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await prisma.user.findFirst();

  return (
    <>
      <Breadcrumb trail={[{ label: "Réglages", href: "/reglages" }, { label: "Profil" }]} />
      <PageContainer>
      <header>
        <h1 className="font-display text-lg font-semibold">Profil</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Repères physiologiques dont dépendent la charge d&apos;entraînement et
          les zones. Rien n&apos;est deviné : un champ vide reste vide, et les
          indicateurs qui en dépendent s&apos;affichent « non disponible ».
        </p>
      </header>

      <div className="mt-5 max-w-2xl">
        <ProfileForm
          initial={{
            firstName: user?.firstName ?? null,
            birthDate: user?.birthDate ?? null,
            sex: (user?.sex as "M" | "F" | null) ?? null,
            weightKg: user?.weightKg ?? null,
            hrMax: user?.hrMax ?? null,
            hrRest: user?.hrRest ?? null,
            lactateThresholdHr: user?.lactateThresholdHr ?? null,
            vma: user?.vma ?? null,
            weeklyVolumeKm: user?.weeklyVolumeKm ?? null,
            weeklySessionsTarget: user?.weeklySessionsTarget ?? null,
            injuryHistory: user?.injuryHistory ?? null,
          }}
        />
      </div>
      </PageContainer>
    </>
  );
}
