import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "text" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

// Interaction color is always --ink (never the proof green). Danger uses --danger.
const variantClass: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-2",
  secondary: "bg-card text-ink border border-line hover:bg-line-soft",
  text: "bg-transparent text-slate hover:text-ink",
  danger: "bg-transparent text-danger border border-danger hover:bg-danger-soft",
};

// Heights: 常规 36 · 小 30 · 大 44
const sizeClass: Record<Size, string> = {
  sm: "h-[30px] px-3 text-[13px]",
  md: "h-9 px-4 text-[14px]",
  lg: "h-11 px-5 text-[15px]",
};

const base =
  "inline-flex items-center justify-center rounded-btn font-medium " +
  "transition-colors duration-150 cursor-pointer select-none " +
  "disabled:opacity-50 disabled:pointer-events-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${base} ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...props}
    />
  );
});

export default Button;
