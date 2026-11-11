import { describe, expect, it } from "vitest";
import type { Notification, User } from "@/lib/generated/prisma";
import { renderNotification } from "@/domain/notifications/channels/render";

const note = {
  type: "REPORT_STATUS_CHANGED",
  payload: { reportId: "r1", title: "Awaria windy", status: "IN_PROGRESS" },
} as unknown as Notification;

describe("renderNotification REPORT_STATUS_CHANGED", () => {
  it("translates the status in the recipient's language", () => {
    expect(renderNotification(note, { locale: "pl" } as User).body).toBe(
      "Twoje zgłoszenie „Awaria windy” ma teraz status: w trakcie.",
    );
    expect(renderNotification(note, { locale: "en" } as User).body).toBe(
      "Your report “Awaria windy” is now in progress.",
    );
  });
});
