// Supabase Edge Functions runtime types (enables Deno global types in editors)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// deno-lint-ignore-file no-explicit-any
declare const Deno: any;

interface PendingPayload {
  subscription_id: string;
  user_full_name?: string | null;
  user_email?: string | null;
  plan_name?: string | null;
  status?: string | null;
  created_at?: string | null;
}

const RECIPIENTS = [
  "brightadmin77@gmail.com",
  "brightmatovu7@gmail.com",
];

const FROM_EMAIL = Deno.env.get("NOTIFY_FROM_EMAIL") || "BrePOS <no-reply@brepos.example>";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

async function sendWithResend(subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) {
    // No email key configured; treat as success to avoid blocking flows
    console.log("[notify-pending] RESEND_API_KEY not configured. Skipping email send.");
    return { ok: true, skipped: true } as const;
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: RECIPIENTS,
      subject,
      html,
      text,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    console.error("[notify-pending] Resend error:", resp.status, body);
    throw new Error(`Email provider error: ${resp.status}`);
  }

  const data = await resp.json();
  return { ok: true, data } as const;
}

function buildContent(p: PendingPayload) {
  const subject = `[Pending Approval] Subscription awaiting verification`;
  const userName = p.user_full_name || "Unknown User";
  const userEmail = p.user_email || "unknown";
  const plan = p.plan_name || "Unknown Plan";
  const subId = p.subscription_id;
  const created = p.created_at || new Date().toISOString();

  const text = `A user subscription is pending approval.\n\n` +
    `User: ${userName} <${userEmail}>\n` +
    `Plan: ${plan}\n` +
    `Subscription ID: ${subId}\n` +
    `Created At: ${created}\n` +
    `\nLog in to the Admin Dashboard to review and approve.`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Subscription Pending Approval</h2>
      <p>A user subscription requires verification:</p>
      <ul>
        <li><strong>User:</strong> ${userName} &lt;${userEmail}&gt;</li>
        <li><strong>Plan:</strong> ${plan}</li>
        <li><strong>Subscription ID:</strong> ${subId}</li>
        <li><strong>Created At:</strong> ${created}</li>
      </ul>
      <p>Please log in to the Admin Dashboard to review and approve this subscription.</p>
    </div>
  `;

  return { subject, text, html };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    const payload = (await req.json()) as PendingPayload | null;
    if (!payload || !payload.subscription_id) {
      return new Response(JSON.stringify({ error: "Invalid payload: subscription_id is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const { subject, text, html } = buildContent(payload);
    const result = await sendWithResend(subject, html, text);

    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[notify-pending] failure:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err && (err as Error).message || err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
