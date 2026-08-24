import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils.ts";

/**
 * Primitives d'interface écrites à la main dans le style shadcn/ui plutôt
 * qu'installées via son CLI : elles se réduisent à quelques classes Tailwind,
 * et chaque dépendance en moins est une surface d'attaque et une source de
 * rupture en moins.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-accent)] text-[#06101f] hover:opacity-90",
        outline:
          "border border-[var(--color-border-strong)] bg-transparent hover:bg-[var(--color-surface-2)]",
        ghost: "hover:bg-[var(--color-surface-2)]",
        danger: "bg-[var(--color-danger)] text-white hover:opacity-90",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export { buttonVariants };
