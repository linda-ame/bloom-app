import {
  corsHeaders,
  jsonResponse,
  adminClient,
  mergeDefaultPrefs,
  prefOn,
  sendPushToUser,
  displayName,
  ymd,
  addDays,
  daysBetween
} from "../_shared/push.ts"

const LUTEAL_PHASE_DAYS = 14

type PrefsMap = Record<string, Record<string, unknown>>

function calcOvulationDate(periodStart: Date, cycleLength: number) {
  return addDays(periodStart, cycleLength - LUTEAL_PHASE_DAYS - 1)
}

function calcNextPeriodFromOvulation(ovulation: Date) {
  return addDays(ovulation, LUTEAL_PHASE_DAYS + 1)
}

function buildWindows(periodStart: Date, periodLength: number, ovulation: Date | null) {
  if (!ovulation) {
    return {
      periodStart,
      periodEnd: addDays(periodStart, periodLength),
      ovulation: null as Date | null,
      fertileStart: null as Date | null,
      fertileEnd: null as Date | null
    }
  }
  return {
    periodStart,
    periodEnd: addDays(periodStart, periodLength),
    ovulation,
    fertileStart: addDays(ovulation, -4),
    fertileEnd: addDays(ovulation, 1)
  }
}

/** First low-fertility day after fertile window ends. */
function safeAfterFertileStart(windows: ReturnType<typeof buildWindows>) {
  if (!windows.fertileEnd) return null
  return addDays(windows.fertileEnd, 1)
}

function hourInTimezone(timeZone: string, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false
    }).formatToParts(now)
    const hour = parts.find((p) => p.type === "hour")?.value
    return Number(hour)
  } catch {
    return now.getUTCHours()
  }
}

function dateInTimezone(timeZone: string, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(now)
    const y = parts.find((p) => p.type === "year")?.value
    const m = parts.find((p) => p.type === "month")?.value
    const d = parts.find((p) => p.type === "day")?.value
    return new Date(`${y}-${m}-${d}T12:00:00Z`)
  } catch {
    const x = new Date(now)
    x.setUTCHours(12, 0, 0, 0)
    return x
  }
}

function slotForHour(hour: number): "morning" | "evening" | null {
  if (hour === 8) return "morning"
  if (hour === 20) return "evening"
  return null
}

async function alreadySent(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  kind: string,
  targetDate: string,
  slot: string
) {
  const { data } = await admin
    .from("notification_log")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("target_date", targetDate)
    .eq("slot", slot)
    .maybeSingle()
  return Boolean(data)
}

async function markSent(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  kind: string,
  targetDate: string,
  slot: string
) {
  await admin.from("notification_log").upsert(
    [{ user_id: userId, kind, target_date: targetDate, slot }],
    { onConflict: "user_id,kind,target_date,slot" }
  )
}

async function loadCycleContext(admin: ReturnType<typeof adminClient>, ownerId: string) {
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name, last_period_start, period_length, cycle_length")
    .eq("id", ownerId)
    .maybeSingle()

  if (
    !profile?.last_period_start ||
    profile.period_length == null ||
    profile.cycle_length == null
  ) {
    return null
  }

  const { data: cycles } = await admin
    .from("cycles")
    .select("start_date, cycle_length")
    .eq("user_id", ownerId)
    .order("start_date", { ascending: false })
    .limit(5)

  let periodStart = new Date(`${String(profile.last_period_start).slice(0, 10)}T12:00:00`)
  let cycleLength = Number(profile.cycle_length)
  const periodLength = Number(profile.period_length)

  if (cycles && cycles.length > 0) {
    periodStart = new Date(`${cycles[0].start_date}T12:00:00`)
    if (cycles[0].cycle_length != null) {
      cycleLength = Number(cycles[0].cycle_length)
    } else if (cycles.length > 1) {
      cycleLength = daysBetween(
        new Date(`${cycles[1].start_date}T12:00:00`),
        periodStart
      )
    }
  }

  const ovulation = calcOvulationDate(periodStart, cycleLength)
  const nextPeriod = calcNextPeriodFromOvulation(ovulation)
  const windows = buildWindows(periodStart, periodLength, ovulation)

  return { profile, periodStart, periodLength, cycleLength, ovulation, nextPeriod, windows }
}

