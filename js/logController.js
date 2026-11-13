const supabase = window.supabaseClient

import { getSelectedDate } from "./selectedDate.js?v=14"
import { getCycleInsights } from "./cycleEngine.js?v=17"
import { lockPredictionForNewPeriod } from "./periodPredictions.js?v=17"

const selectedPills = new Set()
let editingDateKey = null

function resetOtherFormPills() {
  selectedPills.clear()
  document.querySelectorAll(".log-pill").forEach(p => p.classList.remove("selected"))
}

function openOtherFormShell(logModal, periodForm, otherForm, dateKey) {
  logModal.classList.remove("hidden")
  periodForm.classList.add("hidden")
  otherForm.classList.remove("hidden")
  document.getElementById("otherDate").value = dateKey
  document.getElementById("otherTemp").value = ""
  document.getElementById("otherNote").value = ""
  resetOtherFormPills()
}

function openPeriodModal(logModal, periodForm, otherForm, periodDateInput) {
  logModal.classList.remove("hidden")
  periodForm.classList.remove("hidden")
  otherForm.classList.add("hidden")
  periodDateInput.value = getSelectedDate()
  editingDateKey = null
}

function openOtherModal(logModal, periodForm, otherForm) {
  editingDateKey = null
  openOtherFormShell(logModal, periodForm, otherForm, getSelectedDate())
}

export function openOtherForEdit(dateKey, existingLogs) {
  const logModal = document.getElementById("logModal")
  const periodForm = document.getElementById("periodForm")
  const otherForm = document.getElementById("otherForm")
  if (!logModal || !otherForm) return

  editingDateKey = dateKey
  openOtherFormShell(logModal, periodForm, otherForm, dateKey)

  for (const log of existingLogs || []) {
    if (log.category === "temperature") {
      document.getElementById("otherTemp").value = log.value
    } else if (log.category === "note") {
      document.getElementById("otherNote").value = log.value
    } else if (log.note && !document.getElementById("otherNote").value) {
      document.getElementById("otherNote").value = log.note
    } else {
      document.querySelectorAll(".log-pill").forEach(pill => {
        if (
          pill.dataset.category === log.category &&
          pill.dataset.value === log.value
        ) {
          const key = `${log.category}:${log.value}`
          selectedPills.add(key)
          pill.classList.add("selected")
        }
      })
    }
  }
}

export async function deleteLog(id) {
  const { data, error } = await supabase
    .from("cycle_logs")
    .delete()
    .eq("id", id)
    .select("id")

  if (error) {
    alert(error.message || "Could not delete entry.")
    return
  }
  if (!data?.length) {
    alert("Could not delete entry. It may already be gone, or you may not have permission.")
    return
  }
  location.reload()
}

function toDateOnly(value) {
  return String(value || "").split("T")[0]
}

export async function deletePeriod(id) {
  if (!confirm("Remove this logged period? Predictions will be recalculated.")) {
    return
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    alert("Please log in again.")
    return
  }

  const { data: row, error: fetchError } = await supabase
    .from("cycles")
    .select("id, start_date")
    .eq("id", id)
    .maybeSingle()

  if (fetchError || !row) {
    alert(fetchError?.message || "Could not find that period entry.")
    return
  }

  const { data: deleted, error } = await supabase
    .from("cycles")
    .delete()
    .eq("id", id)
    .select("id")

  if (error) {
    alert(error.message || "Could not delete period.")
    return
  }
  if (!deleted?.length) {
    alert("Could not delete period. You may not have permission.")
    return
  }

  // Keep profile seed in sync with remaining logged periods so empty-state
  // predictions (and settings) do not resurrect the deleted start date.
  const deletedKey = toDateOnly(row.start_date)
  const { data: profile } = await supabase
    .from("profiles")
    .select("last_period_start, cycle_length")
    .eq("id", user.id)
    .maybeSingle()

  const { data: remaining } = await supabase
    .from("cycles")
    .select("start_date")
    .eq("user_id", user.id)
    .order("start_date", { ascending: false })
    .limit(1)

  let nextStart = toDateOnly(remaining?.[0]?.start_date)
  if (!nextStart) {
    const cycleLength = Number(profile?.cycle_length) || 28
    const d = new Date(`${deletedKey}T12:00:00`)
    d.setDate(d.getDate() + cycleLength)
    nextStart = toDateOnly(d.toISOString())
  }

  if (nextStart && nextStart !== toDateOnly(profile?.last_period_start)) {
    await supabase
      .from("profiles")
      .update({ last_period_start: nextStart })
      .eq("id", user.id)
  }

  location.reload()
}

