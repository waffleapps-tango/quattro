import { describe, expect, it } from "vitest";
import pl from "@/messages/pl.json";
import en from "@/messages/en.json";

type Tree = { [key: string]: string | string[] | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string | string[]> {
  return Object.entries(tree).reduce<Record<string, string | string[]>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string" || Array.isArray(value)) acc[path] = value;
    else Object.assign(acc, flatten(value, path));
    return acc;
  }, {});
}

const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort().join(",");

const plFlat = flatten(pl as Tree);
const enFlat = flatten(en as Tree);

describe("messages", () => {
  it("have the same keys in pl and en", () => {
    expect(Object.keys(enFlat).sort()).toEqual(Object.keys(plFlat).sort());
  });

  it("have no empty strings", () => {
    for (const [file, flat] of [["pl", plFlat], ["en", enFlat]] as const) {
      for (const [key, value] of Object.entries(flat)) {
        const items = Array.isArray(value) ? value : [value];
        for (const item of items) expect(item.trim(), `${file}:${key}`).not.toBe("");
      }
    }
  });

  it("use the same placeholders and array lengths in both languages", () => {
    for (const [key, plValue] of Object.entries(plFlat)) {
      const enValue = enFlat[key];
      if (Array.isArray(plValue)) {
        expect(Array.isArray(enValue) && enValue.length, key).toBe(plValue.length);
      } else {
        expect(placeholders(String(enValue)), key).toBe(placeholders(plValue));
      }
    }
  });
});
