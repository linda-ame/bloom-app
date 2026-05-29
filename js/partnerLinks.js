const ACTIVE_VIEW_KEY = "bloom_active_view"

export function getActiveView() {
  try {
    const raw = localStorage.getItem(ACTIVE_VIEW_KEY)
    if (!raw) return { kind: "self" }
    const parsed = JSON.parse(raw)
    if (parsed?.kind === "partner" && parsed.ownerId) {
      return { kind: "partner", ownerId: parsed.ownerId }
    }
    return { kind: "self" }
  } catch {
    return { kind: "self" }
  }
}

export function setActiveView(view) {
  if (view?.kind === "partner" && view.ownerId) {
    localStorage.setItem(
      ACTIVE_VIEW_KEY,
      JSON.stringify({ kind: "partner", ownerId: view.ownerId })
    )
  } else {
    localStorage.setItem(ACTIVE_VIEW_KEY, JSON.stringify({ kind: "self" }))
  }
}

export function navigateToView(view) {
  setActiveView(view)
  if (view.kind === "partner" && view.ownerId) {
    window.location.href = `partner.html?owner=${encodeURIComponent(view.ownerId)}`
  } else {
    window.location.href = "dashboard.html"
  }
}

/** Accept pending invites matching the logged-in user's email. */
export async function acceptPendingInvites(supabase, user) {
  if (!user?.id || !user?.email) return

  const { data: pending, error } = await supabase
    .from("partner_links")
    .select("id")
    .eq("status", "pending")

  if (error) {
    console.error("acceptPendingInvites:", error)
    return
  }

  const now = new Date().toISOString()
  for (const row of pending || []) {
    const { error: updateError } = await supabase
      .from("partner_links")
      .update({
        partner_id: user.id,
        status: "accepted",
        accepted_at: now
      })
      .eq("id", row.id)

    if (updateError) {
      console.error("accept invite:", updateError)
    }
  }
}

/** Partners I can view (I am the partner). */
export async function listAcceptedPartnersForMe(supabase, user) {
  if (!user?.id) return []

  const { data, error } = await supabase
    .from("partner_links")
    .select("owner_id, owner_email, status, accepted_at")
    .eq("partner_id", user.id)
    .eq("status", "accepted")
    .order("accepted_at", { ascending: false })

  if (error) {
    console.error("listAcceptedPartnersForMe:", error)
    return []
  }

  return (data || []).map((row) => ({
    owner_id: row.owner_id,
    owner_email: row.owner_email || "Partner"
  }))
}

/** Invites I sent (I am the owner). */
export async function listMyInvites(supabase, user) {
  if (!user?.id) return []

  const { data, error } = await supabase
    .from("partner_links")
    .select("id, partner_email, partner_id, status, created_at, accepted_at")
    .eq("owner_id", user.id)
    .neq("status", "revoked")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("listMyInvites:", error)
    return []
  }

  return data || []
}

export async function isAcceptedPartnerOf(supabase, userId, ownerId) {
  if (!userId || !ownerId) return false

  const { data, error } = await supabase
    .from("partner_links")
    .select("id")
    .eq("partner_id", userId)
    .eq("owner_id", ownerId)
    .eq("status", "accepted")
    .maybeSingle()

  if (error) {
    console.error("isAcceptedPartnerOf:", error)
    return false
  }

  return Boolean(data)
}

export function pickPartnerOwnerId(partners, activeView) {
  if (!partners?.length) return null
  if (activeView?.kind === "partner" && activeView.ownerId) {
    const found = partners.some((p) => p.owner_id === activeView.ownerId)
    if (found) return activeView.ownerId
  }
  return partners[0].owner_id
}
