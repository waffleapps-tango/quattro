// Client-safe reaction helpers (no Prisma imports here).
export const REACTION_KINDS = ["LIKE", "LOVE", "HAHA", "WOW", "SAD"] as const;
export type ReactionKindName = (typeof REACTION_KINDS)[number];

// Untrusted input -> a kind, null (remove), or "invalid" (must not touch the user's reaction).
export function parseReactionKind(input: unknown): ReactionKindName | null | "invalid" {
  if (input === null) return null;
  return (REACTION_KINDS as readonly unknown[]).includes(input) ? (input as ReactionKindName) : "invalid";
}

export const REACTION_EMOJI: Record<ReactionKindName, string> = {
  LIKE: "👍",
  LOVE: "❤️",
  HAHA: "😂",
  WOW: "😮",
  SAD: "😢",
};

export type ReactionSummary = {
  counts: Partial<Record<ReactionKindName, number>>;
  total: number;
  mine: ReactionKindName | null;
};

// The summary after the viewer picks `kind`: same kind again removes it, another switches.
export function applyReaction(s: ReactionSummary, kind: ReactionKindName): ReactionSummary {
  const counts = { ...s.counts };
  const dec = (k: ReactionKindName) => {
    const n = (counts[k] ?? 0) - 1;
    if (n > 0) counts[k] = n;
    else delete counts[k];
  };
  if (s.mine) dec(s.mine);
  if (s.mine === kind) return { counts, total: s.total - 1, mine: null };
  counts[kind] = (counts[kind] ?? 0) + 1;
  return { counts, total: s.total - (s.mine ? 1 : 0) + 1, mine: kind };
}

export function topReactions(s: ReactionSummary, n = 3): ReactionKindName[] {
  return REACTION_KINDS.filter((k) => (s.counts[k] ?? 0) > 0)
    .sort((a, b) => (s.counts[b] ?? 0) - (s.counts[a] ?? 0))
    .slice(0, n);
}
