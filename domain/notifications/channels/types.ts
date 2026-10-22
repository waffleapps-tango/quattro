import type { Notification, User } from "@/lib/generated/prisma";

export type SendResult =
  | { status: "ok" }
  | { status: "retry"; error: string }
  | { status: "fail"; error: string };

export interface ChannelAdapter {
  id: string;
  // Instant channels have nothing to send: their delivery is created SENT.
  instant?: boolean;
  send(notification: Notification, user: User): Promise<SendResult>;
}
