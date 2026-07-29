import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.7"

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type"
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  })
}

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

export function configureWebPush() {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:bloom@example.com"
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured")
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return webpush
}

export async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || ""
  const jwt = authHeader.replace("Bearer ", "")
  if (!jwt) return null
  const admin = adminClient()
  const { data: { user }, error } = await admin.auth.getUser(jwt)
  if (error || !user) return null
  return { admin, user, jwt }
}

export type PrefsMap = Record<string, Record<string, unknown>>

export function mergeDefaultPrefs(stored: PrefsMap | null | undefined): PrefsMap {
  const defaults: PrefsMap = {
    self_period_approaching: { on: false, days_before: 3 },
    self_safe_approaching: { on: false, days_before: 2 },
    self_ovulation_approaching: { on: false, days_before: 2 },
    partner_period_logged: { on: false },
    partner_fertile_window: {
      on: false,
      days_before: 2,
      morning: true,
      evening: true
    },
    partner_safe_after_fertile: {
      on: false,
      days_before: 2,
      morning: true,
      evening: false
    },
    partner_period_expected: {
      on: false,
      days_before: 3,
      morning: true,
      evening: false
    },
    receive_partner_period_logged: { on: true },
    receive_partner_fertile_window: { on: true },
    receive_partner_safe_after_fertile: { on: true },
    receive_partner_period_expected: { on: true }
  }
  return { ...defaults, ...(stored || {}) }
}

export function prefOn(prefs: PrefsMap, key: string) {
  return Boolean(prefs[key]?.on)
}

export async function sendPushToUser(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  payload: { title: string; body: string; url?: string }
) {
  const webpushClient = configureWebPush()
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)

  if (error) {
    console.error("load subscriptions:", error)
    return { sent: 0 }
  }

  let sent = 0
  for (const sub of subs || []) {
    try {
      await webpushClient.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        },
        JSON.stringify(payload)
      )
      sent++
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode
      console.error("push failed", status, err)
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id)
      }
    }
  }
  return { sent }
}

export function displayName(profile: { display_name?: string | null } | null, email?: string | null) {
  const name = (profile?.display_name || "").trim()
  if (name) return name
  if (email) return email.split("@")[0]
  return "Someone"
}

export function ymd(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() + n)
  return x
}

export function daysBetween(a: Date, b: Date) {
  const aa = new Date(a)
  aa.setHours(0, 0, 0, 0)
  const bb = new Date(b)
  bb.setHours(0, 0, 0, 0)
  return Math.round((bb.getTime() - aa.getTime()) / (1000 * 60 * 60 * 24))
}
