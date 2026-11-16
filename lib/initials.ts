const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const first = (s?: string | null) => (s?.trim() ? ([...seg.segment(s.trim())][0]?.segment ?? "") : "");

// First letter of first + last name, split by grapheme so emoji / combining marks stay whole.
export function initials(firstName?: string | null, lastName?: string | null) {
  return (first(firstName) + first(lastName)).toUpperCase();
}
