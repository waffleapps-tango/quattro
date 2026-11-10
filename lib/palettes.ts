export const PALETTE_KEY = "quattro-palette";

// swatch = [background, primary, accent] in light mode, for the picker previews.
export const PALETTES = [
  { id: "default", label: "Default", swatch: ["#f8f9ff", "#091426", "#805533"] },
  { id: "ocean", label: "Ocean", swatch: ["oklch(0.985 0.008 235)", "oklch(0.55 0.15 235)", "oklch(0.93 0.035 235)"] },
  { id: "forest", label: "Forest", swatch: ["oklch(0.985 0.008 150)", "oklch(0.55 0.13 150)", "oklch(0.93 0.035 150)"] },
  { id: "sunset", label: "Sunset", swatch: ["oklch(0.985 0.008 45)", "oklch(0.55 0.17 45)", "oklch(0.93 0.035 45)"] },
  { id: "rose", label: "Rose", swatch: ["oklch(0.985 0.008 10)", "oklch(0.55 0.17 10)", "oklch(0.93 0.035 10)"] },
  { id: "violet", label: "Violet", swatch: ["oklch(0.985 0.008 295)", "oklch(0.55 0.19 295)", "oklch(0.93 0.035 295)"] },
  { id: "coffee", label: "Coffee", swatch: ["oklch(0.985 0.008 65)", "oklch(0.55 0.06 65)", "oklch(0.93 0.035 65)"] },
  { id: "cyber", label: "Cyber", swatch: ["oklch(0.985 0.008 330)", "oklch(0.55 0.25 330)", "oklch(0.93 0.035 330)"] },
] as const;

export type PaletteId = (typeof PALETTES)[number]["id"];

export function getPalette(): PaletteId {
  try {
    return (document.documentElement.dataset.palette as PaletteId) || "default";
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
