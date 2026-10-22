import { inAppChannel } from "./in-app";
import type { ChannelAdapter } from "./types";

// Register new channels (email, sms, push, ...) here.
export const channels: Record<string, ChannelAdapter> = {
  [inAppChannel.id]: inAppChannel,
};

// ponytail: every notification goes to every registered channel. Take
// (user, type) and consult NotificationPreference here once a second channel exists.
export function resolveChannels(): string[] {
  return Object.keys(channels);
}
