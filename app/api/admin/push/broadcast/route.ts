import { NextResponse } from "next/server";
import { z } from "zod";
import { isCorrectPushPin } from "@/lib/admin/pin";
import { sendBroadcast } from "@/lib/push/send";
import { sendEmailBroadcast } from "@/lib/email/broadcast";
import { isResendConfigured } from "@/lib/email/resend";
import { notifyAllReaders } from "@/lib/notifications/notify";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";

// Auth: every /api/admin route sits behind the admin PIN gate (proxy.ts);
// sending additionally needs PUSH_SEND_PIN, checked per request below.
const BroadcastSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  // Optional: empty for a plain message, else an in-app path or an absolute
  // https link — what sw.js's notificationclick can open. Mirrored
  // client-side in app/admin/push/DestinationPicker.tsx.
  url: z
    .string()
    .trim()
    .max(500)
    .regex(/^$|^\/(?!\/)\S*$|^https:\/\/\S+$/)
    .default(""),
  channels: z.array(z.enum(["push", "email"])).min(1).max(2),
  pin: z.string().max(100),
});

const HISTORY_COLUMNS =
  "id, title, body, url, recipient_count, failure_count, channels, email_recipient_count, email_failure_count, created_at";

// Email sends in paced batches of 100 (lib/email/broadcast.ts) — give a
// large list room to finish rather than the platform default.
export const maxDuration = 300;

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// Same per-instance brute-force brake as app/admin/unlock/actions.ts —
// in-memory, so a speed bump rather than a hard limit.
const pinFailures = new Map<string, { count: number; until: number }>();

export async function GET() {
  const { data } = await getSupabaseAdminClient()
    .from("push_broadcasts")
    .select(HISTORY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const parsed = BroadcastSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A title, a message and at least one channel are required, and a link must be an in-app path or an https:// URL." },
      { status: 400 }
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const record = pinFailures.get(ip);
  if (record && record.count >= MAX_PIN_ATTEMPTS && record.until > now) {
    return NextResponse.json({ error: "Too many wrong PINs. Try again in 15 minutes.", code: "pin" }, { status: 429 });
  }
  const { pin, channels: requested, ...message } = parsed.data;
  if (!isCorrectPushPin(pin)) {
    const count = record && record.until > now ? record.count + 1 : 1;
    pinFailures.set(ip, { count, until: now + LOCKOUT_MS });
    const error = count >= MAX_PIN_ATTEMPTS ? "Too many wrong PINs. Try again in 15 minutes." : "That send PIN isn't right.";
    return NextResponse.json({ error, code: "pin" }, { status: 403 });
  }
  pinFailures.delete(ip);

  const channels = [...new Set(requested)];
  if (channels.includes("email") && !isResendConfigured()) {
    return NextResponse.json({ error: "Email isn't set up: RESEND_API_KEY is missing." }, { status: 503 });
  }

  // Known up front so email batches can derive idempotency keys from it.
  const id = crypto.randomUUID();
  const none = { recipientCount: 0, failureCount: 0 };
  // A push and a feed row always need somewhere to go when tapped — a
  // link-less message opens home. Email just drops its button instead.
  const appMessage = { ...message, url: message.url || "/home" };
  // Independent recipient lists (devices, members, opted-in inboxes) — run together.
  const [push, email] = await Promise.all([
    channels.includes("push")
      ? Promise.all([sendBroadcast(appMessage), notifyAllReaders(appMessage)]).then(([tally]) => tally)
      : none,
    channels.includes("email") ? sendEmailBroadcast(id, message) : none,
  ]);

  const { data, error } = await getSupabaseAdminClient()
    .from("push_broadcasts")
    .insert({
      id,
      ...message,
      channels,
      recipient_count: push.recipientCount,
      failure_count: push.failureCount,
      email_recipient_count: email.recipientCount,
      email_failure_count: email.failureCount,
    })
    .select(HISTORY_COLUMNS)
    .single();

  if (error || !data) return NextResponse.json({ error: "Sent, but could not record broadcast history." }, { status: 500 });
  return NextResponse.json({ item: data });
}
