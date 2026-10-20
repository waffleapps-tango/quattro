export const LOCALES = ["pl", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pl";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

// ponytail: looks only at the first tag and ignores q-weights; enough to pick pl vs en.
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | undefined {
  const first = header?.split(",")[0]?.trim().toLowerCase();
  if (!first) return undefined;
  return /^pl(-|$)/.test(first) ? "pl" : "en";
}

export function resolveLocale(input: {
  userLocale?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.userLocale)) return input.userLocale;
  if (isLocale(input.cookie)) return input.cookie;
  return localeFromAcceptLanguage(input.acceptLanguage) ?? DEFAULT_LOCALE;
}
