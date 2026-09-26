// Notifies assistant admin when a user subscription becomes active (new subscriber).
// Trigger via Supabase Database Webhook on public.user_subscriptions (INSERT + UPDATE).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// deno-lint-ignore-file no-explicit-any
declare const Deno: any;

/** Supabase Database Webhook envelope */
interface DbWebhookBody {
  type?: string;
  table?: string;
  schema?: string;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
}

const DEFAULT_EMAILS = "brightmatovu7@gmail.com";
const DEFAULT_SMS_TO = "+256756162969";

const FROM_EMAIL = Deno.env.get("NOTIFY_FROM_EMAIL") || "Zuri POS <no-reply@example.com>";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_RECIPIENTS = (Deno.env.get("NOTIFY_SUBSCRIPTION_EMAILS") || DEFAULT_EMAILS)
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);

const NOTIFY_SECRET = Deno.env.get("SUBSCRIPTION_NOTIFY_SECRET");

const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER");
const SMS_TO = Deno.env.get("NOTIFY_SUBSCRIPTION_SMS_TO") || DEFAULT_SMS_TO;

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function checkSecret(req: Request): boolean {
  if (!NOTIFY_SECRET) {
    console.warn("[notify-subscription] SUBSCRIPTION_NOTIFY_SECRET not set — refusing requests (set secret and redeploy).");
    return false;
  }
  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = req.headers.get("x-subscription-notify-secret");
  return bearer === NOTIFY_SECRET || headerSecret === NOTIFY_SECRET;
}

function parseRow(reqBody: unknown): { record: Record<string, unknown> | null; old_record: Record<string, unknown> | null } {
  if (!reqBody || typeof reqBody !== "object") return { record: null, old_record: null };
  const b = reqBody as DbWebhookBody;
  if (b.record && typeof b.record === "object") {
    return { record: b.record as Record<string, unknown>, old_record: (b.old_record as Record<string, unknown>) || null };
  }
  return { record: reqBody as Record<string, unknown>, old_record: null };
}

function shouldNotify(record: Record<string, unknown>, old_record: Record<string, unknown> | null): boolean {
  const status = String(record.status || "").toLowerCase();
  if (status !== "active") return false;
  if (!old_record) return true; // INSERT with active
  const prev = String(old_record.status || "").toLowerCase();
  return prev !== "active";
}

async function sendEmail(subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) {
    console.log("[notify-subscription] RESEND_API_KEY missing — skip email");
    return { skipped: true as const, channel: "email" };
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: EMAIL_RECIPIENTS,
      subject,
      html,
      text,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Resend ${resp.status}: ${t}`);
  }
  return { ok: true as const, channel: "email", data: await resp.json() };
}

async function sendSms(body: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.log("[notify-subscription] Twilio env missing — skip SMS");
    return { skipped: true as const, channel: "sms" };
  }
  const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
  const params = new URLSearchParams({
    To: SMS_TO,
    From: TWILIO_FROM,
    Body: body.slice(0, 1500),
  });
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Twilio ${resp.status}: ${t}`);
  }
  return { ok: true as const, channel: "sms", data: await resp.json() };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }
  if (!checkSecret(req)) return unauthorized();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { record, old_record } = parseRow(raw);
  if (!record) {
    return new Response(JSON.stringify({ error: "No record in payload" }), { status: 400 });
  }

  if (!shouldNotify(record, old_record)) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "not_new_active_subscription" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const subId = String(record.id ?? "");
  const userId = String(record.user_id ?? "");
  const plan = String(record.plan_id ?? record.metadata ?? "—");
  const created = String(record.created_at ?? new Date().toISOString());

  const subject = `[Zuri POS] New active subscription`;
  const text =
    `A user subscription is now ACTIVE.\n\n` +
    `Subscription ID: ${subId}\n` +
    `User ID: ${userId}\n` +
    `Plan / ref: ${plan}\n` +
    `Created: ${created}\n` +
    `\nReview in Payment Admin or Supabase if needed.`;

  const html = `
    <div style="font-family: system-ui, sans-serif; line-height: 1.5;">
      <h2>New active subscription</h2>
      <p>A subscriber just became <strong>active</strong>.</p>
      <ul>
        <li><strong>Subscription ID:</strong> ${subId}</li>
        <li><strong>User ID:</strong> ${userId}</li>
        <li><strong>Plan / ref:</strong> ${plan}</li>
        <li><strong>Created:</strong> ${created}</li>
      </ul>
    </div>
  `;

  try {
    const results: unknown[] = [];
    results.push(await sendEmail(subject, html, text));
    results.push(await sendSms(`Zuri POS: New ACTIVE subscription. User ${userId}. Sub ${subId}.`));
    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[notify-subscription]", e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
