import { describe, expect, it } from "vitest";
import { applyReaction, topReactions, type ReactionSummary } from "@/lib/engagement";

const empty: ReactionSummary = { counts: {}, total: 0, mine: null };

describe("applyReaction", () => {
  it("adds, switches and removes the viewer's reaction", () => {
    const liked = applyReaction(empty, "LIKE");
    expect(liked).toEqual({ counts: { LIKE: 1 }, total: 1, mine: "LIKE" });
    const loved = applyReaction({ counts: { LIKE: 3 }, total: 3, mine: "LIKE" }, "LOVE");
    expect(loved).toEqual({ counts: { LIKE: 2, LOVE: 1 }, total: 3, mine: "LOVE" });
    expect(applyReaction(liked, "LIKE")).toEqual(empty);
  });
});

describe("topReactions", () => {
  it("returns the most used kinds first, at most n", () => {
    const s: ReactionSummary = { counts: { SAD: 1, LIKE: 5, LOVE: 3, WOW: 2 }, total: 11, mine: null };
    expect(topReactions(s)).toEqual(["LIKE", "LOVE", "WOW"]);
    expect(topReactions(empty)).toEqual([]);
  });
});
