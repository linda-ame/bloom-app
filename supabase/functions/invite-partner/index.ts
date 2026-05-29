import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const authHeader = req.headers.get("Authorization") || ""
  const jwt = authHeader.replace("Bearer ", "")
  if (!jwt) {
    return jsonResponse({ error: "Unauthorized" }, 401)
  }

  let body: { partner_email?: string; redirect_to?: string } = {}
  try {
    body = await req.json()
  } catch {
    // ignore - validate below
  }

  const partnerEmail = (body.partner_email || "").trim().toLowerCase()
  if (!partnerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(partnerEmail)) {
    return jsonResponse({ error: "Please provide a valid email address." }, 400)
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const { data: { user }, error: userError } = await admin.auth.getUser(jwt)
  if (userError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401)
  }

  if (partnerEmail === (user.email || "").toLowerCase()) {
    return jsonResponse({ error: "You cannot invite your own email." }, 400)
  }

  const { error: linkError } = await admin
    .from("partner_links")
    .upsert(
      [
        {
          owner_id: user.id,
          partner_email: partnerEmail,
          owner_email: user.email,
          status: "pending"
        }
      ],
      { onConflict: "owner_id,partner_email" }
    )

  if (linkError) {
    return jsonResponse({ error: linkError.message }, 500)
  }

  const inviteOptions: Record<string, unknown> = {
    data: {
      invited_by_email: user.email,
      app: "bloom"
    }
  }
  if (body.redirect_to) {
    inviteOptions.redirectTo = body.redirect_to
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    partnerEmail,
    inviteOptions
  )

  let emailSent = false
  let alreadyRegistered = false
  let emailWarning: string | null = null

  if (inviteError) {
    const msg = inviteError.message || ""
    if (/already|registered|exist/i.test(msg)) {
      alreadyRegistered = true
    } else {
      emailWarning = msg
      console.error("inviteUserByEmail:", msg)
    }
  } else {
    emailSent = true
  }

  return jsonResponse({
    ok: true,
    email_sent: emailSent,
    already_registered: alreadyRegistered,
    email_warning: emailWarning
  })
})
