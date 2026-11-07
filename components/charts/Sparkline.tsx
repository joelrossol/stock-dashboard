import { curveMonotoneX, line } from "d3-shape";
import { C } from "./colors";

export function Sparkline({
  values,
  width = 70,
  height = 22,
  color,
  strokeWidth = 1.4,
  className,
  fluid = false,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
  /** Stretch to the container's width (keeps stroke width constant). */
  fluid?: boolean;
}) {
  if (values.length < 2) return <svg width={width} height={height} className={className} aria-hidden />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pad = strokeWidth;
  const path = line<number>()
    .x((_, i) => (i / (values.length - 1)) * width)
    .y((v) => pad + ((hi - v) / span) * (height - 2 * pad))
    .curve(curveMonotoneX)(values);
  const stroke = color ?? (values[values.length - 1] >= values[0] ? C.up : C.down);
  return (
    <svg
      width={fluid ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? "none" : undefined}
      className={className}
      aria-hidden
      style={{ overflow: "visible" }}
    >
      <path d={path ?? ""} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
