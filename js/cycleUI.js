function normalizeDate(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatPeriodLabel(daysLeft) {
  if (daysLeft >= 1) return `${daysLeft}`
  if (daysLeft === 0) return "Today"
  if (daysLeft === -1) return "1 day late"

  return `${Math.abs(daysLeft)} days late`
}

export function buildCycleWindows(periodStart, periodLength, ovulation) {
  const start = normalizeDate(periodStart)

  const periodEnd = new Date(start)
  periodEnd.setDate(periodEnd.getDate() + periodLength)

  const ov = ovulation ? normalizeDate(ovulation) : null

  if (!ov || isNaN(ov.getTime())) {
    return { periodStart: start, periodEnd, ovulation: null }
  }

  const fertileStart = new Date(ov)
  fertileStart.setDate(fertileStart.getDate() - 4)

  const fertileEnd = new Date(ov)
  fertileEnd.setDate(fertileEnd.getDate() + 1)

  const warningStart = new Date(periodEnd)
  warningStart.setDate(warningStart.getDate() + 1)

  const postOvulationEnd = new Date(fertileEnd)
  postOvulationEnd.setDate(postOvulationEnd.getDate() + 2)

  return {
    periodStart: start,
    periodEnd,
    ovulation: ov,
    fertileStart,
    fertileEnd,
    warningStart,
    postOvulationEnd
  }
}

export function classifyDate(date, windows) {
  const d = normalizeDate(date)

  if (!windows.ovulation) {
    return {
      phase: "Low fertility 🌿",
      sub: "",
      phaseClass: "status-low"
    }
  }

  const {
    periodStart,
    periodEnd,
    ovulation,
    fertileStart,
    fertileEnd,
    warningStart,
    postOvulationEnd
  } = windows

  let phase = "Low fertility 🌿"
  let sub = ""
  let phaseClass = "status-low"

  if (d >= periodStart && d <= periodEnd) {
    phase = "Period 🌸"
    sub = "Period day"
    phaseClass = "status-period"
  } else if (d >= warningStart && d < fertileStart) {
    phase = "Rising fertility ⚠️"
    sub = "Fertility increasing"
    phaseClass = "status-warning"
  } else if (d >= fertileStart && d < ovulation) {
    phase = "High fertility ⚡"
    sub = "Fertile window"
    phaseClass = "status-fertile"
  } else if (d >= ovulation && d <= fertileEnd) {
    phase = "Ovulation 🔥"
    sub = "Peak fertility"
    phaseClass = "status-ovulation"
  } else if (d > fertileEnd && d <= postOvulationEnd) {
    phase = "Post-ovulation 🌙"
    sub = "Fertility decreasing"
    phaseClass = "status-post"
  }

  return { phase, sub, phaseClass }
}

export function getCycleUI(insights) {
  const now = new Date()
  const periodStart = new Date(insights.periodStart)

  const ovulation = insights.ovulation
    ? new Date(insights.ovulation)
    : null

  const windows = buildCycleWindows(
    periodStart,
    insights.periodLength,
    ovulation
  )

  const classified = classifyDate(now, windows)
  let { phase, sub, phaseClass } = classified

  if (phaseClass === "status-period" && insights.cycleDay) {
    sub = `Day ${insights.cycleDay}`
  }

  let periodClass = ""
  if (insights.daysLeft < 0) {
    periodClass = "period-overdue"
  }

  return {
    ...insights,
    phase,
    sub,
    phaseClass,
    periodClass,
    periodLabel: formatPeriodLabel(insights.daysLeft),
    ...windows
  }
}
