const SIZES = {
  hero: "brand-logo--hero",
  card: "brand-logo--card",
};

/**
 * Primary brand mark, drawn from `/logo.png` — a cut-and-paste collage on a
 * transparent field, so it needs no plate behind it. It only reads as artwork
 * at 48px and up, so the hero and the result card carry it while compact
 * chrome uses the logotype in `Bungee` instead.
 */
export function BrandLogo({
  size = "hero",
  decorative = false,
  label = "Watch Your Movie",
  className = "",
  ...props
}) {
  return (
    <img
      src="/logo.png"
      alt={decorative ? "" : label}
      aria-hidden={decorative ? "true" : undefined}
      width="500"
      height="500"
      decoding="async"
      fetchPriority={size === "hero" ? "high" : "auto"}
      className={`brand-logo ${SIZES[size] ?? SIZES.hero} ${className}`.trim()}
      {...props}
    />
  );
}

export default BrandLogo;
