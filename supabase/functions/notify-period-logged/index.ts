import {
  corsHeaders,
  jsonResponse,
  requireUser,
  mergeDefaultPrefs,
  prefOn,
  sendPushToUser,
  displayName
} from "../_shared/push.ts"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const auth = await requireUser(req)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)
  const { admin, user } = auth

  let body: { start_date?: string } = {}
  try {
    body = await req.json()
  } catch {
    // ignore
  }

  const startDate = (body.start_date || "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return jsonResponse({ error: "start_date (YYYY-MM-DD) required" }, 400)
  }

  const { data: ownerPrefsRow } = await admin
    .from("notification_prefs")
    .select("enabled, prefs")
    .eq("user_id", user.id)
    .maybeSingle()

  const ownerPrefs = mergeDefaultPrefs(ownerPrefsRow?.prefs as Record<string, Record<string, unknown>>)
  if (!ownerPrefsRow?.enabled || !prefOn(ownerPrefs, "partner_period_logged")) {
    return jsonResponse({ ok: true, sent: 0, reason: "owner_disabled" })
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle()

  const name = displayName(profile, user.email)
  const prettyDate = new Date(`${startDate}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric"
  })

  const { data: links, error: linksError } = await admin
    .from("partner_links")
    .select("partner_id")
    .eq("owner_id", user.id)
    .eq("status", "accepted")

  if (linksError) return jsonResponse({ error: linksError.message }, 500)

  let totalSent = 0
  for (const link of links || []) {
    const partnerId = link.partner_id
    if (!partnerId) continue

    const { data: partnerPrefsRow } = await admin
      .from("notification_prefs")
      .select("enabled, prefs")
      .eq("user_id", partnerId)
      .maybeSingle()

    const partnerPrefs = mergeDefaultPrefs(
      partnerPrefsRow?.prefs as Record<string, Record<string, unknown>>
    )
    if (
      !partnerPrefsRow?.enabled ||
      !prefOn(partnerPrefs, "receive_partner_period_logged")
    ) {
      continue
    }

    const result = await sendPushToUser(admin, partnerId, {
      title: `${name} marked the start of their period on ${prettyDate}.`,
      body: "",
      url: `./partner.html?owner=${encodeURIComponent(user.id)}`
    })
    totalSent += result.sent
  }

  return jsonResponse({ ok: true, sent: totalSent })
})
