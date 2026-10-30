/** Stripes for Uncategorized, used by a chart's marks and legend swatch. */
export function HatchPattern({ id }) {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--surface-2)" />
          <rect width="3" height="6" fill="var(--chart-series-2)" />
        </pattern>
      </defs>
    </svg>
  );
}
