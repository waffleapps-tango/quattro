export type Maskable = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email?: string;
  shareName: boolean;
};

export type PersonContext = { buildingName?: string | null; apartmentNumber?: string | null };

// ponytail: Polish only, domain code has no locale; add i18n if the app ever serves non-Polish communities.
export function placeholderName(ctx?: PersonContext): string {
  if (ctx?.buildingName && ctx.apartmentNumber) {
    return `Mieszkaniec ${ctx.buildingName} / ${ctx.apartmentNumber}`;
  }
  return "Mieszkaniec";
}

// The placeholder goes into firstName so every consumer that already renders
// "first last || email" shows it unchanged. Email is blanked (only when present)
// so the fallback cannot leak the identity.
export function maskPerson<T extends Maskable>(person: T, viewerId: string, ctx?: PersonContext): T {
  if (person.shareName || person.id === viewerId) return person;
  return {
    ...person,
    firstName: placeholderName(ctx),
    lastName: null,
    ...("email" in person ? { email: "" } : {}),
  };
}
