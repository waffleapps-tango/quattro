import { afterEach, describe, expect, it, vi } from "vitest";
import prisma from "@/lib/prisma";
import { cleanupDatabase, createPackageScenario } from "@/domain/__test-helpers__/fixtures";
import { createPackage } from "@/domain/packages";
import { GET } from "@/app/api/cron/package-reminders/route";

afterEach(async () => {
  vi.unstubAllEnvs();
  await cleanupDatabase();
});

const call = (authorization?: string) =>
  GET(
    new Request("http://localhost/api/cron/package-reminders", {
      headers: authorization ? { authorization } : {},
    }),
  );

describe("GET /api/cron/package-reminders", () => {
  it("rejects requests without the secret, and when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);

    // Unset secret: "Bearer undefined" must not match via string interpolation.
    vi.stubEnv("CRON_SECRET", undefined);
    expect((await call("Bearer undefined")).status).toBe(401);
  });

  it("sends automatic reminders when authorized", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const s = await createPackageScenario();
    await prisma.community.update({ where: { id: s.community.id }, data: { reminderAfterDays: 1 } });
    const pkg = await createPackage(s.receptionist, {
      communityId: s.community.id,
      buildingId: s.building.id,
      apartmentId: s.apartment.id,
    });
    await prisma.package.update({
      where: { id: pkg.id },
      data: { receivedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    });

    const res = await call("Bearer s3cret");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 1, dispatched: { sent: 0, retried: 0, failed: 0 } });
  });
});
