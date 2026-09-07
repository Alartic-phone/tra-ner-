import type { ReactNode } from "react";
import { Breadcrumb } from "@/components/breadcrumb.tsx";

export default function AnalysesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Breadcrumb trail={[{ label: "Analyses" }]} />
      {children}
    </>
  );
}
