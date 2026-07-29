# Deploying Bloom notifications

## Status (already done via CLI for project `gixndvzewaizeqqluezu`)

- [x] Linked project with Supabase CLI
- [x] Applied `supabase/migrations/notifications.sql` to the remote database
- [x] Set secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`
- [x] Deployed Edge Functions: `push-vapid-public`, `push-subscribe`, `notify-period-logged`, `notify-scheduled`
- [ ] Add `CRON_SECRET` as a **GitHub Actions secret** (see below) so hourly scheduling works

## One step left: GitHub Actions cron secret

Scheduled alerts (period in X days, fertile window, etc.) are triggered by
[`.github/workflows/notify-scheduled.yml`](../.github/workflows/notify-scheduled.yml)
every hour.

1. Open https://github.com/linda-ame/bloom-app/settings/secrets/actions
2. Click **New repository secret**
3. Name: `CRON_SECRET`
4. Value: the same `CRON_SECRET` that was set on Supabase (rotate with
   `supabase secrets set CRON_SECRET="newvalue"` if you lost it)

After that, the workflow runs automatically. You can also run it manually under
**Actions → Bloom scheduled notifications → Run workflow**.

## Manual deploy (if you need to redo)

### Apply SQL

```bash
supabase link --project-ref gixndvzewaizeqqluezu
supabase db query --linked -f supabase/migrations/notifications.sql
```

### VAPID keys

```bash
npx web-push generate-vapid-keys
supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:you@example.com" CRON_SECRET="long-random-string"
```

### Deploy functions

```bash
supabase functions deploy push-vapid-public --no-verify-jwt
supabase functions deploy push-subscribe
supabase functions deploy notify-period-logged
supabase functions deploy notify-scheduled --no-verify-jwt
```

## Test in the app

1. Open Bloom (Home Screen / PWA on iOS).
2. Set a **Display name** under Settings → Account.
3. Gear menu → **Notifications** → enable → allow browser prompt.
4. Configure toggles → **Save**.
5. Log a period to test partner “period logged” (partner must have receive + master ON).

## Notes

- Partner pushes require **both** sides: owner “For partner” type ON **and** partner “Receive” type ON.
- iOS requires Bloom on the Home Screen for Web Push.
- Period-logged alerts work without the cron; timed alerts need the GitHub Actions hourly job.
