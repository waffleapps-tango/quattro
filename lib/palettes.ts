export const PALETTE_KEY = "quattro-palette";

// swatch = [background, primary, accent] in light mode, for the picker previews.
export const PALETTES = [
  { id: "default", label: "Default", swatch: ["#f8f9ff", "#091426", "#805533"] },
  { id: "ocean", label: "Ocean", swatch: ["oklch(0.985 0.008 235)", "oklch(0.55 0.15 235)", "oklch(0.93 0.035 235)"] },
  { id: "forest", label: "Forest", swatch: ["oklch(0.985 0.008 150)", "oklch(0.55 0.13 150)", "oklch(0.93 0.035 150)"] },
  { id: "rose", label: "Rose", swatch: ["oklch(0.985 0.008 10)", "oklch(0.55 0.17 10)", "oklch(0.93 0.035 10)"] },
  { id: "violet", label: "Violet", swatch: ["oklch(0.985 0.008 295)", "oklch(0.55 0.19 295)", "oklch(0.93 0.035 295)"] },
  { id: "espresso", label: "Espresso", swatch: ["#f3ece1", "#2f5bea", "#2b2019"] },
  { id: "coral", label: "Coral", swatch: ["#f2eadb", "#ff6b4a", "#0d3b44"] },
  { id: "plum", label: "Plum", swatch: ["#ece4f3", "#f4b41a", "#22132b"] },
] as const;

export type PaletteId = (typeof PALETTES)[number]["id"];

export function getPalette(): PaletteId {
  try {
    const id = document.documentElement.dataset.palette;
    return PALETTES.some((p) => p.id === id) ? (id as PaletteId) : "default";
  } catch {
    return "default";
  }
}

export function applyPalette(id: PaletteId) {
  if (id === "default") delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = id;
  try {
    if (id === "default") localStorage.removeItem(PALETTE_KEY);
    else localStorage.setItem(PALETTE_KEY, id);
  } catch {}
}
