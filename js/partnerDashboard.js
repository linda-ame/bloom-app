const supabase = window.supabaseClient

import { getCycleInsights } from "./cycleEngine.js?v=1"
import { getCycleUI } from "./cycleUI.js?v=1"
import { loadHeader } from "./header.js?v=1"
import { initCalendar } from "./calendar.js?v=1"
import {
  acceptPendingInvites,
  isAcceptedPartnerOf,
  listAcceptedPartnersForMe,
  setActiveView
} from "./partnerLinks.js?v=1"

function getOwnerIdFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return params.get("owner")
}

async function initPartnerDashboard() {
  const loadingEl = document.getElementById("loading")
  const dashboardEl = document.getElementById("dashboard")
  const calendarEl = document.getElementById("calendarSection")
  const bannerEl = document.getElementById("partnerBanner")

  const ownerId = getOwnerIdFromUrl()
  if (!ownerId) {
    window.location.href = "dashboard.html"
    return
  }

  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) {
    window.location.href = "index.html"
    return
  }

  await acceptPendingInvites(supabase, user)

  const allowed = await isAcceptedPartnerOf(supabase, user.id, ownerId)
  if (!allowed) {
    window.location.href = "dashboard.html"
    return
  }

  setActiveView({ kind: "partner", ownerId })

  const partners = await listAcceptedPartnersForMe(supabase, user)
  const link = partners.find((p) => p.owner_id === ownerId)
  const ownerLabel = link?.owner_email || "Partner"

  if (bannerEl) {
    bannerEl.textContent = `Viewing ${ownerLabel}'s profile (read-only)`
    bannerEl.classList.remove("hidden")
  }

  await loadHeader()

  const { data: cycles } = await supabase
    .from("cycles")
    .select("*")
    .eq("user_id", ownerId)

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", ownerId)
    .maybeSingle()

  const { data: logs } = await supabase
    .from("cycle_logs")
    .select("*")
    .eq("user_id", ownerId)

  if (!profile) {
    if (loadingEl) loadingEl.textContent = "Profile not available yet."
    return
  }

  const insights = getCycleInsights(cycles, profile, logs)
  const ui = getCycleUI(insights)

  const cycleDayEl = document.getElementById("cycleDay")
  const nextPeriodEl = document.getElementById("nextPeriod")
  const cycleLengthEl = document.getElementById("cycleLength")
  const statusEl = document.getElementById("status")
  const statusCardEl = document.getElementById("statusCard")
  const daysLeftEl = document.getElementById("daysLeft")
  const periodCardEl = document.getElementById("periodCard")

  if (cycleDayEl) cycleDayEl.textContent = ui.cycleDay

  if (nextPeriodEl) {
    nextPeriodEl.textContent =
      "Predicted: " + new Date(ui.nextPeriod).toLocaleDateString()
  }

  if (daysLeftEl) daysLeftEl.textContent = ui.periodLabel

  if (statusEl && ui.phase) {
    statusEl.textContent = ui.phase
    statusEl.className = "value"
  }

  if (statusCardEl && ui.phaseClass) {
    statusCardEl.className = `card ${ui.phaseClass}`
  }

  if (periodCardEl) {
    periodCardEl.className = "card"
    if (ui.periodClass) periodCardEl.classList.add(ui.periodClass)
  }

  initCalendar(cycles, profile, logs, { readOnly: true })

  if (loadingEl) loadingEl.classList.add("hidden")
  if (dashboardEl) dashboardEl.classList.remove("hidden")
  if (calendarEl) calendarEl.classList.remove("hidden")
}

initPartnerDashboard().catch(console.error)
