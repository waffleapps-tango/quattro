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

describe("renderNotification comment and reaction types", () => {
  const target = { targetType: "post", targetId: "p1", title: "Remont", slug: "remont" };
  const pl = { locale: "pl" } as User;
  const react = (count: number) =>
    renderNotification({ type: "REACTIONS_ADDED", payload: { ...target, count } } as unknown as Notification, pl).body;
  const comment = (kind: string) =>
    renderNotification({ type: "COMMENT_ADDED", payload: { ...target, kind } } as unknown as Notification, pl).title;

  it("pluralises reactions in pl", () => {
    expect(react(1)).toBe("1 osoba zareagowała na „Remont”");
    expect(react(2)).toBe("2 osoby zareagowały na „Remont”");
    expect(react(5)).toBe("5 osób zareagowało na „Remont”");
  });

  it("selects the comment title by kind", () => {
    expect(comment("reply")).toBe("Nowa odpowiedź na Twój komentarz");
    expect(comment("comment")).toBe("Nowy komentarz");
  });
});
