import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { linkClerkUser } from "@/auth/session";

export async function POST(req: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(req);
  } catch (error) {
    console.error("Clerk webhook verification failed", error);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "user.created" || event.type === "user.updated") {
    const { id, email_addresses, primary_email_address_id } = event.data;
    const email = (
      email_addresses.find((e) => e.id === primary_email_address_id) ??
      email_addresses[0]
    )?.email_address;
    if (email) await linkClerkUser(id, email);
  }

  return new Response("ok");
}
