import type { ChannelAdapter } from "./types";

// The inbox is a query on Notification, so there is nothing to send.
export const inAppChannel: ChannelAdapter = {
  id: "in-app",
  instant: true,
  send: async () => ({ status: "ok" }),
};
