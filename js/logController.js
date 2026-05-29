const supabase = window.supabaseClient

import { getSelectedDate } from "./selectedDate.js"

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
  await supabase.from("cycle_logs").delete().eq("id", id)
  location.reload()
}

export async function deletePeriod(id) {
  if (!confirm("Remove this logged period? Predictions will be recalculated.")) {
    return
  }
  await supabase.from("cycles").delete().eq("id", id)
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

    const { data: { user } } = await supabase.auth.getUser()

    const { data: cycles } = await supabase
      .from("cycles")
      .select("start_date")
      .eq("user_id", user.id)
      .order("start_date", { ascending: false })
      .limit(1)

    const prev = cycles?.[0]?.start_date

    let cycleLength = null

    if (prev) {
      const prevDate = new Date(prev)
      const newDate = new Date(date)
      cycleLength = Math.round(
        (newDate - prevDate) / (1000 * 60 * 60 * 24)
      )
    }

    await supabase.from("cycles").insert([
      {
        user_id: user.id,
        start_date: date,
        cycle_length: cycleLength
      }
    ])

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
