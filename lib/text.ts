// NFD splits most accented letters into base + combining mark, but not ł/Ł.
export function slugify(text: string): string {
  return text
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// "Resident 1" -> "R1", "Anna Admin" -> "AA"; a single word gives one letter.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

// Loose on purpose: info contacts hold numbers like "112" or "22 000 00 00", not just E.164.
export function isValidPhone(phone: string): boolean {
  const p = phone.trim();
  return /^\+?[\d\s()-]+$/.test(p) && (p.match(/\d/g)?.length ?? 0) >= 3;
}
