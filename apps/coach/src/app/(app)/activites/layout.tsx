import type { ReactNode } from "react";
import { Breadcrumb } from "@/components/breadcrumb.tsx";

export default function ActivitesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Breadcrumb trail={[{ label: "Activités", href: "/activites" }]} />
      {children}
    </>
  );
}
