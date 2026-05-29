const supabase = window.supabaseClient

import { getCycleInsights } from "./cycleEngine.js?v=2"
import { getCycleUI } from "./cycleUI.js?v=2"
import { initLogController } from "./logController.js?v=2"
import { loadHeader } from "./header.js?v=2"
import { initCalendar } from "./calendar.js?v=2"
import { isProfileComplete } from "./profile.js?v=2"
import {
  acceptPendingInvites,
  listAcceptedPartnersForMe,
  getActiveView,
  pickPartnerOwnerId
} from "./partnerLinks.js?v=2"

async function initDashboard() {

  const loadingEl = document.getElementById("loading")
  const dashboardEl = document.getElementById("dashboard")
  const calendarEl = document.getElementById("calendarSection")

  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) {
    window.location.href = "index.html"
    return
  }

  await acceptPendingInvites(supabase, user)
  await loadHeader()

  const { data: cycles } = await supabase
    .from("cycles")
    .select("*")
    .eq("user_id", user.id)

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (!isProfileComplete(profile)) {
    const partners = await listAcceptedPartnersForMe(supabase, user)
    if (partners.length > 0) {
      const ownerId = pickPartnerOwnerId(partners, getActiveView())
      window.location.href = `partner.html?owner=${encodeURIComponent(ownerId)}`
      return
    }
    window.location.href = "onboarding.html"
    return
  }

  const { data: logs } = await supabase
    .from("cycle_logs")
    .select("*")
    .eq("user_id", user.id)

  const insights = getCycleInsights(cycles, profile, logs)
  const ui = getCycleUI(insights)

  const cycleDayEl = document.getElementById("cycleDay")
  const nextPeriodEl = document.getElementById("nextPeriod")
  const cycleLengthEl = document.getElementById("cycleLength")
  const statusEl = document.getElementById("status")
  const statusCardEl = document.getElementById("statusCard")
  const daysLeftEl = document.getElementById("daysLeft")
  const periodCardEl = document.getElementById("periodCard")

  if (cycleDayEl) {
    cycleDayEl.textContent = ui.cycleDay
  }

  if (nextPeriodEl) {
    nextPeriodEl.textContent =
      "Predicted: " +
      new Date(ui.nextPeriod).toLocaleDateString()
  }

  if (daysLeftEl) {
    daysLeftEl.textContent = ui.periodLabel
  }

  if (cycleLengthEl && ui.cycleLength !== undefined) {
    cycleLengthEl.textContent = ui.cycleLength + " days"
  }

  if (statusEl && ui.phase) {
    statusEl.textContent = ui.phase
    statusEl.className = "value"
  }

  if (statusCardEl && ui.phaseClass) {
    statusCardEl.className = `card ${ui.phaseClass}`
  }

  if (periodCardEl) {
    periodCardEl.className = "card"
    if (ui.periodClass) {
      periodCardEl.classList.add(ui.periodClass)
    }
  }

  initCalendar(cycles, profile, logs)

  if (loadingEl) loadingEl.classList.add("hidden")
  if (dashboardEl) dashboardEl.classList.remove("hidden")
  if (calendarEl) calendarEl.classList.remove("hidden")
}

initDashboard().catch(e => console.error(e))
initLogController()
