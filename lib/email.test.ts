import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/email";

const env = { ...process.env };
beforeEach(() => {
  process.env.RESEND_API_KEY = "k";
  process.env.EMAIL_FROM = "Quattro <noreply@example.com>";
});
afterEach(() => {
  process.env = { ...env };
  vi.unstubAllGlobals();
});

describe("sendEmail", () => {
  it("posts to Resend and reports ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail({ to: "a@b.pl", subject: "S", text: "T" })).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(init.body)).toEqual({ from: "Quattro <noreply@example.com>", to: ["a@b.pl"], subject: "S", text: "T" });
  });

  it("fails without configuration and marks 5xx as retryable", async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendEmail({ to: "a@b.pl", subject: "S", text: "T" })).toMatchObject({ ok: false, retry: false });
    process.env.RESEND_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("down", { status: 503 })));
    expect(await sendEmail({ to: "a@b.pl", subject: "S", text: "T" })).toMatchObject({ ok: false, retry: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 422 })));
    expect(await sendEmail({ to: "a@b.pl", subject: "S", text: "T" })).toMatchObject({ ok: false, retry: false });
  });
});
