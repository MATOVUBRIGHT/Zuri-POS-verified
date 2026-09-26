# Notify assistant admin when someone subscribes (email + SMS)

When a row in `public.user_subscriptions` becomes **`active`** (new insert with `active`, or update from e.g. `pending` → `active`), you can notify:

- **Email:** `brightmatovu7@gmail.com` (default; override with secrets)
- **SMS:** `+256756162969` (default; requires Twilio)

This uses the Edge Function **`notify-subscription`** (Resend + optional Twilio).

## 1. Deploy the function

From the app folder that contains `supabase/`:

```bash
cd "Zuri POS Desktop App"
supabase functions deploy notify-subscription --no-verify-jwt
```

## 2. Set Edge Function secrets

In **Supabase Dashboard → Edge Functions → notify-subscription → Secrets**, add:

| Secret | Purpose |
|--------|---------|
| `SUBSCRIPTION_NOTIFY_SECRET` | **Required.** Long random string. The webhook must send this same value (see below). |
| `RESEND_API_KEY` | Resend API key (email). |
| `NOTIFY_FROM_EMAIL` | Verified sender in Resend, e.g. `Zuri POS <onboarding@yourdomain.com>`. |
| `NOTIFY_SUBSCRIPTION_EMAILS` | Optional. Comma-separated. Default: `brightmatovu7@gmail.com`. |
| `NOTIFY_SUBSCRIPTION_SMS_TO` | Optional. Default: `+256756162969`. |
| `TWILIO_ACCOUNT_SID` | For SMS (optional). |
| `TWILIO_AUTH_TOKEN` | For SMS. |
| `TWILIO_FROM_NUMBER` | Your Twilio number in **E.164** (e.g. `+15551234567`). |

Without Twilio vars, email still works; SMS steps are skipped.

Without `RESEND_API_KEY`, email is skipped (logged only).

## 3. Create a Database Webhook (runs “once” per transition to active)

1. Open **Supabase Dashboard → Database → Webhooks** (or **Integrations → Database Webhooks**).
2. **Create a new webhook**
   - **Table:** `public.user_subscriptions`
   - **Events:** enable **Insert** and **Update**
   - **Type:** Supabase Edge Functions → choose **`notify-subscription`**  
     **or** HTTP Request to:  
     `https://<PROJECT_REF>.supabase.co/functions/v1/notify-subscription`
3. **HTTP method:** `POST`
4. **Headers:** add one of:
   - `Authorization`: `Bearer <YOUR_SUBSCRIPTION_NOTIFY_SECRET>`  
   **or**
   - `x-subscription-notify-secret`: `<YOUR_SUBSCRIPTION_NOTIFY_SECRET>`

The function only sends email/SMS when:

- `record.status === 'active'`, and  
- it’s a new active row (**INSERT**) or status **changed** to active (**UPDATE**).

So you don’t spam on unrelated column updates while already active.

## 4. Resend & Twilio checklist

- **Resend:** Verify your domain (or use their test sender per Resend docs). `NOTIFY_FROM_EMAIL` must be allowed in Resend.
- **Twilio:** Uganda `+256` SMS depends on Twilio geo permissions; enable **Uganda** for SMS in Twilio Console if messages fail.

## 5. Test

1. In SQL Editor, insert a test row (use a real `user_id` from `auth.users`):

```sql
INSERT INTO public.user_subscriptions (user_id, status, expires_at)
VALUES ('<user-uuid>', 'active', now() + interval '30 days');
```

2. Check Edge Function **Logs** and the assistant admin inbox / phone.

## Related

- **`notify-pending`** — separate function for **pending** payment / approval flows (also uses Resend).
