import type { ReactNode } from "react";
import { Breadcrumb } from "@/components/breadcrumb.tsx";

export default function JournalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Breadcrumb trail={[{ label: "Journal" }]} />
      {children}
    </>
  );
}
