import { buildCycleWindows, classifyDate } from "./cycleUI.js?v=2"
import { getCycleInsights } from "./cycleEngine.js?v=2"
import { getSelectedDate, setSelectedDate } from "./selectedDate.js?v=2"
import {
  openOtherForEdit,
  deleteLog,
  deletePeriod
} from "./logController.js?v=2"

export { getSelectedDate, setSelectedDate }

function normalizeDate(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function toDateKey(date) {
  const d = normalizeDate(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return normalizeDate(d)
}

function isInPeriodRange(date, periodStart, periodLength) {
  const d = normalizeDate(date)
  const start = normalizeDate(periodStart)
  const end = addDays(start, periodLength)
  return d >= start && d <= end
}

// "Rule of 14": for a 28-day cycle, ovulation is on cycle day 14
// (= periodStart + 13 days), and next period is on day 29 (= ovulation + 15 days).
const LUTEAL_PHASE_DAYS = 14
const CONFIRMED_OVULATION_VALUE = "Confirmed ovulation"

function extractConfirmedOvDates(logs) {
  return (logs || [])
    .filter(
      l =>
        l.category === "ovulation" &&
        l.value === CONFIRMED_OVULATION_VALUE
    )
    .map(l => normalizeDate(l.date))
    .sort((a, b) => a - b)
}

export function buildProjectionContext(cycles, profile, logs = []) {
  const insights = getCycleInsights(cycles || [], profile, logs)
  const periodLength = insights.periodLength ?? profile?.period_length ?? 5
  const cycleLength = insights.cycleLength ?? profile?.cycle_length ?? 28

  const sorted = [...(cycles || [])].sort(
    (a, b) => new Date(a.start_date) - new Date(b.start_date)
  )

  const loggedStarts = sorted.map(c => normalizeDate(c.start_date))
  const loggedKeys = new Set(loggedStarts.map(toDateKey))
  const confirmedOvDates = extractConfirmedOvDates(logs)

  // Projection anchor = onboarding's last_period_start.
  const anchorStart = profile?.last_period_start
    ? normalizeDate(profile.last_period_start)
    : (loggedStarts[0] || normalizeDate(insights.periodStart))

  const starts = []
  let cursor = anchorStart
  const horizon = addDays(new Date(), 540)

  while (cursor < horizon) {
    const isLogged = loggedKeys.has(toDateKey(cursor))
    const naturalNext = addDays(cursor, cycleLength)
    const nextLogged = loggedStarts.find(d => d > cursor)

    const upperBound =
      nextLogged && nextLogged < naturalNext ? nextLogged : naturalNext

    const confirmedOv = confirmedOvDates.find(
      d => d > cursor && d < upperBound
    )

    let cycleOv
    let nextDate

    if (confirmedOv) {
      cycleOv = confirmedOv
      const shifted = addDays(confirmedOv, LUTEAL_PHASE_DAYS + 1)
      nextDate =
        nextLogged && nextLogged <= shifted ? nextLogged : shifted
    } else {
      nextDate =
        nextLogged && nextLogged < naturalNext ? nextLogged : naturalNext
      cycleOv = addDays(nextDate, -(LUTEAL_PHASE_DAYS + 1))
    }

    starts.push({ date: cursor, logged: isLogged, ovulation: cycleOv })

    if (nextDate <= cursor) break
    cursor = nextDate
  }

  function findGoverningIndex(d) {
    let idx = 0
    for (let i = 0; i < starts.length; i++) {
      if (starts[i].date <= d) idx = i
      else break
    }
    return idx
  }

  function getDayStatus(date) {
    const d = normalizeDate(date)

    if (d < anchorStart) {
      return {
        phaseClass: null,
        phase: "",
        sub: "",
        kind: "none",
        isPeriod: false,
        isFirstPeriodDay: false,
        isOvulationDay: false
      }
    }

    const dTime = d.getTime()
    const isFirstPeriodDay = starts.some(s => s.date.getTime() === dTime)
    const isOvulationDay = starts.some(
      s => s.ovulation && normalizeDate(s.ovulation).getTime() === dTime
    )

    for (const ls of loggedStarts) {
      if (isInPeriodRange(d, ls, periodLength)) {
        return {
          phaseClass: "status-period",
          phase: "Period 🌸",
          sub: "Logged period",
          kind: "actual",
          isPeriod: true,
          isFirstPeriodDay,
          isOvulationDay
        }
      }
    }

    const idx = findGoverningIndex(d)
    const governing = starts[idx]

    const windows = buildCycleWindows(
      governing.date,
      periodLength,
      governing.ovulation
    )

    const { phase, sub, phaseClass } = classifyDate(d, windows)

    if (phaseClass === "status-period") {
      if (governing.logged) {
        return {
          phaseClass: "status-period",
          phase,
          sub: "Logged period",
          kind: "actual",
          isPeriod: true,
          isFirstPeriodDay,
          isOvulationDay
        }
      }
      return {
        phaseClass: "cal-period-predicted",
        phase,
        sub: "Predicted period",
        kind: "predicted",
        isPeriod: true,
        isFirstPeriodDay,
        isOvulationDay
      }
    }

    return {
      phaseClass,
      phase,
      sub,
      kind: governing.logged ? "actual" : "predicted",
      isPeriod: false,
      isFirstPeriodDay,
      isOvulationDay
    }
  }

  return {
    getDayStatus,
    anchorStart,
    periodLength,
    cycleLength
  }
}

let viewYear = new Date().getFullYear()
let viewMonth = new Date().getMonth()
let projection = null
let eventsByDate = {}
let cyclesByDate = {}
let calendarReadOnly = false

function getEventsForDate(dateKey) {
  return eventsByDate[dateKey] || []
}

const CATEGORY_LABELS = {
  ovulation: "Ovulation",
  spotting: "Spotting",
  discharge: "Discharge",
  symptom: "Symptoms",
  temperature: "Basal temperature",
  note: "Note"
}

function buildEventsMap(logs) {
  const map = {}
  for (const log of logs || []) {
    const key = log.date?.split?.("T")?.[0] || toDateKey(log.date)
    if (!map[key]) map[key] = []
    map[key].push(log)
  }
  return map
}

function buildCyclesByDate(cycles) {
  const map = {}
  for (const cycle of cycles || []) {
    const key =
      cycle.start_date?.split?.("T")?.[0] || toDateKey(cycle.start_date)
    map[key] = cycle
  }
  return map
}

function appendLogRow(list, text, logId) {
  const li = document.createElement("li")
  const span = document.createElement("span")
  span.textContent = text
  li.appendChild(span)

  if (!calendarReadOnly) {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "row-delete"
    btn.dataset.id = logId
    btn.setAttribute("aria-label", "Remove entry")
    btn.textContent = "×"
    btn.addEventListener("click", () => deleteLog(logId))
    li.appendChild(btn)
  }

  list.appendChild(li)
}

function renderMonthLabel() {
  const label = document.getElementById("calMonthLabel")
  if (!label) return
  const date = new Date(viewYear, viewMonth, 1)
  label.textContent = date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  })
}

