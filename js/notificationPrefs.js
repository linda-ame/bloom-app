/** Default notification preference shape. */
export function defaultNotificationPrefs() {
  return {
    schedule: {
      frequency: "once",
      hour1: 8,
      hour2: 20,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    },
    self_period_approaching: { on: false, days_before: 3 },
    self_safe_approaching: { on: false, days_before: 2 },
    self_ovulation_approaching: { on: false, days_before: 2 },
    partner_period_logged: { on: false },
    partner_fertile_window: { on: false, days_before: 2 },
    partner_safe_after_fertile: { on: false, days_before: 2 },
    partner_period_expected: { on: false, days_before: 3 },
    receive_partner_period_logged: { on: true },
    receive_partner_fertile_window: { on: true },
    receive_partner_safe_after_fertile: { on: true },
    receive_partner_period_expected: { on: true }
  }
}

export function clampHour(n, fallback = 8) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(23, Math.max(0, Math.round(v)))
}

export function mergePrefs(stored) {
  const defaults = defaultNotificationPrefs()
  const raw = stored || {}
  const merged = { ...defaults, ...raw }
  merged.schedule = {
    ...defaults.schedule,
    ...(raw.schedule || {})
  }
  merged.schedule.frequency =
    merged.schedule.frequency === "twice" ? "twice" : "once"
  merged.schedule.hour1 = clampHour(merged.schedule.hour1, 8)
  merged.schedule.hour2 = clampHour(merged.schedule.hour2, 20)
  if (!merged.schedule.timezone) {
    merged.schedule.timezone = defaults.schedule.timezone
  }
  return merged
}

/** Hours when scheduled alerts should fire for these prefs. */
export function scheduleHours(prefs) {
  const s = mergePrefs(prefs).schedule
  if (s.frequency === "twice") {
    const a = clampHour(s.hour1, 8)
    const b = clampHour(s.hour2, 20)
    return a === b ? [a] : [a, b]
  }
  return [clampHour(s.hour1, 8)]
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

  // Already blocked earlier — Chrome will not show the prompt again
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
