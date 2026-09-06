import type { ReactNode } from "react";
import { Breadcrumb } from "@/components/breadcrumb.tsx";

export default function ProgressionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Breadcrumb trail={[{ label: "Progression" }]} />
      {children}
    </>
  );
}