async function maybeSend(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  kind: string,
  targetDate: string,
  slot: string,
  payload: { title: string; body: string; url?: string }
) {
  if (await alreadySent(admin, userId, kind, targetDate, slot)) return 0
  const { sent } = await sendPushToUser(admin, userId, payload)
  if (sent > 0) {
    await markSent(admin, userId, kind, targetDate, slot)
  }
  return sent
}

function daysBeforeMatch(eventDate: Date, today: Date, daysBefore: number) {
  const diff = daysBetween(today, eventDate)
  return diff === daysBefore
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  // Allow cron with service role or Authorization Bearer of a secret CRON_SECRET
  const cronSecret = Deno.env.get("CRON_SECRET")
  const authHeader = req.headers.get("Authorization") || ""
  const provided = authHeader.replace("Bearer ", "")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""

  if (cronSecret && provided === cronSecret) {
    // ok
  } else if (provided && provided === serviceKey) {
    // ok
  } else {
    // Also allow authenticated user for manual testing
    const admin = adminClient()
    const { data: { user } } = await admin.auth.getUser(provided)
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401)
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const admin = adminClient()
  const now = new Date()
  let totalSent = 0

  const { data: prefsRows, error } = await admin
    .from("notification_prefs")
    .select("user_id, enabled, prefs")
    .eq("enabled", true)

  if (error) return jsonResponse({ error: error.message }, 500)

  for (const row of prefsRows || []) {
    const userId = row.user_id as string
    const prefs = mergeDefaultPrefs(row.prefs as PrefsMap)

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("timezone")
      .eq("user_id", userId)
      .limit(1)

    const timezone = subs?.[0]?.timezone || "UTC"
    const hour = hourInTimezone(timezone, now)
    const slot = slotForHour(hour)
    // Self alerts run on morning slot only if evening not configured;
    // for self we treat morning+evening windows: run at both 8 and 20.
    if (!slot) continue

    const today = dateInTimezone(timezone, now)

    // ---- Self scheduled alerts (owner with complete profile) ----
    const selfCtx = await loadCycleContext(admin, userId)
    if (selfCtx) {
      const { nextPeriod, ovulation, windows } = selfCtx

      if (prefOn(prefs, "self_period_approaching")) {
        const days = Number(prefs.self_period_approaching.days_before) || 3
        if (daysBeforeMatch(nextPeriod, today, days)) {
          totalSent += await maybeSend(
            admin,
            userId,
            "self_period_approaching",
            ymd(nextPeriod),
            slot,
            {
              title: "Bloom",
              body: `Your period is expected in ${days} day${days === 1 ? "" : "s"}.`,
              url: "./dashboard.html"
            }
          )
        }
      }

      if (prefOn(prefs, "self_ovulation_approaching") && ovulation) {
        const days = Number(prefs.self_ovulation_approaching.days_before) || 2
        if (daysBeforeMatch(ovulation, today, days)) {
          totalSent += await maybeSend(
            admin,
            userId,
            "self_ovulation_approaching",
            ymd(ovulation),
            slot,
            {
              title: "Bloom",
              body: `Possible ovulation in ${days} day${days === 1 ? "" : "s"}.`,
              url: "./dashboard.html"
            }
          )
        }
      }

      if (prefOn(prefs, "self_safe_approaching") && windows.fertileStart) {
        // "Safe" approaching = approaching the start of low fertility after period,
        // or approaching fertileStart from earlier low days — use fertileStart as
        // end of pre-fertile safe stretch: notify days before fertile window begins.
        // Plan: upcoming safe window — after fertile ends.
        const safeStart = safeAfterFertileStart(windows)
        if (safeStart) {
          const days = Number(prefs.self_safe_approaching.days_before) || 2
          if (daysBeforeMatch(safeStart, today, days)) {
            totalSent += await maybeSend(
              admin,
              userId,
              "self_safe_approaching",
              ymd(safeStart),
              slot,
              {
                title: "Bloom",
                body: `Low-fertility (safer) days begin in ${days} day${days === 1 ? "" : "s"}.`,
                url: "./dashboard.html"
              }
            )
          }
        }
      }
    }

    // ---- Partner-facing scheduled alerts (this user is owner) ----
    const ownerCtx = selfCtx
    if (ownerCtx) {
      const { data: ownerAuth } = await admin.auth.admin.getUserById(userId)
      const name = displayName(ownerCtx.profile, ownerAuth?.user?.email || null)
      const { nextPeriod, windows } = ownerCtx
      const fertileStart = windows.fertileStart
      const safeStart = safeAfterFertileStart(windows)

      const { data: links } = await admin
        .from("partner_links")
        .select("partner_id")
        .eq("owner_id", userId)
        .eq("status", "accepted")

      for (const link of links || []) {
        const partnerId = link.partner_id as string | null
        if (!partnerId) continue

        const { data: partnerPrefsRow } = await admin
          .from("notification_prefs")
          .select("enabled, prefs")
          .eq("user_id", partnerId)
          .maybeSingle()

        if (!partnerPrefsRow?.enabled) continue
        const partnerPrefs = mergeDefaultPrefs(partnerPrefsRow.prefs as PrefsMap)

        const partnerUrl = `./partner.html?owner=${encodeURIComponent(userId)}`

        // Fertile window
        if (
          prefOn(prefs, "partner_fertile_window") &&
          prefOn(partnerPrefs, "receive_partner_fertile_window") &&
          fertileStart
        ) {
          const cfg = prefs.partner_fertile_window
          if (Boolean(cfg[slot])) {
            const days = Number(cfg.days_before) || 2
            if (daysBeforeMatch(fertileStart, today, days)) {
              totalSent += await maybeSend(
                admin,
                partnerId,
                "partner_fertile_window",
                ymd(fertileStart),
                slot,
                {
                  title: "Bloom",
                  body: `${name}: fertile window starts in ${days} day${days === 1 ? "" : "s"} (last safer days soon).`,
                  url: partnerUrl
                }
              )
            }
          }
        }

        // Safe after fertile
        if (
          prefOn(prefs, "partner_safe_after_fertile") &&
          prefOn(partnerPrefs, "receive_partner_safe_after_fertile") &&
          safeStart
        ) {
          const cfg = prefs.partner_safe_after_fertile
          if (Boolean(cfg[slot])) {
            const days = Number(cfg.days_before) || 2
            if (daysBeforeMatch(safeStart, today, days)) {
              totalSent += await maybeSend(
                admin,
                partnerId,
                "partner_safe_after_fertile",
                ymd(safeStart),
                slot,
                {
                  title: "Bloom",
                  body: `${name}: last fertile days ending — safer days in ${days} day${days === 1 ? "" : "s"}.`,
                  url: partnerUrl
                }
              )
            }
          }
        }

        // Period expected
        if (
          prefOn(prefs, "partner_period_expected") &&
          prefOn(partnerPrefs, "receive_partner_period_expected")
        ) {
          const cfg = prefs.partner_period_expected
          if (Boolean(cfg[slot])) {
            const days = Number(cfg.days_before) || 3
            if (daysBeforeMatch(nextPeriod, today, days)) {
              totalSent += await maybeSend(
                admin,
                partnerId,
                "partner_period_expected",
                ymd(nextPeriod),
                slot,
                {
                  title: "Bloom",
                  body: `${name}: period expected in ${days} day${days === 1 ? "" : "s"}.`,
                  url: partnerUrl
                }
              )
            }
          }
        }
      }
    }
  }

  return jsonResponse({ ok: true, sent: totalSent })
})
