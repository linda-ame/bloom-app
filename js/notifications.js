import { loadHeader } from "./header.js?v=6"
import { acceptPendingInvites, listAcceptedPartnersForMe } from "./partnerLinks.js?v=6"
import { fetchUserProfile, isProfileComplete } from "./profile.js?v=6"
import {
  fetchNotificationPrefs,
  saveNotificationPrefs,
  registerPushSubscription,
  unregisterPushSubscription,
  mergePrefs,
  listTimeZones,
  formatHourLabel,
  clampHour
} from "./notificationPrefs.js?v=6"

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

function fillHourSelect(selectEl, selected) {
  if (!selectEl) return
  selectEl.innerHTML = ""
  for (let h = 0; h < 24; h++) {
    const opt = document.createElement("option")
    opt.value = String(h)
    opt.textContent = formatHourLabel(h)
    if (h === clampHour(selected, 8)) opt.selected = true
    selectEl.appendChild(opt)
  }
}

function fillTimezoneSelect(selectEl, selected) {
  if (!selectEl) return
  const zones = listTimeZones()
  const preferred =
    selected ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC"
  selectEl.innerHTML = ""
  if (!zones.includes(preferred)) {
    const opt = document.createElement("option")
    opt.value = preferred
    opt.textContent = preferred
    opt.selected = true
    selectEl.appendChild(opt)
  }
  for (const z of zones) {
    const opt = document.createElement("option")
    opt.value = z
    opt.textContent = z
    if (z === preferred) opt.selected = true
    selectEl.appendChild(opt)
  }
}

function syncFrequencyUI() {
  const freq = document.getElementById("notifFrequency")?.value || "once"
  document.getElementById("notifHour2Wrap")?.classList.toggle("hidden", freq !== "twice")
}

function applyScheduleToForm(prefs) {
  const s = mergePrefs(prefs).schedule
  fillTimezoneSelect(document.getElementById("notifTimezone"), s.timezone)
  const freq = document.getElementById("notifFrequency")
  if (freq) freq.value = s.frequency === "twice" ? "twice" : "once"
  fillHourSelect(document.getElementById("notifHour1"), s.hour1)
  fillHourSelect(document.getElementById("notifHour2"), s.hour2)
  syncFrequencyUI()
}

function applyPrefsToForm(prefs) {
  applyScheduleToForm(prefs)
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
  prefs.schedule = {
    frequency:
      document.getElementById("notifFrequency")?.value === "twice"
        ? "twice"
        : "once",
    hour1: clampHour(document.getElementById("notifHour1")?.value, 8),
    hour2: clampHour(document.getElementById("notifHour2")?.value, 20),
    timezone:
      document.getElementById("notifTimezone")?.value ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC"
  }

  document.querySelectorAll("[data-pref]").forEach((row) => {
    const key = row.dataset.pref
    const next = { ...(prefs[key] || {}) }
    delete next.morning
    delete next.evening
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

function selectedTimezone() {
  return (
    document.getElementById("notifTimezone")?.value ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC"
  )
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

  document.getElementById("notifFrequency")?.addEventListener("change", syncFrequencyUI)

  const master = document.getElementById("masterEnabled")
  if (master) master.checked = enabled
  setDetailsVisible(enabled)

  master?.addEventListener("change", async () => {
    hideMsg()
    const wantOn = master.checked

    if (wantOn) {
      try {
        prefs = readPrefsFromForm(prefs)
        await registerPushSubscription(supabase, selectedTimezone())
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
      await registerPushSubscription(supabase, prefs.schedule.timezone)
      await saveNotificationPrefs(supabase, user.id, true, prefs)
      showMsg("Notification settings saved.")
    } catch (err) {
      showMsg(err.message || "Could not save settings.", true)
    }
  })
}

initNotifications()
