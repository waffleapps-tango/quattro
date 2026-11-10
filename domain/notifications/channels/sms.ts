import prisma from "@/lib/prisma";
import { toResult } from "./http";
import { renderNotification } from "./render";
import type { ChannelAdapter } from "./types";

// SMSAPI can answer 200 with {"error": <code>, "message": ...}.
const hasErrorField = (body: string) => {
  try {
    return "error" in JSON.parse(body);
  } catch {
    return false;
  }
};

// Cost guard: the number is not verified, so cap what one account can make us send.
export const SMS_DAILY_LIMIT = 10;

export const smsChannel: ChannelAdapter = {
  id: "sms",
  async send(notification, user) {
    const token = process.env.SMSAPI_TOKEN;
    if (!token) return { status: "fail", error: "SMSAPI_TOKEN not set" };

    const pref = await prisma.notificationPreference.findUnique({ where: { userId: user.id } });
    if (!pref?.smsEnabled || !pref.phone) return { status: "fail", error: "SMS not enabled" };

    const sentToday = await prisma.notificationDelivery.count({
      where: {
        channel: "sms",
        status: "SENT",
        sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        notification: { recipientUserId: user.id },
      },
    });
    if (sentToday >= SMS_DAILY_LIMIT) return { status: "fail", error: "Daily SMS limit reached" };

    const { body } = renderNotification(notification, user);
    const form = new URLSearchParams({
      to: pref.phone.replace(/^\+/, ""),
      message: body,
      format: "json",
      encoding: "utf-8",
    });
    if (process.env.SMSAPI_SENDER) form.set("from", process.env.SMSAPI_SENDER);

    return toResult(
      () =>
        fetch("https://api.smsapi.pl/sms.do", {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        }),
      hasErrorField,
    );
  },
};
