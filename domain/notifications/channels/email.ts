import { toResult } from "./http";
import { renderNotification } from "./render";
import type { ChannelAdapter } from "./types";

export const emailChannel: ChannelAdapter = {
  id: "email",
  async send(notification, user) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) return { status: "fail", error: "RESEND_API_KEY / EMAIL_FROM not set" };

    const { title, body, footer } = renderNotification(notification, user);
    return toResult(() =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [user.email],
          subject: title,
          text: `${body}\n\n${footer}`,
        }),
      }),
    );
  },
};