function renderGrid() {
  const grid = document.getElementById("calGrid")
  if (!grid || !projection) return

  grid.innerHTML = ""

  const todayKey = toDateKey(new Date())
  let selectedDateKey = getSelectedDate()
  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  let startOffset = firstOfMonth.getDay() - 1
  if (startOffset < 0) startOffset = 6

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement("div")
    empty.className = "cal-day cal-day-empty"
    grid.appendChild(empty)
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(viewYear, viewMonth, day)
    const dateKey = toDateKey(date)
    const status = projection.getDayStatus(date)

    const cell = document.createElement("button")
    cell.type = "button"
    cell.className = "cal-day"
    cell.dataset.date = dateKey

    const dayLabel = document.createElement("span")
    dayLabel.className = "cal-day-number"
    dayLabel.textContent = day
    cell.appendChild(dayLabel)

    if (status.isFirstPeriodDay) {
      const badge = document.createElement("span")
      badge.className = "cal-day-icon cal-day-icon-period"
      badge.textContent = "🩸"
      badge.title = "Period start"
      cell.appendChild(badge)
    }

    if (status.isOvulationDay) {
      const badge = document.createElement("span")
      badge.className = "cal-day-icon cal-day-icon-ovulation"
      badge.textContent = "🔥"
      badge.title = "Ovulation"
      cell.appendChild(badge)
    }

    if (status.phaseClass) {
      cell.classList.add(status.phaseClass)
    }

    if (dateKey === todayKey) {
      cell.classList.add("cal-today")
    }

    if (dateKey === selectedDateKey) {
      cell.classList.add("cal-selected")
    }

    cell.addEventListener("click", () => {
      setSelectedDate(dateKey)
      renderGrid()
    })

    cell.addEventListener("dblclick", (e) => {
      e.preventDefault()
      openDayPopup(dateKey, status)
    })

    grid.appendChild(cell)
  }
}

