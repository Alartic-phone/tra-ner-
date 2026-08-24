import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils.ts";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-xs font-medium text-[var(--color-muted)]", className)}
      {...props}
    />
  );
}

const control =
  "h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-faint)] disabled:opacity-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, "pr-8", className)} {...props} />;
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-[11px] text-[var(--color-faint)]">{children}</p>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p className="mt-1 text-xs text-[var(--color-danger)]">{children}</p>
  ) : null;
}
