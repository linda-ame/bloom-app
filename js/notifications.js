import { loadHeader } from "./header.js?v=5"
import { acceptPendingInvites, listAcceptedPartnersForMe } from "./partnerLinks.js?v=5"
import { fetchUserProfile, isProfileComplete } from "./profile.js?v=5"
import {
  fetchNotificationPrefs,
  saveNotificationPrefs,
  registerPushSubscription,
  unregisterPushSubscription,
  mergePrefs
} from "./notificationPrefs.js?v=5"

const supabase = window.supabaseClient

function showMsg(text, isError = false) {
  const el = document.getElementById("notifMsg")
  if (!el) return
  el.textContent = text
  el.classList.remove("hidden")
  el.classList.toggle("settings-msg-error", isError)
  el.classList.toggle("settings-msg-success", !isError)
}

function hideMsg() {
  document.getElementById("notifMsg")?.classList.add("hidden")
}

function clampDays(n, fallback) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(7, Math.max(1, Math.round(v)))
}

function applyPrefsToForm(prefs) {
  document.querySelectorAll("[data-pref]").forEach((row) => {
    const key = row.dataset.pref
    const cfg = prefs[key] || {}
    row.querySelectorAll("[data-key]").forEach((input) => {
      const field = input.dataset.key
      if (input.type === "checkbox") {
        input.checked = Boolean(cfg[field])
      } else if (field === "days_before") {
        input.value = clampDays(cfg.days_before, 2)
      }
    })
  })
}

function readPrefsFromForm(base) {
  const prefs = mergePrefs(base)
  document.querySelectorAll("[data-pref]").forEach((row) => {
    const key = row.dataset.pref
    const next = { ...(prefs[key] || {}) }
    row.querySelectorAll("[data-key]").forEach((input) => {
      const field = input.dataset.key
      if (input.type === "checkbox") {
        next[field] = input.checked
      } else if (field === "days_before") {
        next.days_before = clampDays(input.value, next.days_before || 2)
      }
    })
    prefs[key] = next
  })
  return prefs
}

function setDetailsVisible(on) {
  document.getElementById("notifDetails")?.classList.toggle("hidden", !on)
}

async function initNotifications() {
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) {
    window.location.href = "index.html"
    return
  }

  await acceptPendingInvites(supabase, user)
  await loadHeader()

  const profile = await fetchUserProfile(supabase, user.id)
  const hasOwnData = isProfileComplete(profile)
  const partners = await listAcceptedPartnersForMe(supabase, user)
  const isPartner = partners.length > 0

  document.getElementById("selfSection")?.classList.toggle("hidden", !hasOwnData)
  document.getElementById("forPartnerSection")?.classList.toggle("hidden", !hasOwnData)
  document.getElementById("receiveSection")?.classList.toggle("hidden", !isPartner)

  let { enabled, prefs } = await fetchNotificationPrefs(supabase, user.id)
  applyPrefsToForm(prefs)

  const master = document.getElementById("masterEnabled")
  if (master) master.checked = enabled
  setDetailsVisible(enabled)

  master?.addEventListener("change", async () => {
    hideMsg()
    const wantOn = master.checked

    if (wantOn) {
      try {
        await registerPushSubscription(supabase)
        enabled = true
        setDetailsVisible(true)
        await saveNotificationPrefs(supabase, user.id, true, prefs)
        showMsg("Notifications enabled on this device.")
      } catch (err) {
        master.checked = false
        enabled = false
        setDetailsVisible(false)
        showMsg(err.message || "Could not enable notifications.", true)
      }
      return
    }

    try {
      await unregisterPushSubscription(supabase)
    } catch {
      // ignore
    }
    enabled = false
    setDetailsVisible(false)
    prefs = readPrefsFromForm(prefs)
    await saveNotificationPrefs(supabase, user.id, false, prefs)
    showMsg("Notifications turned off on this device.")
  })

  document.getElementById("saveNotifBtn")?.addEventListener("click", async () => {
    hideMsg()
    if (!master?.checked) {
      showMsg("Turn on notifications first.", true)
      return
    }

    prefs = readPrefsFromForm(prefs)
    try {
      // Refresh subscription in case permission/device changed
      await registerPushSubscription(supabase)
      await saveNotificationPrefs(supabase, user.id, true, prefs)
      showMsg("Notification settings saved.")
    } catch (err) {
      showMsg(err.message || "Could not save settings.", true)
    }
  })
}

initNotifications()
