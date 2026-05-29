import {
  acceptPendingInvites,
  listAcceptedPartnersForMe,
  getActiveView,
  pickPartnerOwnerId
} from "./partnerLinks.js?v=1"

/** Profile row is complete when all onboarding fields are saved. */
export function isProfileComplete(profile) {
  if (!profile) return false
  const { last_period_start, period_length, cycle_length } = profile
  return Boolean(
    last_period_start &&
    period_length != null &&
    period_length !== "" &&
    cycle_length != null &&
    cycle_length !== ""
  )
}

export async function fetchUserProfile(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle()

  if (error) throw error
  return data
}

/** Where to send a logged-in user after sign-in. */
export async function getPostAuthRedirect(supabase, user) {
  await acceptPendingInvites(supabase, user)

  const profile = await fetchUserProfile(supabase, user.id)
  const activeView = getActiveView()

  if (isProfileComplete(profile)) {
    if (activeView.kind === "partner" && activeView.ownerId) {
      const partners = await listAcceptedPartnersForMe(supabase, user)
      const ownerId = pickPartnerOwnerId(partners, activeView)
      if (ownerId) {
        return `partner.html?owner=${encodeURIComponent(ownerId)}`
      }
    }
    return "dashboard.html"
  }

  const partners = await listAcceptedPartnersForMe(supabase, user)
  if (partners.length > 0) {
    const ownerId = pickPartnerOwnerId(partners, activeView)
    return `partner.html?owner=${encodeURIComponent(ownerId)}`
  }

  return "onboarding.html"
}
