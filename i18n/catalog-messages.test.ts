import { describe, expect, it } from "vitest";
import pl from "@/messages/pl.json";
import en from "@/messages/en.json";
import { CATEGORIES } from "@/domain/reports/catalog";

describe("catalog messages", () => {
  it("pl and en have the same number of suggestions per category", () => {
    const plCats: Record<string, { suggestions?: string[] }> = pl.reports.categories;
    const enCats: Record<string, { suggestions?: string[] }> = en.reports.categories;
    for (const { key } of CATEGORIES) {
      expect(enCats[key]?.suggestions?.length, key).toBe(plCats[key]?.suggestions?.length);
    }
  });

  for (const [lang, messages] of [["pl", pl], ["en", en]] as const) {
    it(`${lang} has a label and suggestions for every category`, () => {
      const cats: Record<string, { label?: string; suggestions?: string[] }> =
        messages.reports.categories;
      for (const { key } of CATEGORIES) {
        expect(cats[key]?.label?.trim(), `${lang}:${key}.label`).toBeTruthy();
        expect(cats[key]?.suggestions?.length, `${lang}:${key}.suggestions`).toBeGreaterThan(0);
      }
    });
  }
});
