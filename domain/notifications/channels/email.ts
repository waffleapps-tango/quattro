import prisma from "@/lib/prisma";
import { toResult } from "./http";
import { renderNotification } from "./render";
import type { ChannelAdapter } from "./types";

export const emailChannel: ChannelAdapter = {
  id: "email",
  async send(notification, user) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from || !process.env.APP_URL) {
      return { status: "fail", error: "RESEND_API_KEY / EMAIL_FROM / APP_URL not set" };
    }

    const pref = await prisma.notificationPreference.findUnique({ where: { userId: user.id } });
    if (!pref?.emailEnabled) return { status: "fail", error: "Email not enabled" };

    const { title, body, footer } = renderNotification(notification, user);
    return toResult(() =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
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
