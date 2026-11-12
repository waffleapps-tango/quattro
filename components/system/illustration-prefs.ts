// Shared by the server action, the root layout and the client provider, so it must not be a
// "use client" module (constants exported from one turn into client references on the server).
export const ILLUSTRATIONS_COOKIE = "quattro-illustrations";

// Each set is a folder in public/icons/<id>/ with the same file names. To add a set, drop the
// folder there, add its id here and its file format in Illustration.tsx. The first one is the default.
export const ILLUSTRATION_SETS = ["2", "1"] as const;
export type IllustrationSet = (typeof ILLUSTRATION_SETS)[number];
export type IllustrationPref = IllustrationSet | "off";

export function parseIllustrationPref(value: string | undefined): IllustrationPref {
  if (value === "off") return "off";
  return ILLUSTRATION_SETS.find((s) => s === value) ?? ILLUSTRATION_SETS[0];
}
