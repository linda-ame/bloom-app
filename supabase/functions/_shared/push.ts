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

const DEFAULT_HOUR_PRESETS = [20, 8, 12]
const MAX_FREQUENCY = 3

function clampHour(n: unknown, fallback = 20) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(23, Math.max(0, Math.round(v)))
}

function clampFrequency(n: unknown, fallback = 1) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(MAX_FREQUENCY, Math.max(1, Math.round(v)))
}

function normalizeHours(hours: unknown, frequency: number): number[] {
  const freq = clampFrequency(frequency, 1)
  const src = Array.isArray(hours) ? hours.map((h) => clampHour(h, 20)) : []
  const out: number[] = []
  for (let i = 0; i < freq; i++) {
    out.push(
      src[i] != null
        ? clampHour(src[i], DEFAULT_HOUR_PRESETS[i] ?? 20)
        : DEFAULT_HOUR_PRESETS[i] ?? 20
    )
  }
  return out
}

function normalizePrefEntry(
  key: string,
  value: Record<string, unknown> | undefined,
  fallback: Record<string, unknown>
) {
  const base = { ...fallback, ...(value || {}) }
  if (key === "partner_period_logged" || key === "receive_partner_period_logged") {
    return { on: Boolean(base.on) }
  }

  const hasSchedule =
    key.startsWith("self_") ||
    key.startsWith("receive_partner_") ||
    false

  // Partner allow-list timed types: on + days_before only
  if (key.startsWith("partner_") && key !== "partner_period_logged") {
    const d = Number(base.days_before)
    return {
      on: Boolean(base.on),
      days_before: Number.isFinite(d)
        ? Math.min(7, Math.max(1, Math.round(d)))
        : Number(fallback.days_before) || 2
    }
  }

  let frequency = clampFrequency(base.frequency, 1)
  let hours = normalizeHours(base.hours, frequency)

  // Migrate legacy morning/evening / hour1 on the pref
  if ((!Array.isArray(base.hours) || !(base.hours as unknown[]).length) &&
    (base.morning || base.evening || base.hour1 != null)) {
    const hrs: number[] = []
    if (base.hour1 != null) hrs.push(clampHour(base.hour1, 20))
    else {
      if (base.morning) hrs.push(8)
      if (base.evening) hrs.push(20)
    }
    if (!hrs.length) hrs.push(20)
    frequency = clampFrequency(hrs.length, 1)
    hours = normalizeHours(hrs, frequency)
  }

  const out: Record<string, unknown> = {
    on: Boolean(base.on),
    frequency,
    hours
  }
  if (fallback.days_before != null || base.days_before != null) {
    const d = Number(base.days_before)
    out.days_before = Number.isFinite(d)
      ? Math.min(7, Math.max(1, Math.round(d)))
      : Number(fallback.days_before) || 2
  }

  // Instant receive / self without schedule shouldn't happen for hasSchedule keys
  if (!hasSchedule && !key.startsWith("self_")) {
    delete out.frequency
    delete out.hours
  }
  return out
}

export function mergeDefaultPrefs(stored: PrefsMap | null | undefined): PrefsMap {
  const defaults: PrefsMap = {
    schedule: {
      timezone: "UTC"
    },
    self_period_approaching: {
      on: false,
      days_before: 3,
      frequency: 1,
      hours: [20]
    },
    self_safe_approaching: {
      on: false,
      days_before: 2,
      frequency: 1,
      hours: [20]
    },
    self_ovulation_approaching: {
      on: false,
      days_before: 2,
      frequency: 1,
      hours: [20]
    },
    partner_period_logged: { on: false },
    partner_fertile_window: { on: false, days_before: 2 },
    partner_safe_after_fertile: { on: false, days_before: 2 },
    partner_period_expected: { on: false, days_before: 3 },
    receive_partner_period_logged: { on: true },
    receive_partner_fertile_window: {
      on: true,
      frequency: 1,
      hours: [20]
    },
    receive_partner_safe_after_fertile: {
      on: true,
      frequency: 1,
      hours: [20]
    },
    receive_partner_period_expected: {
      on: true,
      frequency: 1,
      hours: [20]
    }
  }
  const raw = stored || {}
  const merged: PrefsMap = { ...defaults }

  merged.schedule = {
    timezone:
      String((raw.schedule && raw.schedule.timezone) || defaults.schedule.timezone)
  }

  // Migrate old global frequency into each scheduled pref if needed
  const legacyGlobalHours: number[] = []
  if (raw.schedule) {
    if (raw.schedule.hour1 != null) legacyGlobalHours.push(clampHour(raw.schedule.hour1, 20))
    if (raw.schedule.frequency === "twice" && raw.schedule.hour2 != null) {
      legacyGlobalHours.push(clampHour(raw.schedule.hour2, 8))
    }
  }

  for (const key of Object.keys(defaults)) {
    if (key === "schedule") continue
    let entry = normalizePrefEntry(key, raw[key], defaults[key])
    if (
      legacyGlobalHours.length &&
      entry.on &&
      (!raw[key] || !Array.isArray(raw[key].hours)) &&
      (key.startsWith("self_") || key.startsWith("receive_partner_"))
    ) {
      entry = {
        ...entry,
        frequency: clampFrequency(legacyGlobalHours.length, 1),
        hours: normalizeHours(legacyGlobalHours, legacyGlobalHours.length)
      }
    }
    merged[key] = entry
  }
  return merged
}

/** Hours for a specific notification pref key (empty if off). */
export function hoursForPref(prefs: PrefsMap, key: string): number[] {
  const merged = mergeDefaultPrefs(prefs)
  const entry = merged[key] || {}
  if (!entry.on) return []
  if (Array.isArray(entry.hours) && (entry.hours as unknown[]).length) {
    return normalizeHours(entry.hours, Number(entry.frequency) || (entry.hours as unknown[]).length)
  }
  // Fallback for legacy global schedule
  const s = merged.schedule || {}
  if (s.hour1 != null) {
    const hrs = [clampHour(s.hour1, 20)]
    if (s.frequency === "twice" && s.hour2 != null) hrs.push(clampHour(s.hour2, 8))
    return hrs
  }
  return [20]
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
