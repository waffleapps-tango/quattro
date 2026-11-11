import { describe, expect, it } from "vitest";
import { initials, isValidPhone, slugify } from "@/lib/text";

describe("slugify", () => {
  it("transliterates Polish letters, including ł which NFD does not decompose", () => {
    expect(slugify("Zażółć gęślą jaźń")).toBe("zazolc-gesla-jazn");
    expect(slugify("Łódź")).toBe("lodz");
  });

  it("collapses punctuation and trims dashes", () => {
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
    expect(slugify("!!!")).toBe("");
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Resident 1")).toBe("R1");
    expect(initials("Anna Admin")).toBe("AA");
    expect(initials("łucja żak")).toBe("ŁŻ");
  });

  it("falls back to the first letter, then to ?", () => {
    expect(initials("admin@quattro.dev")).toBe("A");
    expect(initials("")).toBe("?");
  });
});

describe("isValidPhone", () => {
  it("accepts short emergency numbers and formatted numbers", () => {
    for (const p of ["112", "997", "600 100 200", "22 000 00 00", "+48 123-456-789", "(22) 123 45 67"]) {
      expect(isValidPhone(p), p).toBe(true);
    }
  });

  it("rejects text and too-short input", () => {
    for (const p of ["abc", "12", "tel: 112", "+", "1 2"]) {
      expect(isValidPhone(p), p).toBe(false);
    }
  });
});
