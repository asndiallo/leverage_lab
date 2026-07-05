type Variant = "neutral" | "positive" | "negative" | "warn" | "brand";

const styles: Record<Variant, string> = {
  neutral: "bg-canvas text-muted border-border",
  positive: "bg-positive/10 text-positive border-positive/30",
  negative: "bg-negative/10 text-negative border-negative/30",
  warn: "bg-warn/10 text-warn border-warn/40",
  brand: "bg-brand/10 text-brand border-brand/30",
};

export function Badge({
  children,
  variant = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
