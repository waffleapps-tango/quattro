import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth/session";
import { countUnread, listNotifications } from "@/domain/notifications/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  const membership = user?.memberships[0];
  if (!user || !membership) return NextResponse.json({ unread: 0, items: [] });

  const [unread, items] = await Promise.all([
    countUnread(user, membership.communityId),
    listNotifications(user, membership.communityId),
  ]);
  return NextResponse.json({
    unread,
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      payload: n.payload,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
  });
}
