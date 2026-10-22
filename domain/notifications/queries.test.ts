import { afterEach, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma";
import {
  cleanupDatabase,
  createPackageScenario,
  createUserWithMembership,
} from "@/domain/__test-helpers__/fixtures";
import { notify } from "@/domain/notifications";
import { countUnread, listNotifications, markAllRead, markRead } from "@/domain/notifications/queries";

afterEach(async () => {
  await cleanupDatabase();
});

const payload = { packageId: "p1", buildingName: "A", apartmentNumber: "101" };

async function send(communityId: string, recipientUserIds: string[]) {
  return prisma.$transaction((tx) =>
    notify(tx, { communityId, type: "PACKAGE_RECEIVED", recipientUserIds, payload }),
  );
}

describe("notification queries", () => {
  it("returns only the actor's own notifications in the community", async () => {
    const { community, building, apartment, resident } = await createPackageScenario();
    const neighbour = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });
    await send(community.id, [resident.id]);
    await send(community.id, [neighbour.id]);

    const mine = await listNotifications(resident, community.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].recipientUserId).toBe(resident.id);
    expect(await countUnread(resident, community.id)).toBe(1);
  });

  it("does not leak notifications from another community", async () => {
    const a = await createPackageScenario();
    await send(a.community.id, [a.resident.id]);

    expect(await listNotifications(a.resident, "some-other-community")).toEqual([]);
    expect(await countUnread(a.resident, "some-other-community")).toBe(0);
  });

  it("markRead only affects the actor's notification", async () => {
    const { community, building, apartment, resident } = await createPackageScenario();
    const neighbour = await createUserWithMembership({
      communityId: community.id,
      buildingId: building.id,
      apartmentId: apartment.id,
      role: Role.RESIDENT,
    });
    const [mine] = await send(community.id, [resident.id]);
    const [theirs] = await send(community.id, [neighbour.id]);

    await markRead(resident, theirs.id);
    expect(await countUnread(neighbour, community.id)).toBe(1);

    await markRead(resident, mine.id);
    expect(await countUnread(resident, community.id)).toBe(0);
  });

  it("markAllRead clears the actor's unread count", async () => {
    const { community, resident } = await createPackageScenario();
    await send(community.id, [resident.id]);
    await send(community.id, [resident.id]);
    expect(await countUnread(resident, community.id)).toBe(2);

    await markAllRead(resident, community.id);
    expect(await countUnread(resident, community.id)).toBe(0);
  });
});
