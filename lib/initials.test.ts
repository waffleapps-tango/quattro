import { expect, it } from "vitest";
import { initials } from "./initials";

it("handles missing, emoji and diacritic names", () => {
  expect(initials("Aleksandra", "Wiśniewska-Kowalczyk")).toBe("AW");
  expect(initials("Jo", null)).toBe("J");
  expect(initials(null, null)).toBe("");
  expect(initials("👩‍💻 Ada", "Lovelace")).toBe("👩‍💻L");
  expect(initials("Łukasz", "Ż")).toBe("ŁŻ");
});