export function initLogController() {

  const logModal = document.getElementById("logModal")
  const periodForm = document.getElementById("periodForm")
  const otherForm = document.getElementById("otherForm")
  const periodDateInput = document.getElementById("periodDate")

  const logPeriodBtn = document.getElementById("logPeriodBtn")
  const logOtherBtn = document.getElementById("logOtherBtn")
  const closeModal = document.getElementById("closeModal")
  const closeModalPeriod = document.getElementById("closeModalPeriod")
  const modalCloseX = document.getElementById("modalCloseX")
  const savePeriodBtn = document.getElementById("savePeriod")
  const saveOtherBtn = document.getElementById("saveOther")

  const closeLogModal = () => logModal.classList.add("hidden")

  logPeriodBtn?.addEventListener("click", () => {
    openPeriodModal(logModal, periodForm, otherForm, periodDateInput)
  })

  logOtherBtn?.addEventListener("click", () => {
    openOtherModal(logModal, periodForm, otherForm)
  })

  closeModal?.addEventListener("click", closeLogModal)
  closeModalPeriod?.addEventListener("click", closeLogModal)
  modalCloseX?.addEventListener("click", closeLogModal)

  document.querySelectorAll(".log-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      const key = `${pill.dataset.category}:${pill.dataset.value}`
      if (selectedPills.has(key)) {
        selectedPills.delete(key)
        pill.classList.remove("selected")
      } else {
        selectedPills.add(key)
        pill.classList.add("selected")
      }
    })
  })

  savePeriodBtn?.addEventListener("click", async () => {

    const date = periodDateInput.value
    if (!date) {
      alert("Please select a date.")
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert("Please log in again.")
      return
    }

    const { data: existingCycles } = await supabase
      .from("cycles")
      .select("*")
      .eq("user_id", user.id)

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()

    // Lock the prediction this log fulfills (e.g. predicted Nov 14, actual Nov 12).
    const insightsBefore = getCycleInsights(existingCycles || [], profile || {}, [])
    await lockPredictionForNewPeriod(supabase, user.id, date, insightsBefore)

    const sorted = [...(existingCycles || [])].sort(
      (a, b) => new Date(a.start_date) - new Date(b.start_date)
    )
    const prev = sorted[sorted.length - 1]?.start_date

    let cycleLength = null
    if (prev) {
      const prevDate = new Date(prev)
      const newDate = new Date(date)
      cycleLength = Math.round(
        (newDate - prevDate) / (1000 * 60 * 60 * 24)
      )
    }

    const { error } = await supabase.from("cycles").insert([
      {
        user_id: user.id,
        start_date: date,
        cycle_length: cycleLength
      }
    ])

    if (error) {
      alert(error.message || "Could not save period.")
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        await fetch(
          `${window.SUPABASE_URL}/functions/v1/notify-period-logged`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ start_date: date })
          }
        )
      }
    } catch (err) {
      console.error("notify-period-logged:", err)
    }

    location.reload()
  })

  saveOtherBtn?.addEventListener("click", async () => {

    const date = document.getElementById("otherDate").value
    const temp = document.getElementById("otherTemp").value.trim()
    const note = document.getElementById("otherNote").value.trim()

    if (!date) {
      alert("Please select a date.")
      return
    }

    const hasSelection = selectedPills.size > 0 || temp !== "" || note !== ""
    if (!hasSelection) {
      alert("Please select at least one option, enter a temperature, or add a note.")
      return
    }

    const { data: { user } } = await supabase.auth.getUser()

    if (editingDateKey) {
      await supabase
        .from("cycle_logs")
        .delete()
        .eq("user_id", user.id)
        .eq("date", editingDateKey)
      editingDateKey = null
    }

    const rows = []
    let isFirst = true

    for (const key of selectedPills) {
      const [category, value] = key.split(/:(.+)/)
      rows.push({
        user_id: user.id,
        date,
        category,
        value,
        note: isFirst ? note || null : null
      })
      isFirst = false
    }

    if (temp !== "") {
      rows.push({
        user_id: user.id,
        date,
        category: "temperature",
        value: temp,
        note: isFirst ? note || null : null
      })
      isFirst = false
    }

    if (note !== "" && isFirst) {
      rows.push({
        user_id: user.id,
        date,
        category: "note",
        value: note,
        note: null
      })
    }

    await supabase.from("cycle_logs").insert(rows)

    logModal.classList.add("hidden")
    location.reload()
  })
}
