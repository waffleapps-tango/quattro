import { describe, expect, it } from "vitest";
import { maskPerson, placeholderName } from "@/domain/privacy/person";

const ctx = { buildingName: "Budynek A", apartmentNumber: "4" };
const user = { id: "u1", firstName: "Jan", lastName: "Kowalski", email: "jan@example.com", shareName: true };

describe("placeholderName", () => {
  it("uses building and apartment when both are known", () => {
    expect(placeholderName(ctx)).toBe("Mieszkaniec Budynek A / 4");
  });
  it("falls back to a generic label", () => {
    expect(placeholderName()).toBe("Mieszkaniec");
    expect(placeholderName({ buildingName: "Budynek A" })).toBe("Mieszkaniec");
    expect(placeholderName({ buildingName: null, apartmentNumber: null })).toBe("Mieszkaniec");
  });
});

describe("maskPerson", () => {
  it("returns a sharing user untouched", () => {
    expect(maskPerson(user, "viewer", ctx)).toBe(user);
  });
  it("returns a hidden user untouched for themself", () => {
    const hidden = { ...user, shareName: false };
    expect(maskPerson(hidden, "u1", ctx)).toBe(hidden);
  });
  it("masks name and email of a hidden user for anyone else", () => {
    const masked = maskPerson({ ...user, shareName: false }, "viewer", ctx);
    expect(masked).toMatchObject({ id: "u1", firstName: "Mieszkaniec Budynek A / 4", lastName: null, email: "" });
  });
  it("does not add an email property when the input has none", () => {
    const { email: _email, ...noEmail } = user;
    const masked = maskPerson({ ...noEmail, shareName: false }, "viewer");
    expect(masked).not.toHaveProperty("email");
    expect(masked.firstName).toBe("Mieszkaniec");
  });
});
