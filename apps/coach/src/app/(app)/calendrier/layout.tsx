import type { ReactNode } from "react";
import { Breadcrumb } from "@/components/breadcrumb.tsx";

export default function CalendrierLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Breadcrumb trail={[{ label: "Calendrier" }]} />
      {children}
    </>
  );
}
