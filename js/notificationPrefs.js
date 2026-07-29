/** Default notification preference shape. */
export function defaultNotificationPrefs() {
  return {
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
}

export function mergePrefs(stored) {
  return { ...defaultNotificationPrefs(), ...(stored || {}) }
}

export function displayNameFromProfile(profile, email) {
  const name = (profile?.display_name || "").trim()
  if (name) return name
  if (email) return String(email).split("@")[0]
  return "Someone"
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

export async function registerPushSubscription(supabase) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error(
      "Push notifications are not supported in this browser. On iPhone, add Bloom to your Home Screen first."
    )
  }

  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.")
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
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

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
      timezone
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
