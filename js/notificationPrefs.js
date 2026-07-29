/** Default hour presets when increasing frequency: 20:00, then 08:00, then 12:00 */
export const DEFAULT_HOUR_PRESETS = [20, 8, 12]
export const MAX_FREQUENCY = 3

export function clampHour(n, fallback = 20) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(23, Math.max(0, Math.round(v)))
}

export function clampFrequency(n, fallback = 1) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(MAX_FREQUENCY, Math.max(1, Math.round(v)))
}

export function normalizeHours(hours, frequency) {
  const freq = clampFrequency(frequency, 1)
  const src = Array.isArray(hours) ? hours.map((h) => clampHour(h, 20)) : []
  const out = []
  for (let i = 0; i < freq; i++) {
    out.push(
      src[i] != null
        ? clampHour(src[i], DEFAULT_HOUR_PRESETS[i] ?? 20)
        : DEFAULT_HOUR_PRESETS[i] ?? 20
    )
  }
  return out
}

export function defaultScheduleBlock() {
  return {
    on: false,
    days_before: 2,
    frequency: 1,
    hours: [20]
  }
}

/** Default notification preference shape. */
export function defaultNotificationPrefs() {
  return {
    schedule: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
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
}

function normalizePrefEntry(key, value, fallback) {
  const base = { ...fallback, ...(value || {}) }
  if (key === "partner_period_logged" || key === "receive_partner_period_logged") {
    return { on: Boolean(base.on) }
  }

  // Owner “for partner” allow-list: on + days_before only
  if (key.startsWith("partner_")) {
    const d = Number(base.days_before)
    return {
      on: Boolean(base.on),
      days_before: Number.isFinite(d)
        ? Math.min(7, Math.max(1, Math.round(d)))
        : fallback.days_before || 2
    }
  }

  let frequency = clampFrequency(base.frequency, 1)
  let hours = normalizeHours(base.hours, frequency)

  // Migrate legacy morning/evening / hour1 on the pref
  if ((!Array.isArray(base.hours) || !base.hours.length) && (base.morning || base.evening || base.hour1 != null)) {
    const hrs = []
    if (base.hour1 != null) hrs.push(clampHour(base.hour1, 20))
    else {
      if (base.morning) hrs.push(8)
      if (base.evening) hrs.push(20)
    }
    if (!hrs.length) hrs.push(20)
    frequency = clampFrequency(hrs.length, 1)
    hours = normalizeHours(hrs, frequency)
  }

  const out = {
    on: Boolean(base.on),
    frequency,
    hours
  }
  if (fallback.days_before != null || base.days_before != null) {
    const d = Number(base.days_before)
    out.days_before =
      Number.isFinite(d) ? Math.min(7, Math.max(1, Math.round(d))) : fallback.days_before || 2
  }
  return out
}

export function mergePrefs(stored) {
  const defaults = defaultNotificationPrefs()
  const raw = stored || {}
  const merged = { ...defaults }

  merged.schedule = {
    timezone:
      (raw.schedule && raw.schedule.timezone) ||
      defaults.schedule.timezone
  }

  // Migrate old global frequency into each pref if needed
  const legacyGlobalHours = []
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

/** Hours for a specific notification pref key. */
export function hoursForPref(prefs, key) {
  const merged = mergePrefs(prefs)
  const entry = merged[key] || {}
  if (!entry.on) return []
  if (Array.isArray(entry.hours) && entry.hours.length) {
    return normalizeHours(entry.hours, entry.frequency || entry.hours.length)
  }
  return [20]
}

export function displayNameFromProfile(profile, email) {
  const name = (profile?.display_name || "").trim()
  if (name) return name
  if (email) return String(email).split("@")[0]
  return "Someone"
}

export function listTimeZones() {
  try {
    if (typeof Intl !== "undefined" && Intl.supportedValuesOf) {
      return Intl.supportedValuesOf("timeZone")
    }
  } catch {
    // fall through
  }
  return [
    "UTC",
    "Europe/Riga",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Paris",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Tokyo",
    "Australia/Sydney"
  ]
}

export function formatHourLabel(hour) {
  return `${String(clampHour(hour, 0)).padStart(2, "0")}:00`
}

export async function fetchNotificationPrefs(supabase, userId) {
  const { data, error } = await supabase
    .from("notification_prefs")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    return { enabled: false, prefs: defaultNotificationPrefs() }
  }
  return {
    enabled: Boolean(data.enabled),
    prefs: mergePrefs(data.prefs)
  }
}

export async function saveNotificationPrefs(supabase, userId, enabled, prefs) {
  const { error } = await supabase.from("notification_prefs").upsert(
    [
      {
        user_id: userId,
        enabled: Boolean(enabled),
        prefs: mergePrefs(prefs),
        updated_at: new Date().toISOString()
      }
    ],
    { onConflict: "user_id" }
  )
  if (error) throw error
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function fetchVapidPublicKey(supabase) {
  const baseUrl = window.SUPABASE_URL
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error("Not signed in")

  const res = await fetch(`${baseUrl}/functions/v1/push-vapid-public`, {
    headers: { Authorization: `Bearer ${session.access_token}` }
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(payload.error || "Could not load push config")
  }
  return payload.publicKey
}

export async function registerPushSubscription(supabase, timezone) {
  if (!window.isSecureContext) {
    throw new Error(
      "Notifications need a secure (HTTPS) site. Open Bloom via https://linda-ame.github.io/bloom-app/"
    )
  }

  if (!("Notification" in window)) {
    throw new Error(
      "This browser does not support notifications. Try Chrome or Safari on a phone with Bloom added to the Home Screen."
    )
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error(
      "Push notifications are not supported here. On iPhone use Safari → Share → Add to Home Screen, then open Bloom from that icon (Chrome on iPhone cannot send push)."
    )
  }

  if (Notification.permission === "denied") {
    throw new Error(
      "Chrome blocked notifications for this site. Click the lock/tune icon left of the address bar → Site settings → Notifications → Allow, then try again. Or: chrome://settings/content/notifications"
    )
  }

  let permission = Notification.permission
  if (permission !== "granted") {
    permission = await Notification.requestPermission()
  }

  if (permission !== "granted") {
    throw new Error(
      "Notification permission was not granted. When Chrome asks, tap Allow. If you dismissed it, use the lock icon next to the URL → Notifications → Allow."
    )
  }

  const swUrl = new URL("sw.js", window.location.href).href
  const reg =
    (await navigator.serviceWorker.getRegistration()) ||
    (await navigator.serviceWorker.register(swUrl, { scope: "./" }))

  await navigator.serviceWorker.ready

  const publicKey = await fetchVapidPublicKey(supabase)
  const existing = await reg.pushManager.getSubscription()
  const subscription =
    existing ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    }))

  const json = subscription.toJSON()
  const tz =
    (timezone || "").trim() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC"

  const { data: { session } } = await supabase.auth.getSession()
  const baseUrl = window.SUPABASE_URL
  const res = await fetch(`${baseUrl}/functions/v1/push-subscribe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      timezone: tz
    })
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(payload.error || "Failed to save push subscription")
  }

  return subscription
}

export async function unregisterPushSubscription(supabase) {
  if (!("serviceWorker" in navigator)) return

  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return

  const sub = await reg.pushManager.getSubscription()
  if (!sub) return

  const endpoint = sub.endpoint
  await sub.unsubscribe()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return

  await fetch(`${window.SUPABASE_URL}/functions/v1/push-subscribe`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ endpoint })
  })
}
