// "Rule of 14": ovulation lands on cycle day (cycleLength - 14).
// For a 28-day cycle: ovulation on day 14, next period on day 29.
// LUTEAL_PHASE_DAYS = the 14 post-ovulation days (cycle days 15..28 for a 28-day cycle).
// In calendar terms, next period = ovulation date + LUTEAL_PHASE_DAYS + 1.
const LUTEAL_PHASE_DAYS = 14
const CONFIRMED_OVULATION_VALUE = "Confirmed ovulation"

function calcOvulationDate(periodStart, cycleLength) {
  const d = new Date(periodStart)
  d.setDate(d.getDate() + (cycleLength - LUTEAL_PHASE_DAYS - 1))
  return d
}

function calcNextPeriodFromOvulation(ovulationDate) {
  const d = new Date(ovulationDate)
  d.setDate(d.getDate() + LUTEAL_PHASE_DAYS + 1)
  return d
}

function calcDaysLeft(nextPeriod) {
  const next = new Date(nextPeriod)
  next.setHours(0, 0, 0, 0)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return Math.round((next - today) / (1000 * 60 * 60 * 24))
}

function normalizeDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function getConfirmedOvulationInWindow(logs, periodStart, nextPeriod) {
  const start = normalizeDay(periodStart)
  const end = normalizeDay(nextPeriod)
  let earliest = null

  for (const log of logs || []) {
    if (log.category !== "ovulation" || log.value !== CONFIRMED_OVULATION_VALUE) {
      continue
    }
    const d = normalizeDay(log.date)
    if (d >= start && d <= end) {
      if (!earliest || d < earliest) earliest = d
    }
  }

  return earliest
}

function applyConfirmedOvulationOverride(ovulation, nextPeriod, periodStart, logs) {
  const confirmed = getConfirmedOvulationInWindow(logs, periodStart, nextPeriod)
  if (!confirmed) {
    return {
      ovulation,
      nextPeriod,
      daysLeft: calcDaysLeft(nextPeriod)
    }
  }

  const shiftedNext = calcNextPeriodFromOvulation(confirmed)

  return {
    ovulation: confirmed,
    nextPeriod: shiftedNext,
    daysLeft: calcDaysLeft(shiftedNext)
  }
}

export function getCycleInsights(cycles, onboardingData, logs = []) {
  const now = new Date()

  // -------------------------
  // 1. NO DATA → onboarding fallback
  // -------------------------
  if (!cycles || cycles.length === 0) {
    const start = new Date(onboardingData.last_period_start)
    const cycleLength = onboardingData.cycle_length

    const nextPeriod = new Date(start)
    nextPeriod.setDate(start.getDate() + cycleLength)

    const cycleDay =
      Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1

    const ovulation = calcOvulationDate(start, cycleLength)

    const overridden = applyConfirmedOvulationOverride(
      ovulation,
      nextPeriod,
      start,
      logs
    )

    return {
      mode: "onboarding",
      cycleDay,
      ovulation: overridden.ovulation || null,
      daysLeft: overridden.daysLeft,
      nextPeriod: overridden.nextPeriod,
      cycleLength,
      periodStart: start,
      periodLength: onboardingData.period_length
    }
  }

  // -------------------------
  // helper: sort cycles
  // -------------------------
  const sorted = [...cycles].sort(
    (a, b) => new Date(a.start_date) - new Date(b.start_date)
  )

  const lastCycle = sorted[sorted.length - 1]
  const lastStart = new Date(lastCycle.start_date)

  // -------------------------
  // 2. LIGHT DATA (1–2 cycles)
  // -------------------------
  if (cycles.length < 3) {
    const onboardingCycle = onboardingData.cycle_length

    const realLengths = cycles
      .map(c => c.cycle_length)
      .filter(Boolean)

    const combined = realLengths.length
      ? Math.round(
          (realLengths.reduce((a, b) => a + b, 0) + onboardingCycle) /
          (realLengths.length + 1)
        )
      : onboardingCycle

    const nextPeriod = new Date(lastStart)
    nextPeriod.setDate(lastStart.getDate() + combined)

    const cycleDay =
      Math.floor((now - lastStart) / (1000 * 60 * 60 * 24)) + 1

    const ovulation = calcOvulationDate(lastStart, combined)

    const overridden = applyConfirmedOvulationOverride(
      ovulation,
      nextPeriod,
      lastStart,
      logs
    )

    return {
      mode: "blended",
      cycleDay,
      ovulation: overridden.ovulation || null,
      daysLeft: overridden.daysLeft,
      nextPeriod: overridden.nextPeriod,
      cycleLength: combined,
      periodStart: lastStart,
      periodLength: onboardingData.period_length
    }
  }

  // -------------------------
  // 3. FULL DATA (3+ cycles)
  // -------------------------
  const last6 = sorted.slice(-6)

  const lengths = last6
    .map(c => c.cycle_length)
    .filter(Boolean)

  const avg =
    Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)

  const nextPeriod = new Date(lastStart)
  nextPeriod.setDate(lastStart.getDate() + avg)

  const cycleDay =
    Math.floor((now - lastStart) / (1000 * 60 * 60 * 24)) + 1

  const ovulation = calcOvulationDate(lastStart, avg)

  const overridden = applyConfirmedOvulationOverride(
    ovulation,
    nextPeriod,
    lastStart,
    logs
  )

  return {
    mode: "history",
    cycleDay,
    ovulation: overridden.ovulation || null,
    daysLeft: overridden.daysLeft,
    nextPeriod: overridden.nextPeriod,
    cycleLength: avg,
    periodStart: lastStart,
    periodLength: onboardingData.period_length
  }
}
