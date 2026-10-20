import { describe, expect, it } from "vitest";
import { isLocale, localeFromAcceptLanguage, resolveLocale } from "@/i18n/locale";

describe("isLocale", () => {
  it("accepts only supported locales", () => {
    expect(isLocale("pl")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe("localeFromAcceptLanguage", () => {
  it("maps Polish to pl and everything else to en", () => {
    expect(localeFromAcceptLanguage("pl-PL,pl;q=0.9,en;q=0.8")).toBe("pl");
    expect(localeFromAcceptLanguage("pl")).toBe("pl");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("de-DE")).toBe("en");
  });

  it("returns undefined without a usable header", () => {
    expect(localeFromAcceptLanguage(undefined)).toBeUndefined();
    expect(localeFromAcceptLanguage(null)).toBeUndefined();
    expect(localeFromAcceptLanguage("")).toBeUndefined();
  });

  it("does not treat tags that only start with the letters pl as Polish", () => {
    expect(localeFromAcceptLanguage("plx")).toBe("en");
  });
});

describe("resolveLocale", () => {
  it("prefers the user's saved locale over cookie and header", () => {
    expect(resolveLocale({ userLocale: "en", cookie: "pl", acceptLanguage: "pl" })).toBe("en");
  });

  it("falls back to the cookie, then the header, then the default", () => {
    expect(resolveLocale({ userLocale: null, cookie: "en", acceptLanguage: "pl" })).toBe("en");
    expect(resolveLocale({ cookie: undefined, acceptLanguage: "en-GB" })).toBe("en");
    expect(resolveLocale({})).toBe("pl");
  });

  it("ignores invalid values at every level", () => {
    expect(resolveLocale({ userLocale: "xx", cookie: "yy", acceptLanguage: "pl" })).toBe("pl");
    expect(resolveLocale({ userLocale: "xx", cookie: "en" })).toBe("en");
  });
});
