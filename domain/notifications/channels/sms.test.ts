import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/lib/prisma";
import type { Notification } from "@/lib/generated/prisma";
import { cleanupDatabase, createPackageScenario } from "@/domain/__test-helpers__/fixtures";
import { smsChannel } from "@/domain/notifications/channels/sms";

const notification = {
  id: "n1",
  type: "PACKAGE_RECEIVED",
  payload: { packageId: "p1", buildingName: "Building A", apartmentNumber: "101" },
} as unknown as Notification;

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SMSAPI_TOKEN", "tok");
  vi.stubEnv("SMSAPI_SENDER", "Quattro");
});

afterEach(async () => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await cleanupDatabase();
});

async function residentWithPhone(phone: string | null = "+48123456789") {
  const { resident } = await createPackageScenario();
  if (phone) {
    await prisma.notificationPreference.create({
      data: { userId: resident.id, smsEnabled: true, phone },
    });
  }
  return { ...resident, locale: "en" };
}

describe("smsChannel", () => {
  it("posts the message to SMSAPI with the phone minus the plus sign", async () => {
    fetchMock.mockResolvedValue(new Response('{"count":1}', { status: 200 }));
    const user = await residentWithPhone();

    expect(await smsChannel.send(notification, user)).toEqual({ status: "ok" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.smsapi.pl/sms.do");
    expect(init.headers.Authorization).toBe("Bearer tok");
    const form = new URLSearchParams(init.body);
    expect(form.get("to")).toBe("48123456789");
    expect(form.get("from")).toBe("Quattro");
    expect(form.get("message")).toBe("A package arrived for Building A / 101.");
    expect(form.get("format")).toBe("json");
  });

  it("treats an error object inside a 200 response as a failure", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"error":101,"message":"Authorization failed"}', { status: 200 }),
    );
    const result = await smsChannel.send(notification, await residentWithPhone());
    expect(result.status).toBe("fail");
  });

  it("maps 5xx to retry and 4xx to fail", async () => {
    const user = await residentWithPhone();
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 502 }));
    expect((await smsChannel.send(notification, user)).status).toBe("retry");
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 400 }));
    expect((await smsChannel.send(notification, user)).status).toBe("fail");
  });

  it("fails without calling the API when the token is missing or no phone is stored", async () => {
    const user = await residentWithPhone();
    vi.stubEnv("SMSAPI_TOKEN", "");
    expect((await smsChannel.send(notification, user)).status).toBe("fail");
    vi.stubEnv("SMSAPI_TOKEN", "tok");
    const noPhone = await residentWithPhone(null);
    expect((await smsChannel.send(notification, noPhone)).status).toBe("fail");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
