import {
  corsHeaders,
  jsonResponse,
  requireUser
} from "../_shared/push.ts"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const auth = await requireUser(req)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)
  const { admin, user } = auth

  if (req.method === "DELETE") {
    let body: { endpoint?: string } = {}
    try {
      body = await req.json()
    } catch {
      // ignore
    }
    const endpoint = (body.endpoint || "").trim()
    if (!endpoint) return jsonResponse({ error: "endpoint required" }, 400)

    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", endpoint)

    if (error) return jsonResponse({ error: error.message }, 500)
    return jsonResponse({ ok: true })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  let body: {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
    timezone?: string
  } = {}
  try {
    body = await req.json()
  } catch {
    // ignore
  }

  const endpoint = (body.endpoint || "").trim()
  const p256dh = (body.keys?.p256dh || "").trim()
  const authKey = (body.keys?.auth || "").trim()
  const timezone = (body.timezone || "UTC").trim() || "UTC"

  if (!endpoint || !p256dh || !authKey) {
    return jsonResponse({ error: "Invalid subscription payload" }, 400)
  }

  const { error } = await admin.from("push_subscriptions").upsert(
    [
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth: authKey,
        timezone
      }
    ],
    { onConflict: "endpoint" }
  )

  if (error) return jsonResponse({ error: error.message }, 500)
  return jsonResponse({ ok: true })
})
