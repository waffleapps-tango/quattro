import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Notification, User } from "@/lib/generated/prisma";
import { emailChannel } from "@/domain/notifications/channels/email";

const notification = {
  id: "n1",
  type: "PACKAGE_RECEIVED",
  payload: { packageId: "p1", buildingName: "Building A", apartmentNumber: "101" },
} as unknown as Notification;
const user = { email: "ala@example.com", locale: "en" } as unknown as User;

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Quattro <noreply@example.com>");
  vi.stubEnv("APP_URL", "https://quattro.test");
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("emailChannel", () => {
  it("posts a localised message to Resend and returns ok on 2xx", async () => {
    fetchMock.mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));

    expect(await emailChannel.send(notification, user)).toEqual({ status: "ok" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["ala@example.com"]);
    expect(body.from).toBe("Quattro <noreply@example.com>");
    expect(body.subject).toBe("Package registered");
    expect(body.text).toContain("A package arrived for Building A / 101.");
    expect(body.text).toContain("https://quattro.test/settings");
  });

  it("uses the user's locale", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await emailChannel.send(notification, { ...user, locale: "pl" } as User);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).subject).toBe("Paczka zarejestrowana");
  });

  it("maps 5xx and 429 to retry, other 4xx to fail", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 503 }));
    expect((await emailChannel.send(notification, user)).status).toBe("retry");
    fetchMock.mockResolvedValueOnce(new Response("slow down", { status: 429 }));
    expect((await emailChannel.send(notification, user)).status).toBe("retry");
    fetchMock.mockResolvedValueOnce(new Response("bad address", { status: 422 }));
    expect((await emailChannel.send(notification, user)).status).toBe("fail");
  });

  it("retries on network errors", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    expect((await emailChannel.send(notification, user)).status).toBe("retry");
  });

  it("fails without calling the API when env vars are missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const result = await emailChannel.send(notification, user);
    expect(result.status).toBe("fail");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
