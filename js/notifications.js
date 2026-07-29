import { loadHeader } from "./header.js?v=11"
import { acceptPendingInvites, listAcceptedPartnersForMe } from "./partnerLinks.js?v=11"
import { fetchUserProfile, isProfileComplete } from "./profile.js?v=11"
import {
  fetchNotificationPrefs,
  saveNotificationPrefs,
  registerPushSubscription,
  unregisterPushSubscription,
  mergePrefs,
  listTimeZones,
  formatHourLabel,
  clampHour,
  clampFrequency,
  normalizeHours,
  DEFAULT_HOUR_PRESETS,
  MAX_FREQUENCY
} from "./notificationPrefs.js?v=11"

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

function fillHourSelect(selectEl, selected) {
  if (!selectEl) return
  selectEl.innerHTML = ""
  for (let h = 0; h < 24; h++) {
    const opt = document.createElement("option")
    opt.value = String(h)
    opt.textContent = formatHourLabel(h)
    if (h === clampHour(selected, 20)) opt.selected = true
    selectEl.appendChild(opt)
  }
}

function renderHourSlots(row, hours) {
  const container = row.querySelector("[data-hours]")
  if (!container) return
  const list = Array.isArray(hours) && hours.length ? hours : [20]
  container.innerHTML = ""
  list.forEach((hour, index) => {
    const wrap = document.createElement("div")
    wrap.className = "notif-hour-slot"
    const label = document.createElement("label")
    label.textContent = list.length === 1 ? "Time" : `Time ${index + 1}`
    const select = document.createElement("select")
    select.dataset.hourIndex = String(index)
    fillHourSelect(select, hour)
    wrap.appendChild(label)
    wrap.appendChild(select)
    container.appendChild(wrap)
  })
}

function readHoursFromRow(row, frequency) {
  const selects = row.querySelectorAll("[data-hours] select")
  const hours = []
  selects.forEach((sel) => {
    hours.push(clampHour(sel.value, 20))
  })
  return normalizeHours(hours, frequency)
}

function syncRowConfigVisibility(row) {
  const on = row.querySelector(".notif-on-toggle")?.checked
  const config = row.querySelector(".notif-row-config")
  if (!config) return
  config.classList.toggle("hidden", !on)
}

function ensureScheduleDefaults(row) {
  const freqEl = row.querySelector("[data-key='frequency']")
  if (!freqEl) return
  let frequency = clampFrequency(freqEl.value, 1)
  freqEl.value = String(frequency)

  const existing = readHoursFromRow(row, frequency)
  // If increasing frequency, fill new slots with presets
  const hours = []
  for (let i = 0; i < frequency; i++) {
    hours.push(
      existing[i] != null
        ? existing[i]
        : DEFAULT_HOUR_PRESETS[i] ?? 20
    )
  }
  renderHourSlots(row, hours)
}

function applyPrefsToForm(prefs) {
  const merged = mergePrefs(prefs)
  fillTimezoneSelect(
    document.getElementById("notifTimezone"),
    merged.schedule.timezone
  )

  document.querySelectorAll("[data-pref]").forEach((row) => {
    const key = row.dataset.pref
    const cfg = merged[key] || {}
    const onToggle = row.querySelector(".notif-on-toggle")
    if (onToggle) onToggle.checked = Boolean(cfg.on)

    const daysEl = row.querySelector("[data-key='days_before']")
    if (daysEl) {
      daysEl.value = clampDays(cfg.days_before, Number(daysEl.value) || 2)
    }

    if (row.dataset.hasSchedule === "1") {
      const frequency = clampFrequency(cfg.frequency, 1)
      const freqEl = row.querySelector("[data-key='frequency']")
      if (freqEl) freqEl.value = String(frequency)
      renderHourSlots(row, normalizeHours(cfg.hours, frequency))
    }

    syncRowConfigVisibility(row)
  })
}

function readPrefsFromForm(base) {
  const prefs = mergePrefs(base)
  prefs.schedule = {
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
    delete next.hour1

    const on = Boolean(row.querySelector(".notif-on-toggle")?.checked)
    next.on = on

    const daysEl = row.querySelector("[data-key='days_before']")
    if (daysEl) {
      next.days_before = clampDays(daysEl.value, next.days_before || 2)
    }

    if (row.dataset.hasSchedule === "1") {
      const frequency = clampFrequency(
        row.querySelector("[data-key='frequency']")?.value,
        1
      )
      next.frequency = frequency
      next.hours = on
        ? readHoursFromRow(row, frequency)
        : normalizeHours(next.hours, frequency)
    } else {
      delete next.frequency
      delete next.hours
    }

    prefs[key] = next
  })
  return prefs
}

function setDetailsVisible(_on) {
  document.getElementById("notifDetails")?.classList.remove("hidden")
}

function selectedTimezone() {
  return (
    document.getElementById("notifTimezone")?.value ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC"
  )
}

function wireRowInteractions() {
  document.querySelectorAll("[data-pref]").forEach((row) => {
    const onToggle = row.querySelector(".notif-on-toggle")
    onToggle?.addEventListener("change", () => {
      if (onToggle.checked && row.dataset.hasSchedule === "1") {
        const freqEl = row.querySelector("[data-key='frequency']")
        if (freqEl && !freqEl.value) freqEl.value = "1"
        const hoursContainer = row.querySelector("[data-hours]")
        const hasSlots = hoursContainer?.querySelector("select")
        if (!hasSlots) {
          renderHourSlots(row, normalizeHours([20], 1))
        }
        ensureScheduleDefaults(row)
      }
      syncRowConfigVisibility(row)
    })

    const freqEl = row.querySelector("[data-key='frequency']")
    freqEl?.addEventListener("change", () => {
      const frequency = clampFrequency(freqEl.value, 1)
      if (frequency > MAX_FREQUENCY) freqEl.value = String(MAX_FREQUENCY)
      ensureScheduleDefaults(row)
    })
  })
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
  wireRowInteractions()
  setDetailsVisible(true)

  const master = document.getElementById("masterEnabled")
  if (master) master.checked = enabled

  master?.addEventListener("change", async () => {
    hideMsg()
    const wantOn = master.checked

    if (wantOn) {
      try {
        prefs = readPrefsFromForm(prefs)
        await registerPushSubscription(supabase, selectedTimezone())
        enabled = true
        await saveNotificationPrefs(supabase, user.id, true, prefs)
        showMsg("Notifications enabled on this device.")
      } catch (err) {
        master.checked = false
        enabled = false
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
    prefs = readPrefsFromForm(prefs)
    await saveNotificationPrefs(supabase, user.id, false, prefs)
    showMsg("Notifications turned off on this device.")
  })

  document.getElementById("saveNotifBtn")?.addEventListener("click", async () => {
    hideMsg()
    prefs = readPrefsFromForm(prefs)
    try {
      if (master?.checked) {
        await registerPushSubscription(supabase, prefs.schedule.timezone)
      }
      await saveNotificationPrefs(supabase, user.id, Boolean(master?.checked), prefs)
      showMsg(
        master?.checked
          ? "Notification settings saved."
          : "Settings saved. Turn on “Enable notifications” (and Allow in Chrome) to receive pushes."
      )
    } catch (err) {
      showMsg(err.message || "Could not save settings.", true)
    }
  })
}

initNotifications()
