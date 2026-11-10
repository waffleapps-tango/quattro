import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { ValidationError } from "@/domain/errors";
import { cleanupDatabase, createPackageScenario } from "@/domain/__test-helpers__/fixtures";
import { getPreferences, updatePreferences } from "@/domain/notifications/preferences";

afterEach(async () => {
  await cleanupDatabase();
});

describe("preferences", () => {
  it("defaults to everything off when no row exists", async () => {
    const { resident } = await createPackageScenario();
    expect(await getPreferences(resident.id)).toEqual({
      emailEnabled: false,
      smsEnabled: false,
      phone: null,
    });
  });

  it("saves and normalises the phone number", async () => {
    const { resident } = await createPackageScenario();
    await updatePreferences(resident, { emailEnabled: true, smsEnabled: true, phone: "+48 123-456 789" });
    expect(await getPreferences(resident.id)).toEqual({
      emailEnabled: true,
      smsEnabled: true,
      phone: "+48123456789",
    });
  });

  it("updates an existing row", async () => {
    const { resident } = await createPackageScenario();
    await updatePreferences(resident, { emailEnabled: true, smsEnabled: false, phone: null });
    await updatePreferences(resident, { emailEnabled: false, smsEnabled: false, phone: null });
    expect((await getPreferences(resident.id)).emailEnabled).toBe(false);
    expect(await prisma.notificationPreference.count()).toBe(1);
  });

  it("rejects a malformed phone", async () => {
    const { resident } = await createPackageScenario();
    for (const phone of ["123456789", "+0123456789", "+48abc", "+48123"]) {
      await expect(
        updatePreferences(resident, { emailEnabled: false, smsEnabled: false, phone }),
      ).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it("rejects smsEnabled without a phone", async () => {
    const { resident } = await createPackageScenario();
    await expect(
      updatePreferences(resident, { emailEnabled: false, smsEnabled: true, phone: null }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      updatePreferences(resident, { emailEnabled: false, smsEnabled: true, phone: "  " }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("only ever writes the actor's own row", async () => {
    const { resident, receptionist } = await createPackageScenario();
    await updatePreferences(resident, { emailEnabled: true, smsEnabled: false, phone: null });
    expect((await getPreferences(receptionist.id)).emailEnabled).toBe(false);
  });
});
