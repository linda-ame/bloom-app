# Deploying Bloom notifications

Follow these steps once after pulling the notifications feature.

## 1. Apply the database migration

In **Supabase Dashboard → SQL Editor**, paste and run the contents of:

`supabase/migrations/notifications.sql`

This adds:

- `profiles.display_name`
- `notification_prefs`
- `push_subscriptions`
- `notification_log`

## 2. Generate VAPID keys

On your computer (Node.js):

```bash
npx web-push generate-vapid-keys
```

Copy the **Public Key** and **Private Key**.

## 3. Set Edge Function secrets

In **Supabase Dashboard → Edge Functions → Secrets** (or CLI):

```bash
supabase secrets set VAPID_PUBLIC_KEY="your_public_key"
supabase secrets set VAPID_PRIVATE_KEY="your_private_key"
supabase secrets set VAPID_SUBJECT="mailto:your-email@example.com"
supabase secrets set CRON_SECRET="a-long-random-string"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are usually already available to functions.

## 4. Deploy Edge Functions

From the project root (with Supabase CLI logged in and linked to the project):

```bash
supabase functions deploy push-vapid-public
supabase functions deploy push-subscribe
supabase functions deploy notify-period-logged
supabase functions deploy notify-scheduled
```

## 5. Schedule the daily / hourly job

Scheduled alerts fire at **08:00** and **20:00** in each user’s device timezone.

Use **Supabase Dashboard → Edge Functions → notify-scheduled → Schedules**, or create a cron that calls the function every hour:

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/notify-scheduled" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

Recommended: run **hourly** so morning/evening slots are hit for all timezones.

Example with [cron-job.org](https://cron-job.org) or GitHub Actions: POST every hour with `Authorization: Bearer <CRON_SECRET>`.

## 6. Test in the app

1. Open Bloom (Home Screen / PWA on iOS).
2. Set a **Display name** under Settings → Account.
3. Open the gear menu → **Notifications**.
4. Toggle **Enable notifications** and allow the browser prompt.
5. Configure self / partner / receive toggles → **Save**.
6. Log a period to test `partner_period_logged` (partner must have receive + master ON).

## Notes

- Partner pushes require **both** sides: owner “For partner” type ON **and** partner “Receive” type ON.
- iOS requires Bloom added to the Home Screen (PWA) for Web Push.
- The live site must be HTTPS (GitHub Pages is fine).
