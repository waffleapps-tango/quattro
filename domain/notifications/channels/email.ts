import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { renderNotification } from "./render";
import type { ChannelAdapter } from "./types";

export const emailChannel: ChannelAdapter = {
  id: "email",
  async send(notification, user) {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.APP_URL) {
      return { status: "fail", error: "RESEND_API_KEY / EMAIL_FROM / APP_URL not set" };
    }

    const pref = await prisma.notificationPreference.findUnique({ where: { userId: user.id } });
    if (!pref?.emailEnabled) return { status: "fail", error: "Email not enabled" };

    const { title, body, footer } = renderNotification(notification, user);
    const res = await sendEmail({ to: user.email, subject: title, text: `${body}\n\n${footer}` });
    if (res.ok) return { status: "ok" };
    return { status: res.retry ? "retry" : "fail", error: res.error };
  },
};
