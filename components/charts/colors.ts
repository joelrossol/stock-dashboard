export const C = {
  up: "#7DBF96",
  down: "#B48BD0",
  warn: "#CFAE73",
  accent: "#8E78C4",
  sage: "#6E9C86",
  slate: "#5A5870",
  card: "#201F29",
  card2: "#2A2935",
  fg: "#ECEAF3",
  fg2: "#A6A3B5",
  fg3: "#757287",
  grid: "rgba(255,255,255,0.05)",
  line: "rgba(255,255,255,0.07)",
};

/** Four-step heat colors by size of move (green up, plum down). */
const GREENS = ["#26392F", "#2D4D3B", "#3A654D", "#4C8463"];
const PLUMS = ["#2F2839", "#3D3150", "#523F6B", "#6A5289"];

export function heat(changePct: number): { bg: string; fg: string } {
  const a = Math.abs(changePct * 100);
  const k = a < 0.5 ? 0 : a < 1.5 ? 1 : a < 3 ? 2 : 3;
  return changePct >= 0 ? { bg: GREENS[k], fg: "#D3EBDC" } : { bg: PLUMS[k], fg: "#E9DDF5" };
}

export const SECTOR_COLORS = ["#8E78C4", "#6E9C86", "#C9A46A", "#6B8FC2", "#B07A9E", "#5E9C9C", "#9C8C6E", "#7A7896", "#A27B6B", "#5A5870"];
