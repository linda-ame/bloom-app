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

export async function lockPeriodPrediction(supabase, userId, predictedStart) {
  const key = toDateOnly(predictedStart)
  if (!userId || !key) return { error: null }

  return supabase.from("period_predictions").upsert(
    {
      user_id: userId,
      predicted_start: key
    },
    { onConflict: "user_id,predicted_start" }
  )
}

export async function fetchPeriodPredictions(supabase, userId) {
  const { data, error } = await supabase
    .from("period_predictions")
    .select("predicted_start")
    .eq("user_id", userId)

  if (error) {
    console.error("period_predictions:", error)
    return []
  }

  return (data || [])
    .map(row => toDateOnly(row.predicted_start))
    .filter(Boolean)
}

/**
 * When a period is logged, lock the prediction that this log fulfills
 * (so past predicted starts stay visible for comparison).
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

  // Logging the current cycle's start itself should not lock the *next* prediction.
  if (!actualKey || !predictedKey || actualKey <= periodStartKey) return

  await lockPeriodPrediction(supabase, userId, predictedKey)
}

/**
 * If the next predicted period is already overdue, lock it so it remains
 * visible in the past even before the user logs the actual start.
 */
export async function lockOverduePrediction(supabase, userId, insights) {
  if (!insights?.nextPeriod) return

  const predictedKey = toDateOnly(insights.nextPeriod)
  const todayKey = toDateOnly(new Date())
  if (predictedKey && predictedKey < todayKey) {
    await lockPeriodPrediction(supabase, userId, predictedKey)
  }
}

export { toDateOnly }
