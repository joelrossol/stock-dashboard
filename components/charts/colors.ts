export const C = {
  up: "#7DBF96",
  down: "#F16F6F",
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

/** Four-step heat colors by size of move (green up, red down). */
const GREENS = ["#26392F", "#2D4D3B", "#3A654D", "#4C8463"];
const REDS = ["#3A2629", "#52302F", "#723A38", "#9A4644"];

export function heat(changePct: number): { bg: string; fg: string } {
  const a = Math.abs(changePct * 100);
  const k = a < 0.5 ? 0 : a < 1.5 ? 1 : a < 3 ? 2 : 3;
  return changePct >= 0 ? { bg: GREENS[k], fg: "#D3EBDC" } : { bg: REDS[k], fg: "#FBE3E1" };
}

export const SECTOR_COLORS = ["#8E78C4", "#6E9C86", "#C9A46A", "#6B8FC2", "#B07A9E", "#5E9C9C", "#9C8C6E", "#7A7896", "#A27B6B", "#5A5870"];
