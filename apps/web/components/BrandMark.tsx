import Link from "next/link";

export const BRAND_NAME = "Fixed Ops Reports";
export const BRAND_TAGLINE = "Service department performance intelligence";

type Size = "xs" | "sm" | "md" | "lg";
type Variant = "light" | "dark";

const SIZE_MAP: Record<Size, string> = {
  xs: "h-7 w-7 rounded-md",
  sm: "h-8 w-8 rounded-lg",
  md: "h-9 w-9 rounded-lg",
  lg: "h-11 w-11 rounded-xl",
};

const VARIANT_MAP: Record<Variant, string> = {
  light: "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200/60",
  dark: "bg-zinc-900 text-white ring-1 ring-zinc-800",
};

/**
 * Square logomark with a stylized chart-bars glyph.
 * Renders consistently across light/dark contexts via the `variant` prop.
 */
export function BrandMark({
  size = "md",
  variant = "light",
  className,
}: {
  size?: Size;
  variant?: Variant;
  className?: string;
}) {
  return (
    <div
      className={[
        "grid place-items-center",
        SIZE_MAP[size],
        VARIANT_MAP[variant],
        className ?? "",
      ].join(" ")}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[58%] w-[58%]"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
      >
        <path d="M5 19V12" />
        <path d="M12 19V8" />
        <path d="M19 19V14" />
        <path d="M3 19h18" strokeWidth={1.75} opacity={0.6} />
      </svg>
    </div>
  );
}

/**
 * Wordmark — the brand name set in semibold tracking-tight.
 */
export function BrandWordmark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const text =
    size === "sm" ? "text-sm" : size === "lg" ? "text-base" : "text-[15px]";
  return (
    <span
      className={["font-semibold tracking-tight", text, className ?? ""].join(
        " "
      )}
    >
      {BRAND_NAME}
    </span>
  );
}

/**
 * Logomark + wordmark together, optionally as a link to "/".
 */
export function BrandLockup({
  size = "sm",
  variant = "light",
  href,
  textClassName,
}: {
  size?: Size;
  variant?: Variant;
  href?: string;
  textClassName?: string;
}) {
  const inner = (
    <span className="flex items-center gap-2.5">
      <BrandMark size={size} variant={variant} />
      <BrandWordmark
        className={textClassName}
        size={size === "lg" ? "lg" : size === "xs" ? "sm" : "md"}
      />
    </span>
  );
  if (href) {
    return (
      <Link href={href} className="inline-flex items-center">
        {inner}
      </Link>
    );
  }
  return inner;
}
