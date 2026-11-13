function toDateOnly(value) {
  if (!value) return ""
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, "0")
    const d = String(value.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  return String(value).split("T")[0]
}

export async function lockPeriodPrediction(
  supabase,
  userId,
  predictedStart,
  predictedOvulation = null
) {
  const key = toDateOnly(predictedStart)
  if (!userId || !key) return { error: null }

  const row = {
    user_id: userId,
    predicted_start: key
  }
  const ovKey = toDateOnly(predictedOvulation)
  if (ovKey) row.predicted_ovulation = ovKey

  return supabase.from("period_predictions").upsert(row, {
    onConflict: "user_id,predicted_start"
  })
}

export async function fetchPeriodPredictions(supabase, userId) {
  const { data, error } = await supabase
    .from("period_predictions")
    .select("predicted_start, predicted_ovulation")
    .eq("user_id", userId)

  if (error) {
    console.error("period_predictions:", error)
    return { starts: [], ovulations: [] }
  }

  const starts = []
  const ovulations = []
  for (const row of data || []) {
    const start = toDateOnly(row.predicted_start)
    const ov = toDateOnly(row.predicted_ovulation)
    if (start) starts.push(start)
    if (ov) ovulations.push(ov)
  }
  return { starts, ovulations }
}

/**
 * When a period is logged, lock the prediction that this log fulfills
 * (period start + ovulation for that cycle) so past predictions stay fixed.
 */
export async function lockPredictionForNewPeriod(
  supabase,
  userId,
  actualStart,
  insights
) {
  if (!insights?.nextPeriod || !insights?.periodStart) return

  const actualKey = toDateOnly(actualStart)
  const periodStartKey = toDateOnly(insights.periodStart)
  const predictedKey = toDateOnly(insights.nextPeriod)
  const predictedOv = toDateOnly(insights.ovulation)

  // Logging the current cycle's start itself should not lock the *next* prediction.
  if (!actualKey || !predictedKey || actualKey <= periodStartKey) return

  await lockPeriodPrediction(supabase, userId, predictedKey, predictedOv)
}

/**
 * If the next predicted period is already overdue, lock period + ovulation
 * so they remain visible in the past even before the user logs the actual start.
 */
export async function lockOverduePrediction(supabase, userId, insights) {
  if (!insights?.nextPeriod) return

  const predictedKey = toDateOnly(insights.nextPeriod)
  const todayKey = toDateOnly(new Date())
  if (predictedKey && predictedKey < todayKey) {
    await lockPeriodPrediction(
      supabase,
      userId,
      predictedKey,
      insights.ovulation
    )
  }
}

export { toDateOnly }