function openDayPopup(dateKey, status) {
  const popup = document.getElementById("dayPopup")
  const title = document.getElementById("dayPopupTitle")
  const body = document.getElementById("dayPopupBody")
  if (!popup || !title || !body) return

  const date = parseDateKey(dateKey)
  title.textContent = date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  })

  body.innerHTML = ""

  if (status.phase) {
    const phaseEl = document.createElement("p")
    phaseEl.innerHTML = `<strong>${status.phase}</strong>`
    body.appendChild(phaseEl)
    if (status.sub) {
      const subEl = document.createElement("p")
      subEl.className = "day-popup-sub"
      subEl.textContent = status.sub
      body.appendChild(subEl)
    }
  } else {
    const subEl = document.createElement("p")
    subEl.className = "day-popup-sub"
    subEl.textContent = "No cycle data for this day"
    body.appendChild(subEl)
  }

  const logs = getEventsForDate(dateKey)

  if (logs.length) {
    const grouped = {}
    for (const log of logs) {
      const cat = log.category || "note"
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(log)
    }

    const logsWrap = document.createElement("div")
    logsWrap.className = "day-popup-logs"

    for (const [cat, entries] of Object.entries(grouped)) {
      const label = document.createElement("p")
      label.className = "day-popup-cat"
      label.textContent = CATEGORY_LABELS[cat] || cat
      logsWrap.appendChild(label)

      const list = document.createElement("ul")
      list.className = "day-popup-events"

      for (const entry of entries) {
        let text = ""
        if (cat === "temperature") {
          text = `${entry.value} °C`
        } else if (cat === "note") {
          text = entry.value
        } else {
          text = entry.value
          if (entry.note) text += ` — ${entry.note}`
        }
        appendLogRow(list, text, entry.id)
      }

      logsWrap.appendChild(list)
    }

    body.appendChild(logsWrap)

    if (!calendarReadOnly) {
      const editBtn = document.createElement("button")
      editBtn.type = "button"
      editBtn.className = "btn-edit"
      editBtn.textContent = "Edit all entries"
      editBtn.addEventListener("click", () => {
        closeDayPopup()
        openOtherForEdit(dateKey, logs)
      })
      body.appendChild(editBtn)
    }
  } else {
    const emptyEl = document.createElement("p")
    emptyEl.className = "day-popup-sub"
    emptyEl.textContent = "No logged entries"
    body.appendChild(emptyEl)
  }

  const cycleRow = cyclesByDate[dateKey]
  if (cycleRow?.id && !calendarReadOnly) {
    const removePeriodBtn = document.createElement("button")
    removePeriodBtn.type = "button"
    removePeriodBtn.className = "btn-danger"
    removePeriodBtn.textContent = "Remove this period"
    removePeriodBtn.addEventListener("click", () => deletePeriod(cycleRow.id))
    body.appendChild(removePeriodBtn)
  }

  popup.classList.remove("hidden")
}

function closeDayPopup() {
  document.getElementById("dayPopup")?.classList.add("hidden")
}

function bindNavigation() {
  document.getElementById("calPrev")?.addEventListener("click", () => {
    viewMonth--
    if (viewMonth < 0) {
      viewMonth = 11
      viewYear--
    }
    renderMonthLabel()
    renderGrid()
  })

  document.getElementById("calNext")?.addEventListener("click", () => {
    viewMonth++
    if (viewMonth > 11) {
      viewMonth = 0
      viewYear++
    }
    renderMonthLabel()
    renderGrid()
  })

  document.getElementById("dayPopupClose")?.addEventListener("click", closeDayPopup)

  document.getElementById("dayPopup")?.addEventListener("click", (e) => {
    if (e.target.id === "dayPopup") closeDayPopup()
  })
}

export function initCalendar(cycles, profile, events, options = {}) {
  calendarReadOnly = Boolean(options.readOnly)
  projection = buildProjectionContext(cycles, profile, events)
  eventsByDate = buildEventsMap(events)
  cyclesByDate = buildCyclesByDate(cycles)

  const now = new Date()
  viewYear = now.getFullYear()
  viewMonth = now.getMonth()
  setSelectedDate(toDateKey(now))

  renderMonthLabel()
  renderGrid()
  bindNavigation()
}
