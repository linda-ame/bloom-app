import {
  corsHeaders,
  jsonResponse,
  requireUser
} from "../_shared/push.ts"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const auth = await requireUser(req)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")
  if (!publicKey) {
    return jsonResponse(
      { error: "VAPID_PUBLIC_KEY is not set on the server." },
      500
    )
  }

  return jsonResponse({ publicKey })
})
